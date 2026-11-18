import { expect, test } from "bun:test";
import { join } from "node:path";
import {
  apiSignatureSymbolLinks,
  renderApiPage,
} from "@defold-typescript/docs-render/api-page-render";
import type { ApiPage } from "@defold-typescript/docs-render/api-surface";
import { hastHeadings, hastOutlineText } from "@defold-typescript/docs-render/headings";
import { buildSymbolIndex } from "@defold-typescript/docs-render/symbol-index";
import type { SymbolLinker } from "@defold-typescript/docs-render/symbol-linkify";
import { canonicalApiPages } from "@defold-typescript/docs-render/toolchain-surface";
import {
  loadApiSurfaceForVersion,
  versionsWithDiskFixtures,
} from "@defold-typescript/docs-render/toolchain-surface-loader";
import type { Element, Nodes, Root } from "hast";

const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");

const noLinks: SymbolLinker = (text) => [{ type: "text", value: text }];

function textOf(node: Nodes): string {
  if (node.type === "text") return node.value;
  return "children" in node ? node.children.map(textOf).join("") : "";
}

// Every `a.signature-symbol-link` under `nodes`, as `[token, href]` pairs.
function symbolLinks(nodes: readonly Nodes[]): [string, string][] {
  const out: [string, string][] = [];
  const walk = (node: Nodes): void => {
    if (node.type === "element" && node.tagName === "a") {
      const { className, href } = node.properties;
      if (Array.isArray(className) && className.includes("signature-symbol-link")) {
        out.push([textOf(node), String(href ?? "")]);
      }
    }
    if ("children" in node) for (const child of node.children) walk(child);
  };
  for (const node of nodes) walk(node);
  return out;
}

const isH3 = (node: Nodes): node is Element => node.type === "element" && node.tagName === "h3";

// The `h3` whose text holds `signatureText` and everything up to the next `h3`.
function signatureBlock(tree: Root, signatureText: string): Nodes[] | undefined {
  const at = tree.children.findIndex(
    (child) => isH3(child) && hastOutlineText(child).includes(signatureText),
  );
  if (at < 0) return undefined;
  const next = tree.children.findIndex((child, index) => index > at && isH3(child));
  return tree.children.slice(at, next < 0 ? undefined : next);
}

function signatureLinks(tree: Root, signatureText: string): Map<string, string> {
  return new Map(symbolLinks(signatureBlock(tree, signatureText) ?? []));
}

test("apiSignatureSymbolLinks resolves Opaque to the document-engine-globals page route", () => {
  const pages = canonicalApiPages(REAL_TYPES_DIR);
  const route = buildSymbolIndex(pages).Opaque?.route;
  // Dropping or renaming the `Opaque` global-type page makes this undefined.
  expect(route).toBe("/api/Opaque");
  expect(apiSignatureSymbolLinks(pages).get("Opaque")).toBe(route);
});

test("a versioned surface carries no Opaque page, so its route resolves against canonical", () => {
  // Global types are version-independent — `apiPagesForVersion` excludes them, so
  // resolving against a versioned surface yields nothing. This is why the
  // `/api/<version>/<namespace>` route builds its signature links from the
  // canonical surface (which links every version's `Opaque` to `/api/Opaque`).
  const defaultId = versionsWithDiskFixtures(REAL_TYPES_DIR).find((v) => v.isDefault)?.id;
  expect(defaultId).toBeDefined();
  const versioned = loadApiSurfaceForVersion(REAL_TYPES_DIR, defaultId as string);
  expect(apiSignatureSymbolLinks(versioned).size).toBe(0);
});

