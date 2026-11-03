import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import sharp from "sharp";
import { createApp } from "../server/app.js";

const admin = "admin_user";
const member = "member_user";
const other = "other_user";
const input = { title: "Pasta", description: "Family dinner", ingredients: "Pasta\nTomato", instructions: "Cook and serve", tags: [], categories: [] };
let dir: string;
let service: ReturnType<typeof createApp>;

const auth = (user: string) => ({ "X-Remote-User-Id": user, "X-Family-Recipes": "1" });
async function addUser(id: string, role = "member") {
  return request(service.app).put(`/api/admin/users/${id}`).set(auth(admin)).send({ id, name: id, role, enabled: true });
}
async function recipe(user = member) {
  const result = await request(service.app).post("/api/recipes").set(auth(user)).send(input);
  expect(result.status).toBe(201);
  return result.body;
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "family-recipes-"));
  service = createApp({ dataDir: dir, initialAdminId: admin, trustedAddress: "127.0.0.1" });
});
afterEach(() => { service.close(); rmSync(dir, { recursive: true, force: true }); });

describe("Home Assistant access", () => {
  it("rejects untrusted connections, missing identity and non-allowlisted users", async () => {
    const untrustedDir = mkdtempSync(path.join(tmpdir(), "family-recipes-untrusted-"));
    const untrusted = createApp({ dataDir: untrustedDir, initialAdminId: admin });
    try { expect((await request(untrusted.app).get("/api/me").set(auth(admin))).status).toBe(403); }
    finally { untrusted.close(); rmSync(untrustedDir, { recursive: true, force: true }); }
    expect((await request(service.app).get("/api/me")).status).toBe(401);
    expect((await request(service.app).get("/api/me").set(auth(member))).status).toBe(403);
    expect((await request(service.app).get("/api/me").set(auth(admin))).body.role).toBe("admin");
  });
  it("rejects writes without the anti-CSRF header and applies revocation immediately", async () => {
    expect((await request(service.app).post("/api/recipes").set("X-Remote-User-Id", admin).send(input)).status).toBe(403);
    expect((await request(service.app).post("/api/recipes").set(auth(admin)).set("Content-Type", "application/json").send("{")).status).toBe(400);
    expect((await addUser(member)).status).toBe(200);
    expect((await request(service.app).get("/api/me").set(auth(member))).status).toBe(200);
    await request(service.app).put(`/api/admin/users/${member}`).set(auth(admin)).send({ id: member, name: member, role: "member", enabled: false });
    expect((await request(service.app).get("/api/me").set(auth(member))).status).toBe(403);
    expect((await request(service.app).put(`/api/admin/users/${admin}`).set(auth(admin)).send({ id: admin, name: admin, role: "member", enabled: false })).status).toBe(400);
  });
});

