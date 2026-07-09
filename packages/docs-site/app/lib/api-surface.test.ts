import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ApiFunction,
  hashExampleSource,
  htmlToCodeText,
  parseDefoldApiDoc,
  type SignatureStore,
} from "@defold-typescript/types";
import {
  type ApiPage,
  type ApiSymbol,
  apiModuleMarkdown,
  apiModuleSymbols,
  exampleMarkdownFor,
  functionOverviewCards,
  groupFunctionSymbols,
  mapDocType,
} from "./api-surface";
import {
  libraryRouteSlug,
  listApiVersions,
  loadApiSurface,
  loadApiSurfaceForVersion,
  versionsWithDiskFixtures,
} from "./api-surface-loader";
import { pageHeadings } from "./headings";
import { renderMarkdown } from "./markdown";

function fnSymbol(name: string, overrides: Partial<ApiSymbol> = {}): ApiSymbol {
  return {
    kind: "function",
    name,
    signature: `${name}()`,
    docMarkdown: "",
    parameters: [],
    returnValues: [],
    ...overrides,
  };
}

const FIXTURE_DIR = join(import.meta.dir, "__fixtures__/api-surface");
const NO_GLOBALS_FIXTURE_DIR = join(import.meta.dir, "__fixtures__/api-surface-no-globals");
const MISSING_VERSION_FIXTURE_DIR = join(
  import.meta.dir,
  "__fixtures__/api-surface-missing-version",
);
const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");
const REAL_LIBRARY_TYPES_DIR = join(import.meta.dir, "../../../library-types");

