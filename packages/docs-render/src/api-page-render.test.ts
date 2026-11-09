import { describe, expect, test } from "bun:test";
import type { ApiFunction, ApiModule } from "@defold-typescript/types";
import { apiLinkify, apiPageMarkdown, apiSignatureSymbolLinks } from "./api-page-render";
import type { ApiPage, LibraryMeta } from "./api-surface";
import { buildSymbolIndex, memberAnchors } from "./symbol-index";

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

describe("apiPageMarkdown provenance block", () => {
  const provenance = [
    `pinned to [\`0123456\`](${SOURCE_URL})`,
    "Run `bunx @defold-typescript/cli resolve` to materialize its types.",
    '     import * as astar from "astar"',
  ];

  test("a library page states its pin, resolve step and import; an engine page of the same module none", () => {
    const library = apiPageMarkdown(page({ category: "library", libraryMeta: META }), (t) => t);
    const engine = apiPageMarkdown(page({}), (t) => t);
    for (const line of provenance) {
      expect(library).toContain(line);
      expect(engine).not.toContain(line);
    }
  });
});

function fn(name: string): ApiFunction {
  return { name, brief: `${name} brief`, description: "", parameters: [], returnValues: [] };
}

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
      apiLinkify(shared, current ? { current, ambiguous: "drop" } : { ambiguous: "drop" })(text);
    expect(link(rng)).toContain(`href="${anchored(rng, "function:rnd.range")}"`);
    expect(link(random)).toContain(`href="${anchored(random, "function:rnd.range")}"`);
    expect(link(other)).not.toContain("<a ");
    expect(link()).not.toContain("<a ");
  });

  test("under drop a qualified type two pages declare links only from a page that declares it", () => {
    const links = (current: ApiPage) =>
      apiSignatureSymbolLinks(shared, current, shared, { ambiguous: "drop" });
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