describe("recipe and community features", () => {
  beforeEach(async () => { await addUser(member); await addUser(other); });
  it("enforces owner and admin permissions, and persists edits and deletion", async () => {
    const created = await recipe();
    expect((await request(service.app).put(`/api/recipes/${created.id}`).set(auth(other)).send(input)).status).toBe(403);
    expect((await request(service.app).delete(`/api/recipes/${created.id}`).set(auth(other))).status).toBe(403);
    const edited = await request(service.app).put(`/api/recipes/${created.id}`).set(auth(admin)).send({ ...input, title: "Updated" });
    expect(edited.body.title).toBe("Updated");
    expect((await request(service.app).get("/api/recipes").set(auth(other))).body[0].title).toBe("Updated");
    expect((await request(service.app).delete(`/api/recipes/${created.id}`).set(auth(member))).status).toBe(204);
    expect((await request(service.app).get(`/api/recipes/${created.id}`).set(auth(member))).status).toBe(404);
  });
  it("handles likes idempotently and restricts comment moderation", async () => {
    const created = await recipe();
    const url = `/api/recipes/${created.id}/like`;
    await request(service.app).put(url).set(auth(other)).send({ liked: true });
    const liked = await request(service.app).put(url).set(auth(other)).send({ liked: true });
    expect(liked.body.likes).toBe(1);
    expect(liked.body.liked).toBe(true);
    const added = await request(service.app).post(`/api/recipes/${created.id}/comments`).set(auth(other)).send({ text: "Delicious" });
    const comment = added.body.comments[0];
    expect((await request(service.app).delete(`/api/comments/${comment.id}`).set(auth(member))).status).toBe(403);
    const edited = await request(service.app).put(`/api/comments/${comment.id}`).set(auth(other)).send({ text: "Very good" });
    expect(edited.body.comments[0].text).toBe("Very good");
    const removed = await request(service.app).delete(`/api/comments/${comment.id}`).set(auth(admin));
    expect(removed.body.comments).toHaveLength(0);
    const unliked = await request(service.app).put(url).set(auth(other)).send({ liked: false });
    expect(unliked.body.likes).toBe(0);
  });
  it("manages taxonomy and rolls back invalid associations", async () => {
    expect((await request(service.app).post("/api/admin/tags").set(auth(member)).send({ name: "Quick" })).status).toBe(403);
    const tags = await request(service.app).post("/api/admin/tags").set(auth(admin)).send({ name: "Quick" });
    const tag = tags.body[0];
    expect((await request(service.app).post("/api/admin/tags").set(auth(admin)).send({ name: "quick" })).status).toBe(409);
    const created = await request(service.app).post("/api/recipes").set(auth(member)).send({ ...input, tags: [tag.id] });
    expect(created.body.tags[0].name).toBe("Quick");
    const invalid = await request(service.app).put(`/api/recipes/${created.body.id}`).set(auth(member)).send({ ...input, title: "Should not save", tags: ["00000000-0000-4000-8000-000000000000"] });
    expect(invalid.status).toBe(400);
    expect((await request(service.app).get(`/api/recipes/${created.body.id}`).set(auth(member))).body.title).toBe("Pasta");
    await request(service.app).delete(`/api/admin/tags/${tag.id}`).set(auth(admin));
    expect((await request(service.app).get(`/api/recipes/${created.body.id}`).set(auth(member))).body.tags).toHaveLength(0);
  });
  it("validates photos, restricts edits, selects a cover and removes files", async () => {
    const created = await recipe();
    const image = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#339966" } }).png().toBuffer();
    const invalid = await request(service.app).post(`/api/recipes/${created.id}/images`).set(auth(member)).attach("image", Buffer.from("not an image"), "bad.png");
    expect(invalid.status).toBe(400);
    const first = await request(service.app).post(`/api/recipes/${created.id}/images`).set(auth(member)).attach("image", image, "one.png");
    expect(first.status).toBe(201);
    const firstId = first.body.images[0].id;
    expect((await request(service.app).get(`/api/images/${firstId}`).set(auth(other))).headers["content-type"]).toMatch("image/webp");
    expect((await request(service.app).delete(`/api/images/${firstId}`).set(auth(other))).status).toBe(403);
    const second = await request(service.app).post(`/api/recipes/${created.id}/images`).set(auth(member)).attach("image", image, "two.png");
    const secondId = second.body.images.find((item: { id: string }) => item.id !== firstId).id;
    const cover = await request(service.app).put(`/api/images/${secondId}/cover`).set(auth(admin));
    expect(cover.body.images[0].id).toBe(secondId);
    const removed = await request(service.app).delete(`/api/images/${secondId}`).set(auth(member));
    expect(removed.body.images[0].is_cover).toBe(1);
    expect((await request(service.app).get(`/api/images/${secondId}`).set(auth(member))).status).toBe(404);
  });
  it("enforces the five-photo limit even for concurrent uploads", async () => {
    const created = await recipe();
    const image = await sharp({ create: { width: 5, height: 5, channels: 3, background: "#339966" } }).png().toBuffer();
    const results = await Promise.all(Array.from({ length: 7 }, () =>
      request(service.app).post(`/api/recipes/${created.id}/images`).set(auth(member)).attach("image", image, "photo.png")));
    expect(results.filter((result) => result.status === 201)).toHaveLength(5);
    expect(results.filter((result) => result.status === 400)).toHaveLength(2);
    expect((await request(service.app).get(`/api/recipes/${created.id}`).set(auth(member))).body.images).toHaveLength(5);
  });
  it("retains users, data and images across a stopped-app backup and restore", async () => {
    const created = await recipe();
    const image = await sharp({ create: { width: 5, height: 5, channels: 3, background: "#ff0000" } }).png().toBuffer();
    const uploaded = await request(service.app).post(`/api/recipes/${created.id}/images`).set(auth(member)).attach("image", image, "photo.png");
    const imageId = uploaded.body.images[0].id;
    service.close();
    const backup = mkdtempSync(path.join(tmpdir(), "family-recipes-backup-"));
    try {
      cpSync(dir, backup, { recursive: true });
      service = createApp({ dataDir: backup, initialAdminId: admin, trustedAddress: "127.0.0.1" });
      expect((await request(service.app).get(`/api/recipes/${created.id}`).set(auth(member))).body.title).toBe("Pasta");
      expect((await request(service.app).get(`/api/images/${imageId}`).set(auth(member))).status).toBe(200);
      service.close();
    } finally { rmSync(backup, { recursive: true, force: true }); }
    service = createApp({ dataDir: dir, initialAdminId: admin, trustedAddress: "127.0.0.1" });
  });
});