// Every `api-doc/*.json` fixture that also has a vendored `generated/*.d.ts`
// sibling — the exact set the loader is expected to surface as `library` pages.
function vendoredLibraryModules(): string[] {
  const apiDocDir = join(REAL_LIBRARY_TYPES_DIR, "api-doc");
  return readdirSync(apiDocDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .filter((mod) => existsSync(join(REAL_LIBRARY_TYPES_DIR, "generated", `${mod}.d.ts`)));
}

describe("loadApiSurface", () => {
  test("returns one ApiPage per module of the default target (engine then lua-stdlib), globals first then alphabetical", () => {
    const pages = loadApiSurface(FIXTURE_DIR);
    expect(pages.map((p) => p.namespace)).toEqual(["globals", "alpha", "camera", "base", "bit"]);
  });

  test("prepends the synthetic globals page from globals_doc.json as pages[0]", () => {
    const pages = loadApiSurface(FIXTURE_DIR);
    expect(pages[0]?.namespace).toBe("globals");
    expect(pages[0]?.route).toBe("/api/globals");
    expect(pages[0]?.module.functions.map((f) => f.name)).toContain("hash");
  });

  test("omits the globals page when no globals_doc.json exists in the fixtures dir", () => {
    const pages = loadApiSurface(NO_GLOBALS_FIXTURE_DIR);
    expect(pages.map((p) => p.namespace)).toEqual(["camera"]);
  });

  test("derives the route and carries the brief plus the parsed module", () => {
    const camera = loadApiSurface(FIXTURE_DIR).find((p) => p.namespace === "camera");
    expect(camera?.route).toBe("/api/camera");
    expect(camera?.brief).toBe("Camera brief");
    expect(camera?.module.functions.map((f) => f.name)).toContain("camera.get_projection");
  });

  test("selects the default target by its flag, not the first entry", () => {
    const pages = loadApiSurface(FIXTURE_DIR);
    expect(pages.some((p) => p.namespace === "wmath")).toBe(false);
  });

  test("yields an entry for a namespace whose fixture has no functions or variables", () => {
    const alpha = loadApiSurface(FIXTURE_DIR).find((p) => p.namespace === "alpha");
    expect(alpha).toBeDefined();
    expect(alpha?.module.functions).toHaveLength(0);
    expect(alpha?.module.variables).toHaveLength(0);
  });

  test("tags base and bit pages with category 'lua-stdlib' from target.luaStdlib", () => {
    const pages = loadApiSurface(FIXTURE_DIR);
    const base = pages.find((p) => p.namespace === "base");
    const bit = pages.find((p) => p.namespace === "bit");
    expect(base?.category).toBe("lua-stdlib");
    expect(bit?.category).toBe("lua-stdlib");
    expect(base?.route).toBe("/api/base");
    expect(bit?.route).toBe("/api/bit");
  });

  test("tags engine pages (modules, globals) with category 'engine', distinct from lua-stdlib", () => {
    const pages = loadApiSurface(FIXTURE_DIR);
    for (const namespace of ["globals", "alpha", "camera"]) {
      const page = pages.find((p) => p.namespace === namespace);
      expect(page?.category).toBe("engine");
    }
  });
});

describe("listApiVersions", () => {
  test("lists the default target first, then the rest in api-targets.json order", () => {
    expect(listApiVersions(FIXTURE_DIR)).toEqual([
      { id: "cur", isDefault: true },
      { id: "old", isDefault: false },
    ]);
  });
});

describe("versionsWithDiskFixtures", () => {
  test("includes a non-default version whose module fixtures exist on disk", () => {
    expect(versionsWithDiskFixtures(FIXTURE_DIR)).toEqual([
      { id: "cur", isDefault: true },
      { id: "old", isDefault: false },
    ]);
  });

  test("skips a non-default version whose fixturesDir has no readable module fixture (no throw)", () => {
    expect(versionsWithDiskFixtures(MISSING_VERSION_FIXTURE_DIR)).toEqual([
      { id: "cur", isDefault: true },
    ]);
  });

  test("keeps the default version even when only the default has on-disk fixtures", () => {
    const versions = versionsWithDiskFixtures(MISSING_VERSION_FIXTURE_DIR);
    expect(versions.some((v) => v.isDefault)).toBe(true);
    expect(versions.some((v) => v.id === "ghost")).toBe(false);
  });
});

describe("loadApiSurfaceForVersion", () => {
  test("loading the default target by id is byte-identical to the legacy entry point", () => {
    expect(loadApiSurfaceForVersion(FIXTURE_DIR, "cur")).toEqual(loadApiSurface(FIXTURE_DIR));
  });

  test("a non-default target loads only its own modules, with version-prefixed routes", () => {
    const pages = loadApiSurfaceForVersion(FIXTURE_DIR, "old");
    expect(pages).toHaveLength(1);
    expect(pages[0]?.namespace).toBe("wmath");
    expect(pages[0]?.route).toBe("/api/old/wmath");
  });

  test("a non-default surface omits the shared core-types global-type pages", () => {
    const pages = loadApiSurfaceForVersion(FIXTURE_DIR, "old");
    expect(pages.some((p) => p.category === "global-type")).toBe(false);
  });

  test("throws for an unknown version id", () => {
    expect(() => loadApiSurfaceForVersion(FIXTURE_DIR, "nope")).toThrow();
  });
});

describe("loadApiSurface library pages", () => {
  const modules = vendoredLibraryModules();
  const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
  const libraryPages = pages.filter((p) => p.category === "library");

  test("adds one default-surface `library` page per vendored library fixture", () => {
    expect(modules.length).toBeGreaterThan(0);
    expect(libraryPages.map((p) => p.namespace).sort()).toEqual([...modules].sort());
    for (const page of libraryPages) {
      expect(page.route).toBe(`/api/${libraryRouteSlug(page.namespace)}`);
      expect(page.route.startsWith("/api/")).toBe(true);
      // default surface only — never under `/api/<version>/…`
      expect(page.route).not.toMatch(/^\/api\/defold-/);
    }
  });

  test("omits library pages entirely when no library-types dir is supplied", () => {
    const noLib = loadApiSurface(REAL_TYPES_DIR);
    expect(noLib.some((p) => p.category === "library")).toBe(false);
  });

  test("builds a structured libraryMeta with author/upstream repo, commit pin, import, and license", () => {
    const camera = libraryPages.find((p) => p.namespace === "orthographic.camera");
    expect(camera).toBeDefined();
    const meta = camera?.libraryMeta;
    expect(meta).toBeDefined();
    if (!meta) return;
    expect(meta.author).toBe("Britzl");
    expect(meta.authorUrl).toBe("https://github.com/britzl/defold-orthographic");
    expect(meta.commit).toBe("2fe3aed3352a913d2859e6e85d34a8b23d821368");
    // Links to the exact `.d.ts` the types were generated from, at the pin.
    expect(meta.sourceUrl).toBe(
      "https://github.com/ts-defold/library/blob/2fe3aed3352a913d2859e6e85d34a8b23d821368/packages/defold-orthographic/orthographic.camera.d.ts",
    );
    expect(meta.importString).toBe('import * as camera from "orthographic.camera"');
    expect(meta.license).toBe("MIT");
    expect("commitUrl" in meta).toBe(false);
    expect("attribution" in meta).toBe(false);
  });

  test("no longer prepends the prose provenance note into a library module description", () => {
    for (const page of libraryPages) {
      expect(page.module.description ?? "").not.toContain("Vendored from");
    }
    // the library's own description survives, unburied by the removed boilerplate
    const monarch = libraryPages.find((p) => p.namespace === "monarch.monarch");
    expect(monarch?.module.description ?? "").toContain("Monarch is a screen manager");
  });

  test("a non-library page carries no libraryMeta", () => {
    const engine = pages.find((p) => p.category === "engine");
    expect(engine).toBeDefined();
    expect(engine?.libraryMeta).toBeUndefined();
  });

  test("derives a round-tripping /api slug for a dotted library module", () => {
    const slug = libraryRouteSlug("monarch.monarch");
    const monarch = libraryPages.find((p) => p.namespace === "monarch.monarch");
    expect(monarch?.route).toBe(`/api/${slug}`);
    // slug -> page lookup round-trips with the dotted module name preserved
    const bySlug = pages.find((p) => p.route === `/api/${slug}`);
    expect(bySlug?.namespace).toBe("monarch.monarch");
  });

  test("a non-default versioned surface yields zero library pages even when a lib dir is supplied", () => {
    const versioned = loadApiSurfaceForVersion(FIXTURE_DIR, "old", REAL_LIBRARY_TYPES_DIR);
    expect(versioned.some((p) => p.category === "library")).toBe(false);
  });
});

describe("loadApiSurface library descriptions", () => {
  const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
  const libraryPages = pages.filter((p) => p.category === "library");
  const descByDir = JSON.parse(
    readFileSync(join(REAL_LIBRARY_TYPES_DIR, "library-descriptions.json"), "utf8"),
  ) as Record<string, string>;

  test("every library page has a non-empty module.description", () => {
    for (const page of libraryPages) {
      expect(page.module.description.length).toBeGreaterThan(0);
    }
  });

  test("a description-less api-doc page (orthographic.camera) gets its description from the vendored map", () => {
    const orthographic = libraryPages.find((p) => p.namespace === "orthographic.camera");
    expect(orthographic).toBeDefined();
    expect(orthographic?.module.description).toBe(descByDir["defold-orthographic"]);
    expect(orthographic?.module.description ?? "").not.toContain("vendored via");
    expect(orthographic?.module.description ?? "").not.toContain("tree/");
  });

  test("a page whose api-doc fixture already carries a description keeps its own richer text", () => {
    const monarch = libraryPages.find((p) => p.namespace === "monarch.monarch");
    expect(monarch?.module.description ?? "").toContain("Monarch is a screen manager");
    expect(monarch?.module.description).not.toBe(descByDir.monarch);
  });
});

describe("apiModuleMarkdown", () => {
  test("renders a codehilite examples fragment as a lua fence with no raw HTML", () => {
    const page: ApiPage = {
      namespace: "demo",
      route: "/api/demo",
      brief: "Demo brief",
      module: {
        namespace: "demo",
        brief: "Demo brief",
        description: "Demo module.",
        functions: [
          {
            name: "demo.run",
            brief: "run it",
            description: "Runs the demo.",
            parameters: [],
            returnValues: [],
            examples:
              'Call it:\n<div class="codehilite"><pre><code><span class="n">demo</span><span class="p">.</span><span class="n">run</span><span class="p">()</span></code></pre></div>',
          },
        ],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [],
      },
      translations: {},
      signatures: {},
      category: "engine",
    };
    const md = apiModuleMarkdown(page);
    expect(md).toContain("```lua");
    expect(md).toContain("demo.run()");
    expect(md).not.toContain("codehilite");
    expect(md).not.toContain("<div");
    expect(md).not.toContain("<span");
  });

  test("renders displayName as the H1 and keeps the raw namespace visible beneath it", () => {
    const md = apiModuleMarkdown({
      namespace: "squid.squid",
      displayName: "paweljarosz / squid",
      category: "library",
      module: {
        namespace: "squid.squid",
        brief: "Squid",
        description: "Squid helpers.",
        functions: [],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [],
      },
    });
    expect(md).toContain("# paweljarosz / squid");
    expect(md).not.toContain("# squid.squid");
    expect(md).toContain("`squid.squid`");
  });

  test("a page without displayName renders `# <namespace>` unchanged", () => {
    const md = apiModuleMarkdown({
      namespace: "camera",
      category: "engine",
      module: {
        namespace: "camera",
        brief: "Camera",
        description: "Camera module.",
        functions: [],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [],
      },
    });
    expect(md).toContain("# camera");
  });

  function paramDocPage(
    parameters: { name: string; doc: string; types: string[]; isOptional: boolean }[],
    returnValues: { name: string; doc: string; types: string[]; isOptional: boolean }[],
  ): ApiPage {
    return {
      namespace: "demo",
      route: "/api/demo",
      brief: "Demo brief",
      module: {
        namespace: "demo",
        brief: "Demo brief",
        description: "Demo module.",
        functions: [
          {
            name: "demo.run",
            brief: "run it",
            description: "Runs the demo.",
            parameters,
            returnValues,
          },
        ],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [],
      },
      translations: {},
      signatures: {},
      category: "engine",
    };
  }

  test("folds parameter and return doc prose into the text", () => {
    const md = apiModuleMarkdown(
      paramDocPage(
        [
          {
            name: "loop",
            doc: "<p>whether to keep looping</p>",
            types: ["boolean"],
            isOptional: true,
          },
        ],
        [{ name: "", doc: "<p>the frame counter value</p>", types: ["number"], isOptional: false }],
      ),
    );
    expect(md).toContain("whether to keep looping");
    expect(md).toContain("the frame counter value");
  });

  test("strips HTML from param/return docs sourced from <p> markup", () => {
    const md = apiModuleMarkdown(
      paramDocPage(
        [
          {
            name: "loop",
            doc: "<p>whether to keep looping</p>",
            types: ["boolean"],
            isOptional: true,
          },
        ],
        [{ name: "", doc: "<p>the frame counter value</p>", types: ["number"], isOptional: false }],
      ),
    );
    expect(md).not.toContain("<");
  });

  test("emits no param/return scaffolding when both lists are empty", () => {
    const md = apiModuleMarkdown(paramDocPage([], []));
    expect(md).toContain("Runs the demo.");
    expect(md).toContain("### `demo.run()`");
  });

  test("renders member-bearing typedefs under a Types section", () => {
    const md = apiModuleMarkdown({
      namespace: "demo",
      category: "engine",
      module: {
        namespace: "demo",
        brief: "Demo brief",
        description: "Demo module.",
        functions: [],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [
          {
            name: "LoggerInstance",
            functions: [
              {
                name: "info",
                brief: "",
                description: "Writes an info message.",
                parameters: [
                  { name: "message", doc: "message text", types: ["string"], isOptional: false },
                ],
                returnValues: [],
              },
            ],
            properties: [
              { name: "level", brief: "", description: "Current log level.", types: ["number"] },
            ],
          },
        ],
      },
    });
    expect(md).toContain("## Types");
    expect(md).toContain("### LoggerInstance");
    expect(md).toContain("#### `info(message: string)`");
    expect(md).toContain("Writes an info message.");
    expect(md).toContain("message — message text");
    expect(md).toContain("#### `level: number`");
    expect(md).toContain("Current log level.");
  });

  test("omits the Types section for memberless typedefs", () => {
    const md = apiModuleMarkdown({
      namespace: "demo",
      category: "engine",
      module: {
        namespace: "demo",
        brief: "Demo brief",
        description: "Demo module.",
        functions: [],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [{ name: "Alias" }],
      },
    });
    expect(md).not.toContain("## Types");
    expect(md).not.toContain("Alias");
  });
});

describe("apiModuleSymbols", () => {
  function pageWith(module: Partial<ApiPage["module"]>): ApiPage {
    return {
      namespace: "demo",
      route: "/api/demo",
      brief: "Demo brief",
      module: {
        namespace: "demo",
        brief: "Demo brief",
        description: "Demo module.",
        functions: [],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [],
        ...module,
      },
      translations: {},
      signatures: {},
      category: "engine",
    };
  }

  test("extracts a function symbol with signature, doc, and example", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "demo.run",
            brief: "run it",
            description: "Runs the demo.",
            parameters: [{ name: "loop", doc: "", types: ["boolean"], isOptional: true }],
            returnValues: [{ name: "", doc: "", types: ["number"], isOptional: false }],
            examples:
              '<div class="codehilite"><pre><code><span class="n">demo</span><span class="p">.</span><span class="n">run</span><span class="p">()</span></code></pre></div>',
          },
        ],
      }),
    );
    expect(symbols).toHaveLength(1);
    const sym = symbols[0];
    expect(sym?.kind).toBe("function");
    expect(sym?.name).toBe("demo.run");
    expect(sym?.signature).toBe("demo.run(loop?: boolean): number");
    expect(sym?.docMarkdown).toBe("Runs the demo.");
    expect(sym?.exampleMarkdown).toContain("```lua");
    expect(sym?.exampleMarkdown).toContain("demo.run()");
  });

  test("a function with no examples yields exampleMarkdown undefined", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          { name: "demo.tick", brief: "", description: "Tick.", parameters: [], returnValues: [] },
        ],
      }),
    );
    expect(symbols[0]?.signature).toBe("demo.tick()");
    expect(symbols[0]?.exampleMarkdown).toBeUndefined();
  });

  test("yields the correct kind and signature for variables, constants, and properties", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        variables: [{ name: "demo.SPEED", brief: "", description: "Speed.", types: ["number"] }],
        constants: [{ name: "demo.MAX", brief: "", description: "Max." }],
        properties: [{ name: "position", brief: "", description: "Pos.", types: ["vector3"] }],
      }),
    );
    expect(symbols.map((s) => [s.kind, s.signature])).toEqual([
      ["variable", "demo.SPEED: number"],
      ["constant", "demo.MAX"],
      ["property", "position: Vector3"],
    ]);
    expect(symbols.every((s) => s.exampleMarkdown === undefined)).toBe(true);
  });

  test("emits type member symbols for member-bearing typedefs only", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        typedefs: [
          {
            name: "LoggerInstance",
            functions: [
              {
                name: "info",
                brief: "",
                description: "Writes an info message.",
                parameters: [
                  { name: "message", doc: "message text", types: ["string"], isOptional: false },
                ],
                returnValues: [],
              },
            ],
            properties: [
              { name: "level", brief: "", description: "Current log level.", types: ["number"] },
            ],
          },
          { name: "BareAlias" },
        ],
      }),
    );
    expect(symbols.map((s) => [s.kind, s.name, s.signature, s.docMarkdown])).toEqual([
      [
        "type",
        "LoggerInstance.info",
        "LoggerInstance.info(message: string)",
        "Writes an info message.",
      ],
      ["type", "LoggerInstance.level", "LoggerInstance.level: number", "Current log level."],
    ]);
    expect(symbols[0]?.parameters).toEqual([
      { name: "message", doc: "message text", types: ["string"], isOptional: false },
    ]);
    expect(symbols[1]?.parameters).toEqual([]);
    expect(symbols.every((s) => s.returnValues.length === 0)).toBe(true);
  });

  test("carries structured parameters and named return values for a function", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "b2d.get_body",
            brief: "",
            description: "Gets the body.",
            parameters: [
              {
                name: "url",
                doc: "the url ...",
                types: ["string", "hash", "url"],
                isOptional: false,
              },
            ],
            returnValues: [
              {
                name: "body",
                doc: "the body if successful. Otherwise nil.",
                types: ["b2Body"],
                isOptional: false,
              },
            ],
          },
        ],
      }),
    );
    expect(symbols[0]?.parameters).toEqual([
      { name: "url", doc: "the url ...", types: ["string", "Hash", "Url"], isOptional: false },
    ]);
    expect(symbols[0]?.returnValues).toEqual([
      {
        name: "body",
        doc: "the body if successful. Otherwise nil.",
        types: ['Opaque<"b2Body">'],
        isOptional: false,
      },
    ]);
  });

  test("projects a parameter's fields tree recursively, mapping member docs and types", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "demo.follow",
            brief: "",
            description: "Follow.",
            parameters: [
              {
                name: "options",
                doc: "the options",
                types: ["{ lerp?: number; nested?: { color?: vector3; }; }"],
                isOptional: true,
                fields: [
                  {
                    name: "lerp",
                    doc: 'the <span class="type">lerp</span> factor',
                    types: ["number"],
                    isOptional: true,
                  },
                  {
                    name: "nested",
                    doc: "nested config",
                    types: ["{ color?: vector3; }"],
                    isOptional: true,
                    fields: [
                      { name: "color", doc: "the color", types: ["vector3"], isOptional: true },
                    ],
                  },
                ],
              },
            ],
            returnValues: [],
          },
        ],
      }),
    );
    expect(symbols[0]?.parameters[0]?.fields).toEqual([
      { name: "lerp", doc: "the lerp factor", types: ["number"], isOptional: true },
      {
        name: "nested",
        doc: "nested config",
        types: ["{ color?: vector3; }"],
        isOptional: true,
        fields: [{ name: "color", doc: "the color", types: ["Vector3"], isOptional: true }],
      },
    ]);
  });

  test("leaves a parameter without fields free of a fields key", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "demo.plain",
            brief: "",
            description: "Plain.",
            parameters: [{ name: "x", doc: "", types: ["number"], isOptional: false }],
            returnValues: [],
          },
        ],
      }),
    );
    expect(symbols[0]?.parameters[0]?.fields).toBeUndefined();
    expect(Object.hasOwn(symbols[0]?.parameters[0] ?? {}, "fields")).toBe(false);
  });

  test("reduces HTML in a parameter doc to plain text", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "demo.f",
            brief: "",
            description: "F.",
            parameters: [
              {
                name: "url",
                doc: 'the <span class="type">url</span> to use',
                types: ["url"],
                isOptional: false,
              },
            ],
            returnValues: [],
          },
        ],
      }),
    );
    expect(symbols[0]?.parameters[0]?.doc).toBe("the url to use");
    expect(symbols[0]?.parameters[0]?.doc).not.toContain("<span");
  });

  test("renders an empty types array as `unknown`, matching the emitted .d.ts", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "demo.f",
            brief: "",
            description: "F.",
            parameters: [{ name: "x", doc: "", types: [], isOptional: false }],
            returnValues: [{ name: "", doc: "", types: [], isOptional: false }],
          },
        ],
        variables: [{ name: "demo.V", brief: "", description: "V.", types: [] }],
      }),
    );
    expect(symbols[0]?.signature).toBe("demo.f(x: unknown): unknown");
    expect(symbols[1]?.signature).toBe("demo.V: unknown");
  });

  test("projects empty parameters and returnValues to empty arrays", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          { name: "demo.tick", brief: "", description: "Tick.", parameters: [], returnValues: [] },
        ],
      }),
    );
    expect(symbols[0]?.parameters).toEqual([]);
    expect(symbols[0]?.returnValues).toEqual([]);
  });

  test("variables, constants, and properties carry empty parameters and returnValues arrays", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        variables: [{ name: "demo.SPEED", brief: "", description: "Speed.", types: ["number"] }],
        constants: [{ name: "demo.MAX", brief: "", description: "Max." }],
        properties: [{ name: "position", brief: "", description: "Pos.", types: ["vector3"] }],
      }),
    );
    expect(symbols.every((s) => s.parameters.length === 0 && s.returnValues.length === 0)).toBe(
      true,
    );
  });

  test("order and signatures match the headings apiModuleMarkdown emits", () => {
    const page = pageWith({
      functions: [
        { name: "demo.a", brief: "", description: "A.", parameters: [], returnValues: [] },
      ],
      variables: [{ name: "demo.V", brief: "", description: "V.", types: ["number"] }],
      constants: [{ name: "demo.C", brief: "", description: "C." }],
      properties: [{ name: "p", brief: "", description: "P.", types: ["number"] }],
    });
    const md = apiModuleMarkdown(page);
    const headingOrder = [...md.matchAll(/^### `([^`]+)`/gm)].map((m) => m[1] ?? "");
    expect(apiModuleSymbols(page).map((s) => s.signature)).toEqual(headingOrder);
  });

  test("a blank-but-present parameter type array renders `unknown`, not a dangling colon", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "io.read",
            brief: "",
            description: "Reads.",
            parameters: [{ name: "...", doc: "", types: [""], isOptional: false }],
            returnValues: [],
          },
        ],
      }),
    );
    expect(symbols[0]?.signature).toContain("...: unknown");
    expect(symbols[0]?.signature).not.toContain("...: )");
  });

  test("a blank-but-present parameter type array projects to an empty types array", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "io.read",
            brief: "",
            description: "Reads.",
            parameters: [{ name: "...", doc: "", types: [""], isOptional: false }],
            returnValues: [],
          },
        ],
      }),
    );
    expect(symbols[0]?.parameters[0]?.types).toEqual([]);
  });

  test("a mixed type array drops blank entries in both projection and signature", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "demo.f",
            brief: "",
            description: "F.",
            parameters: [{ name: "x", doc: "", types: ["string", "", "  "], isOptional: false }],
            returnValues: [],
          },
        ],
      }),
    );
    expect(symbols[0]?.parameters[0]?.types).toEqual(["string"]);
    expect(symbols[0]?.signature).toBe("demo.f(x: string)");
  });

  test("a blank-but-present return type array renders `unknown` in the return position", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "demo.g",
            brief: "",
            description: "G.",
            parameters: [],
            returnValues: [{ name: "", doc: "", types: [""], isOptional: false }],
          },
        ],
      }),
    );
    expect(symbols[0]?.signature).toBe("demo.g(): unknown");
  });

  test("a blank-but-present variable type array renders `unknown`", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        variables: [{ name: "demo.V", brief: "", description: "V.", types: [""] }],
      }),
    );
    expect(symbols[0]?.signature).toBe("demo.V: unknown");
  });

  test("maps a globals-shaped `hash(s: string): hash` return token to `Hash`", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "hash",
            brief: "",
            description: "Hashes a string.",
            parameters: [{ name: "s", doc: "", types: ["string"], isOptional: false }],
            returnValues: [{ name: "", doc: "", types: ["hash"], isOptional: false }],
          },
        ],
      }),
    );
    expect(symbols[0]?.signature).toBe("hash(s: string): Hash");
  });

  test("maps a `vmath.vector3(): vector3` return token to `Vector3`", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "vmath.vector3",
            brief: "",
            description: "Creates a vector3.",
            parameters: [],
            returnValues: [{ name: "", doc: "", types: ["vector3"], isOptional: false }],
          },
        ],
      }),
    );
    expect(symbols[0]?.signature).toBe("vmath.vector3(): Vector3");
  });

  test("maps a union param and agrees between signature segment and projected types", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "demo.f",
            brief: "",
            description: "F.",
            parameters: [
              { name: "x", doc: "", types: ["string", "hash", "url"], isOptional: false },
            ],
            returnValues: [],
          },
        ],
      }),
    );
    expect(symbols[0]?.signature).toBe("demo.f(x: string | Hash | Url)");
    expect(symbols[0]?.parameters[0]?.types).toEqual(["string", "Hash", "Url"]);
  });

  test("a single-signature override replaces only the signature, keeping ref-doc doc and params", () => {
    const store: SignatureStore = {
      "io.open": { signatures: ["io.open(filename: string, mode?: string): LuaFile | undefined"] },
    };
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "io.open",
            brief: "",
            description: "Opens a file.",
            parameters: [
              { name: "filename", doc: "the file name", types: ["string"], isOptional: false },
              { name: "mode", doc: "the open mode", types: ["string"], isOptional: true },
            ],
            returnValues: [],
          },
        ],
      }),
      {},
      store,
    );
    expect(symbols).toHaveLength(1);
    expect(symbols[0]?.signature).toBe(
      "io.open(filename: string, mode?: string): LuaFile | undefined",
    );
    expect(symbols[0]?.signature).not.toBe("io.open(filename: string, mode?: string)");
    expect(symbols[0]?.docMarkdown).toBe("Opens a file.");
    expect(symbols[0]?.parameters).toEqual([
      { name: "filename", doc: "the file name", types: ["string"], isOptional: false },
      { name: "mode", doc: "the open mode", types: ["string"], isOptional: true },
    ]);
    expect(symbols[0]?.returnValues).toEqual([]);
  });

  test("an overloaded override expands to one symbol per authored signature in order", () => {
    const signatures = [
      "file:read(): string | undefined",
      'file:read(format: "*n" | "*l" | "*a" | number): string | number | undefined',
      'file:read(...formats: ("*n" | "*l" | "*a" | number)[]): (string | number | undefined)[]',
    ];
    const store: SignatureStore = { "file:read": { signatures } };
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "file:read",
            brief: "",
            description: "Reads the file.",
            parameters: [
              { name: "format", doc: "the read format", types: ["string"], isOptional: true },
            ],
            returnValues: [
              { name: "", doc: "the data read", types: ["string"], isOptional: false },
            ],
            examples:
              '<div class="codehilite"><pre><code><span class="n">file</span><span class="p">:</span><span class="n">read</span><span class="p">()</span></code></pre></div>',
          },
        ],
      }),
      {},
      store,
    );
    expect(symbols).toHaveLength(3);
    expect(symbols.map((s) => s.name)).toEqual(["file:read", "file:read", "file:read"]);
    expect(symbols.map((s) => s.signature)).toEqual(signatures);
    expect(symbols[0]?.docMarkdown).toBe("Reads the file.");
    expect(symbols[0]?.parameters).toEqual([
      { name: "format", doc: "the read format", types: ["string"], isOptional: true },
    ]);
    expect(symbols[0]?.returnValues).toEqual([
      { name: "", doc: "the data read", types: ["string"], isOptional: false },
    ]);
    expect(symbols[0]?.exampleMarkdown).toContain("```lua");
    for (const i of [1, 2]) {
      expect(symbols[i]?.docMarkdown).toBe("Reads the file.");
      expect(symbols[i]?.parameters).toEqual([]);
      expect(symbols[i]?.returnValues).toEqual([]);
      expect(symbols[i]?.exampleMarkdown).toBeUndefined();
    }
  });

  test("a function absent from the store keeps its ref-doc signature; non-functions are untouched", () => {
    const store: SignatureStore = {
      "io.open": { signatures: ["io.open(filename: string, mode?: string): LuaFile | undefined"] },
    };
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "io.close",
            brief: "",
            description: "Closes a file.",
            parameters: [],
            returnValues: [],
          },
        ],
        variables: [
          { name: "io.stdout", brief: "", description: "Standard output.", types: ["number"] },
        ],
      }),
      {},
      store,
    );
    expect(symbols.find((s) => s.name === "io.close")?.signature).toBe("io.close()");
    const variable = symbols.find((s) => s.name === "io.stdout");
    expect(variable?.kind).toBe("variable");
    expect(variable?.signature).toBe("io.stdout: number");
  });

  const VMATH_CLAMP = [
    "vmath.clamp<T extends number | Vector3 | Vector4>(value: T, min: number | T, max: number | T): T",
  ];
  const VMATH_LERP = [
    "vmath.lerp<T extends Vector3 | Vector4>(t: number, v1: T, v2: T): T",
    "vmath.lerp(t: number, q1: Quaternion, q2: Quaternion): Quaternion",
    "vmath.lerp(t: number, n1: number, n2: number): number",
  ];
  const VMATH_SLERP = [
    "vmath.slerp<T extends Vector3 | Vector4>(t: number, v1: T, v2: T): T",
    "vmath.slerp(t: number, q1: Quaternion, q2: Quaternion): Quaternion",
  ];
  const VMATH_MUL_PER_ELEM = ["vmath.mul_per_elem<T extends Vector3 | Vector4>(v1: T, v2: T): T"];
  const VMATH_NORMALIZE = ["vmath.normalize<T extends Vector3 | Vector4 | Quaternion>(v1: T): T"];
  const VMATH_OVERRIDES: SignatureStore = {
    "vmath.clamp": { signatures: VMATH_CLAMP },
    "vmath.lerp": { signatures: VMATH_LERP },
    "vmath.slerp": { signatures: VMATH_SLERP },
    "vmath.mul_per_elem": { signatures: VMATH_MUL_PER_ELEM },
    "vmath.normalize": { signatures: VMATH_NORMALIZE },
  };
  const VMATH_SINGLE: Record<string, string[]> = {
    "vmath.clamp": VMATH_CLAMP,
    "vmath.mul_per_elem": VMATH_MUL_PER_ELEM,
    "vmath.normalize": VMATH_NORMALIZE,
  };

  function vmathPage(): ApiPage {
    const raw = JSON.parse(
      readFileSync(join(REAL_TYPES_DIR, "fixtures", "vmath_doc.json"), "utf8"),
    );
    return pageWith(parseDefoldApiDoc(raw));
  }

  test("collapses a multi-fixture-entry override to one row per authored signature, in order", () => {
    const symbols = apiModuleSymbols(vmathPage(), {}, VMATH_OVERRIDES);

    const lerp = symbols.filter((s) => s.name === "vmath.lerp");
    const slerp = symbols.filter((s) => s.name === "vmath.slerp");
    // The fixture carries 3 `vmath.lerp` and 2 `vmath.slerp` entries; without the
    // dedupe the override would render once per entry (9 and 4 rows).
    expect(lerp).toHaveLength(3);
    expect(slerp).toHaveLength(2);
    expect(lerp.map((s) => s.signature)).toEqual(VMATH_LERP);
    expect(slerp.map((s) => s.signature)).toEqual(VMATH_SLERP);
  });

  test("the primary vmath.lerp row renders the generic override signature", () => {
    const symbols = apiModuleSymbols(vmathPage(), {}, VMATH_OVERRIDES);
    const lerp = symbols.filter((s) => s.name === "vmath.lerp");
    expect(lerp[0]?.signature).toBe(
      "vmath.lerp<T extends Vector3 | Vector4>(t: number, v1: T, v2: T): T",
    );
    expect(lerp[0]?.parameters.length).toBeGreaterThan(0);
    for (const row of lerp.slice(1)) {
      expect(row.parameters).toEqual([]);
      expect(row.returnValues).toEqual([]);
    }
  });

  test("single-signature vmath overrides each render exactly once as their generic form", () => {
    const symbols = apiModuleSymbols(vmathPage(), {}, VMATH_OVERRIDES);
    for (const [fqn, expected] of Object.entries(VMATH_SINGLE)) {
      const rows = symbols.filter((s) => s.name === fqn);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.signature).toBe(expected[0]);
    }
  });

  test("dedupe leaves the single-fixture-entry override path unchanged for distinct FQNs", () => {
    const store: SignatureStore = {
      "demo.a": { signatures: ["demo.a(): number"] },
      "demo.b": { signatures: ["demo.b(): string"] },
    };
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          { name: "demo.a", brief: "", description: "A.", parameters: [], returnValues: [] },
          { name: "demo.b", brief: "", description: "B.", parameters: [], returnValues: [] },
        ],
      }),
      {},
      store,
    );
    expect(symbols.filter((s) => s.name === "demo.a")).toHaveLength(1);
    expect(symbols.filter((s) => s.name === "demo.b")).toHaveLength(1);
    expect(symbols.map((s) => s.signature)).toEqual(["demo.a(): number", "demo.b(): string"]);
  });

  // The vector prose the fixture's first `vmath.lerp` entry renders — the doc
  // every row copies today, and the fallback for any override row without its
  // own `docs[]` entry.
  const fixtureLerpVectorDoc =
    apiModuleSymbols(vmathPage(), {}, {}).find((s) => s.name === "vmath.lerp")?.docMarkdown ?? "";

  test("each override row renders its own docs[] entry, not the shared fixture prose", () => {
    const store: SignatureStore = {
      ...VMATH_OVERRIDES,
      "vmath.lerp": {
        signatures: VMATH_LERP,
        docs: [
          "Linearly interpolate between two vectors.",
          "Linearly interpolate between two quaternions.",
          "Linearly interpolate between two values.",
        ],
      },
    };
    const lerp = apiModuleSymbols(vmathPage(), {}, store).filter((s) => s.name === "vmath.lerp");
    expect(lerp).toHaveLength(3);
    expect(lerp.map((s) => s.docMarkdown)).toEqual([
      "Linearly interpolate between two vectors.",
      "Linearly interpolate between two quaternions.",
      "Linearly interpolate between two values.",
    ]);
    // the scalar row reads its own "between two values" prose, not the vector one
    expect(lerp[2]?.docMarkdown).toContain("values");
    expect(lerp[2]?.docMarkdown).not.toBe(fixtureLerpVectorDoc);
  });

  test("an override without a docs key renders every row with the fixture description", () => {
    const lerp = apiModuleSymbols(vmathPage(), {}, VMATH_OVERRIDES).filter(
      (s) => s.name === "vmath.lerp",
    );
    expect(lerp).toHaveLength(3);
    for (const row of lerp) expect(row.docMarkdown).toBe(fixtureLerpVectorDoc);
  });

  test("a short or null docs entry falls back to the fixture description for that row only", () => {
    const store: SignatureStore = {
      ...VMATH_OVERRIDES,
      // authored primary, explicit null secondary, and a third row absent (array
      // shorter than `signatures`) — both untyped rows fall back to the fixture.
      "vmath.lerp": { signatures: VMATH_LERP, docs: ["Interpolate two vectors.", null] },
    };
    const lerp = apiModuleSymbols(vmathPage(), {}, store).filter((s) => s.name === "vmath.lerp");
    expect(lerp).toHaveLength(3);
    expect(lerp[0]?.docMarkdown).toBe("Interpolate two vectors.");
    expect(lerp[1]?.docMarkdown).toBe(fixtureLerpVectorDoc);
    expect(lerp[2]?.docMarkdown).toBe(fixtureLerpVectorDoc);
  });
});

