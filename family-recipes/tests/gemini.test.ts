import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import sharp from "sharp";
import { createApp } from "../server/app.js";

const auth = { "X-Remote-User-Id": "admin", "X-Family-Recipes": "1" };
const recipe = { isRecipe: true, title: "Soup", description: "", ingredients: "2 carrots", instructions: "Cook." };
const success = (data: unknown = recipe) => Response.json({
  candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(data) }] } }],
});
let dir: string;
let service: ReturnType<typeof createApp>;
let reply: () => Promise<Response>;
let fetchGemini: ReturnType<typeof vi.fn<typeof fetch>>;
let image: Buffer;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "family-gemini-"));
  reply = async () => success();
  fetchGemini = vi.fn<typeof fetch>(async () => reply());
  service = createApp({ dataDir: dir, initialAdminId: "admin", trustedAddress: "127.0.0.1", geminiApiKey: "test-key", geminiFetch: fetchGemini });
  image = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#ffffff" } }).png().withMetadata().toBuffer();
});
afterEach(() => { service.close(); rmSync(dir, { recursive: true, force: true }); });

describe("Gemini photo import", () => {
  it("reports configuration and sends only a processed photo to Gemini without saving", async () => {
    expect((await request(service.app).get("/api/photo-import").set(auth)).body).toEqual({ configured: true });
    const result = await request(service.app).post("/api/photo-import").set(auth).attach("image", image, "recipe.png");
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ title: "Soup", description: "", ingredients: "2 carrots", instructions: "Cook." });
    const [url, options] = fetchGemini.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    expect(new Headers(options?.headers).get("x-goog-api-key")).toBe("test-key");
    expect(options?.redirect).toBe("error");
    const body = JSON.parse(String(options?.body)) as {
      contents: { parts: { inlineData?: { data: string; mimeType: string } }[] }[];
      generationConfig: { responseMimeType: string };
      store: boolean;
    };
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.store).toBe(false);
    const inline = body.contents[0].parts[1].inlineData!;
    expect(inline.mimeType).toBe("image/jpeg");
    const meta = await sharp(Buffer.from(inline.data, "base64")).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect((await request(service.app).get("/api/recipes").set(auth)).body).toHaveLength(0);
    expect(JSON.stringify(result.body)).not.toContain("test-key");
  });
  it("rejects unauthenticated and unverified requests before accessing Gemini", async () => {
    expect((await request(service.app).post("/api/photo-import").attach("image", image, "recipe.png")).status).toBe(401);
    expect((await request(service.app).post("/api/photo-import").set("X-Remote-User-Id", "admin").attach("image", image, "recipe.png")).status).toBe(403);
    expect(fetchGemini).not.toHaveBeenCalled();
  });
  it("rejects invalid, unsupported, missing and oversized images", async () => {
    expect((await request(service.app).post("/api/photo-import").set(auth)).status).toBe(400);
    expect((await request(service.app).post("/api/photo-import").set(auth).attach("image", Buffer.from("invalid"), "bad.jpg")).status).toBe(400);
    const gif = await sharp({ create: { width: 1, height: 1, channels: 3, background: "#fff" } }).gif().toBuffer();
    expect((await request(service.app).post("/api/photo-import").set(auth).attach("image", gif, "bad.gif")).status).toBe(400);
    expect((await request(service.app).post("/api/photo-import").set(auth).attach("image", Buffer.alloc(5 * 1024 * 1024 + 1), "large.jpg")).status).toBe(400);
    expect(fetchGemini).not.toHaveBeenCalled();
  });
  it("makes the feature unavailable without a configured key", async () => {
    service.close();
    service = createApp({ dataDir: dir, initialAdminId: "admin", trustedAddress: "127.0.0.1", geminiFetch: fetchGemini });
    expect((await request(service.app).get("/api/photo-import").set(auth)).body).toEqual({ configured: false });
    expect((await request(service.app).post("/api/photo-import").set(auth).attach("image", image, "recipe.png")).status).toBe(503);
    expect(fetchGemini).not.toHaveBeenCalled();
  });
  it("surfaces quota, key, network and model errors without exposing provider details", async () => {
    const cases: [() => Promise<Response>, number, string][] = [
      [async () => new Response("secret error", { status: 429 }), 429, "quota"],
      [async () => new Response("secret error", { status: 403 }), 502, "API key"],
      [async () => new Response("secret error", { status: 404 }), 502, "HTTP 404"],
      [async () => { throw new Error("test-key"); }, 502, "Could not reach"],
      [async () => Response.json({ candidates: [] }), 502, "could not complete"],
      [async () => new Response("not json", { status: 200 }), 502, "invalid response"],
      [async () => Response.json({ candidates: [{ finishReason: "MAX_TOKENS" }] }), 502, "could not complete"],
      [async () => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "not json" }] } }] }), 502, "invalid recipe"],
      [async () => success({ ...recipe, title: "x".repeat(161) }), 502, "oversized"],
      [async () => success({ ...recipe, isRecipe: false }), 422, "No readable recipe"],
    ];
    for (const [response, status, message] of cases) {
      reply = response;
      const result = await request(service.app).post("/api/photo-import").set(auth).attach("image", image, "recipe.png");
      expect(result.status).toBe(status);
      expect(result.body.error).toContain(message);
      expect(JSON.stringify(result.body)).not.toMatch(/test-key|secret error/);
    }
  });
});
