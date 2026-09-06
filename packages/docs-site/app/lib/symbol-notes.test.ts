import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { canonicalApiPages } from "./api-content";
import { apiLinkify, apiPageMarkdown } from "./api-page-render";
import type { ApiPage } from "./api-surface";
import { loadApiSurfaceForVersion, versionsWithDiskFixtures } from "./api-surface-loader";
import { renderGuidePage } from "./content";
import { listGuidePages } from "./guide-loader";
import { renderMarkdown } from "./markdown";
import { SYMBOL_NOTES } from "./symbol-notes";

// `api-content` and `content` anchor their own dirs on `process.cwd()`, which is
// the repo root under root `bun test` and `packages/docs-site` under the build,
// so every directory this test reads is passed in explicitly.
const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");
const REAL_LIBRARY_TYPES_DIR = join(import.meta.dir, "../../../library-types");
const GUIDE_DIR = join(import.meta.dir, "../../../docs/guide");

function markdownFor(pages: ApiPage[], namespace: string): string {
  const page = pages.find((p) => p.module.namespace === namespace);
  if (!page) throw new Error(`no /api/${namespace} page in this surface`);
  return apiPageMarkdown(page, apiLinkify(pages));
}

// The section one symbol renders: from its `###` heading to the next one.
function sectionFor(markdown: string, signaturePrefix: string): string {
  const at = markdown.indexOf(`### \`${signaturePrefix}`);
  expect(at).toBeGreaterThan(-1);
  const rest = markdown.slice(at + 4);
  const next = rest.indexOf("\n### ");
  return next === -1 ? rest : rest.slice(0, next);
}

describe("authored symbol notes", () => {
  const canonical = canonicalApiPages(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);

  test("every noted symbol still exists on the surface it annotates", () => {
    // A note keyed to a symbol the surface no longer renders is invisible, so
    // this is what catches an upstream rename rather than the note going quiet.
    const rendered = new Set<string>();
    for (const page of canonical) {
      for (const fn of page.module.functions) rendered.add(fn.name);
    }
    for (const name of Object.keys(SYMBOL_NOTES)) {
      expect(rendered.has(name)).toBe(true);
    }
  });

  test("a note leads its symbol's section on the canonical page", () => {
    const section = sectionFor(markdownFor(canonical, "go"), "go.property(");
    const note = SYMBOL_NOTES["go.property"] ?? "";
    expect(note).not.toBe("");
    expect(section).toContain(note);
    // Ahead of the upstream description it qualifies — a warning printed after
    // Defold's own Lua example would arrive too late to stop the copy-paste.
    expect(section.indexOf(note)).toBeLessThan(section.indexOf("This function defines a property"));
  });

  test("an overload set carries the note once, not once per row", () => {
    // The version-pinned surface applies the authored signature overrides, so
    // `go.property` renders one row per overload there.
    const version = versionsWithDiskFixtures(REAL_TYPES_DIR)[0];
    expect(version).toBeDefined();
    const pages = loadApiSurfaceForVersion(REAL_TYPES_DIR, version?.id ?? "");
    const markdown = markdownFor(pages, "go");
    const rows = markdown.split("### `go.property(").length - 1;
    expect(rows).toBeGreaterThan(1);
    expect(markdown.split("[!WARNING]").length - 1).toBe(1);
  });

  test("the note renders as a warning callout, not a bare blockquote", async () => {
    const html = await renderMarkdown(markdownFor(canonical, "go"));
    expect(html).toContain("admonition admonition-warning");
    // The `properties`-field snippet inside the callout has to survive the
    // blockquote-to-div retag as a highlighted block, not as quoted prose.
    expect(html).toContain("language-ts");
  });

  test("every guide link a note carries resolves to a real page and anchor", async () => {
    const pages = new Map(listGuidePages(GUIDE_DIR).map((page) => [page.slug, page]));
    let checked = 0;
    for (const [name, note] of Object.entries(SYMBOL_NOTES)) {
      for (const [, slug, fragment] of note.matchAll(/\]\(\/([a-z0-9-]+)(#[a-z0-9-]+)?\)/g)) {
        // `/api/...` targets are reference routes, audited by `reference-audit`.
        if (slug === undefined || slug === "api") continue;
        const page = pages.get(slug);
        if (!page) throw new Error(`${name}'s note links /${slug}, which is no guide page`);
        checked++;
        if (fragment === undefined) continue;
        const html = await renderGuidePage(GUIDE_DIR, page);
        if (!html.includes(`id="${fragment.slice(1)}"`)) {
          throw new Error(`${name}'s note links /${slug}${fragment}, which is no heading there`);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