describe("exampleMarkdownFor", () => {
  const luaExample =
    '<div class="codehilite"><pre><code><span class="n">demo</span><span class="p">.</span><span class="n">run</span><span class="p">()</span></code></pre></div>';
  const fn: ApiFunction = {
    name: "demo.run",
    brief: "",
    description: "",
    parameters: [],
    returnValues: [],
    examples: luaExample,
  };
  const sourceHash = hashExampleSource(htmlToCodeText(luaExample));

  test("a matched FQN and hash render the authored TypeScript as a ```ts fence", () => {
    const md = exampleMarkdownFor(fn, { "demo.run": [{ sourceHash, ts: "demo.run(); // ts" }] });
    expect(md).toContain("```ts");
    expect(md).toContain("demo.run(); // ts");
    expect(md).not.toContain("```lua");
  });

  test("an FQN present with a mismatched hash falls back to the Lua fence", () => {
    const md = exampleMarkdownFor(fn, {
      "demo.run": [{ sourceHash: "deadbeefdeadbeef", ts: "should not appear" }],
    });
    expect(md).toContain("```lua");
    expect(md).not.toContain("```ts");
    expect(md).not.toContain("should not appear");
  });

  test("an absent FQN falls back to the Lua fence", () => {
    const md = exampleMarkdownFor(fn, {});
    expect(md).toContain("```lua");
    expect(md).not.toContain("```ts");
  });

  test("a function with no examples yields undefined", () => {
    const noExamples: ApiFunction = {
      name: "demo.silent",
      brief: "",
      description: "",
      parameters: [],
      returnValues: [],
    };
    expect(exampleMarkdownFor(noExamples, {})).toBeUndefined();
  });
});

