import { z } from "zod";

const origin = "https://cookidoo.be";
const locale = "nl-BE";
const remoteId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const created = z.object({ recipeId: remoteId });
const recipeResult = z.object({ recipeId: remoteId, recipeContent: z.object({ name: z.string() }) });
const dayResult = z.object({
  content: z.object({
    dayKey: z.string(),
    customerRecipeIds: z.array(z.string()).optional(),
    customerRecipes: z.array(z.object({ id: z.string() })).optional(),
    recipes: z.array(z.object({ id: z.string() })).optional(),
  }),
});

export class CookidooError extends Error {
  constructor(message: string, public uncertain = false) { super(message); }
}

export type CookidooRecipe = { title: string; ingredients: string; instructions: string };

export function createCookidoo(cookie: string, request: typeof fetch = fetch) {
  if (!cookie || cookie.length > 16000 || /[\r\n]/.test(cookie) || !/^[\x20-\x7e]+$/.test(cookie)) {
    throw new Error("Invalid Cookidoo session cookie configuration");
  }
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Requested-With": "xmlhttprequest",
    Origin: origin,
    Cookie: cookie,
  };
  const send = async (route: string, method: "GET" | "POST" | "PATCH" | "PUT", body?: unknown): Promise<unknown> => {
    const mutation = method !== "GET";
    let response: Response;
    try {
      response = await request(`${origin}${route}`, {
        method, headers, redirect: "manual", signal: AbortSignal.timeout(15000),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new CookidooError(`Cookidoo ${method} failed or timed out. Check the connection.`, mutation);
    }
    if (response.status === 401 || response.status === 403 || (response.status >= 300 && response.status < 400)) {
      throw new CookidooError("Cookidoo rejected the session or redirected the request. Renew the session cookie or check the Belgian site.", mutation && response.status >= 300 && response.status < 400);
    }
    if (!response.ok) {
      throw new CookidooError(`Cookidoo ${method} failed with HTTP ${response.status}.`, mutation && response.status >= 500);
    }
    try {
      if (!response.headers.get("content-type")?.toLowerCase().includes("json")) throw new Error("Not JSON");
      return await response.json() as unknown;
    } catch {
      throw new CookidooError(`Cookidoo returned an unexpected response to ${method}.`, mutation);
    }
  };
  const recipePath = `/created-recipes/${locale}`;
  const pathFor = (id: string) => `${recipePath}/${encodeURIComponent(remoteId.parse(id))}`;
  return {
    check: () => send(recipePath, "GET"),
    async create(title: string) {
      const body = await send(recipePath, "POST", { recipeName: title });
      const result = created.safeParse(body);
      if (!result.success) throw new CookidooError("Cookidoo created a recipe but did not return a usable ID.", true);
      return result.data.recipeId;
    },
    async verifyRecipe(id: string, title: string) {
      const body = await send(pathFor(id), "GET");
      const parsed = recipeResult.safeParse(body);
      if (!parsed.success || parsed.data.recipeId !== id || parsed.data.recipeContent.name !== title) {
        throw new CookidooError("The Cookidoo recipe ID or title did not match. Check the ID and the Family Recipes title.");
      }
    },
    async update(id: string, recipe: CookidooRecipe) {
      const ingredients = recipe.ingredients.split(/\r?\n/).map((text) => text.trim()).filter(Boolean).map((text) => ({ type: "INGREDIENT", text }));
      const instructions = recipe.instructions.split(/\r?\n/).map((text) => text.trim()).filter(Boolean).map((text) => ({ type: "STEP", text }));
      await send(pathFor(id), "PATCH", { name: recipe.title, ingredients, tools: ["TM6"] });
      await send(pathFor(id), "PATCH", { instructions });
    },
    async schedule(id: string, day: string) {
      const body = await send(`/planning/${locale}/api/my-day`, "PUT", { recipeIds: [remoteId.parse(id)], dayKey: day, recipeSource: "CUSTOMER" });
      const parsed = dayResult.safeParse(body);
      if (!parsed.success || parsed.data.content.dayKey !== day ||
          ![...(parsed.data.content.customerRecipeIds ?? []), ...(parsed.data.content.customerRecipes ?? []).map((r) => r.id), ...(parsed.data.content.recipes ?? []).map((r) => r.id)].includes(id)) {
        throw new CookidooError("Cookidoo did not confirm the recipe in the requested day. Check Cookidoo before retrying.", true);
      }
    },
  };
}
