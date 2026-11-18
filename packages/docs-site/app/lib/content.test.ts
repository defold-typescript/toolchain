import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTokenBlock } from "@defold-typescript/docs-render/design-tokens";
import { processDocsMarkdown } from "@defold-typescript/docs-render/docs-markdown";
import { engineIndexBaseTable } from "@defold-typescript/types";
import { toHtml } from "hast-util-to-html";
import { CHANGELOG_TAG_DATES } from "../generated/changelog-dates";
import { applyChangelogTagDates } from "./changelog-dates";
import { renderGuidePage } from "./content";
import { listGuidePages } from "./guide-loader";
import { guideSymbolRoutes } from "./guide-symbol-links";

const GUIDE_DIR = join(import.meta.dir, "../../../docs/guide");
const STYLES = readFileSync(join(import.meta.dir, "../../../docs-render/src/styles.css"), "utf8");
const GUIDE_PAGES = listGuidePages(GUIDE_DIR);

function guidePage(predicate: (file: string) => boolean) {
  const found = GUIDE_PAGES.find((p) => predicate(p.file));
  if (!found) throw new Error("no matching guide page");
  return found;
}

const versionParts = (version: string): number[] =>
  version.replace(/^v/, "").split(".").map(Number);

function newestTag(): string {
  const [newest] = Object.keys(CHANGELOG_TAG_DATES).sort((a, b) => {
    const [x, y] = [versionParts(a), versionParts(b)];
    for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
    return 0;
  });
  if (newest === undefined) throw new Error("no changelog tag dates");
  return newest;
}

describe("renderGuidePage", () => {
  test("the index page is processed with its Overview title", async () => {
    const index = GUIDE_PAGES.find((p) => p.isIndex);
    if (!index) throw new Error("no index guide page");
    const page = await renderGuidePage(GUIDE_DIR, index);
    expect(page.hast.type).toBe("root");
    expect(page.structuredData.headings.length).toBeGreaterThan(0);
    expect(page.toc.find((item) => item.depth === 1)).toEqual({
      title: "Overview",
      url: "#overview",
      depth: 1,
    });
  });

  test("the changelog's headings carry their tag dates", async () => {
    const tag = newestTag();
    const expected = await processDocsMarkdown(
      applyChangelogTagDates(`## ${tag}`, CHANGELOG_TAG_DATES),
      { routePrefix: "" },
    );
    const url = expected.toc[0]?.url ?? "";
    expect(url).toContain(CHANGELOG_TAG_DATES[tag] ?? "no date");
    const changelog = await renderGuidePage(
      GUIDE_DIR,
      guidePage((file) => file === "changelog.md"),
    );
    expect(changelog.toc.map((item) => item.url)).toContain(url);
  });

  test("a guide directive expands before processing", async () => {
    const directive = "<!-- engine-index-base-table -->";
    const page = guidePage((file) =>
      readFileSync(join(GUIDE_DIR, file), "utf8").includes(directive),
    );
    const html = toHtml((await renderGuidePage(GUIDE_DIR, page)).hast);
    const table = toHtml(
      (
        await processDocsMarkdown(engineIndexBaseTable(), {
          routePrefix: "",
          symbolCodeLinks: guideSymbolRoutes(GUIDE_DIR),
        })
      ).hast,
    );
    expect(table).toStartWith("<table");
    expect(html).toContain(table);
    expect(html).not.toContain("engine-index-base-table");
  });
});

function tokensDeclaredUnder(selector: string): Map<string, string> {
  const tokens = new Map<string, string>();
  const escaped = selector.replace(/[[\]"]/g, "\\$&");
  for (const block of STYLES.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "g"))) {
    for (const [name, value] of parseTokenBlock(block[1] ?? "")) tokens.set(name, value);
  }
  return tokens;
}

const page = GUIDE_PAGES.find((p) => p.slug === "vectors-tutorial");
if (!page) throw new Error("guide page vectors-tutorial not found");
const source = readFileSync(join(GUIDE_DIR, page.file), "utf8");
const html = toHtml((await renderGuidePage(GUIDE_DIR, page)).hast);
const figures = [
  ...html.matchAll(/<figure\b[^>]*data-slot="svg-figure"[^>]*>([\s\S]*?)<\/figure>/g),
].map((m) => m[1] ?? "");

describe("vectors-tutorial inline figures", () => {
  test("inlines every .svg#inline reference as a figure", () => {
    const references = source.match(/\]\([^)\s]+\.svg#inline[^)]*\)/g) ?? [];
    expect(references.length).toBeGreaterThan(0);
    expect(figures.length).toBe(references.length);
  });

  test("has no duplicate id on the page", () => {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(duplicates).toEqual([]);
  });

  test("figures carry no export fonts and no literal colours", () => {
    for (const figure of figures) {
      expect(figure).not.toContain("DejaVu");
      expect(figure).not.toContain("rgb(");
      const withoutFallbacks = figure.replace(/var\(--fig-[a-z-]+, #[0-9a-fA-F]{3,8}\)/g, "");
      expect(withoutFallbacks).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });

  test("every --fig-* token a figure uses has a light value and, unless it aliases a theme token, a dark one", () => {
    const used = new Set(
      figures.flatMap((f) => [...f.matchAll(/var\((--fig-[a-z-]+)/g)].map((m) => m[1])),
    );
    expect(used.size).toBeGreaterThan(0);
    const light = tokensDeclaredUnder(":root");
    const dark = tokensDeclaredUnder('[data-theme="dark"]');
    const followsTheme = (name: string) => light.get(name)?.startsWith("var(--color-") ?? false;
    const missing = [...used].filter(
      (name) => !name || !light.has(name) || !(dark.has(name) || followsTheme(name)),
    );
    expect(missing).toEqual([]);
  });
});