describe("loadApiSurface translations and /api rendering", () => {
  const pages = loadApiSurface(REAL_TYPES_DIR);
  const goPage = pages.find((p) => p.namespace === "go");
  const cameraPage = pages.find((p) => p.namespace === "camera");

  test("attaches a non-empty translation store to the loaded surface", () => {
    expect(goPage?.translations).toBeDefined();
    expect(Object.keys(goPage?.translations ?? {}).length).toBeGreaterThan(0);
  });

  test("go.get renders the authored TypeScript, not raw Lua or HTML", () => {
    const fn = goPage?.module.functions.find((f) => f.name === "go.get");
    expect(fn).toBeDefined();
    const md = fn ? exampleMarkdownFor(fn, goPage?.translations) : undefined;
    expect(md).toContain("```ts");
    expect(md).not.toContain("```lua");
    expect(md).not.toContain("<div");
    expect(md).not.toContain("<span");
    expect(md).not.toContain("codehilite");
  });

  test("camera.get_cameras renders the authored TypeScript, not raw Lua or HTML", () => {
    const fn = cameraPage?.module.functions.find((f) => f.name === "camera.get_cameras");
    expect(fn).toBeDefined();
    const md = fn ? exampleMarkdownFor(fn, cameraPage?.translations) : undefined;
    expect(md).toContain("```ts");
    expect(md).not.toContain("```lua");
    expect(md).not.toContain("<span");
  });

  test("apiModuleMarkdown and apiModuleSymbols are identical with an absent vs empty store", () => {
    expect(cameraPage).toBeDefined();
    if (!cameraPage) return;
    expect(apiModuleMarkdown(cameraPage)).toBe(apiModuleMarkdown(cameraPage, {}));
    expect(JSON.stringify(apiModuleSymbols(cameraPage))).toBe(
      JSON.stringify(apiModuleSymbols(cameraPage, {})),
    );
  });

  test("a non-io page is byte-identical with vs without a populated io signature store", () => {
    expect(cameraPage).toBeDefined();
    if (!cameraPage) return;
    const ioStore: SignatureStore = {
      "io.open": { signatures: ["io.open(filename: string, mode?: string): LuaFile | undefined"] },
    };
    expect(JSON.stringify(apiModuleSymbols(cameraPage))).toBe(
      JSON.stringify(apiModuleSymbols(cameraPage, {}, ioStore)),
    );
  });

  test("attaches a signature store carrying io.open and file:read to every loaded page", () => {
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      expect(page.signatures["io.open"]).toBeDefined();
      expect(page.signatures["file:read"]).toBeDefined();
    }
  });

  test("a surface with no signatures dir attaches an empty signature store", () => {
    for (const page of loadApiSurface(FIXTURE_DIR)) {
      expect(page.signatures).toEqual({});
    }
  });
});

