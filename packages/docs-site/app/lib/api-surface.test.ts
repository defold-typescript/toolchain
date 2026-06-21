import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { type ApiFunction, hashExampleSource, htmlToCodeText } from "@defold-typescript/types";
import {
  type ApiPage,
  type ApiSymbol,
  apiModuleMarkdown,
  apiModuleSymbols,
  exampleMarkdownFor,
  functionSummaryTable,
  groupFunctionSymbols,
  mapDocType,
} from "./api-surface";
import {
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
      category: "engine",
    };
    const md = apiModuleMarkdown(page);
    expect(md).toContain("```lua");
    expect(md).toContain("demo.run()");
    expect(md).not.toContain("codehilite");
    expect(md).not.toContain("<div");
    expect(md).not.toContain("<span");
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

describe("functionSummaryTable", () => {
  async function renderedHeadingId(signature: string): Promise<string> {
    const html = await renderMarkdown(`### \`${signature}\``);
    const heading = pageHeadings(html)[0];
    if (!heading) throw new Error(`no heading rendered for ${signature}`);
    return heading.id;
  }

  test("emits a GitHub table with a header row and one anchor-linked row per symbol", () => {
    const table = functionSummaryTable([
      fnSymbol("go.get_position", { signature: "go.get_position(): vector3" }),
      fnSymbol("go.set_position", { signature: "go.set_position(position: vector3): void" }),
    ]);
    expect(table).toBe(
      [
        "| Function | Summary |",
        "| --- | --- |",
        "| [`go.get_position(): vector3`](#goget_position-vector3) |  |",
        "| [`go.set_position(position: vector3): void`](#goset_positionposition-vector3-void) |  |",
      ].join("\n"),
    );
  });

  test("summary cell is the first sentence of docMarkdown, newline-collapsed and pipe-escaped", () => {
    const table = functionSummaryTable([
      fnSymbol("go.get_position", {
        signature: "go.get_position(): vector3",
        docMarkdown: "Gets the world position.\nReturns a | vector3. More prose here.",
      }),
    ]);
    expect(table).toBe(
      [
        "| Function | Summary |",
        "| --- | --- |",
        "| [`go.get_position(): vector3`](#goget_position-vector3) | Gets the world position. Returns a \\| vector3. |",
      ].join("\n"),
    );
  });

  test("empty docMarkdown yields an empty summary cell", () => {
    const table = functionSummaryTable([
      fnSymbol("go.get_position", { signature: "go.get_position(): vector3", docMarkdown: "" }),
    ]);
    expect(table).toBe(
      [
        "| Function | Summary |",
        "| --- | --- |",
        "| [`go.get_position(): vector3`](#goget_position-vector3) |  |",
      ].join("\n"),
    );
  });

  test("anchors match the id the slugify-headings rule actually assigns", async () => {
    const signature = "go.set_position(position: vector3): void";
    const table = functionSummaryTable([fnSymbol("go.set_position", { signature })]);
    const id = await renderedHeadingId(signature);
    expect(table).toContain(`(#${id})`);
  });

  test("an empty symbol list yields an empty string", () => {
    expect(functionSummaryTable([])).toBe("");
  });

  test("colon-named receiver methods produce a valid row whose anchor matches the heading id", async () => {
    const signature = "file:read(): string";
    const table = functionSummaryTable([fnSymbol("file:read", { signature })]);
    const id = await renderedHeadingId(signature);
    expect(table).toContain(`[\`file:read(): string\`](#${id})`);
    expect(table).toContain("(#fileread-string)");
  });

  test("overloaded functions render distinct rows keyed by their full signatures", () => {
    const table = functionSummaryTable([
      fnSymbol("mul", {
        signature: "mul(rhs: Matrix4): Matrix4",
        docMarkdown: "Lua `*` operator.",
      }),
      fnSymbol("mul", {
        signature: "mul(rhs: Vector4): Vector4",
        docMarkdown: "Lua `*` operator.",
      }),
    ]);
    expect(table).toBe(
      [
        "| Function | Summary |",
        "| --- | --- |",
        "| [`mul(rhs: Matrix4): Matrix4`](#mulrhs-matrix4-matrix4) | Lua `*` operator. |",
        "| [`mul(rhs: Vector4): Vector4`](#mulrhs-vector4-vector4) | Lua `*` operator. |",
      ].join("\n"),
    );
  });

  test("escapes union-type pipes in the signature so the table cell stays intact", () => {
    const table = functionSummaryTable([
      fnSymbol("buffer.get_stream", {
        signature: "buffer.get_stream(name: Hash | string): Opaque",
      }),
    ]);
    expect(table).toContain(
      "| [`buffer.get_stream(name: Hash \\| string): Opaque`](#bufferget_streamname-hash--string-opaque) |  |",
    );
  });
});
