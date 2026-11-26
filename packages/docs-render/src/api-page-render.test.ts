import { describe, expect, test } from "bun:test";
import type { ApiFunction, ApiModule } from "@defold-typescript/types";
import type { Element, Nodes } from "hast";
import { toHtml } from "hast-util-to-html";
import type { PhrasingContent } from "mdast";
import {
  apiLinkifier,
  apiLinkify,
  apiSignatureSymbolLinker,
  apiSignatureSymbolLinks,
  renderApiPage,
} from "./api-page-render";
import type { ApiPage, LibraryMeta } from "./api-surface";
import { hastHeadings } from "./headings";
import { buildSymbolIndex, memberAnchors } from "./symbol-index";

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

const childElements = (node: Element | undefined): Element[] =>
  (node?.children ?? []).filter((child): child is Element => child.type === "element");

// The text and link nodes a linker returns, as `[text, href?]` pairs.
const linked = (nodes: PhrasingContent[]): [string, string?][] =>
  nodes.map((node) =>
    node.type === "link"
      ? [
          node.children.map((child) => (child.type === "text" ? child.value : "")).join(""),
          node.url,
        ]
      : [node.type === "text" ? node.value : ""],
  );

const MODULE: ApiModule = {
  namespace: "astar",
  brief: "Grid path finding.",
  description: "",
  functions: [
    {
      name: "astar.solve",
      brief: "Finds a path.",
      description: "",
      parameters: [],
      returnValues: [],
    },
  ],
  variables: [],
  constants: [],
  properties: [],
  typedefs: [],
};

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const SOURCE_URL = `https://github.com/someone/defold-astar/blob/${COMMIT}/astar.d.ts`;

const META: LibraryMeta = {
  author: "someone",
  authorUrl: "https://github.com/someone/defold-astar",
  commit: COMMIT,
  sourceUrl: SOURCE_URL,
  importString: 'import * as astar from "astar"',
  license: "MIT",
  authoredHere: false,
  usage: "import",
};

function page(fields: Partial<ApiPage>): ApiPage {
  return {
    namespace: MODULE.namespace,
    route: "/api/astar",
    brief: MODULE.brief,
    module: MODULE,
    translations: {},
    signatures: {},
    category: "engine",
    ...fields,
  };
}

const html = async (p: ApiPage): Promise<string> =>
  toHtml((await renderApiPage(p, apiLinkify([p]))).hast);

describe("renderApiPage provenance block", () => {
  const provenance = [
    `pinned to <a href="${SOURCE_URL}"><code>0123456</code></a>`,
    "Run <code>bunx @defold-typescript/cli resolve</code> to materialize its types.",
    'import * as astar from "astar"',
  ];

  test("a library page states its pin, resolve step and import; an engine page of the same module none", async () => {
    const library = await html(page({ category: "library", libraryMeta: META }));
    const engine = await html(page({}));
    for (const text of provenance) {
      expect(library.replace(/<span[^>]*>|<\/span>/g, "")).toContain(text);
      expect(engine.replace(/<span[^>]*>|<\/span>/g, "")).not.toContain(text);
    }
  });
});

function fn(name: string): ApiFunction {
  return { name, brief: `${name} brief`, description: "", parameters: [], returnValues: [] };
}

function withParameter(name: string, parameter: string): ApiFunction {
  return {
    ...fn(name),
    parameters: [{ name: parameter, doc: "", types: ["number"], isOptional: false }],
  };
}

describe("renderApiPage anchors", () => {
  test("memberAnchors keys a function at the id its heading renders with, non-ASCII letters kept", async () => {
    const p = page({
      namespace: "ns",
      route: "/api/ns",
      module: { ...MODULE, namespace: "ns", functions: [fn("ns.fé")] },
    });
    const anchor = memberAnchors(p).get("function:ns.fé") ?? "";
    expect(anchor).toContain("é");
    const { hast } = await renderApiPage(p, apiLinkify([p]));
    expect(hastHeadings(hast).map((heading) => heading.id)).toContain(anchor);
  });

  test("the function overview lists each function once, linking its heading", async () => {
    const p = page({
      namespace: "ns",
      route: "/api/ns",
      module: {
        ...MODULE,
        namespace: "ns",
        functions: [fn("ns.one"), withParameter("ns.two", "a"), withParameter("ns.two", "b")],
      },
    });
    const { hast } = await renderApiPage(p, apiLinkify([p]));
    const overviews = elements(
      hast,
      (element) =>
        classes(element).includes("api-overview") &&
        element.properties.ariaLabel === "Function overview",
    );
    expect(overviews).toHaveLength(1);
    const [list] = childElements(overviews[0]).filter((element) => element.tagName === "ul");
    const items = childElements(list);
    expect(items.map((item) => [item.tagName, classes(item)])).toEqual([
      ["li", ["api-overview-item"]],
      ["li", ["api-overview-item"]],
    ]);
    const anchors = memberAnchors(p);
    const hrefs = items.map((item) => elements(item, (e) => e.tagName === "a")[0]?.properties.href);
    expect(hrefs).toEqual([
      `#${anchors.get("function:ns.one")}`,
      `#${anchors.get("function:ns.two")}`,
    ]);
    const headingIds = hastHeadings(hast).map((heading) => heading.id);
    for (const href of hrefs) expect(headingIds).toContain(String(href).slice(1));

    const [overloaded] = byClass(items[1], "api-signature");
    const [count] = byClass(overloaded, "api-overload-count");
    expect(textOf(count)).toBe("2 overloads");
    expect(byClass(items[0], "api-overload-count")).toEqual([]);
  });
});