describe("groupFunctionSymbols", () => {
  test("puts module functions first, then one receiver group, preserving input order", () => {
    const groups = groupFunctionSymbols([
      fnSymbol("io.read"),
      fnSymbol("io.write"),
      fnSymbol("file:close"),
      fnSymbol("file:read"),
    ]);
    expect(groups).toEqual([
      { label: "Functions", symbols: [fnSymbol("io.read"), fnSymbol("io.write")] },
      { label: "`file` methods", symbols: [fnSymbol("file:close"), fnSymbol("file:read")] },
    ]);
  });

  test("orders receiver groups by first appearance and routes each method to its receiver", () => {
    const groups = groupFunctionSymbols([
      fnSymbol("socket.dns"),
      fnSymbol("client:receive"),
      fnSymbol("master:listen"),
      fnSymbol("client:send"),
    ]);
    expect(groups).toEqual([
      { label: "Functions", symbols: [fnSymbol("socket.dns")] },
      { label: "`client` methods", symbols: [fnSymbol("client:receive"), fnSymbol("client:send")] },
      { label: "`master` methods", symbols: [fnSymbol("master:listen")] },
    ]);
  });

  test("returns a single Functions group when no name carries a colon", () => {
    const groups = groupFunctionSymbols([fnSymbol("go.get"), fnSymbol("go.set")]);
    expect(groups).toEqual([
      { label: "Functions", symbols: [fnSymbol("go.get"), fnSymbol("go.set")] },
    ]);
  });

  test("omits the Functions group when every name is a colon method", () => {
    const groups = groupFunctionSymbols([fnSymbol("file:close"), fnSymbol("file:read")]);
    expect(groups).toEqual([
      { label: "`file` methods", symbols: [fnSymbol("file:close"), fnSymbol("file:read")] },
    ]);
  });

  test("yields an empty array for empty input", () => {
    expect(groupFunctionSymbols([])).toEqual([]);
  });
});

