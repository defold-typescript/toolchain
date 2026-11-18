import { describe, expect, test } from "bun:test";
import type { Element, Nodes } from "hast";
import { toHtml } from "hast-util-to-html";
import type { Heading, PhrasingContent, Root, RootContent } from "mdast";
import {
  apiTypeCode,
  BADGE_KINDS,
  badgeChip,
  GLOBAL_CHIP,
  globalChip,
  overloadCount,
  signatureCode,
  spanMarker,
  UPSTREAM_CHIP,
  upstreamChip,
} from "./api-nodes";
import { parseMarkdownFragment, processApiTree, processDocsMarkdown } from "./docs-markdown";
import { allPageHeadings, hastHeadings } from "./headings";
import { getHighlighter, runStyle, signatureTokens } from "./signature-tokens";
import { escapeUpstreamText } from "./upstream-text";

const root = (...children: RootContent[]): Root => ({ type: "root", children });

const heading = (depth: Heading["depth"], ...children: PhrasingContent[]): Heading => ({
  type: "heading",
  depth,
  children,
});

function elements(node: Nodes | undefined, match: (element: Element) => boolean): Element[] {
  const found: Element[] = [];
  const walk = (current: Nodes): void => {
    if (current.type === "element" && match(current)) found.push(current);
    if ("children" in current) for (const child of current.children) walk(child);
  };
  if (node) walk(node);
  return found;
}

function textOf(node: Nodes | undefined): string {
  if (node?.type === "text") return node.value;
  return node && "children" in node ? node.children.map(textOf).join("") : "";
}

function classes(node: Element | undefined): string[] {
  const value = node?.properties.className;
  return Array.isArray(value) ? value.map(String) : String(value ?? "").split(/\s+/);
}

const byClass = (node: Nodes | undefined, name: string): Element[] =>
  elements(node, (element) => classes(element).includes(name));

const headingsOf = (node: Nodes): Element[] =>
  elements(node, (element) => /^h[1-6]$/.test(element.tagName));

const styleOf = (element: Element | undefined): string => String(element?.properties.style ?? "");

const colorOf = (element: Element | undefined): string =>
  styleOf(element)
    .split(";")
    .filter((part) => part !== "font-weight:600")
    .join(";");

// The token spans of a signature code, in order.
const tokenSpans = (code: Element | undefined): Element[] =>
  (code?.children ?? []).filter(
    (child): child is Element => child.type === "element" && child.tagName === "span",
  );

