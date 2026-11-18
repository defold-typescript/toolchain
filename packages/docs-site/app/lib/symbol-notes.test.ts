import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { apiLinkify, renderApiPage } from "@defold-typescript/docs-render/api-page-render";
import { type ApiPage, apiModuleSymbols } from "@defold-typescript/docs-render/api-surface";
import {
  parseMarkdownFragment,
  processApiTree,
} from "@defold-typescript/docs-render/docs-markdown";
import { hastOutlineText } from "@defold-typescript/docs-render/headings";
import { SYMBOL_NOTES } from "@defold-typescript/docs-render/symbol-notes";
import { canonicalApiPages } from "@defold-typescript/docs-render/toolchain-surface";
import {
  loadApiSurfaceForVersion,
  versionsWithDiskFixtures,
} from "@defold-typescript/docs-render/toolchain-surface-loader";
import type { Element, Nodes, Root } from "hast";
import { toHtml } from "hast-util-to-html";
import { renderGuidePage } from "./content";
import { listGuidePages } from "./guide-loader";

// `api-content` and `content` anchor their own dirs on `process.cwd()`, which is
// the repo root under root `bun test` and `packages/docs-site` under the build,
// so every directory this test reads is passed in explicitly.
const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");
const GUIDE_DIR = join(import.meta.dir, "../../../docs/guide");

async function hastFor(pages: ApiPage[], namespace: string): Promise<Root> {
  const page = pages.find((p) => p.module.namespace === namespace);
  if (!page) throw new Error(`no /api/${namespace} page in this surface`);
  return (await renderApiPage(page, apiLinkify(pages))).hast;
}

const textOf = (node: Nodes): string =>
  node.type === "text" ? node.value : "children" in node ? node.children.map(textOf).join("") : "";

function elementsOf(node: Root | Element): Element[] {
  const children: readonly Nodes[] = node.children;
  return children.filter((child): child is Element => child.type === "element");
}

function descendants(node: Nodes, match: (element: Element) => boolean): Element[] {
  const found: Element[] = [];
  if (node.type === "element" && match(node)) found.push(node);
  if ("children" in node)
    for (const child of node.children) found.push(...descendants(child, match));
  return found;
}

const isCallout = (element: Element): boolean => element.tagName === "Callout";

// The body one symbol renders: the element after its `h3` signature heading.
function bodyFor(hast: Root, signaturePrefix: string): Element {
  const top = elementsOf(hast);
  const at = top.findIndex(
    (element) =>
      element.tagName === "h3" && hastOutlineText(element).trim().startsWith(signaturePrefix),
  );
  expect(at).toBeGreaterThan(-1);
  const body = top[at + 1];
  if (!body) throw new Error(`${signaturePrefix} renders no body`);
  return body;
}

// The text a note renders as, run through the same pipeline on its own.
async function noteText(note: string): Promise<string> {
  const { hast } = await processApiTree({ type: "root", children: parseMarkdownFragment(note) });
  const [callout] = descendants(hast, isCallout);
  if (!callout) throw new Error("the note renders no callout");
  return textOf(callout);
}

describe("authored symbol notes", () => {
  const canonical = canonicalApiPages(REAL_TYPES_DIR);

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

  test("a note precedes its symbol's example on the canonical page", async () => {
    const page = canonical.find((p) => p.module.namespace === "go");
    if (!page) throw new Error("no /api/go page");
    const body = bodyFor(await hastFor(canonical, "go"), "go.property(");
    const note = SYMBOL_NOTES["go.property"] ?? "";
    expect(note).not.toBe("");
    const blocks = elementsOf(body);
    const noteAt = blocks.findIndex(isCallout);
    expect(noteAt).toBeGreaterThan(-1);
    expect(textOf(blocks[noteAt] as Element)).toBe(await noteText(note));
    // Ahead of the example it warns about — a warning printed after the Lua
    // example would arrive too late to stop the copy-paste. The example is read
    // from the rendered symbol rather than named as code, because which text that
    // row carries depends on the upstream doc and its translation, and the
    // ordering guarantee holds either way.
    const example = apiModuleSymbols(page, page.translations, page.signatures).find(
      (s) => s.name === "go.property" && s.exampleMarkdown,
    )?.exampleMarkdown;
    expect(example).toBeTruthy();
    // A line of the example's code, which reads the same once highlighted.
    const fence = /```[^\n]*\n([\s\S]*?)```/.exec(example ?? "")?.[1] ?? example ?? "";
    const line =
      fence
        .split("\n")
        .find((text) => text.trim() !== "")
        ?.trim() ?? "";
    expect(line).not.toBe("");
    const exampleAt = blocks.findIndex(
      (block, index) => index !== noteAt && textOf(block).includes(line),
    );
    expect(exampleAt).toBeGreaterThan(-1);
    expect(noteAt).toBeLessThan(exampleAt);
  });

  test("an overload set carries the note once, not once per row", async () => {
    // The version-pinned surface applies the authored signature overrides, so
    // `go.property` renders one row per overload there.
    const version = versionsWithDiskFixtures(REAL_TYPES_DIR)[0];
    expect(version).toBeDefined();
    const pages = loadApiSurfaceForVersion(REAL_TYPES_DIR, version?.id ?? "");
    const hast = await hastFor(pages, "go");
    const go = pages.find((p) => p.namespace === "go");
    if (!go) throw new Error("no go page");
    const rows = apiModuleSymbols(go, go.translations, go.signatures).filter(
      (s) => s.name === "go.property",
    );
    expect(rows.length).toBeGreaterThan(1);
    expect(descendants(hast, isCallout)).toHaveLength(1);
  });

  test("the note renders as a warning callout, not a bare blockquote", async () => {
    const callouts = descendants(await hastFor(canonical, "go"), isCallout);
    expect(callouts.map((callout) => callout.properties.type)).toEqual(["warning"]);
    expect(descendants(callouts[0] as Element, (e) => e.tagName === "blockquote")).toEqual([]);
    // The `properties`-field snippet inside the callout has to survive the
    // blockquote-to-callout retag as a highlighted block, not as quoted prose.
    const [code] = descendants(callouts[0] as Element, (e) => e.tagName === "pre");
    expect(textOf(code as Element)).toContain("properties: { health: 100 }");
    expect(descendants(code as Element, (e) => typeof e.properties.style === "string")).not.toEqual(
      [],
    );
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
        const html = toHtml((await renderGuidePage(GUIDE_DIR, page)).hast);
        if (!html.includes(`id="${fragment.slice(1)}"`)) {
          throw new Error(`${name}'s note links /${slug}${fragment}, which is no heading there`);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