describe("library-category token rendering", () => {
  function libraryPage(module: Partial<ApiPage["module"]>): ApiPage {
    return {
      namespace: "event.event",
      route: "/api/event.event",
      brief: "Event",
      module: {
        namespace: "event.event",
        brief: "Event",
        description: "Event helpers.",
        functions: [],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [],
        ...module,
      },
      translations: {},
      signatures: {},
      category: "library",
    };
  }

  test("renders a library typedef member's `this: any` verbatim, not remapped to unknown", () => {
    const module: Partial<ApiPage["module"]> = {
      typedefs: [
        {
          name: "EventInstance",
          functions: [
            {
              name: "trigger",
              brief: "",
              description: "Triggers the event.",
              parameters: [{ name: "this", doc: "", types: ["any"], isOptional: false }],
              returnValues: [],
            },
          ],
          properties: [],
        },
      ],
    };
    const md = apiModuleMarkdown(libraryPage(module));
    expect(md).toContain("trigger(this: any)");
    expect(md).not.toContain("this: unknown");
    const sig = apiModuleSymbols(libraryPage(module)).find(
      (s) => s.name === "EventInstance.trigger",
    )?.signature;
    expect(sig).toBe("EventInstance.trigger(this: any)");
  });

  test("renders DEFOLD_TYPE_MAP-key tokens that are valid TS verbatim for a library module", () => {
    const sig = apiModuleSymbols(
      libraryPage({
        functions: [
          {
            name: "event.on",
            brief: "",
            description: "Subscribes.",
            parameters: [
              { name: "callback", doc: "", types: ["function"], isOptional: false },
              { name: "context", doc: "", types: ["any"], isOptional: false },
            ],
            returnValues: [{ name: "", doc: "", types: ["table"], isOptional: false }],
          },
        ],
      }),
    )[0]?.signature;
    expect(sig).toBe("event.on(callback: function, context: any): table");
  });

  test("still maps ref-doc tokens through DEFOLD_TYPE_MAP for an engine module", () => {
    const enginePage: ApiPage = {
      namespace: "demo",
      route: "/api/demo",
      brief: "Demo",
      module: {
        namespace: "demo",
        brief: "Demo",
        description: "Demo module.",
        functions: [
          {
            name: "demo.move",
            brief: "",
            description: "Moves.",
            parameters: [
              { name: "pos", doc: "", types: ["vector3"], isOptional: false },
              { name: "ctx", doc: "", types: ["any"], isOptional: false },
            ],
            returnValues: [],
          },
        ],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [],
      },
      translations: {},
      signatures: {},
      category: "engine",
    };
    expect(apiModuleSymbols(enginePage)[0]?.signature).toBe(
      "demo.move(pos: Vector3, ctx: unknown)",
    );
  });
});

