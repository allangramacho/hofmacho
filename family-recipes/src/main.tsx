import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type User = { id: string; name: string; role: "admin" | "member"; enabled: number };
type Item = { id: string; name: string };
type Image = { id: string; is_cover: number };
type Comment = { id: string; author: string; author_id: string; text: string; created_at: string };
type Recipe = {
  id: string; owner_id: string; owner: string; title: string; description: string;
  ingredients: string; instructions: string; tags: Item[]; categories: Item[]; images: Image[];
  likes: number; liked: boolean; comments: Comment[]; updated_at: string;
  cookidoo?: { remote_id: string | null; state: "working" | "ready" | "attention"; scheduled_day: string | null };
};
type RecipeForm = { title: string; description: string; ingredients: string; instructions: string; tags: string[]; categories: string[] };
type Data = { tags: Item[]; categories: Item[] };
const emptyForm = (): RecipeForm => ({ title: "", description: "", ingredients: "", instructions: "", tags: [], categories: [] });

async function api<T>(url: string, method = "GET", data?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== "GET") headers["X-Family-Recipes"] = "1";
  if (data !== undefined && !(data instanceof FormData)) headers["Content-Type"] = "application/json";
  const response = await fetch(`./api/${url}`, {
    method, headers, body: data instanceof FormData ? data : data === undefined ? undefined : JSON.stringify(data),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [taxonomy, setTaxonomy] = useState<Data>({ tags: [], categories: [] });
  const [users, setUsers] = useState<User[]>([]);
  const [screen, setScreen] = useState<"list" | "view" | "edit" | "admin">("list");
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [form, setForm] = useState<RecipeForm>(emptyForm);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cookidooConfigured, setCookidooConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const [me, all, groups, cookidoo] = await Promise.all([api<User>("me"), api<Recipe[]>("recipes"), api<Data>("taxonomy"), api<{ configured: boolean }>("cookidoo")]);
    setUser(me); setRecipes(all); setTaxonomy(groups);
    setCookidooConfigured(cookidoo.configured);
    if (me.role === "admin") setUsers(await api<User[]>("admin/users"));
  };
  const run = async (action: () => Promise<void>) => {
    setError(""); setNotice(""); setBusy(true);
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  };
  useEffect(() => { void run(async () => { try { await refresh(); } finally { setLoading(false); } }); }, []);

  const open = async (id: string) => {
    const recipe = await api<Recipe>(`recipes/${id}`);
    setSelected(recipe); setScreen("view");
  };
  const showEdit = (recipe?: Recipe) => {
    setSelected(recipe ?? null);
    setForm(recipe ? { title: recipe.title, description: recipe.description, ingredients: recipe.ingredients, instructions: recipe.instructions, tags: recipe.tags.map((x) => x.id), categories: recipe.categories.map((x) => x.id) } : emptyForm());
    setScreen("edit");
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const saved = await api<Recipe>(selected ? `recipes/${selected.id}` : "recipes", selected ? "PUT" : "POST", form);
      setSelected(saved); setScreen("view"); await refresh();
    });
  };
  const updateRecipe = async (url: string, method: string, data?: unknown) => {
    const updated = await api<Recipe>(url, method, data);
    setSelected(updated); await refresh();
  };
  const canEdit = selected && user && (selected.owner_id === user.id || user.role === "admin");
  const filtered = recipes.filter((recipe) =>
    `${recipe.title} ${recipe.description} ${recipe.ingredients}`.toLowerCase().includes(query.toLowerCase()) &&
    (!tagFilter || recipe.tags.some((item) => item.id === tagFilter)) &&
    (!categoryFilter || recipe.categories.some((item) => item.id === categoryFilter)));
  const changeSelection = (key: "tags" | "categories", id: string) => setForm((old) => ({
    ...old, [key]: old[key].includes(id) ? old[key].filter((x) => x !== id) : [...old[key], id],
  }));
  const refreshTaxonomy = async () => { setTaxonomy(await api<Data>("taxonomy")); await refresh(); };
  const editTaxonomy = (kind: "tags" | "categories", item?: Item) => void run(async () => {
    const name = window.prompt(item ? "Rename" : `New ${kind === "tags" ? "tag" : "category"}`, item?.name ?? "");
    if (name === null) return;
    await api(`admin/${kind}${item ? `/${item.id}` : ""}`, item ? "PUT" : "POST", { name });
    await refreshTaxonomy();
  });

  return <div className="shell">
    <header className="topbar">
      <button className="brand" onClick={() => setScreen("list")}><span>✿</span> Family Recipes</button>
      <nav><button onClick={() => setScreen("list")}>Recipes</button>{user?.role === "admin" && <button onClick={() => setScreen("admin")}>Admin</button>}</nav>
      {user && <span className="identity">{user.name}</span>}
    </header>
    <main>
      {error && <div className="alert" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
      {notice && <div className="panel" role="status">{notice}</div>}
      {loading ? <p>Loading recipes…</p> : !user ? <div className="empty"><h1>Access unavailable</h1><p>Open this app through Home Assistant and ask an app administrator for access.</p></div> : <>
        {screen === "list" && <>
          <section className="hero"><div><p className="eyebrow">YOUR FAMILY COOKBOOK</p><h1>Good food, shared together.</h1><p>Keep your favorite recipes close, from everyday meals to family classics.</p></div><button className="primary" onClick={() => showEdit()}>+ Add recipe</button></section>
          <div className="filters">
            <label className="search"><span className="sr-only">Search recipes</span><input placeholder="Search recipes or ingredients" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
            <select aria-label="Filter by category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="">All categories</option>{taxonomy.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select aria-label="Filter by tag" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}><option value="">All tags</option>{taxonomy.tags.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          </div>
          <div className="section-heading"><h2>Recipes</h2><span>{filtered.length} {filtered.length === 1 ? "recipe" : "recipes"}</span></div>
          {filtered.length === 0 ? <div className="empty"><h2>No recipes found</h2><p>Try a different search or add your first recipe.</p></div> : <div className="grid">{filtered.map((recipe) => <button className="card" key={recipe.id} onClick={() => void run(() => open(recipe.id))}>
            {recipe.images[0] ? <img src={`./api/images/${recipe.images[0].id}`} alt="" /> : <div className="placeholder">✿</div>}
            <div className="card-body"><div className="chips">{recipe.categories.map((item) => <span key={item.id}>{item.name}</span>)}</div><h3>{recipe.title}</h3><p>{recipe.description || "A family favorite."}</p><small>By {recipe.owner} · ♥ {recipe.likes}</small></div>
          </button>)}</div>}
        </>}
        {screen === "view" && selected && <>
          <button className="back" onClick={() => setScreen("list")}>← All recipes</button>
          <div className="detail-header"><div><div className="chips">{selected.categories.map((x) => <span key={x.id}>{x.name}</span>)}</div><h1>{selected.title}</h1><p>{selected.description}</p><small>Added by {selected.owner}</small></div>
            <div className="actions"><button onClick={() => void run(() => updateRecipe(`recipes/${selected.id}/like`, "PUT", { liked: !selected.liked }))}>{selected.liked ? "♥ Liked" : "♡ Like"} ({selected.likes})</button>{canEdit && <button onClick={() => showEdit(selected)}>Edit</button>}{canEdit && <button className="danger" onClick={() => { if (window.confirm("Delete this recipe and its photos?")) void run(async () => { await api(`recipes/${selected.id}`, "DELETE"); setSelected(null); setScreen("list"); await refresh(); }); }}>Delete</button>}</div>
          </div>
          {selected.images.length > 0 && <div className="gallery">{selected.images.map((image) => <div key={image.id}><img src={`./api/images/${image.id}`} alt={`${selected.title} recipe`} />{canEdit && <div className="image-actions"><button disabled={Boolean(image.is_cover)} onClick={() => void run(() => updateRecipe(`images/${image.id}/cover`, "PUT"))}>{image.is_cover ? "Cover" : "Set cover"}</button><button onClick={() => { if (window.confirm("Remove this photo?")) void run(() => updateRecipe(`images/${image.id}`, "DELETE")); }}>Remove</button></div>}</div>)}</div>}
          {canEdit && <label className="upload">Add photo <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || selected.images.length >= 5} onChange={(event) => {
            const file = event.target.files?.[0]; event.target.value = "";
            if (file) void run(async () => { const data = new FormData(); data.append("image", file); await updateRecipe(`recipes/${selected.id}/images`, "POST", data); });
          }} /><small>JPEG, PNG or WebP · up to 5 MB each, 5 photos</small></label>}
          <div className="recipe-columns"><section className="panel"><h2>Ingredients</h2><p className="multiline">{selected.ingredients}</p></section><section className="panel"><h2>Method</h2><p className="multiline">{selected.instructions}</p></section></div>
          <section className="panel">
            <h2>Cookidoo · TM6</h2>
            <p>Send the current ingredients and one instruction per line to the shared Cookidoo account for today. This replaces the linked Cookidoo recipe's ingredients and instructions. Photos are not sent.</p>
            <p>Steps are text only: no timer, temperature or speed is set automatically. Check the recipe and operate the TM6 manually.</p>
            {!cookidooConfigured && <p>Ask an administrator to configure the Cookidoo session in Home Assistant.</p>}
            {selected.cookidoo && selected.cookidoo.state !== "ready" && <p role="alert">This Cookidoo operation needs administrator review. Check the created recipe and calendar in Cookidoo before retrying.</p>}
            {selected.cookidoo?.scheduled_day && <p>Last sent for {selected.cookidoo.scheduled_day}; check Cookidoo for its current calendar.</p>}
            <div className="actions">
              <button disabled={busy || !cookidooConfigured || Boolean(selected.cookidoo && selected.cookidoo.state !== "ready")} onClick={() => {
                if (!window.confirm("Send this recipe to the shared Cookidoo account for today? The linked Cookidoo recipe will be overwritten.")) return;
                void run(async () => {
                  const now = new Date();
                  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
                  try {
                    await api(`recipes/${selected.id}/cookidoo`, "POST", { day });
                  } catch (error) {
                    await open(selected.id);
                    throw error;
                  }
                  await open(selected.id); await refresh();
                  setNotice(`Cookidoo confirmed this recipe for ${day}. Check it on your TM6 before cooking.`);
                });
              }}>Send to Cookidoo for today</button>
              {user.role === "admin" && selected.cookidoo && selected.cookidoo.state !== "ready" && <button disabled={busy} onClick={() => {
                if (!window.confirm("Have you checked Cookidoo for the recipe and calendar entry? Continue only if it is safe to retry; this can create duplicates.")) return;
                void run(() => updateRecipe(`admin/cookidoo/recipes/${selected.id}/reset`, "POST", { forget: false }));
              }}>Review complete: allow retry</button>}
              {user.role === "admin" && selected.cookidoo && selected.cookidoo.state !== "ready" && !selected.cookidoo.remote_id && <button disabled={busy} onClick={() => {
                const remoteId = window.prompt("Enter the ID of the matching created recipe in Cookidoo. Retrying will overwrite its ingredients and instructions.");
                if (remoteId === null) return;
                void run(() => updateRecipe(`admin/cookidoo/recipes/${selected.id}/link`, "POST", { remoteId }));
              }}>Link existing Cookidoo recipe</button>}
              {user.role === "admin" && selected.cookidoo?.state === "ready" && selected.cookidoo.scheduled_day && <button disabled={busy} onClick={() => {
                if (!window.confirm("Have you checked Cookidoo and resolved the existing calendar entry? Allowing a repeat send may create a duplicate.")) return;
                void run(() => updateRecipe(`admin/cookidoo/recipes/${selected.id}/reset`, "POST", { forget: false }));
              }}>Allow scheduling again</button>}
              {user.role === "admin" && selected.cookidoo && <button disabled={busy} onClick={() => {
                if (!window.confirm("Forget the local Cookidoo link? The Cookidoo recipe will not be deleted; sending again may create a duplicate.")) return;
                void run(() => updateRecipe(`admin/cookidoo/recipes/${selected.id}/reset`, "POST", { forget: true }));
              }}>Forget Cookidoo link</button>}
            </div>
          </section>
          {selected.tags.length > 0 && <div className="chips">{selected.tags.map((tag) => <span key={tag.id}>#{tag.name}</span>)}</div>}
          <section className="panel comments"><h2>Comments ({selected.comments.length})</h2>
            {selected.comments.map((item) => <article key={item.id}><strong>{item.author}</strong><p className="multiline">{item.text}</p>{(item.author_id === user.id || user.role === "admin") && <div className="actions"><button onClick={() => { const text = window.prompt("Edit comment", item.text); if (text !== null) void run(() => updateRecipe(`comments/${item.id}`, "PUT", { text })); }}>Edit</button><button onClick={() => { if (window.confirm("Delete this comment?")) void run(() => updateRecipe(`comments/${item.id}`, "DELETE")); }}>Delete</button></div>}</article>)}
            <form onSubmit={(event) => { event.preventDefault(); void run(async () => { await updateRecipe(`recipes/${selected.id}/comments`, "POST", { text: comment }); setComment(""); }); }}><label>Add a comment<textarea required maxLength={4000} value={comment} onChange={(e) => setComment(e.target.value)} /></label><button className="primary" disabled={busy}>Post comment</button></form>
          </section>
        </>}
        {screen === "edit" && <><button className="back" onClick={() => setScreen(selected ? "view" : "list")}>← Cancel</button><div className="section-heading"><h1>{selected ? "Edit recipe" : "Add a recipe"}</h1></div>
          <form className="panel editor" onSubmit={(event) => void save(event)}>
            <label>Recipe title<input required maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label>Description<textarea maxLength={4000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <label>Ingredients <small>One per line</small><textarea required rows={8} maxLength={20000} value={form.ingredients} onChange={(e) => setForm({ ...form, ingredients: e.target.value })} /></label>
            <label>Instructions <small>For Cookidoo, put each step on a separate line.</small><textarea required rows={10} maxLength={30000} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></label>
            {(["categories", "tags"] as const).map((kind) => <fieldset key={kind}><legend>{kind === "categories" ? "Categories" : "Tags"}</legend><div className="check-list">{taxonomy[kind].length ? taxonomy[kind].map((item) => <label key={item.id}><input type="checkbox" checked={form[kind].includes(item.id)} onChange={() => changeSelection(kind, item.id)} /> {item.name}</label>) : <small>An administrator can add {kind}.</small>}</div></fieldset>)}
            <button className="primary" disabled={busy}>Save recipe</button>
          </form>
        </>}
        {screen === "admin" && user.role === "admin" && <><h1>Administration</h1><p>Manage access to this app, not Home Assistant accounts.</p>
          <section className="panel"><div className="section-heading"><h2>Users</h2><button onClick={() => void run(async () => {
            const id = window.prompt("Home Assistant user ID"); if (id === null) return;
            const name = window.prompt("Display name"); if (name === null) return;
            setUsers(await api<User[]>(`admin/users/${encodeURIComponent(id)}`, "PUT", { id, name, role: "member", enabled: true }));
          })}>+ Allow user</button></div>
            {users.map((item) => <div className="admin-row" key={item.id}><div><strong>{item.name}</strong><small>{item.id}</small></div><span>{item.role} · {item.enabled ? "enabled" : "disabled"}</span><div className="actions"><button onClick={() => void run(async () => { setUsers(await api<User[]>(`admin/users/${encodeURIComponent(item.id)}`, "PUT", { ...item, enabled: Boolean(item.enabled), role: item.role === "admin" ? "member" : "admin" })); })}>{item.role === "admin" ? "Make member" : "Make admin"}</button><button onClick={() => void run(async () => { setUsers(await api<User[]>(`admin/users/${encodeURIComponent(item.id)}`, "PUT", { ...item, enabled: !item.enabled })); })}>{item.enabled ? "Disable" : "Enable"}</button></div></div>)}
          </section>
          {(["categories", "tags"] as const).map((kind) => <section className="panel" key={kind}><div className="section-heading"><h2>{kind === "categories" ? "Categories" : "Tags"}</h2><button onClick={() => editTaxonomy(kind)}>+ Add</button></div>{taxonomy[kind].map((item) => <div className="admin-row" key={item.id}><strong>{item.name}</strong><div className="actions"><button onClick={() => editTaxonomy(kind, item)}>Rename</button><button onClick={() => { if (window.confirm(`Delete "${item.name}" and remove it from all recipes?`)) void run(async () => { await api(`admin/${kind}/${item.id}`, "DELETE"); await refreshTaxonomy(); }); }}>Delete</button></div></div>)}</section>)}
        </>}
      </>}
    </main>
  </div>;
}

createRoot(document.getElementById("root")!).render(<App />);
