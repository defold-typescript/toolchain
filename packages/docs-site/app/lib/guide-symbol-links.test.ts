import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { canonicalApiPages } from "./api-content";
import { loadCombinedSurface } from "./api-surface-loader";
import { withBase } from "./base";
import { renderGuidePage } from "./content";
import { listGuidePages } from "./guide-loader";
import { guideSymbolRoutes } from "./guide-symbol-links";
import { renderMarkdown } from "./markdown";
import { combinedSymbolIndexRecords } from "./symbol-index";

const GUIDE_DIR = join(import.meta.dir, "../../../../packages/docs/guide");
const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");
const COMBINED_INDEX = combinedSymbolIndexRecords(loadCombinedSurface(REAL_TYPES_DIR));

function routeOf(key: string): string {
  const route = COMBINED_INDEX[key]?.route;
  if (!route) throw new Error(`symbol index has no entry for ${key}`);
  return route;
}

function linkedCode(key: string, route: string = routeOf(key)): string {
  return `<a href="${withBase(route)}"><code>${key}</code></a>`;
}

// Global types are version-independent pages, so they are absent from the
// Combined index and are looked up among the canonical pages instead.
function globalTypeRoute(namespace: string): string {
  const page = canonicalApiPages(REAL_TYPES_DIR).find((p) => p.namespace === namespace);
  if (!page) throw new Error(`no canonical API page for ${namespace}`);
  expect(page.category).toBe("global-type");
  return page.route;
}

async function renderReal(file: string): Promise<string> {
  const page = listGuidePages(GUIDE_DIR).find((p) => p.file === file);
  if (!page) throw new Error(`no guide page ${file}`);
  return renderGuidePage(GUIDE_DIR, page);
}

describe("symbol-named inline code in rendered guide pages", () => {
  test("a guide page links a symbol span to its reference heading", async () => {
    const html = await renderReal("typescript-vs-lua.md");
    expect(html).toContain(linkedCode("go.get"));
  });

  test("a guide page links a prefixless global function span", async () => {
    const html = await renderReal("transpile-diagnostics.md");
    expect(html).toContain(linkedCode("hash"));
  });

  test("a guide page links a global type span", async () => {
    const html = await renderReal("messages.md");
    expect(html).toContain(linkedCode("Hash", globalTypeRoute("Hash")));
  });

  // The changelog's released sections are frozen source; the link has to come
  // from the render, so it reaches every section that names the constant.
  test("the changelog links a constant span in more than one release section", async () => {
    const html = await renderReal("changelog.md");
    const sections = html.split("<h2").slice(1);
    const linked = sections.filter((s) => s.includes(linkedCode("render.RENDER_TARGET_DEFAULT")));
    expect(linked.length).toBeGreaterThanOrEqual(2);
  });

  test("only whole-symbol spans outside links, headings and fences link", async () => {
    const source = [
      "# Page",
      "",
      "### The `go.get` heading",
      "",
      "An authored link [`go.get`](https://example.com/x) stays one anchor.",
      "",
      "Unlinked: `go`, `game.project`, `go.get(url)`.",
      "",
      "```ts",
      "go.get(url);",
      "```",
      "",
      "Linked: `go.get`, `hash`, `Hash`.",
    ].join("\n");
    const routes = guideSymbolRoutes(GUIDE_DIR);
    const html = await renderMarkdown(source, { symbolCodeLinks: routes });
    const plain = await renderMarkdown(source);

    const href = `href="${withBase(routeOf("go.get"))}"`;
    expect(html.split(href).length - 1).toBe(1);
    expect(html).toContain(
      `Linked: ${linkedCode("go.get")}, ${linkedCode("hash")}, ${linkedCode("Hash", globalTypeRoute("Hash"))}`,
    );
    expect(html).not.toMatch(/<a [^>]*>(?:(?!<\/a>)[\s\S])*<a /);
    for (const code of ["go", "game.project", "go.get(url)"]) {
      expect(html).toContain(` <code>${code}</code>`);
    }
    const ids = (text: string) =>
      [...text.matchAll(/<h[1-6][^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids(html)).toEqual(ids(plain));
  });
});
