import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { apiPageTree, renderApiPage } from "@defold-typescript/docs-render/api-page-render";
import { combinedNamespaceToApiPage } from "@defold-typescript/docs-render/combined-surface";
import { processDocsMarkdown } from "@defold-typescript/docs-render/docs-markdown";
import {
  type AnyHeading,
  type Heading,
  hastHeadings,
  outlineHeadings,
  slugify,
} from "@defold-typescript/docs-render/headings";
import type { SymbolLinker } from "@defold-typescript/docs-render/symbol-linkify";
import { loadCombinedSurface } from "@defold-typescript/docs-render/toolchain-surface-loader";

describe("slugify", () => {
  test("keeps underscores so on_message-style ids match GitHub", () => {
    expect(slugify("`on_message` ids are hashes, not strings")).toBe(
      "on_message-ids-are-hashes-not-strings",
    );
  });

  test("emits one hyphen per space with no collapse, so a stripped `/` leaves a double hyphen", () => {
    expect(slugify("Unary minus on Vector3 / Vector4 silently produces `number`")).toBe(
      "unary-minus-on-vector3--vector4-silently-produces-number",
    );
  });

  test("leaves a slug without `_` or `/` stable (regression guard)", () => {
    expect(slugify("`as` is a compile-time assertion, not a runtime check")).toBe(
      "as-is-a-compile-time-assertion-not-a-runtime-check",
    );
  });
});

// Raw HTML parsed by the pipeline's `rehype-raw`, the parser every page's
// headings go through, then read the way both sites read a page's headings.
async function headingsIn(html: string): Promise<AnyHeading[]> {
  return hastHeadings((await processDocsMarkdown(html, { routePrefix: "" })).hast);
}

describe("outlineHeadings", () => {
  // The upgrade guide nests each release's per-symbol notes at h4 beneath one
  // `## Defold <version>` heading. A TOC that stops at h3 lists the release and
  // its topics but none of the symbols a reader is actually looking for.
  test("extracts an h4 heading as a third tier, in document order", async () => {
    const html =
      '<h2 id="defold-1131">Defold 1.13.1</h2>' +
      '<h3 id="added-lua-apis">Added Lua APIs</h3>' +
      '<h4 id="collectionproxyload">collectionproxy.load</h4>';
    expect(outlineHeadings(await headingsIn(html))).toEqual([
      { text: "Defold 1.13.1", id: "defold-1131", level: 2, code: false },
      { text: "Added Lua APIs", id: "added-lua-apis", level: 3, code: false },
      { text: "collectionproxy.load", id: "collectionproxyload", level: 4, code: false },
    ]);
  });
});