describe("processApiTree signature coloring", () => {
  test("an h3 signature renders as one colored code with its names bold", async () => {
    const page = await processApiTree(
      root(heading(3, signatureCode("go.get(id: string): Vector3"))),
    );
    const codes = byClass(page.hast, "api-signature");
    expect(codes).toHaveLength(1);
    const [code] = codes;
    expect(code?.tagName).toBe("code");
    expect(classes(code)).toContain("shiki");
    expect(textOf(code)).toBe("go.get(id: string): Vector3");
    const spans = tokenSpans(code);
    expect(spans.length).toBeGreaterThan(1);
    for (const span of spans) {
      expect(styleOf(span)).toContain("--shiki-light:");
      expect(styleOf(span)).toContain("--shiki-dark:");
    }
    const id = spans.find((span) => textOf(span) === "id");
    expect(styleOf(id).split(";")).toContain("font-weight:600");
  });

  test("a prefixed fragment drops the prefix and colors as its full signature does", async () => {
    const page = await processApiTree(
      root({
        type: "paragraph",
        children: [signatureCode("(x: number)", { prefix: "vmath.lerp" })],
      }),
    );
    const [code] = byClass(page.hast, "api-signature");
    expect(textOf(code)).toBe("(x: number)");
    const full = signatureTokens(await getHighlighter(), "vmath.lerp(x: number)", "");
    const expected = full.find((run) => run.text === "x");
    expect(expected).toBeDefined();
    const x = tokenSpans(code).find((span) => textOf(span) === "x");
    expect(styleOf(x)).toBe(expected ? runStyle(expected) : "");
  });

  test("a qualified type alias head colors each segment as its first", async () => {
    const page = await processApiTree(root(heading(3, signatureCode("type image.Type = number"))));
    const spans = tokenSpans(byClass(page.hast, "api-signature")[0]);
    const named = (text: string) => spans.find((span) => textOf(span).trim() === text);
    expect(colorOf(named("Type"))).not.toBe("");
    expect(colorOf(named("Type"))).toBe(colorOf(named("image")));
  });

  test("an overload count moves into the call list over its `...`", async () => {
    const page = await processApiTree(
      root(heading(3, signatureCode("ns.fn(...)"), overloadCount(3))),
    );
    const [h3] = headingsOf(page.hast);
    expect(h3?.properties.id).toBe("nsfn");
    const [code] = byClass(h3, "api-signature");
    const [count] = byClass(h3, "api-overload-count");
    expect(count?.properties.dataTocText).toBe("...");
    expect(textOf(count)).toBe("3 overloads");
    expect(byClass(code, "api-overload-count")).toEqual(count ? [count] : []);
    expect(textOf(code)).toBe("ns.fn(3 overloads)");
  });

  test("chips decorate a signature heading without entering its id", async () => {
    const present = ["defold-1.10.0", "defold-1.9.0"];
    const categories = [
      { isNew: true, isChanged: false, isDeprecated: false },
      { isNew: false, isChanged: false, isDeprecated: false },
    ];
    const marker = spanMarker(present, categories);
    if (!marker) throw new Error("a symbol present in two versions has a span marker");
    const page = await processApiTree(
      root(
        heading(
          3,
          signatureCode("go.get(id: string): Vector3"),
          badgeChip("new", { hidden: true }),
          globalChip(),
          marker,
        ),
      ),
    );
    const [h3] = headingsOf(page.hast);
    expect(h3?.properties.id).toBe("gogetid-string-vector3");
    expect(page.toc.map((item) => item.title)).toEqual(["go.get(id: string): Vector3"]);

    const order = elements(
      h3,
      (element) =>
        classes(element).includes("api-signature") ||
        classes(element).includes("api-badge-dot") ||
        classes(element).includes("api-symbol-span"),
    );
    expect(order.map((element) => classes(element)[0])).toEqual([
      "api-signature",
      "api-badge-dot",
      "api-badge-dot",
      "api-symbol-span",
    ]);

    const fresh = BADGE_KINDS.find((kind) => kind.kind === "new");
    const [newChip, globalDot] = byClass(h3, "api-badge-dot");
    expect(classes(newChip)).toEqual(["api-badge-dot", `api-badge-dot--${fresh?.kind}`]);
    expect(newChip?.properties.ariaLabel).toBe(fresh?.label);
    expect(newChip?.properties.title).toBe(fresh?.label);
    expect(styleOf(newChip)).toBe("display:none");
    expect(textOf(newChip)).toBe(fresh?.glyph ?? "");
    expect(classes(globalDot)).toEqual(["api-badge-dot", `api-badge-dot--${GLOBAL_CHIP.kind}`]);
    expect(globalDot?.properties.ariaLabel).toBe(GLOBAL_CHIP.label);
    expect(globalDot?.properties.title).toBe(GLOBAL_CHIP.label);
    expect(globalDot?.properties.style).toBeUndefined();
    expect(textOf(globalDot)).toBe(GLOBAL_CHIP.glyph);

    const [span] = byClass(h3, "api-symbol-span");
    expect(span?.properties.dataSpanOldest).toBe("defold-1.9.0");
    expect(span?.properties.dataSpanNewest).toBe("defold-1.10.0");
    expect(span?.properties.dataSpanCats).toBe("N|-");
    expect(textOf(span)).toBe("");
  });
});

const text = (value: string): PhrasingContent => ({ type: "text", value });

const anchorsOf = (node: Nodes | undefined): Element[] =>
  elements(node, (element) => element.tagName === "a");

