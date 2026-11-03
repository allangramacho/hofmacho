import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import * as cheerio from "cheerio";
import { decodeHTMLStrict } from "entities";
import ipaddr from "ipaddr.js";

export type ImportedRecipe = { title: string; description: string; ingredients: string; instructions: string };

export class RecipeImportError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Page = { status: number; location?: string; contentType?: string; body: string };
type ImportDependencies = {
  resolve: (hostname: string) => Promise<LookupAddress[]>;
  download: (url: URL, address: LookupAddress, signal: AbortSignal) => Promise<Page>;
};

const maxPageBytes = 2 * 1024 * 1024;
const publicAddress = (address: string) => {
  if (!ipaddr.isValid(address)) return false;
  const parsed = ipaddr.process(address);
  return parsed.range() === "unicast" &&
    (parsed.kind() === "ipv4" || parsed.match(ipaddr.parse("2000::"), 3));
};

function parseUrl(input: string, base?: URL): URL {
  let url: URL;
  try { url = new URL(input, base); }
  catch { throw new RecipeImportError(400, "Enter a valid public HTTP or HTTPS recipe URL."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) {
    throw new RecipeImportError(400, "Use a public HTTP or HTTPS URL without credentials or a custom port.");
  }
  return url;
}

function download(url: URL, address: LookupAddress, signal: AbortSignal): Promise<Page> {
  return new Promise((resolve, reject) => {
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send(url, {
      signal, family: address.family,
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      headers: { Accept: "text/html,application/xhtml+xml", "Accept-Encoding": "identity", "User-Agent": "FamilyRecipes/1.0" },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
        res.destroy();
        resolve({ status: res.statusCode, location: res.headers.location, body: "" });
        return;
      }
      if (res.statusCode !== 200) {
        res.destroy();
        reject(new RecipeImportError(502, `The recipe website returned HTTP ${res.statusCode ?? "unknown"}.`));
        return;
      }
      if (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity") {
        res.destroy();
        reject(new RecipeImportError(502, "The recipe website returned an unsupported encoding."));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxPageBytes) {
          req.destroy(new RecipeImportError(502, "The recipe page is too large to import."));
        } else chunks.push(chunk);
      });
      res.on("end", () => resolve({
        status: res.statusCode ?? 0, contentType: res.headers["content-type"], body: Buffer.concat(chunks).toString("utf8"),
      }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

function text(value: unknown): string {
  if (typeof value !== "string") return "";
  return decodeHTMLStrict(cheerio.load(value, {}, false).text()).replace(/\r\n?/g, "\n").trim();
}

function instructions(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(instructions);
  if (typeof value === "string") return text(value) ? [text(value)] : [];
  if (!value || typeof value !== "object") return [];
  const item = value as Record<string, unknown>;
  if (item.itemListElement) return instructions(item.itemListElement);
  const step = text(item.text) || text(item.name);
  return step ? [step] : [];
}

function findRecipes(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 30 || !value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => findRecipes(item, depth + 1));
  const object = value as Record<string, unknown>;
  const types = Array.isArray(object["@type"]) ? object["@type"] : [object["@type"]];
  const matches = types.some((type) => typeof type === "string" && /(?:^|[/#])Recipe$/i.test(type));
  return [...(matches ? [object] : []), ...Object.values(object).flatMap((item) => findRecipes(item, depth + 1))];
}

function escapeJsonLineBreaks(source: string): string {
  let insideString = false;
  let escaped = false;
  let result = "";
  for (const char of source) {
    if (insideString && !escaped && (char === "\n" || char === "\r")) {
      result += char === "\n" ? "\\n" : "\\r";
      continue;
    }
    result += char;
    if (escaped) { escaped = false; continue; }
    if (insideString && char === "\\") { escaped = true; continue; }
    if (char === '"') insideString = !insideString;
  }
  return result;
}

export function extractRecipe(html: string): ImportedRecipe {
  const $ = cheerio.load(html);
  const recipes: Record<string, unknown>[] = [];
  $("script[type]").each((_index, element) => {
    if ($(element).attr("type")?.split(";")[0].trim().toLowerCase() !== "application/ld+json") return;
    try { recipes.push(...findRecipes(JSON.parse(escapeJsonLineBreaks($(element).html() ?? "")))); }
    catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  });
  const recipe = recipes.find((item) => text(item.name));
  if (!recipe) throw new RecipeImportError(422, "No structured recipe was found on this page. You can enter it manually.");
  const ingredients = Array.isArray(recipe.recipeIngredient)
    ? recipe.recipeIngredient.map(text).filter(Boolean).join("\n") : text(recipe.recipeIngredient);
  const result = {
    title: text(recipe.name), description: text(recipe.description),
    ingredients, instructions: instructions(recipe.recipeInstructions).join("\n"),
  };
  if (result.title.length > 160 || result.description.length > 4000 ||
      result.ingredients.length > 20000 || result.instructions.length > 30000) {
    throw new RecipeImportError(422, "The recipe contains fields that are too long to import. Enter them manually instead.");
  }
  return result;
}

export function createRecipeImporter(dependencies: Partial<ImportDependencies> = {}) {
  const resolve = dependencies.resolve ?? ((hostname: string) => lookup(hostname, { all: true, verbatim: true }));
  const get = dependencies.download ?? download;
  return async (input: string): Promise<ImportedRecipe> => {
    let url = parseUrl(input);
    const signal = AbortSignal.timeout(15000);
    for (let redirects = 0; redirects <= 3; redirects++) {
      let page: Page;
      try {
        signal.throwIfAborted();
        const hostname = url.hostname.replace(/^\[|\]$/g, "");
        const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] :
          await Promise.race([
            resolve(hostname),
            new Promise<never>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })),
          ]);
        if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) {
          throw new RecipeImportError(400, "Recipe URLs must resolve only to public internet addresses.");
        }
        page = await get(url, addresses[0], signal);
      } catch (error) {
        if (error instanceof RecipeImportError) throw error;
        throw new RecipeImportError(502, "Could not reach the recipe website or the request timed out.");
      }
      if (page.status >= 300 && page.status < 400) {
        if (!page.location || redirects === 3) throw new RecipeImportError(502, "The recipe website redirected too many times or provided an invalid redirect.");
        url = parseUrl(page.location, url);
        continue;
      }
      if (!/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/i.test(page.contentType ?? "")) {
        throw new RecipeImportError(422, "The URL did not return an HTML recipe page.");
      }
      return extractRecipe(page.body);
    }
    throw new RecipeImportError(502, "The recipe website redirected too many times.");
  };
}
