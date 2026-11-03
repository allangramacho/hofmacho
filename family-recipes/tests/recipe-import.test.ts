import { describe, expect, it, vi } from "vitest";
import { createRecipeImporter, extractRecipe, RecipeImportError } from "../server/recipe-import.js";

const html = `<html><head>
  <script type="application/ld+json">{bad json}</script>
  <script type="application/ld+json; charset=utf-8">${JSON.stringify({
    "@graph": [
      { "@type": "WebPage", name: "Page" },
      {
        "@type": ["Thing", "https://schema.org/Recipe"], name: "Tomato &amp; pasta",
        description: "<p>Family dinner</p>", recipeIngredient: ["200g pasta", "Tomato &amp; basil"],
        recipeInstructions: [{ "@type": "HowToSection", itemListElement: [
          { "@type": "HowToStep", text: "Boil the pasta." }, { "@type": "HowToStep", text: "<b>Serve</b> warm." },
        ] }],
      },
    ],
  })}</script>
</head></html>`;

describe("recipe import", () => {
  it("extracts JSON-LD graphs, ingredient lines, and nested instruction steps", () => {
    expect(extractRecipe(html)).toEqual({
      title: "Tomato & pasta", description: "Family dinner",
      ingredients: "200g pasta\nTomato & basil", instructions: "Boil the pasta.\nServe warm.",
    });
  });
  it("leaves missing fields editable and rejects missing or oversized recipes", () => {
    expect(extractRecipe('<script type="application/ld+json">{"@type":"Recipe","name":"Toast"}</script>'))
      .toEqual({ title: "Toast", description: "", ingredients: "", instructions: "" });
    expect(() => extractRecipe("<p>Not a recipe</p>")).toThrow("No structured recipe");
    const oversized = `<script type="application/ld+json">${JSON.stringify({ "@type": "Recipe", name: "x".repeat(161) })}</script>`;
    expect(() => extractRecipe(oversized)).toThrow("too long");
  });
  it("pins a validated public DNS address and follows safe redirects", async () => {
    const resolve = vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]);
    const download = vi.fn()
      .mockResolvedValueOnce({ status: 302, location: "https://other.example/recipe", body: "" })
      .mockResolvedValueOnce({ status: 200, contentType: "text/html; charset=utf-8", body: html });
    const result = await createRecipeImporter({ resolve, download })("https://example.com/start");
    expect(result.title).toBe("Tomato & pasta");
    expect(resolve.mock.calls).toEqual([["example.com"], ["other.example"]]);
    expect(download.mock.calls[0][1]).toEqual({ address: "8.8.8.8", family: 4 });
  });
  it("blocks private, reserved, mapped and mixed DNS addresses before connecting", async () => {
    const download = vi.fn();
    for (const address of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "::1", "::ffff:192.168.1.1", "2001:db8::1"]) {
      const importer = createRecipeImporter({ resolve: async () => [{ address, family: address.includes(":") ? 6 : 4 }], download });
      await expect(importer("https://example.com")).rejects.toThrow("public internet");
    }
    const mixed = createRecipeImporter({
      resolve: async () => [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }], download,
    });
    await expect(mixed("https://example.com")).rejects.toThrow("public internet");
    await expect(mixed("http://127.0.0.1")).rejects.toThrow("public internet");
    expect(download).not.toHaveBeenCalled();
  });
  it("revalidates redirect targets and rejects unsafe or malformed URLs", async () => {
    const download = vi.fn().mockResolvedValue({ status: 302, location: "http://127.0.0.1/admin", body: "" });
    const importer = createRecipeImporter({ resolve: async () => [{ address: "8.8.8.8", family: 4 }], download });
    await expect(importer("https://example.com")).rejects.toThrow("public internet");
    expect(download).toHaveBeenCalledTimes(1);
    for (const url of ["file:///etc/passwd", "https://user:pass@example.com", "https://example.com:8443", "not a url"]) {
      await expect(importer(url)).rejects.toBeInstanceOf(RecipeImportError);
    }
  });
  it("rejects redirect loops, non-HTML pages, and failed connections", async () => {
    const resolve = async () => [{ address: "8.8.8.8", family: 4 }];
    const redirect = vi.fn().mockResolvedValue({ status: 302, location: "/next", body: "" });
    await expect(createRecipeImporter({ resolve, download: redirect })("https://example.com")).rejects.toThrow("redirected too many times");
    expect(redirect).toHaveBeenCalledTimes(4);
    await expect(createRecipeImporter({ resolve, download: async () => ({ status: 200, contentType: "application/json", body: "{}" }) })("https://example.com"))
      .rejects.toThrow("HTML recipe page");
    await expect(createRecipeImporter({ resolve: async () => { throw new Error("DNS failed"); } })("https://example.com"))
      .rejects.toThrow("Could not reach");
  });
});