describe("mapDocType", () => {
  test("maps Defold engine tokens to their emitted TypeScript names", () => {
    expect(mapDocType("hash")).toBe("Hash");
    expect(mapDocType("vector3")).toBe("Vector3");
    expect(mapDocType("vector4")).toBe("Vector4");
    expect(mapDocType("quaternion")).toBe("Quaternion");
    expect(mapDocType("matrix4")).toBe("Matrix4");
    expect(mapDocType("url")).toBe("Url");
    expect(mapDocType("vector")).toBe("Vector");
    expect(mapDocType("any")).toBe("unknown");
  });

  test("leaves primitives unchanged and returns an unmapped token verbatim", () => {
    expect(mapDocType("string")).toBe("string");
    expect(mapDocType("number")).toBe("number");
    expect(mapDocType("boolean")).toBe("boolean");
    expect(mapDocType("playback")).toBe("playback");
  });
});

describe("functionOverviewCards", () => {
  async function renderedHeadingId(signature: string): Promise<string> {
    const html = await renderMarkdown(`### \`${signature}\``);
    const heading = pageHeadings(html)[0];
    if (!heading) throw new Error(`no heading rendered for ${signature}`);
    return heading.id;
  }

  test("emits one overview container and one linked bullet per symbol", () => {
    const list = functionOverviewCards([
      fnSymbol("go.get_position", {
        signature: "go.get_position(): vector3",
        docMarkdown: "Gets the world position. More prose.",
      }),
      fnSymbol("go.set_position", {
        signature: "go.set_position(position: vector3): void",
        docMarkdown: "Sets the world position.",
      }),
    ]);
    expect(list).toBe(
      [
        '<div class="api-overview" aria-label="Function overview">',
        "",
        "- [`go.get_position(): vector3`](#goget_position-vector3)",
        "- [`go.set_position(position: vector3): void`](#goset_positionposition-vector3-void)",
        "",
        "</div>",
      ].join("\n"),
    );
  });

  test("anchors match the id the slugify-headings rule actually assigns", async () => {
    const signatures = [
      "go.set_position(position: vector3): void",
      "file:read(): string",
      "mul(rhs: Matrix4): Matrix4",
      "mul(rhs: Vector4): Vector4",
    ];
    const cards = functionOverviewCards(
      signatures.map((signature) => fnSymbol(signature, { signature })),
    );
    for (const signature of signatures) {
      const id = await renderedHeadingId(signature);
      expect(cards).toContain(`](#${id})`);
    }
  });

  test("keeps descriptions out of the overview and returns empty string for no symbols", async () => {
    const list = functionOverviewCards([
      fnSymbol("demo.escape", {
        signature: 'demo.escape(value: "Hash | <Url> & string")',
        docMarkdown: 'Uses `a | b` and <unsafe> "quotes" & ampersands. Second sentence.',
      }),
    ]);
    expect(list).toContain(
      '[`demo.escape(value: "Hash | <Url> & string")`](#demoescapevalue-hash--url--string)',
    );
    expect(list).not.toContain("Uses `a | b`");
    expect(list).not.toContain("title=");
    expect(list).not.toContain("\\|");
    expect(functionOverviewCards([])).toBe("");

    const html = await renderMarkdown(list, { highlightSignatureHeadings: true });
    expect(html).toContain('<code class="api-signature');
    expect(html).toContain("--shiki-light:");
  });
});