// Every `a` with an `a` somewhere above it.
function nestedAnchors(node: Nodes): Element[] {
  const nested: Element[] = [];
  const walk = (current: Nodes, inAnchor: boolean): void => {
    const isAnchor = current.type === "element" && current.tagName === "a";
    if (isAnchor && inAnchor) nested.push(current);
    if ("children" in current) {
      for (const child of current.children) walk(child, inAnchor || isAnchor);
    }
  };
  walk(node, false);
  return nested;
}

const signatureText = (node: Nodes | undefined): string =>
  byClass(node, "api-signature").map(textOf).join("");

describe("processApiTree permalinks and links", () => {
  test("a signature heading carries its own permalink; a section heading does not", async () => {
    const page = await processApiTree(
      root(heading(2, text("Functions")), heading(3, signatureCode("go.get(id: string): Vector3"))),
    );
    const [h2, h3] = headingsOf(page.hast);
    const [anchor, ...rest] = anchorsOf(h3);
    expect(rest).toEqual([]);
    expect(classes(anchor)).toEqual(["heading-anchor"]);
    expect(anchor?.properties.href).toBe("#gogetid-string-vector3");
    expect(anchor?.properties.ariaLabel).toBe("Permalink to go.get(id: string): Vector3");
    expect(byClass(anchor, "api-signature")).toHaveLength(1);
    expect(byClass(anchor, "heading-anchor-icon")).toHaveLength(1);
    expect(h3?.properties.dataAnchored).toBeDefined();
    expect(anchorsOf(h2)).toEqual([]);
    expect(h2?.properties.dataAnchored).toBeUndefined();
  });

  test("a brand token splits the permalink and its overview link into sibling links", async () => {
    const signature = 'go.x(h: Opaque<"node">): void';
    const page = await processApiTree(
      root(heading(3, signatureCode(signature)), {
        type: "paragraph",
        children: [
          { type: "link", url: "#goxh-opaquenode-void", children: [signatureCode(signature)] },
        ],
      }),
      { signatureSymbolLinks: new Map([["Opaque", "/api/Opaque"]]) },
    );
    expect(nestedAnchors(page.hast)).toEqual([]);
    const [h3] = headingsOf(page.hast);
    const [headingSplit] = byClass(h3, "signature-split");
    const [overviewSplit] = byClass(
      page.hast.children.find((node) => node.type === "element" && node.tagName === "p"),
      "signature-split",
    );
    for (const [split, href] of [
      [headingSplit, "#goxh-opaquenode-void"],
      [overviewSplit, "#goxh-opaquenode-void"],
    ] as const) {
      expect(split).toBeDefined();
      expect(signatureText(split)).toBe(signature);
      const [brand, ...others] = byClass(split, "signature-symbol-link");
      expect(others).toEqual([]);
      expect(brand?.properties.href).toBe("/api/Opaque");
      expect(signatureText(brand)).toBe("Opaque");
      const fragments = anchorsOf(split).filter((a) => a.properties.href === href);
      expect(fragments).toHaveLength(2);
    }
    expect(byClass(headingSplit, "heading-anchor")).toHaveLength(2);
    expect(byClass(headingSplit, "heading-anchor-icon")).toHaveLength(1);
  });

  test("a heading target resolves to the last heading with its text", async () => {
    const page = await processApiTree(
      root(
        heading(2, text("Types")),
        heading(3, text("Types")),
        heading(3, signatureCode("go.y(v: Types, w: Missing): void")),
      ),
      {
        signatureSymbolLinks: new Map([
          ["Types", { route: "/api/x", heading: "Types" }],
          ["Missing", { route: "/api/x", heading: "Nope" }],
        ]),
      },
    );
    const links = byClass(page.hast, "signature-symbol-link");
    expect(links.map((link) => [signatureText(link), link.properties.href])).toEqual([
      ["Types", "/api/x#types-1"],
    ]);
  });

  test("a type code links its qualified tokens only", async () => {
    const page = await processApiTree(
      root({
        type: "paragraph",
        children: [apiTypeCode([{ type: "text", value: 'gui.Easing | Opaque<"node">' }])],
      }),
      {
        signatureSymbolLinks: new Map([
          ["gui.Easing", "/api/gui#guieasing"],
          ["Opaque", "/api/Opaque"],
          ["node", "/api/node"],
        ]),
      },
    );
    const [code] = byClass(page.hast, "api-type");
    expect(textOf(code)).toBe('gui.Easing | Opaque<"node">');
    const links = anchorsOf(code);
    expect(links.map((link) => [classes(link), link.properties.href, textOf(link)])).toEqual([
      [["api-type-link"], "/api/gui#guieasing", "gui.Easing"],
    ]);
  });
});

