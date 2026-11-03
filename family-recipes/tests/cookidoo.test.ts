import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { createApp } from "../server/app.js";

const auth = (id: string) => ({ "X-Remote-User-Id": id, "X-Family-Recipes": "1" });
const recipeInput = { title: "Pasta", description: "", ingredients: "Pasta\nTomato", instructions: "Boil water\nCook pasta", tags: [], categories: [] };
const day = "2026-11-03";
type Call = { url: string; method: string; body: unknown; cookie: string | null };
let dir: string;
let service: ReturnType<typeof createApp>;
let calls: Call[];
let reply: (call: Call) => Promise<Response>;

const json = (body: unknown, status = 200) => Response.json(body, { status });
const success = async (call: Call) => {
  if (call.method === "GET") return json({ items: [] });
  if (call.method === "POST") return json({ recipeId: "remote123" });
  if (call.method === "PATCH") return json({ recipeId: "remote123" });
  return json({ content: { dayKey: day, customerRecipeIds: ["remote123"] } });
};
const fakeFetch: typeof fetch = async (url, init) => {
  const headers = new Headers(init?.headers);
  const call = { url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) as unknown : undefined, cookie: headers.get("cookie") };
  calls.push(call);
  return reply(call);
};
const start = (configured = true) => createApp({ dataDir: dir, initialAdminId: "admin", trustedAddress: "127.0.0.1", cookidooCookie: configured ? "_oauth2_proxy=test-session" : undefined, cookidooFetch: fakeFetch });
async function createRecipe() {
  const result = await request(service.app).post("/api/recipes").set(auth("admin")).send(recipeInput);
  expect(result.status).toBe(201);
  return result.body.id as string;
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "family-cookidoo-"));
  calls = [];
  reply = success;
  service = start();
});
afterEach(() => { service.close(); rmSync(dir, { recursive: true, force: true }); });