// A page whose module-function section heading and typedef shape share the slug
// `functions`: the section renders `h2#functions` and the shape `h3#functions-1`,
// so a link built from `slugify(<shape name>)` alone lands on the wrong heading.
// No shipped page carries this collision yet, which is why it takes a fixture.
function collidingShapePage(): ApiPage {
  return {
    namespace: "demo",
    route: "/api/demo",
    brief: "Demo",
    module: {
      namespace: "demo",
      brief: "Demo",
      description: "Heading-collision demo.",
      functions: [
        {
          name: "demo.use",
          brief: "",
          description: "Uses the option table.",
          parameters: [
            { name: "opts", doc: "the options", types: ["Functions"], isOptional: false },
          ],
          returnValues: [],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [
        {
          name: "Functions",
          functions: [
            {
              name: "run",
              brief: "",
              description: "Runs the callback.",
              parameters: [],
              returnValues: [],
            },
          ],
          properties: [{ name: "count", brief: "", description: "How many.", types: ["number"] }],
        },
      ],
    },
    translations: {},
    signatures: {},
    category: "global-type",
  };
}

test("a shape link targets its own heading when an earlier heading shares the slug", async () => {
  const page = collidingShapePage();
  const { hast } = await renderApiPage(
    page,
    noLinks,
    {},
    { signatureSymbolLinks: apiSignatureSymbolLinks([page], page) },
  );

  // Both sides come from production: the expected id is read off the rendered
  // shape heading, so the assertion compares two render outputs rather than a
  // literal, and the de-duplication suffix cannot drift them apart silently.
  const collided = hastHeadings(hast).filter((h) => h.text === "Functions");
  expect(collided.length).toBe(2);
  const shape = collided[collided.length - 1] as (typeof collided)[number];
  expect(shape.id).not.toBe("functions");

  const signature = signatureBlock(hast, "demo.use(opts");
  expect(signature).toBeDefined();
  if (!signature) return;
  const linked = new Map(symbolLinks(signature));
  expect([...linked.keys()]).toContain("Functions");
  expect(linked.get("Functions")?.endsWith(`#${shape.id}`)).toBe(true);
  // Stated separately so the assertion above cannot pass by both ids agreeing:
  // resolving first-wins, or from `slugify(label)`, lands on the section heading.
  expect(linked.get("Functions")?.endsWith("#functions")).toBe(false);
});

// One member-less alias and one shape with fields, both named by the same
// signature, so the two link targets can be told apart on one page.
function mixedTypesPage(): ApiPage {
  return {
    namespace: "demo",
    route: "/api/demo",
    brief: "Demo",
    module: {
      namespace: "demo",
      brief: "Demo",
      description: "Mixed types demo.",
      functions: [
        {
          name: "demo.show",
          brief: "",
          description: "Shows a screen.",
          parameters: [
            { name: "id", doc: "the screen", types: ["ScreenKey"], isOptional: false },
            { name: "opts", doc: "the options", types: ["ShowConfig"], isOptional: false },
          ],
          returnValues: [],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [
        { name: "ScreenKey", types: ["string", "number"] },
        {
          name: "ShowConfig",
          properties: [{ name: "modal", brief: "", description: "Modal.", types: ["boolean"] }],
        },
      ],
    },
    translations: {},
    signatures: {},
    category: "global-type",
  };
}

test("a member-less type's bare name links to its own row", async () => {
  const page = mixedTypesPage();
  const { hast } = await renderApiPage(
    page,
    noLinks,
    {},
    { signatureSymbolLinks: apiSignatureSymbolLinks([page], page) },
  );

  const headings = hastHeadings(hast);
  const named = (text: string) => headings.filter((h) => h.text === text);
  expect(named("Types").map((h) => h.level)).toEqual([2]);
  expect(named("ShowConfig").map((h) => h.level)).toEqual([3]);
  expect(named("ScreenKey")).toHaveLength(0);
  const row = headings.find((h) => h.text.startsWith("type ScreenKey"));
  const shape = named("ShowConfig")[0];
  expect(row).toBeDefined();
  if (!row || !shape) return;

  const linked = signatureLinks(hast, "demo.show(id");
  expect(linked.get("ScreenKey")?.endsWith(`#${row.id}`)).toBe(true);
  expect(linked.get("ShowConfig")?.endsWith(`#${shape.id}`)).toBe(true);
});

test("an engine page's type links target the qualified headings it renders", async () => {
  const page: ApiPage = { ...mixedTypesPage(), category: "engine" };
  const { hast } = await renderApiPage(
    page,
    noLinks,
    {},
    { signatureSymbolLinks: apiSignatureSymbolLinks([page], page) },
  );

  const headings = hastHeadings(hast);
  const row = headings.find((h) => h.text.startsWith("type demo.ScreenKey"));
  const shape = headings.find((h) => h.text === "demo.ShowConfig");
  expect(row).toBeDefined();
  expect(shape?.level).toBe(3);
  if (!row || !shape) return;

  const linked = signatureLinks(hast, "demo.show(id");
  expect(linked.get("ScreenKey")?.endsWith(`#${row.id}`)).toBe(true);
  expect(linked.get("ShowConfig")?.endsWith(`#${shape.id}`)).toBe(true);
});

test("a page's own shapes join the map at that page's route, beside Opaque", () => {
  const pages = canonicalApiPages(REAL_TYPES_DIR);
  const page = mixedTypesPage();
  const links = apiSignatureSymbolLinks(pages, page);
  expect(links.get("Opaque")).toBe("/api/Opaque");
  expect(links.get("ShowConfig")).toEqual({ route: page.route, heading: "ShowConfig" });
  // The fallback grouping label names no shape, so it never enters the map.
  expect(links.has("Types")).toBe(false);
});

test("a shape name declared on two pages resolves against the page being rendered", () => {
  const first = { ...mixedTypesPage(), namespace: "first", route: "/api/first" };
  const second = { ...mixedTypesPage(), namespace: "second", route: "/api/second" };
  const other = collidingShapePage();
  const pages = [first, second, other];
  expect(apiSignatureSymbolLinks(pages, first).get("ShowConfig")).toEqual({
    route: first.route,
    heading: "ShowConfig",
  });
  expect(apiSignatureSymbolLinks(pages, second).get("ShowConfig")).toEqual({
    route: second.route,
    heading: "ShowConfig",
  });
  // A page declaring no `ShowConfig` must not inherit either route.
  expect(apiSignatureSymbolLinks(pages, other).has("ShowConfig")).toBe(false);
});

test("an empty shape has nothing to show, so its token stays inert", async () => {
  const base = mixedTypesPage();
  const page: ApiPage = {
    ...base,
    module: {
      ...base.module,
      functions: [
        {
          name: "demo.show",
          brief: "",
          description: "Shows a screen.",
          parameters: [
            { name: "opts", doc: "", types: ["ShowConfig"], isOptional: false },
            { name: "data", doc: "", types: ["Data"], isOptional: false },
          ],
          returnValues: [],
        },
      ],
      typedefs: [...base.module.typedefs, { name: "Data" }],
    },
  };
  const { hast } = await renderApiPage(
    page,
    noLinks,
    {},
    { signatureSymbolLinks: apiSignatureSymbolLinks([page], page) },
  );
  const linked = signatureLinks(hast, "demo.show(opts");
  expect([...linked.keys()]).toContain("ShowConfig");
  expect([...linked.keys()]).not.toContain("Data");
});

let canonical: ApiPage[] | undefined;
const canonicalPages = (): ApiPage[] => {
  canonical ??= canonicalApiPages(REAL_TYPES_DIR);
  return canonical;
};

const canonicalRenders = new Map<string, Promise<{ page: ApiPage; hast: Root }>>();

function renderCanonical(namespace: string): Promise<{ page: ApiPage; hast: Root }> {
  let rendered = canonicalRenders.get(namespace);
  if (rendered === undefined) {
    const pages = canonicalPages();
    const page = pages.find((p) => p.namespace === namespace);
    if (!page) throw new Error(`no ${namespace} page`);
    rendered = renderApiPage(
      page,
      noLinks,
      {},
      { signatureSymbolLinks: apiSignatureSymbolLinks(pages, page) },
    ).then(({ hast }) => ({ page, hast }));
    canonicalRenders.set(namespace, rendered);
  }
  return rendered;
}

test("canonical gui, socket and image pages: one Types heading and no dangling in-page type link", async () => {
  for (const namespace of ["gui", "socket", "image"]) {
    const { page, hast } = await renderCanonical(namespace);
    const headings = hastHeadings(hast);
    const levelsOf = (text: string) => headings.filter((h) => h.text === text).map((h) => h.level);
    expect(levelsOf("Types")).toEqual([2]);
    if (namespace === "gui") {
      expect(levelsOf("Adjust")).toEqual([]);
      expect(levelsOf("Easing")).toEqual([]);
    } else if (namespace === "socket") {
      expect(levelsOf("socket.dns")).toEqual([3]);
      expect(levelsOf("dns")).toEqual([]);
      expect(levelsOf("socket_client")).toEqual([]);
      expect(levelsOf("client methods")).toEqual([3]);
    } else {
      expect(headings.some((h) => h.text.startsWith("type image.Type"))).toBe(true);
    }

    const ids = new Set(headings.map((h) => h.id));
    const inPage = symbolLinks([hast])
      .map(([, href]) => href)
      .filter((href) => href.startsWith(`${page.route}#`));
    expect(inPage.length).toBeGreaterThan(0);
    const dangling = inPage.filter((href) => !ids.has(href.slice(`${page.route}#`.length)));
    expect(dangling).toEqual([]);
  }
});

test("the symbol index routes a type to the heading the page renders", async () => {
  const { hast } = await renderCanonical("image");
  const heading = hastHeadings(hast).find((h) => h.text.startsWith("type image.Type"));
  expect(heading).toBeDefined();
  if (!heading) return;
  expect(buildSymbolIndex(canonicalPages())["image.Type"]?.route.endsWith(`#${heading.id}`)).toBe(
    true,
  );
});
