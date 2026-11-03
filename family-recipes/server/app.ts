import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { z, ZodError } from "zod";
import { CookidooError, createCookidoo } from "./cookidoo.js";

type User = { id: string; name: string; role: "admin" | "member"; enabled: number };
type Recipe = { id: string; owner_id: string; title: string; description: string; ingredients: string; instructions: string; created_at: string; updated_at: string };
type Image = { id: string; recipe_id: string; filename: string; is_cover: number };
type Taxonomy = { id: string; name: string };
type Comment = { id: string; recipe_id: string; author_id: string; text: string; created_at: string; author: string };
type AppOptions = { dataDir: string; initialAdminId: string; trustedAddress?: string; staticDir?: string; cookidooCookie?: string; cookidooFetch?: typeof fetch };
type CookidooExport = { remote_id: string | null; state: "working" | "ready" | "attention"; scheduled_day: string | null };

const userId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const uuid = z.uuid();
const recipeInput = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000),
  ingredients: z.string().trim().min(1).max(20000),
  instructions: z.string().trim().min(1).max(30000),
  tags: z.array(uuid).max(50),
  categories: z.array(uuid).max(50),
});
const taxonomyInput = z.object({ name: z.string().trim().min(1).max(80) });
const userInput = z.object({ id: userId, name: z.string().trim().min(1).max(100), role: z.enum(["admin", "member"]), enabled: z.boolean() });
const commentInput = z.object({ text: z.string().trim().min(1).max(4000) });
const cookidooDay = z.object({ day: z.iso.date() });

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function createApp(options: AppOptions) {
  userId.parse(options.initialAdminId);
  mkdirSync(options.dataDir, { recursive: true });
  const imageDir = path.join(options.dataDir, "images");
  mkdirSync(imageDir, { recursive: true });
  const db = new DatabaseSync(path.join(options.dataDir, "recipes.db"));
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = DELETE;
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
    INSERT INTO schema_version SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM schema_version);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','member')), enabled INTEGER NOT NULL CHECK(enabled IN (0,1)));
    CREATE TABLE IF NOT EXISTS recipes (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, description TEXT NOT NULL, ingredients TEXT NOT NULL, instructions TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE);
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE);
    CREATE TABLE IF NOT EXISTS recipe_tags (recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(recipe_id, tag_id));
    CREATE TABLE IF NOT EXISTS recipe_categories (recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE, PRIMARY KEY(recipe_id, category_id));
    CREATE TABLE IF NOT EXISTS likes (recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(recipe_id, user_id));
    CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, author_id TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, filename TEXT NOT NULL UNIQUE, is_cover INTEGER NOT NULL DEFAULT 0 CHECK(is_cover IN (0,1)));
  `);
  const version = db.prepare("SELECT version FROM schema_version").get() as { version: number };
  if (version.version !== 1 && version.version !== 2) throw new Error(`Unsupported database version: ${version.version}`);
  if (version.version === 1) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec("CREATE TABLE IF NOT EXISTS cookidoo_exports (recipe_id TEXT PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE, remote_id TEXT, state TEXT NOT NULL CHECK(state IN ('working','ready','attention')), scheduled_day TEXT)");
      db.exec("UPDATE schema_version SET version=2");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  db.prepare("INSERT INTO users (id, name, role, enabled) VALUES (?, ?, 'admin', 1) ON CONFLICT(id) DO UPDATE SET role='admin', enabled=1").run(options.initialAdminId, "Initial administrator");

  const app = express();
  const cookidoo = options.cookidooCookie ? createCookidoo(options.cookidooCookie, options.cookidooFetch) : undefined;
  const cookidooInFlight = new Set<string>();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const remote = req.socket.remoteAddress?.replace(/^::ffff:/, "");
    if (remote !== (options.trustedAddress ?? "172.30.32.2")) return res.status(403).json({ error: "Untrusted connection" });
    const id = req.get("X-Remote-User-Id");
    if (!id || !userId.safeParse(id).success) return res.status(401).json({ error: "Home Assistant did not provide a user identity" });
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
    if (!user || !user.enabled) return res.status(403).json({ error: "Your Home Assistant user is not allowed to use Family Recipes" });
    const name = req.get("X-Remote-User-Display-Name") || req.get("X-Remote-User-Name");
    if (name && name.length <= 100 && name !== user.name) {
      db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, id);
      user.name = name;
    }
    res.locals.user = user;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.get("X-Family-Recipes") !== "1") {
      return res.status(403).json({ error: "Missing request verification header" });
    }
    next();
  });
  app.use(express.json({ limit: "128kb" }));

  const currentUser = (res: Response): User => res.locals.user as User;
  const requireAdmin = (_req: Request, res: Response, next: NextFunction) => {
    if (currentUser(res).role !== "admin") return next(new HttpError(403, "Administrator access required"));
    next();
  };
  const findRecipe = (id: string): Recipe => {
    const recipe = db.prepare("SELECT * FROM recipes WHERE id = ?").get(id) as Recipe | undefined;
    if (!recipe) throw new HttpError(404, "Recipe not found");
    return recipe;
  };
  const checkOwner = (recipe: Recipe, user: User) => {
    if (user.role !== "admin" && recipe.owner_id !== user.id) throw new HttpError(403, "Only the owner or an administrator can edit this recipe");
  };
  const transaction = (action: () => void) => {
    db.exec("BEGIN IMMEDIATE");
    try { action(); db.exec("COMMIT"); } catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  const taxonomies = (table: "tags" | "categories") => db.prepare(`SELECT id, name FROM ${table} ORDER BY name`).all() as Taxonomy[];
  const detail = (recipe: Recipe, user: User) => ({
    ...recipe,
    owner: (db.prepare("SELECT name FROM users WHERE id = ?").get(recipe.owner_id) as { name: string }).name,
    tags: db.prepare("SELECT tags.id, tags.name FROM tags JOIN recipe_tags ON tags.id = recipe_tags.tag_id WHERE recipe_tags.recipe_id = ? ORDER BY tags.name").all(recipe.id) as Taxonomy[],
    categories: db.prepare("SELECT categories.id, categories.name FROM categories JOIN recipe_categories ON categories.id = recipe_categories.category_id WHERE recipe_categories.recipe_id = ? ORDER BY categories.name").all(recipe.id) as Taxonomy[],
    images: db.prepare("SELECT id, is_cover FROM images WHERE recipe_id = ? ORDER BY is_cover DESC, rowid").all(recipe.id),
    likes: (db.prepare("SELECT COUNT(*) AS count FROM likes WHERE recipe_id = ?").get(recipe.id) as { count: number }).count,
    liked: Boolean(db.prepare("SELECT 1 FROM likes WHERE recipe_id = ? AND user_id = ?").get(recipe.id, user.id)),
    comments: db.prepare("SELECT comments.*, users.name AS author FROM comments JOIN users ON users.id = comments.author_id WHERE recipe_id = ? ORDER BY created_at, comments.rowid").all(recipe.id) as Comment[],
    cookidoo: db.prepare("SELECT remote_id, state, scheduled_day FROM cookidoo_exports WHERE recipe_id = ?").get(recipe.id) as CookidooExport | undefined,
  });
  const updateRelations = (recipeId: string, value: z.infer<typeof recipeInput>) => {
    for (const [table, column, ids] of [["recipe_tags", "tag_id", value.tags], ["recipe_categories", "category_id", value.categories]] as const) {
      db.prepare(`DELETE FROM ${table} WHERE recipe_id = ?`).run(recipeId);
      for (const id of new Set(ids)) db.prepare(`INSERT INTO ${table} (recipe_id, ${column}) VALUES (?, ?)`).run(recipeId, id);
    }
  };
  const unlinkImage = (image: Image) => {
    try { rmSync(path.join(imageDir, image.filename)); }
    catch (error) { console.error(`Could not remove image ${image.id}:`, error); throw new HttpError(500, "Image metadata was removed, but its file could not be deleted; check the add-on logs"); }
  };

  app.get("/api/me", (_req, res) => res.json(currentUser(res)));
  app.get("/api/taxonomy", (_req, res) => res.json({ tags: taxonomies("tags"), categories: taxonomies("categories") }));
  app.get("/api/cookidoo", (_req, res) => res.json({ configured: Boolean(cookidoo) }));
  app.post("/api/recipes/:id/cookidoo", async (req, res) => {
    if (!cookidoo) throw new HttpError(503, "Cookidoo is not configured. Ask an administrator to configure the session.");
    const recipe = findRecipe(z.string().parse(req.params.id));
    const { day } = cookidooDay.parse(req.body);
    if (recipe.title.length > 120) throw new HttpError(400, "Cookidoo recipe titles must be at most 120 characters.");
    await cookidoo.check().catch((error: unknown) => {
      if (error instanceof CookidooError) throw new HttpError(502, error.message);
      throw error;
    });
    findRecipe(recipe.id);
    const existing = db.prepare("SELECT remote_id, state, scheduled_day FROM cookidoo_exports WHERE recipe_id = ?").get(recipe.id) as CookidooExport | undefined;
    if (existing && existing.state !== "ready") throw new HttpError(409, "A Cookidoo operation needs administrator review before retrying. Check the created recipe and calendar in Cookidoo.");
    if (existing?.scheduled_day === day) throw new HttpError(409, "This recipe was already sent to Cookidoo for this date. Check Cookidoo before scheduling it again.");
    const locked = db.prepare("INSERT INTO cookidoo_exports (recipe_id, remote_id, state, scheduled_day) VALUES (?, NULL, 'working', NULL) ON CONFLICT(recipe_id) DO UPDATE SET state='working' WHERE state='ready'").run(recipe.id);
    if (!locked.changes) throw new HttpError(409, "Another Cookidoo operation is already in progress or needs review.");
    cookidooInFlight.add(recipe.id);
    let remoteId = existing?.remote_id ?? null;
    try {
      if (!remoteId) {
        remoteId = await cookidoo.create(recipe.title);
        db.prepare("UPDATE cookidoo_exports SET remote_id = ? WHERE recipe_id = ?").run(remoteId, recipe.id);
      }
      await cookidoo.update(remoteId, recipe);
      await cookidoo.schedule(remoteId, day);
      db.prepare("UPDATE cookidoo_exports SET state = 'ready', scheduled_day = ? WHERE recipe_id = ?").run(day, recipe.id);
      res.json({ day, remoteId });
    } catch (error) {
      const needsReview = !(error instanceof CookidooError) || error.uncertain;
      if (!remoteId && !needsReview) db.prepare("DELETE FROM cookidoo_exports WHERE recipe_id = ?").run(recipe.id);
      else db.prepare("UPDATE cookidoo_exports SET state = ? WHERE recipe_id = ?").run(needsReview ? "attention" : "ready", recipe.id);
      if (error instanceof CookidooError) {
        throw new HttpError(502, `${error.message}${needsReview ? " The result is uncertain; an administrator must review Cookidoo before retrying." : " Check Cookidoo before retrying."}`);
      }
      throw error;
    } finally {
      cookidooInFlight.delete(recipe.id);
    }
  });
  app.post("/api/admin/cookidoo/recipes/:id/reset", requireAdmin, (req, res) => {
    const recipe = findRecipe(z.string().parse(req.params.id));
    const { forget } = z.object({ forget: z.boolean() }).parse(req.body);
    if (cookidooInFlight.has(recipe.id)) throw new HttpError(409, "Wait for the Cookidoo operation to finish before resetting its link.");
    const state = db.prepare("SELECT remote_id, state, scheduled_day FROM cookidoo_exports WHERE recipe_id = ?").get(recipe.id) as CookidooExport | undefined;
    if (!state) throw new HttpError(404, "No Cookidoo link to review");
    if (forget || !state.remote_id) db.prepare("DELETE FROM cookidoo_exports WHERE recipe_id = ?").run(recipe.id);
    else db.prepare("UPDATE cookidoo_exports SET state='ready', scheduled_day=NULL WHERE recipe_id = ?").run(recipe.id);
    res.json(detail(recipe, currentUser(res)));
  });
  app.post("/api/admin/cookidoo/recipes/:id/link", requireAdmin, async (req, res) => {
    if (!cookidoo) throw new HttpError(503, "Cookidoo is not configured.");
    const recipe = findRecipe(z.string().parse(req.params.id));
    const { remoteId } = z.object({ remoteId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) }).parse(req.body);
    if (cookidooInFlight.has(recipe.id)) throw new HttpError(409, "Wait for the Cookidoo operation to finish.");
    const state = db.prepare("SELECT remote_id, state, scheduled_day FROM cookidoo_exports WHERE recipe_id = ?").get(recipe.id) as CookidooExport | undefined;
    if (!state || state.remote_id || state.state === "ready") throw new HttpError(409, "Only an unresolved creation can be linked.");
    try { await cookidoo.verifyRecipe(remoteId, recipe.title); }
    catch (error) {
      if (error instanceof CookidooError) throw new HttpError(502, error.message);
      throw error;
    }
    if (cookidooInFlight.has(recipe.id)) throw new HttpError(409, "A Cookidoo operation is in progress.");
    const linked = db.prepare("UPDATE cookidoo_exports SET remote_id=?, state='ready', scheduled_day=NULL WHERE recipe_id=? AND remote_id IS NULL AND state IN ('working','attention')").run(remoteId, recipe.id);
    if (!linked.changes) throw new HttpError(409, "The Cookidoo link changed while it was being verified.");
    res.json(detail(recipe, currentUser(res)));
  });
  app.get("/api/recipes", (_req, res) => {
    const recipes = db.prepare("SELECT * FROM recipes ORDER BY updated_at DESC").all() as Recipe[];
    res.json(recipes.map((recipe) => detail(recipe, currentUser(res))));
  });
  app.get("/api/recipes/:id", (req, res) => res.json(detail(findRecipe(req.params.id), currentUser(res))));
  app.post("/api/recipes", (req, res) => {
    const value = recipeInput.parse(req.body);
    const id = randomUUID();
    const now = new Date().toISOString();
    transaction(() => {
      db.prepare("INSERT INTO recipes VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, currentUser(res).id, value.title, value.description, value.ingredients, value.instructions, now, now);
      updateRelations(id, value);
    });
    res.status(201).json(detail(findRecipe(id), currentUser(res)));
  });
  app.put("/api/recipes/:id", (req, res) => {
    const recipe = findRecipe(z.string().parse(req.params.id));
    checkOwner(recipe, currentUser(res));
    const value = recipeInput.parse(req.body);
    transaction(() => {
      db.prepare("UPDATE recipes SET title=?, description=?, ingredients=?, instructions=?, updated_at=? WHERE id=?").run(value.title, value.description, value.ingredients, value.instructions, new Date().toISOString(), recipe.id);
      updateRelations(recipe.id, value);
    });
    res.json(detail(findRecipe(recipe.id), currentUser(res)));
  });
  app.delete("/api/recipes/:id", (req, res) => {
    const recipe = findRecipe(req.params.id);
    checkOwner(recipe, currentUser(res));
    if (cookidooInFlight.has(recipe.id)) throw new HttpError(409, "Wait for the Cookidoo operation to finish before deleting this recipe.");
    const images = db.prepare("SELECT * FROM images WHERE recipe_id = ?").all(recipe.id) as Image[];
    db.prepare("DELETE FROM recipes WHERE id = ?").run(recipe.id);
    images.forEach(unlinkImage);
    res.status(204).end();
  });
  app.put("/api/recipes/:id/like", (req, res) => {
    findRecipe(req.params.id);
    const { liked } = z.object({ liked: z.boolean() }).parse(req.body);
    if (liked) db.prepare("INSERT OR IGNORE INTO likes (recipe_id, user_id) VALUES (?, ?)").run(req.params.id, currentUser(res).id);
    else db.prepare("DELETE FROM likes WHERE recipe_id = ? AND user_id = ?").run(req.params.id, currentUser(res).id);
    res.json(detail(findRecipe(req.params.id), currentUser(res)));
  });
  app.post("/api/recipes/:id/comments", (req, res) => {
    findRecipe(req.params.id);
    const value = commentInput.parse(req.body);
    db.prepare("INSERT INTO comments VALUES (?, ?, ?, ?, ?)").run(randomUUID(), req.params.id, currentUser(res).id, value.text, new Date().toISOString());
    res.status(201).json(detail(findRecipe(req.params.id), currentUser(res)));
  });
  app.put("/api/comments/:id", (req, res) => {
    const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(req.params.id) as Comment | undefined;
    if (!comment) throw new HttpError(404, "Comment not found");
    if (comment.author_id !== currentUser(res).id && currentUser(res).role !== "admin") throw new HttpError(403, "Cannot edit this comment");
    db.prepare("UPDATE comments SET text = ? WHERE id = ?").run(commentInput.parse(req.body).text, comment.id);
    res.json(detail(findRecipe(comment.recipe_id), currentUser(res)));
  });
  app.delete("/api/comments/:id", (req, res) => {
    const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(req.params.id) as Comment | undefined;
    if (!comment) throw new HttpError(404, "Comment not found");
    if (comment.author_id !== currentUser(res).id && currentUser(res).role !== "admin") throw new HttpError(403, "Cannot delete this comment");
    db.prepare("DELETE FROM comments WHERE id = ?").run(comment.id);
    res.json(detail(findRecipe(comment.recipe_id), currentUser(res)));
  });

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
  app.post("/api/recipes/:id/images", upload.single("image"), async (req, res) => {
    const recipe = findRecipe(z.string().parse(req.params.id));
    checkOwner(recipe, currentUser(res));
    if (!req.file) throw new HttpError(400, "Select an image");
    const metadata = await sharp(req.file.buffer, { limitInputPixels: 40000000 }).metadata().catch(() => { throw new HttpError(400, "Invalid image"); });
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) throw new HttpError(400, "Only JPEG, PNG and WebP images are supported");
    const bytes = await sharp(req.file.buffer, { limitInputPixels: 40000000 }).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    const activeUser = db.prepare("SELECT * FROM users WHERE id = ? AND enabled = 1").get(currentUser(res).id) as User | undefined;
    if (!activeUser) throw new HttpError(403, "Your access has been revoked");
    checkOwner(findRecipe(recipe.id), activeUser);
    const existing = db.prepare("SELECT COUNT(*) AS count FROM images WHERE recipe_id = ?").get(recipe.id) as { count: number };
    if (existing.count >= 5) throw new HttpError(400, "A recipe can have at most five images");
    const id = randomUUID();
    const filename = `${id}.webp`;
    writeFileSync(path.join(imageDir, filename), bytes, { flag: "wx" });
    try { db.prepare("INSERT INTO images VALUES (?, ?, ?, ?)").run(id, recipe.id, filename, existing.count === 0 ? 1 : 0); }
    catch (error) { rmSync(path.join(imageDir, filename)); throw error; }
    res.status(201).json(detail(findRecipe(recipe.id), currentUser(res)));
  });
  app.get("/api/images/:id", (req, res) => {
    const image = db.prepare("SELECT * FROM images WHERE id = ?").get(req.params.id) as Image | undefined;
    if (!image) throw new HttpError(404, "Image not found");
    res.type("image/webp").send(readFileSync(path.join(imageDir, image.filename)));
  });
  app.put("/api/images/:id/cover", (req, res) => {
    const image = db.prepare("SELECT * FROM images WHERE id = ?").get(req.params.id) as Image | undefined;
    if (!image) throw new HttpError(404, "Image not found");
    const recipe = findRecipe(image.recipe_id);
    checkOwner(recipe, currentUser(res));
    transaction(() => {
      db.prepare("UPDATE images SET is_cover = 0 WHERE recipe_id = ?").run(recipe.id);
      db.prepare("UPDATE images SET is_cover = 1 WHERE id = ?").run(image.id);
    });
    res.json(detail(recipe, currentUser(res)));
  });
  app.delete("/api/images/:id", (req, res) => {
    const image = db.prepare("SELECT * FROM images WHERE id = ?").get(req.params.id) as Image | undefined;
    if (!image) throw new HttpError(404, "Image not found");
    const recipe = findRecipe(image.recipe_id);
    checkOwner(recipe, currentUser(res));
    transaction(() => {
      db.prepare("DELETE FROM images WHERE id = ?").run(image.id);
      if (image.is_cover) db.prepare("UPDATE images SET is_cover = 1 WHERE id = (SELECT id FROM images WHERE recipe_id = ? ORDER BY rowid LIMIT 1)").run(recipe.id);
    });
    unlinkImage(image);
    res.json(detail(recipe, currentUser(res)));
  });
  for (const table of ["tags", "categories"] as const) {
    app.post(`/api/admin/${table}`, requireAdmin, (req, res) => {
      const { name } = taxonomyInput.parse(req.body);
      db.prepare(`INSERT INTO ${table} (id, name) VALUES (?, ?)`).run(randomUUID(), name);
      res.status(201).json(taxonomies(table));
    });
    app.put(`/api/admin/${table}/:id`, requireAdmin, (req, res) => {
      const { name } = taxonomyInput.parse(req.body);
      if (!db.prepare(`UPDATE ${table} SET name = ? WHERE id = ?`).run(name, z.string().parse(req.params.id)).changes) throw new HttpError(404, "Item not found");
      res.json(taxonomies(table));
    });
    app.delete(`/api/admin/${table}/:id`, requireAdmin, (req, res) => {
      if (!db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(z.string().parse(req.params.id)).changes) throw new HttpError(404, "Item not found");
      res.json(taxonomies(table));
    });
  }
  app.get("/api/admin/users", requireAdmin, (_req, res) => res.json(db.prepare("SELECT * FROM users ORDER BY name").all()));
  app.put("/api/admin/users/:id", requireAdmin, (req, res) => {
    const value = userInput.parse(req.body);
    if (value.id !== req.params.id) throw new HttpError(400, "User ID does not match");
    if ((value.id === options.initialAdminId || value.id === currentUser(res).id) && (!value.enabled || value.role !== "admin")) {
      throw new HttpError(400, "The initial administrator and your own administrator account cannot be disabled or demoted");
    }
    db.prepare("INSERT INTO users (id, name, role, enabled) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role, enabled=excluded.enabled").run(value.id, value.name, value.role, Number(value.enabled));
    res.json(db.prepare("SELECT * FROM users ORDER BY name").all());
  });

  if (options.staticDir) app.use(express.static(options.staticDir, { index: "index.html", fallthrough: true }));
  app.use((_req, _res, next) => next(new HttpError(404, "Not found")));
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof ZodError) return res.status(400).json({ error: error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") });
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error instanceof multer.MulterError) return res.status(400).json({ error: error.message });
    if (error instanceof Error && "type" in error && error.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON" });
    if (error instanceof Error && "type" in error && error.type === "entity.too.large") return res.status(413).json({ error: "Request body is too large" });
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) return res.status(409).json({ error: "An item with that name already exists" });
    if (error instanceof Error && error.message.includes("FOREIGN KEY constraint failed")) return res.status(400).json({ error: "A selected tag or category no longer exists" });
    console.error("Request failed:", error);
    res.status(500).json({ error: "The request failed; check the add-on logs" });
  };
  app.use(errors);
  return { app, close: () => db.close() };
}