function libraryPage(key: string, namespace: string, fields: Partial<ApiModule>): ApiPage {
  return page({
    namespace: key,
    route: `/api/someone/${key}/${namespace}`,
    module: { ...MODULE, namespace, functions: [], ...fields },
    category: "library",
  });
}

describe("library member symbol keys", () => {
  const spineGui = libraryPage("spine.gui", "gui", {
    functions: [fn("gui.new_spine_node")],
    typedefs: [{ name: "SpineNode", types: ["number"] }],
  });
  const rng = libraryPage("rng", "rnd", {
    functions: [fn("rnd.range")],
    typedefs: [{ name: "State", types: ["number"] }],
  });
  const random = libraryPage("random", "rnd", {
    functions: [fn("rnd.range")],
    typedefs: [{ name: "State", types: ["number"] }],
  });
  const other = libraryPage("astar", "astar", { functions: [fn("astar.solve")] });
  const shared = [rng, random];
  const anchored = (p: ApiPage, member: string): string =>
    `${p.route}#${memberAnchors(p).get(member)}`;

  test("a library member is keyed by its module namespace; the page entry keeps the page key", () => {
    const index = buildSymbolIndex([spineGui]);
    expect(index["gui.new_spine_node"]?.route).toBe(
      anchored(spineGui, "function:gui.new_spine_node"),
    );
    expect(index["spine.gui"]?.route).toBe(spineGui.route);
    expect(Object.keys(index).filter((key) => key.startsWith("spine.gui.gui."))).toEqual([]);
  });

  test("an engine page is keyed by its page namespace", () => {
    const engine = page({ namespace: "pathing", route: "/api/pathing" });
    expect(Object.keys(buildSymbolIndex([engine])).sort()).toEqual([
      "pathing",
      "pathing.astar.solve",
    ]);
  });

  test("a key two pages declare is dropped under drop; with no option the later page wins", () => {
    const dropped = buildSymbolIndex(shared, { ambiguous: "drop" });
    expect(dropped["rnd.range"]).toBeUndefined();
    expect(dropped.rng?.route).toBe(rng.route);
    expect(dropped.random?.route).toBe(random.route);
    expect(buildSymbolIndex(shared)["rnd.range"]?.route).toBe(
      anchored(random, "function:rnd.range"),
    );
  });

  test("a value and a type one page declares under one key are one page's key", () => {
    const vector = libraryPage("vec", "vmath", {
      functions: [fn("vmath.vector")],
      typedefs: [{ name: "vector", types: ["number"] }],
    });
    expect(buildSymbolIndex([vector], { ambiguous: "drop" })["vmath.vector"]?.route).toBe(
      anchored(vector, "function:vmath.vector"),
    );
  });

  test("under drop prose links a shared key only on a page that declares it, to its own heading", () => {
    const text = "Call rnd.range here.";
    const link = (current?: ApiPage) =>
      linked(
        apiLinkify(shared, current ? { current, ambiguous: "drop" } : { ambiguous: "drop" })(text),
      );
    const linkedTo = (href: string): [string, string?][] => [
      ["Call "],
      ["rnd.range", href],
      [" here."],
    ];
    expect(link(rng)).toEqual(linkedTo(anchored(rng, "function:rnd.range")));
    expect(link(random)).toEqual(linkedTo(anchored(random, "function:rnd.range")));
    expect(link(other)).toEqual([[text]]);
    expect(link()).toEqual([[text]]);
  });

  test("under drop a qualified type two pages declare links only from a page that declares it", () => {
    const links = (current: ApiPage) =>
      apiSignatureSymbolLinks(shared, current, shared, { ambiguous: "drop" });
    expect(links(rng).get("rnd.State")).toBe(anchored(rng, "type:State"));
    expect(links(random).get("rnd.State")).toBe(anchored(random, "type:State"));
    expect(links(other).has("rnd.State")).toBe(false);
  });

  test("one prose linker serves many pages, each page's own keys staying on that page", () => {
    const text = "Call rnd.range here.";
    const linkify = apiLinkifier(shared, { ambiguous: "drop" });
    const linkedTo = (href: string): [string, string?][] => [
      ["Call "],
      ["rnd.range", href],
      [" here."],
    ];
    expect(linked(linkify(rng)(text))).toEqual(linkedTo(anchored(rng, "function:rnd.range")));
    expect(linked(linkify(random)(text))).toEqual(linkedTo(anchored(random, "function:rnd.range")));
    expect(linked(linkify(other)(text))).toEqual([[text]]);
    expect(linked(linkify()(text))).toEqual([[text]]);
  });

  test("one signature linker serves many pages, each page's own types staying on that page", () => {
    const links = apiSignatureSymbolLinker(shared, shared, { ambiguous: "drop" });
    expect(links(rng).get("rnd.State")).toBe(anchored(rng, "type:State"));
    expect(links(random).get("rnd.State")).toBe(anchored(random, "type:State"));
    expect(links(other).has("rnd.State")).toBe(false);
  });

  test("a library page's qualified type is keyed by its module namespace", () => {
    const pages = [spineGui, other];
    const links = apiSignatureSymbolLinks(pages, other, pages, { ambiguous: "drop" });
    expect(links.get("gui.SpineNode")).toBe(anchored(spineGui, "type:SpineNode"));
    expect([...links.keys()].filter((key) => key.startsWith("spine.gui."))).toEqual([]);
  });
});