describe("Cookidoo integration", () => {
  it("creates a TM6 recipe and schedules it using the shared account", async () => {
    await request(service.app).put("/api/admin/users/member").set(auth("admin")).send({ id: "member", name: "Member", role: "member", enabled: true });
    const id = await createRecipe();
    const result = await request(service.app).post(`/api/recipes/${id}/cookidoo`).set(auth("member")).send({ day });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ day, remoteId: "remote123" });
    expect(calls.map((call) => [call.method, new URL(call.url).pathname])).toEqual([
      ["GET", "/created-recipes/nl-BE"],
      ["POST", "/created-recipes/nl-BE"],
      ["PATCH", "/created-recipes/nl-BE/remote123"],
      ["PATCH", "/created-recipes/nl-BE/remote123"],
      ["PUT", "/planning/nl-BE/api/my-day"],
    ]);
    expect(calls.every((call) => call.cookie === "_oauth2_proxy=test-session")).toBe(true);
    expect(calls[2].body).toEqual({ name: "Pasta", ingredients: [{ type: "INGREDIENT", text: "Pasta" }, { type: "INGREDIENT", text: "Tomato" }], tools: ["TM6"] });
    expect(calls[3].body).toEqual({ instructions: [{ type: "STEP", text: "Boil water" }, { type: "STEP", text: "Cook pasta" }] });
    expect(calls[4].body).toEqual({ recipeIds: ["remote123"], dayKey: day, recipeSource: "CUSTOMER" });
    expect((await request(service.app).get(`/api/recipes/${id}`).set(auth("member"))).body.cookidoo).toEqual({ remote_id: "remote123", state: "ready", scheduled_day: day });
    const duplicate = await request(service.app).post(`/api/recipes/${id}/cookidoo`).set(auth("member")).send({ day });
    expect(duplicate.status).toBe(409);
    expect(calls.filter((call) => call.method === "PUT")).toHaveLength(1);
    expect(JSON.stringify(result.body)).not.toContain("test-session");
  });

  it("reuses the linked recipe on a later day after a restart", async () => {
    const id = await createRecipe();
    expect((await request(service.app).post(`/api/recipes/${id}/cookidoo`).set(auth("admin")).send({ day })).status).toBe(200);
    service.close();
    service = start();
    const nextDay = "2026-11-04";
    reply = async (call) => call.method === "PUT" ? json({ content: { dayKey: nextDay, customerRecipes: [{ id: "remote123" }] } }) : success(call);
    expect((await request(service.app).post(`/api/recipes/${id}/cookidoo`).set(auth("admin")).send({ day: nextDay })).status).toBe(200);
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
  });

  it("migrates an existing version 1 database without losing recipes", async () => {
    const id = await createRecipe();
    service.close();
    const database = new DatabaseSync(path.join(dir, "recipes.db"));
    database.exec("DROP TABLE cookidoo_exports; UPDATE schema_version SET version=1");
    database.close();
    service = start();
    expect((await request(service.app).get(`/api/recipes/${id}`).set(auth("admin"))).body.title).toBe("Pasta");
    expect((await request(service.app).post(`/api/recipes/${id}/cookidoo`).set(auth("admin")).send({ day })).status).toBe(200);
  });

  it("blocks uncertain creations until an administrator confirms review", async () => {
    await request(service.app).put("/api/admin/users/member").set(auth("admin")).send({ id: "member", name: "Member", role: "member", enabled: true });
    const id = await createRecipe();
    reply = async (call) => { if (call.method === "POST") throw new Error("network"); return success(call); };
    const failed = await request(service.app).post(`/api/recipes/${id}/cookidoo`).set(auth("member")).send({ day });
    expect(failed.status).toBe(502);
    expect(failed.body.error).toContain("uncertain");
    expect((await request(service.app).get(`/api/recipes/${id}`).set(auth("member"))).body.cookidoo).toMatchObject({ remote_id: null, state: "attention" });
    reply = success;
    expect((await request(service.app).post(`/api/recipes/${id}/cookidoo`).set(auth("member")).send({ day })).status).toBe(409);
    expect((await request(service.app).post(`/api/admin/cookidoo/recipes/${id}/reset`).set(auth("member")).send({ forget: false })).status).toBe(403);
    expect((await request(service.app).post(`/api/admin/cookidoo/recipes/${id}/reset`).set(auth("admin")).send({ forget: false })).status).toBe(200);
    expect((await request(service.app).post(`/api/recipes/${id}/cookidoo`).set(auth("member")).send({ day })).status).toBe(200);
  });

  it("retains a known remote ID and blocks retries when scheduling cannot be confirmed", async () => {
    const id = await createRecipe();
    reply = async (call) => call.method === "PUT" ? json({ content: { dayKey: day, customerRecipeIds: [] } }) : success(call);
    expect((await request(service.app).post(`/api/recipes/${id}/cookidoo`).set(auth("admin")).send({ day })).status).toBe(502);
    expect((await request(service.app).get(`/api/recipes/${id}`).set(auth("admin"))).body.cookidoo).toMatchObject({ remote_id: "remote123", state: "attention" });
    service.close();
    service = start();
    expect((await request(service.app).post(`/api/recipes/${id}/cookidoo`).set(auth("admin")).send({ day })).status).toBe(409);
    await request(service.app).post(`/api/admin/cookidoo/recipes/${id}/reset`).set(auth("admin")).send({ forget: false });
    reply = success;
    expect((await request(service.app).post(`/api/recipes/${id}/cookidoo`).set(auth("admin")).send({ day })).status).toBe(200);
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
  });

  it("allows an administrator to link a matching recipe after an uncertain creation", async () => {
    const id = await createRecipe();
    reply = async (call) => { if (call.method === "POST") throw new Error("network"); return success(call); };
    expect((await request(service.app).post(`/api/recipes/${id}/cookidoo`).set(auth("admin")).send({ day })).status).toBe(502);
    reply = async (call) => call.url.endsWith("/remote123") && call.method === "GET"
      ? json({ recipeId: "remote123", recipeContent: { name: "Different recipe" } }) : success(call);
    expect((await request(service.app).post(`/api/admin/cookidoo/recipes/${id}/link`).set(auth("admin")).send({ remoteId: "remote123" })).status).toBe(502);
    reply = async (call) => call.url.endsWith("/remote123") && call.method === "GET"
      ? json({ recipeId: "remote123", recipeContent: { name: "Pasta" } }) : success(call);
    const linked = await request(service.app).post(`/api/admin/cookidoo/recipes/${id}/link`).set(auth("admin")).send({ remoteId: "remote123" });
    expect(linked.status).toBe(200);
    expect(linked.body.cookidoo).toMatchObject({ remote_id: "remote123", state: "ready" });
    expect((await request(service.app).post(`/api/recipes/${id}/cookidoo`).set(auth("admin")).send({ day })).status).toBe(200);
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
  });

  it("surfaces authentication and validation failures without creating a recipe", async () => {
    const id = await createRecipe();
    expect((await request(service.app).post(`/api/recipes/${id}/cookidoo`).set(auth("admin")).send({ day: "invalid" })).status).toBe(400);
    reply = async () => new Response(null, { status: 302, headers: { location: "https://example.invalid" } });
    expect((await request(service.app).post(`/api/recipes/${id}/cookidoo`).set(auth("admin")).send({ day })).status).toBe(502);
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);
    service.close();
    service = start(false);
    expect((await request(service.app).post(`/api/recipes/${id}/cookidoo`).set(auth("admin")).send({ day })).status).toBe(503);
  });

  it("prevents reset, deletion, and a second send while a write is in flight", async () => {
    const id = await createRecipe();
    let release!: () => void;
    let started!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const entered = new Promise<void>((resolve) => { started = resolve; });
    reply = async (call) => { if (call.method === "POST") { started(); await wait; } return success(call); };
    const first = request(service.app).post(`/api/recipes/${id}/cookidoo`).set(auth("admin")).send({ day }).then((result) => result);
    await entered;
    expect((await request(service.app).post(`/api/recipes/${id}/cookidoo`).set(auth("admin")).send({ day })).status).toBe(409);
    expect((await request(service.app).post(`/api/admin/cookidoo/recipes/${id}/reset`).set(auth("admin")).send({ forget: true })).status).toBe(409);
    expect((await request(service.app).delete(`/api/recipes/${id}`).set(auth("admin"))).status).toBe(409);
    release();
    expect((await first).status).toBe(200);
  });
});
