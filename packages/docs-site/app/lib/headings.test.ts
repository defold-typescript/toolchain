import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { apiPageMarkdown } from "./api-page-render";
import { loadCombinedSurface } from "./api-surface-loader";
import { combinedNamespaceToApiPage } from "./combined-surface";
import { allPageHeadings, type Heading, pageHeadings, slugify } from "./headings";
import { renderMarkdown } from "./markdown";

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

describe("pageHeadings", () => {
  test("decodes hex entities Shiki emits for inline-highlighted signature text", () => {
    const headings = pageHeadings('<h3 id="x">Opaque&#x3C;"node"&#x3E;</h3>');
    expect(headings).toHaveLength(1);
    expect(headings[0]?.text).toBe('Opaque<"node">');
  });

  test("decodes decimal entities", () => {
    const headings = pageHeadings("<h3>a &#60; b &#62; c</h3>");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.text).toBe("a < b > c");
  });

  test("decodes named entities (and decodes &amp; last so it never double-decodes)", () => {
    const headings = pageHeadings("<h3>a &lt; b &gt; c &amp; d &quot;e&quot; &#39;f&#39;</h3>");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.text).toBe(`a < b > c & d "e" 'f'`);
  });

  test("strips tags, decodes entities, and preserves the explicit heading id", () => {
    const html =
      '<h3 id="gui-get_node"><a href="#gui-get_node"><span>gui.get_node(id: string | Hash): Opaque&#x3C;"node"&#x3E;</span></a></h3>';
    const headings = pageHeadings(html);
    expect(headings).toHaveLength(1);
    expect(headings[0]?.text).toBe('gui.get_node(id: string | Hash): Opaque<"node">');
    expect(headings[0]?.id).toBe("gui-get_node");
  });

  test("decodes &amp; exactly once across a heading full of encoded entities", () => {
    const headings = pageHeadings("<h3>Record&#x3C;string, any&#x3E; &amp; Foo</h3>");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.text).toBe("Record<string, any> & Foo");
  });

  // The upgrade guide nests each release's per-symbol notes at h4 beneath one
  // `## Defold <version>` heading. A TOC that stops at h3 lists the release and
  // its topics but none of the symbols a reader is actually looking for.
  test("extracts an h4 heading as a third tier, in document order", () => {
    const html =
      '<h2 id="defold-1131">Defold 1.13.1</h2>' +
      '<h3 id="added-lua-apis">Added Lua APIs</h3>' +
      '<h4 id="collectionproxyload">collectionproxy.load</h4>';
    expect(pageHeadings(html)).toEqual([
      { text: "Defold 1.13.1", id: "defold-1131", level: 2, code: false },
      { text: "Added Lua APIs", id: "added-lua-apis", level: 3, code: false },
      { text: "collectionproxy.load", id: "collectionproxyload", level: 4, code: false },
    ]);
  });
});

describe("allPageHeadings", () => {
  const fullDepthHtml =
    '<h1 id="upgrading-defold-versions">Upgrading Defold versions</h1>' +
    '<h2 id="defold-1131">Defold 1.13.1</h2>' +
    '<h3 id="added-lua-apis">Added Lua APIs</h3>' +
    '<h4 id="collectionproxyload">collectionproxy.load</h4>' +
    '<h5><a href="#x"><span>Opaque&#x3C;"node"&#x3E;</span></a></h5>' +
    '<h6 id="minted-deep">Deep note</h6>';

  test("returns h1 through h6 in document order, with tags stripped, entities decoded, and an explicit id preferred over the slug fallback outside h2..h4", () => {
    expect(allPageHeadings(fullDepthHtml)).toEqual([
      { text: "Upgrading Defold versions", id: "upgrading-defold-versions", level: 1, code: false },
      { text: "Defold 1.13.1", id: "defold-1131", level: 2, code: false },
      { text: "Added Lua APIs", id: "added-lua-apis", level: 3, code: false },
      { text: "collectionproxy.load", id: "collectionproxyload", level: 4, code: false },
      { text: 'Opaque<"node">', id: "opaquenode", level: 5, code: false },
      { text: "Deep note", id: "minted-deep", level: 6, code: false },
    ]);
  });

  test("an element carrying data-toc-text contributes that value instead of its text, and is kept as the heading's badge", () => {
    const html =
      '<h3 id="fx"><code><span>f(</span><span class="api-overload-count" data-toc-text="...">2 overloads</span><span>): number</span></code></h3>';
    expect(allPageHeadings(html)).toEqual([
      {
        text: "f(...): number",
        id: "fx",
        level: 3,
        code: true,
        badge: { start: 2, end: 5, label: "2 overloads" },
      },
    ]);
  });

  test("the badge offset counts decoded characters after the leading whitespace is trimmed", () => {
    const html =
      '<h3 id="gx"> <code><span>g&#x3C;T&#x3E;(</span><span class="api-overload-count" data-toc-text="...">3 &#x3C;overloads&#x3E;</span><span>)</span></code></h3>';
    expect(allPageHeadings(html)).toEqual([
      {
        text: "g<T>(...)",
        id: "gx",
        level: 3,
        code: true,
        badge: { start: 5, end: 8, label: "3 <overloads>" },
      },
    ]);
  });

  test("a heading with no data-toc-text element carries no badge", () => {
    const [heading] = allPageHeadings('<h3 id="plain"><code>f(): number</code></h3>');
    expect(heading?.text).toBe("f(): number");
    expect(heading !== undefined && "badge" in heading).toBe(false);
  });

  test("pageHeadings over the same html keeps the h2..h4 table-of-contents bound", () => {
    expect(pageHeadings(fullDepthHtml)).toEqual([
      { text: "Defold 1.13.1", id: "defold-1131", level: 2, code: false },
      { text: "Added Lua APIs", id: "added-lua-apis", level: 3, code: false },
      { text: "collectionproxy.load", id: "collectionproxyload", level: 4, code: false },
    ]);
  });
});

describe("pageHeadings over rendered /api pages (Combined surface, committed artifacts)", async () => {
  const pages = loadCombinedSurface(join(import.meta.dir, "../../../types")).namespaces.map(
    combinedNamespaceToApiPage,
  );
  const markdownOf = (page: (typeof pages)[number]) =>
    apiPageMarkdown(page, (t) => t, { combinedMarkers: true });
  const headingsOf = async (markdown: string): Promise<Heading[]> =>
    pageHeadings(await renderMarkdown(markdown, { highlightSignatureHeadings: true }));
  const goPage = pages.find((p) => p.namespace === "go");
  if (!goPage) throw new Error("namespace go missing from the Combined surface");
  const deprecatedPage = pages.find((p) => markdownOf(p).includes("api-badge-dot--deprecated"));
  if (!deprecatedPage) throw new Error("no Combined namespace carries a deprecated chip");
  const go = await headingsOf(markdownOf(goPage));
  const deprecated = await headingsOf(markdownOf(deprecatedPage));
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
});