describe("hastHeadings", () => {
  const fullDepthHtml =
    '<h1 id="upgrading-defold-versions">Upgrading Defold versions</h1>' +
    '<h2 id="defold-1131">Defold 1.13.1</h2>' +
    '<h3 id="added-lua-apis">Added Lua APIs</h3>' +
    '<h4 id="collectionproxyload">collectionproxy.load</h4>' +
    '<h5><a href="#x"><span>Opaque&#x3C;"node"&#x3E;</span></a></h5>' +
    '<h6 id="minted-deep">Deep note</h6>';

  test("returns h1 through h6 in document order, an explicit id preferred over the slug fallback outside h2..h4", async () => {
    expect(await headingsIn(fullDepthHtml)).toEqual([
      { text: "Upgrading Defold versions", id: "upgrading-defold-versions", level: 1, code: false },
      { text: "Defold 1.13.1", id: "defold-1131", level: 2, code: false },
      { text: "Added Lua APIs", id: "added-lua-apis", level: 3, code: false },
      { text: "collectionproxy.load", id: "collectionproxyload", level: 4, code: false },
      { text: 'Opaque<"node">', id: "opaquenode", level: 5, code: false },
      { text: "Deep note", id: "minted-deep", level: 6, code: false },
    ]);
  });

  test("an element carrying data-toc-text contributes that value instead of its text, and is kept as the heading's badge", async () => {
    const html =
      '<h3 id="fx"><code><span>f(</span><span class="api-overload-count" data-toc-text="...">2 overloads</span><span>): number</span></code></h3>';
    expect(await headingsIn(html)).toEqual([
      {
        text: "f(...): number",
        id: "fx",
        level: 3,
        code: true,
        badge: { start: 2, end: 5, label: "2 overloads" },
      },
    ]);
  });

  test("the badge offset counts characters after the leading whitespace is trimmed", async () => {
    const html =
      '<h3 id="gx"> <code><span>g&#x3C;T&#x3E;(</span><span class="api-overload-count" data-toc-text="...">3 &#x3C;overloads&#x3E;</span><span>)</span></code></h3>';
    expect(await headingsIn(html)).toEqual([
      {
        text: "g<T>(...)",
        id: "gx",
        level: 3,
        code: true,
        badge: { start: 5, end: 8, label: "3 <overloads>" },
      },
    ]);
  });

  test("a heading with no data-toc-text element carries no badge", async () => {
    const [heading] = await headingsIn('<h3 id="plain"><code>f(): number</code></h3>');
    expect(heading?.text).toBe("f(): number");
    expect(heading !== undefined && "badge" in heading).toBe(false);
  });

  test("a highlighted heading's markup keeps its token spans and its data-toc-text element, and drops every other tag", async () => {
    const html =
      '<h3 id="fx"><span class="signature-split"><a class="heading-anchor" href="#fx"><code class="api-signature shiki">' +
      '<span style="--shiki-light:#111111;--shiki-dark:#EEEEEE">f(</span>' +
      '<span class="api-overload-count" data-toc-text="...">2 overloads</span>' +
      '<span style="--shiki-light:#111111;--shiki-dark:#EEEEEE">): </span></code></a>' +
      '<a class="signature-symbol-link" href="/api/hash"><code class="api-signature shiki">' +
      '<span style="--shiki-light:#222222;--shiki-dark:#DDDDDD;font-weight:600">Hash&#x3C;T&#x3E;</span></code></a></span>' +
      ' <span class="api-badge-dot api-badge-dot--new" aria-label="New" title="New">N</span>' +
      '<span class="api-symbol-span" data-span-oldest="1.12.4" aria-hidden="true"></span>' +
      '<span class="heading-anchor-icon"><svg aria-hidden="true"><path d="M1 1"/></svg></span></h3>';
    expect((await headingsIn(html))[0]?.markup).toBe(
      '<span style="--shiki-light:#111111;--shiki-dark:#EEEEEE">f(</span>' +
        '<span class="api-overload-count">2 overloads</span>' +
        '<span style="--shiki-light:#111111;--shiki-dark:#EEEEEE">): </span>' +
        '<span style="--shiki-light:#222222;--shiki-dark:#DDDDDD;font-weight:600">Hash&#x3C;T></span>',
    );
  });

  test("a heading with no highlighted token carries no markup", async () => {
    const [heading] = await headingsIn(
      '<h2 id="p"><a class="heading-anchor" href="#p">What <code>resolve</code> prints</a></h2>',
    );
    expect(heading?.text).toBe("What resolve prints");
    expect(heading !== undefined && "markup" in heading).toBe(false);
  });

  test("a heading's inline code, bold, italic and struck text stay as bare elements in its formatted markup, and every other tag gives way to its children", async () => {
    const html =
      '<h2 id="f">Define <code class="x">src/pieces.ts</code>, <strong>now</strong> <em>and</em> <del>then</del> <a href="/y">here</a>' +
      '<span class="heading-anchor-icon"><svg aria-hidden="true"><path d="M1 1"/></svg></span></h2>';
    expect((await headingsIn(html))[0]?.formatted).toBe(
      "Define <code>src/pieces.ts</code>, <strong>now</strong> <em>and</em> <del>then</del> here",
    );
  });

  test("a heading with no inline formatting, or whose outline reads as its signature, carries no formatted markup", async () => {
    const headings = await headingsIn(
      '<h2 id="p">Plain <a href="/y">text</a></h2>' +
        '<h3 id="s"><code><span style="--shiki-light:#111111;--shiki-dark:#EEEEEE">f()</span></code></h3>' +
        '<h3 id="b"><code>f(<span class="api-overload-count" data-toc-text="...">2 overloads</span>)</code></h3>',
    );
    expect(headings.map((heading) => heading.id)).toEqual(["p", "s", "b"]);
    for (const heading of headings) expect("formatted" in heading).toBe(false);
  });

  test("outlineHeadings over the same headings keeps the h2..h4 table-of-contents bound", async () => {
    expect(outlineHeadings(await headingsIn(fullDepthHtml))).toEqual([
      { text: "Defold 1.13.1", id: "defold-1131", level: 2, code: false },
      { text: "Added Lua APIs", id: "added-lua-apis", level: 3, code: false },
      { text: "collectionproxy.load", id: "collectionproxyload", level: 4, code: false },
    ]);
  });
});

