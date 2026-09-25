import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderGuidePage } from "./content";
import { listGuidePages } from "./guide-loader";

const GUIDE_DIR = join(import.meta.dir, "../../../docs/guide");
const STYLES = readFileSync(join(import.meta.dir, "../styles.css"), "utf8");

function tokensDeclaredUnder(selector: string): Set<string> {
  const names = new Set<string>();
  const escaped = selector.replace(/[[\]"]/g, "\\$&");
  for (const block of STYLES.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "g"))) {
    for (const decl of (block[1] ?? "").matchAll(/(--fig-[a-z-]+)\s*:/g)) {
      if (decl[1]) names.add(decl[1]);
    }
  }
  return names;
}

const page = listGuidePages(GUIDE_DIR).find((p) => p.slug === "vectors-tutorial");
if (!page) throw new Error("guide page vectors-tutorial not found");
const source = readFileSync(join(GUIDE_DIR, page.file), "utf8");
const html = await renderGuidePage(GUIDE_DIR, page);
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

  test("every --fig-* token a figure uses has a light and a dark value", () => {
    const used = new Set(
      figures.flatMap((f) => [...f.matchAll(/var\((--fig-[a-z-]+)/g)].map((m) => m[1])),
    );
    expect(used.size).toBeGreaterThan(0);
    const light = tokensDeclaredUnder(":root");
    const dark = tokensDeclaredUnder('[data-theme="dark"]');
    const missing = [...used].filter((name) => !name || !light.has(name) || !dark.has(name));
    expect(missing).toEqual([]);
  });
});