const fragment = (markdown: string): Root => root(...parseMarkdownFragment(markdown));

describe("processApiTree upstream safety", () => {
  test("a link to an unsafe target renders as its label", async () => {
    const page = await processApiTree(
      fragment(
        "[x][r], [z](javascript:alert(1)) and [y](https://example.com)\n\n[r]: javascript:alert(1)\n",
      ),
    );
    expect(anchorsOf(page.hast).map((a) => [a.properties.href, textOf(a)])).toEqual([
      ["https://example.com", "y"],
    ]);
    const [p] = elements(page.hast, (element) => element.tagName === "p");
    expect(textOf(p)).toBe("x, z and y");
  });

  test("an escaped `<` renders as text in prose, code spans and fences", async () => {
    const escaped = escapeUpstreamText("a <b> c");
    const markdown = `${escaped}\n\n\`${escaped}\`\n\n\`\`\`ts\n${escaped}\n\`\`\`\n`;
    const pages = [
      await processApiTree(fragment(markdown)),
      await processDocsMarkdown(markdown, { routePrefix: "" }),
    ];
    for (const page of pages) {
      expect(elements(page.hast, (element) => element.tagName === "b")).toEqual([]);
      const [prose, span] = elements(page.hast, (element) => element.tagName === "p");
      expect(textOf(prose)).toBe("a <b> c");
      expect(textOf(span)).toBe("a <b> c");
      const [pre] = elements(page.hast, (element) => element.tagName === "pre");
      expect(textOf(pre).trim()).toBe("a <b> c");
      expect(textOf(page.hast)).not.toContain("");
    }
  });
});

describe("hastHeadings", () => {
  test("reads a signature heading's outline with its count badge, chips and colors", async () => {
    const page = await processApiTree(
      root(
        heading(2, text("Functions")),
        heading(
          3,
          signatureCode("ns.fn(...)"),
          overloadCount(3),
          badgeChip("changed", { hidden: true }),
          upstreamChip(),
        ),
      ),
    );
    const [functions, overload, ...rest] = hastHeadings(page.hast);
    expect(rest).toEqual([]);
    expect(functions).toEqual({ text: "Functions", id: "functions", level: 2, code: false });
    const changed = BADGE_KINDS.find((kind) => kind.kind === "changed");
    expect(overload).toMatchObject({
      text: "ns.fn(...)",
      id: "nsfn",
      level: 3,
      code: true,
      badge: { start: "ns.fn(".length, end: "ns.fn(...".length, label: "3 overloads" },
      markers: [
        { kind: changed?.kind, label: changed?.label, glyph: changed?.glyph, hidden: true },
        {
          kind: UPSTREAM_CHIP.kind,
          label: UPSTREAM_CHIP.label,
          glyph: UPSTREAM_CHIP.glyph,
          hidden: false,
        },
      ],
    });
    const markup = overload?.markup ?? "";
    expect(markup).toContain('<span class="api-overload-count">3 overloads</span>');
    expect(markup).toMatch(/<span style="[^"]*--shiki-light:[^"]*">fn<\/span>/);
    expect(markup).not.toMatch(/<a\b|<code\b|heading-anchor|api-badge-dot|<svg/);
    expect(hastHeadings(page.hast)).toEqual(allPageHeadings(toHtml(page.hast)));
  });
});