// biome-ignore lint/correctness/usePlaywrightValidDescribeCallback: bun:test awaits an async describe before collecting its tests.
describe("hastHeadings over rendered /api pages (Combined surface, committed artifacts)", async () => {
  const pages = loadCombinedSurface(join(import.meta.dir, "../../../types")).namespaces.map(
    combinedNamespaceToApiPage,
  );
  const noLinks: SymbolLinker = (text) => [{ type: "text", value: text }];
  const options = { combinedMarkers: true };
  const headingsOf = async (page: (typeof pages)[number]): Promise<Heading[]> =>
    hastHeadings((await renderApiPage(page, noLinks, options)).hast).filter(
      (h): h is Heading => h.level >= 2 && h.level <= 4,
    );
  const goPage = pages.find((p) => p.namespace === "go");
  if (!goPage) throw new Error("namespace go missing from the Combined surface");
  const deprecatedPage = pages.find((p) =>
    JSON.stringify(apiPageTree(p, noLinks, options)).includes("api-badge-dot--deprecated"),
  );
  if (!deprecatedPage) throw new Error("no Combined namespace carries a deprecated chip");
  const go = await headingsOf(goPage);
  const deprecated = await headingsOf(deprecatedPage);
  const marked = [...go, ...deprecated].filter((h) => h.markers !== undefined);

  test("the pages exercise new, changed and deprecated chips", () => {
    const kinds = new Set(marked.flatMap((h) => (h.markers ?? []).map((m) => m.kind)));
    expect([...kinds].filter((k) => ["new", "changed", "deprecated"].includes(k)).sort()).toEqual([
      "changed",
      "deprecated",
      "new",
    ]);
  });

  test("a chipped heading's text is the bare signature the slugger minted its id from", () => {
    expect(marked.length).toBeGreaterThan(0);
    for (const h of marked) {
      const base = slugify(h.text);
      expect({ id: h.id, matches: new RegExp(`^${base}(-\\d+)?$`).test(h.id) }).toEqual({
        id: h.id,
        matches: true,
      });
    }
  });

  test("go.get carries its Changed chip as a marker, in place of the glyph in its text", () => {
    const get = go.find((h) => h.id === "goget");
    expect(get?.text).toBe("go.get(...)");
    expect(get?.markers).toEqual([
      { kind: "changed", label: "Changed", glyph: "C", hidden: false },
    ]);
  });

  test("every function heading on go is code, and the Functions heading is not", () => {
    const functionsAt = go.findIndex((h) => h.level === 2 && h.text === "Functions");
    const nextSection = go.findIndex((h, i) => i > functionsAt && h.level === 2);
    const functions = go.slice(functionsAt + 1, nextSection < 0 ? undefined : nextSection);
    expect(functions.length).toBeGreaterThan(0);
    expect(go[functionsAt]?.code).toBe(false);
    expect(functions.filter((h) => !h.code).map((h) => h.id)).toEqual([]);
  });

  test("every code heading on go carries markup of bare spans that reads as the heading, the badge in place of what it stands for", async () => {
    const code = go.filter((h) => h.code);
    expect(code.some((h) => h.badge !== undefined)).toBe(true);
    for (const h of code) {
      const markup = h.markup ?? "";
      const reads = h.badge
        ? h.text.slice(0, h.badge.start) + h.badge.label + h.text.slice(h.badge.end)
        : h.text;
      expect({
        id: h.id,
        reads: (await headingsIn(`<h3>${markup}</h3>`))[0]?.text,
        otherTags: markup.match(/<(?!\/?span\b)[^>]*>/g) ?? [],
        otherAttributes: markup.match(/<span\s(?!style="|class="api-overload-count")[^>]*>/g) ?? [],
      }).toEqual({ id: h.id, reads, otherTags: [], otherAttributes: [] });
    }
  });

  test("the Functions heading, which holds no code, carries no markup", () => {
    const functions = go.find((h) => h.level === 2 && h.text === "Functions");
    expect(functions !== undefined && "markup" in functions).toBe(false);
  });
});
