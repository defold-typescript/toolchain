import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ApiPage,
  type ApiSymbol,
  type AvailabilityLookup,
  apiModuleMarkdown,
  apiModuleSections,
  apiModuleSymbols,
  badgeCategory,
  defoldTypeRef,
  exampleMarkdownFor,
  functionAnchorText,
  functionBadgeCategory,
  functionOverviewCards,
  groupFunctionRevisions,
  groupFunctionSymbols,
  groupOverloadForms,
  groupTypeSymbols,
  mapDocType,
  outerCallArity,
  outerCallParams,
  outerCallSlots,
  overloadFormCodes,
  overloadHeading,
  splitCallForm,
  windowedBadgeCategory,
} from "@defold-typescript/docs-render/api-surface";
import {
  combinedApiPages,
  combinedNamespaceToApiPage,
  compareSemverDesc,
} from "@defold-typescript/docs-render/combined-surface";
import { pageHeadings, slugify } from "@defold-typescript/docs-render/headings";
import { renderMarkdown } from "@defold-typescript/docs-render/markdown";
import {
  canonicalApiPages,
  windowedApiPages,
} from "@defold-typescript/docs-render/toolchain-surface";
import {
  listApiVersions,
  loadApiSurface,
  loadApiSurfaceForVersion,
  loadCombinedSurface,
  versionsWithDiskFixtures,
} from "@defold-typescript/docs-render/toolchain-surface-loader";
import {
  type ApiAvailability,
  type ApiFunction,
  hashExampleSource,
  htmlToCodeText,
  lookupExampleTranslations,
  normalizedFunctionSignature,
  parseDefoldApiDoc,
  type SignatureStore,
  signatureTransitionNames,
  splitExampleSources,
  symbolIdentityKey,
  type TranslationStore,
} from "@defold-typescript/types";
import { extractApiDoc } from "../../../cli/src/library/extract-api-doc";
import { loadAnnotations } from "../../../types/scripts/lua-annotations";
import { loadApiTargets } from "../../../types/scripts/regen";
import { memberAnchorPage } from "./__fixtures__/member-anchor-page";
import { versionLabel } from "./version-switch";

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

const FIXTURE_DIR = join(import.meta.dir, "../../../docs-render/src/__fixtures__/api-surface");
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
    // The default target now owns an explicit version-prefixed engine family; the
    // canonical unprefixed surface is the Combined projection, not this loader.
    expect(pages[0]?.route).toBe("/api/cur/globals");
    expect(pages[0]?.module.functions.map((f) => f.name)).toContain("hash");
  });

  test("omits the globals page when no globals_doc.json exists in the fixtures dir", () => {
    const pages = loadApiSurface(NO_GLOBALS_FIXTURE_DIR);
    expect(pages.map((p) => p.namespace)).toEqual(["camera"]);
  });

  test("derives the route and carries the brief plus the parsed module", () => {
    const camera = loadApiSurface(FIXTURE_DIR).find((p) => p.namespace === "camera");
    expect(camera?.route).toBe("/api/cur/camera");
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
  test("loading the default target by id yields exactly the engine pages of loadApiSurface", () => {
    expect(loadApiSurfaceForVersion(FIXTURE_DIR, "cur")).toEqual(
      loadApiSurface(FIXTURE_DIR).filter((p) => p.category === "engine"),
    );
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

  test("a page renders `# <namespace>` unchanged", () => {
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

  test("cuts the Types block into one section per type symbol, in symbol order", () => {
    const typeSections = apiModuleSections(memberAnchorPage)
      .sections.filter((s) => s.kind === "type")
      .map(({ kind, name }) => [kind, name]);
    const typeSymbols = apiModuleSymbols(memberAnchorPage)
      .filter((s) => s.kind === "type")
      .map(({ kind, name }) => [kind, name]);
    expect(typeSections.length).toBeGreaterThan(0);
    expect(typeSections).toEqual(typeSymbols);
    const md = apiModuleMarkdown(memberAnchorPage);
    expect(md).toContain("## Types");
    expect(md).toContain("### Mode");
    expect(md).toContain("`type Mode = typeof demo.LIMIT`");
    expect(md).toContain("### Options");
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

  const slotFn = {
    name: "demo.run",
    brief: "run it",
    description: "Runs the demo.",
    parameters: [{ name: "opts", doc: "", types: ["table"], isOptional: false }],
    returnValues: [{ name: "id", doc: "", types: ["hash"], isOptional: false }],
  };
  const slotIdentity = symbolIdentityKey({
    namespace: "demo",
    kind: "FUNCTION",
    name: "demo.run",
    signature: normalizedFunctionSignature(slotFn),
  });
  const slotSignature = "demo.run(opts: { mode: string }): Hash";

  test("a slot the artifact covers renders the emitted type, not the token render", () => {
    const page = pageWith({ functions: [slotFn] });
    const symbol = apiModuleSymbols({
      ...page,
      authoritativeSignatures: new Map([[slotIdentity, slotSignature]]),
      authoritativeSlotTypes: new Map([
        [
          slotIdentity,
          {
            "param:0:opts": { type: "{ mode: string }", optional: false },
            "return:0:id": { type: "Hash", optional: false },
          },
        ],
      ]),
    })[0];
    expect(symbol?.signature).toBe(slotSignature);
    expect(symbol?.parameters[0]?.types).toEqual(["{ mode: string }"]);
    expect(symbol?.returnValues[0]?.types).toEqual(["Hash"]);
  });

  test("a slot the artifact covers takes its optionality from the record, not the fixture", () => {
    const optionalFn = {
      ...slotFn,
      parameters: [{ name: "opts", doc: "", types: ["table"], isOptional: true }],
    };
    const identity = symbolIdentityKey({
      namespace: "demo",
      kind: "FUNCTION",
      name: "demo.run",
      signature: normalizedFunctionSignature(optionalFn),
    });
    const symbol = apiModuleSymbols({
      ...pageWith({ functions: [optionalFn] }),
      authoritativeSignatures: new Map([[identity, slotSignature]]),
      authoritativeSlotTypes: new Map([
        [identity, { "param:0:opts": { type: "{ mode: string }", optional: false } }],
      ]),
    })[0];
    expect(symbol?.parameters[0]?.isOptional).toBe(false);
  });

  test("a slot the artifact does not cover keeps the token render", () => {
    const page = pageWith({ functions: [slotFn] });
    const symbol = apiModuleSymbols({
      ...page,
      authoritativeSignatures: new Map([[slotIdentity, slotSignature]]),
      authoritativeSlotTypes: new Map([
        [slotIdentity, { "return:0:id": { type: "Hash", optional: false } }],
      ]),
    })[0];
    // `opts` has no artifact entry, so it must still render something.
    expect(symbol?.parameters[0]?.types).toEqual([mapDocType("table")]);
    expect(symbol?.returnValues[0]?.types).toEqual(["Hash"]);
  });

  test("a page carrying no slot map renders every slot from the token map", () => {
    const symbol = apiModuleSymbols(pageWith({ functions: [slotFn] }))[0];
    expect(symbol?.parameters[0]?.types).toEqual([mapDocType("table")]);
    expect(symbol?.returnValues[0]?.types).toEqual([mapDocType("hash")]);
  });

  test("the row's declarationIdentity is the key its own slot lookup resolved through", () => {
    const page = pageWith({ functions: [slotFn] });
    const symbol = apiModuleSymbols({
      ...page,
      authoritativeSignatures: new Map([[slotIdentity, slotSignature]]),
      authoritativeSlotTypes: new Map([
        [
          slotIdentity,
          {
            "param:0:opts": { type: "{ mode: string }", optional: false },
            "return:0:id": { type: "Hash", optional: false },
          },
        ],
      ]),
      availability: {
        versions: ["1.10.0"],
        records: new Map<string, ApiAvailability>([
          [
            slotIdentity,
            {
              identity: { namespace: "demo", kind: "FUNCTION", name: "demo.run", signature: "" },
              availableIn: ["1.10.0"],
            },
          ],
        ]),
        transitions: new Set<string>(),
      },
    })[0];
    // The slot render and the badge both landed, so `slotIdentity` is demonstrably
    // the key production keyed those lookups on — and the row must report it.
    expect(symbol?.parameters[0]?.types).toEqual(["{ mode: string }"]);
    expect(symbol?.availability?.availableIn).toEqual(["1.10.0"]);
    expect(symbol?.declarationIdentity).toBe(slotIdentity);
  });

  test("two ref-doc entries under one name render rows with distinct declarationIdentity", () => {
    const overloads: ApiFunction[] = [
      {
        name: "demo.each",
        brief: "",
        description: "",
        parameters: [{ name: "list", doc: "", types: ["table"], isOptional: false }],
        returnValues: [],
      },
      {
        name: "demo.each",
        brief: "",
        description: "",
        parameters: [
          { name: "list", doc: "", types: ["table"], isOptional: false },
          { name: "fn", doc: "", types: ["function"], isOptional: false },
        ],
        returnValues: [],
      },
    ];
    const symbols = apiModuleSymbols(pageWith({ functions: overloads }));
    expect(symbols).toHaveLength(2);
    const identities = symbols.map((s) => s.declarationIdentity);
    expect(identities.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(identities).size).toBe(2);
    expect(identities).toEqual(
      overloads.map((fn) =>
        symbolIdentityKey({
          namespace: "demo",
          kind: "FUNCTION",
          name: fn.name,
          signature: normalizedFunctionSignature(fn),
        }),
      ),
    );
  });

  test("an authored override collapses onto one identified row; its arm rows carry none", () => {
    const store: SignatureStore = {
      "demo.play": { signatures: ["demo.play(a: number): void", "demo.play(a: string): void"] },
    };
    const fn: ApiFunction = {
      name: "demo.play",
      brief: "",
      description: "",
      parameters: [{ name: "a", doc: "", types: ["number"], isOptional: false }],
      returnValues: [],
    };
    const armSignatures = store["demo.play"]?.signatures ?? [];
    const symbols = apiModuleSymbols(pageWith({ functions: [fn] }), {}, store);
    expect(symbols.map((s) => s.signature)).toEqual([...armSignatures]);
    expect(symbols[0]?.declarationIdentity).toBe(
      symbolIdentityKey({
        namespace: "demo",
        kind: "FUNCTION",
        name: "demo.play",
        signature: normalizedFunctionSignature(fn),
      }),
    );
    expect(symbols[1]?.declarationIdentity).toBeUndefined();
  });

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

  test("a function carrying generics prints `name<...>(...)`; absent generics is unchanged", () => {
    const genericPage: ApiPage = {
      ...pageWith({}),
      module: {
        namespace: "druid",
        brief: "",
        description: "",
        functions: [
          {
            name: "get_widget",
            brief: "",
            description: "",
            generics: "<T extends druid_widget>",
            parameters: [{ name: "widget_class", doc: "", types: ["T"], isOptional: false }],
            returnValues: [{ name: "", doc: "", types: ["T"], isOptional: false }],
          },
          {
            name: "new",
            brief: "",
            description: "",
            parameters: [{ name: "context", doc: "", types: ["LuaTable"], isOptional: false }],
            returnValues: [{ name: "", doc: "", types: ["druid_instance"], isOptional: false }],
          },
        ],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [],
      },
    };
    const symbols = apiModuleSymbols(genericPage);
    expect(symbols.map((s) => s.signature)).toEqual([
      "get_widget<T extends druid_widget>(widget_class: T): T",
      "new(context: LuaTable): druid_instance",
    ]);
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

  test("projects a deprecated tag onto function, variable, and typedef-member symbols", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "demo.stale",
            brief: "",
            description: "",
            deprecated: "Use `demo.fresh` instead.",
            parameters: [],
            returnValues: [],
          },
          { name: "demo.fresh", brief: "", description: "", parameters: [], returnValues: [] },
        ],
        variables: [
          { name: "demo.OLD", brief: "", description: "", types: ["number"], deprecated: "" },
          { name: "demo.NEW", brief: "", description: "", types: ["number"] },
        ],
        typedefs: [
          {
            name: "Handle",
            functions: [
              {
                name: "close",
                brief: "",
                description: "",
                deprecated: "Handles close themselves.",
                parameters: [],
                returnValues: [],
              },
            ],
            properties: [
              {
                name: "tag",
                brief: "",
                description: "",
                types: ["string"],
                deprecated: "Read `id`.",
              },
            ],
          },
        ],
      }),
    );
    const by = (name: string) => symbols.find((s) => s.name === name);

    expect(by("demo.stale")?.deprecated).toBe("Use `demo.fresh` instead.");
    expect(by("demo.fresh")?.deprecated).toBeUndefined();
    // A bare tag survives projection as `""` rather than collapsing to absent.
    expect(by("demo.OLD")?.deprecated).toBe("");
    expect(by("demo.NEW")?.deprecated).toBeUndefined();
    expect(by("Handle.close")?.deprecated).toBe("Handles close themselves.");
    expect(by("Handle.tag")?.deprecated).toBe("Read `id`.");
  });

  test("a deprecated authored-override function tags every emitted row, not just the primary", () => {
    const store: SignatureStore = {
      "demo.stale": {
        signatures: ["demo.stale(a: number): void", "demo.stale(a: string): void"],
      },
      "demo.fresh": {
        signatures: ["demo.fresh(a: number): void", "demo.fresh(a: string): void"],
      },
    };
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "demo.stale",
            brief: "",
            description: "",
            deprecated: "Use `demo.fresh`.",
            parameters: [],
            returnValues: [],
          },
          { name: "demo.fresh", brief: "", description: "", parameters: [], returnValues: [] },
        ],
      }),
      {},
      store,
    );

    // Assert across the whole row list: the rows share a name, so a lookup by
    // name would silently only ever check the primary.
    const staleRows = symbols.filter((s) => s.name === "demo.stale");
    expect(staleRows).toHaveLength(2);
    expect(staleRows.map((s) => s.deprecated)).toEqual(["Use `demo.fresh`.", "Use `demo.fresh`."]);

    const freshRows = symbols.filter((s) => s.name === "demo.fresh");
    expect(freshRows).toHaveLength(2);
    for (const row of freshRows) {
      expect(row.deprecated).toBeUndefined();
      expect(Object.keys(row)).not.toContain("deprecated");
    }
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
        "demo.LoggerInstance.info(message: string)",
        "Writes an info message.",
      ],
      ["type", "LoggerInstance.level", "demo.LoggerInstance.level: number", "Current log level."],
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
    // the zero-argument row cannot take the entry's `format` table, so it moves
    // to the one-argument row that accepts it; the example stays on row 1
    expect(symbols[0]?.parameters).toEqual([]);
    expect(symbols[0]?.returnValues).toEqual([]);
    expect(symbols[0]?.exampleMarkdown).toContain("```lua");
    // the fixture marks `format` optional, but the row's own signature requires it
    expect(symbols[1]?.parameters).toEqual([
      { name: "format", doc: "the read format", types: ["string"], isOptional: false },
    ]);
    expect(symbols[1]?.returnValues).toEqual([
      { name: "", doc: "the data read", types: ["string"], isOptional: false },
    ]);
    for (const i of [1, 2]) {
      expect(symbols[i]?.docMarkdown).toBe("Reads the file.");
      expect(symbols[i]?.exampleMarkdown).toBeUndefined();
    }
    expect(symbols[2]?.parameters).toEqual([]);
    expect(symbols[2]?.returnValues).toEqual([]);
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
  });

  test("arity-identical override rows pair with the ref-doc entry their parameter names select", () => {
    const symbols = apiModuleSymbols(vmathPage(), {}, VMATH_OVERRIDES);
    const tables = (name: string) =>
      symbols
        .filter((s) => s.name === name)
        .map((s) => ({
          parameters: s.parameters.map((p) => p.name),
          returns: s.returnValues.map((r) => r.name),
        }));
    expect(tables("vmath.lerp")).toEqual([
      { parameters: ["t", "v1", "v2"], returns: ["v"] },
      { parameters: ["t", "q1", "q2"], returns: ["q"] },
      { parameters: ["t", "n1", "n2"], returns: ["n"] },
    ]);
    expect(tables("vmath.slerp")).toEqual([
      { parameters: ["t", "v1", "v2"], returns: ["v"] },
      { parameters: ["t", "q1", "q2"], returns: ["q"] },
    ]);
    const examples = symbols.filter((s) => s.name === "vmath.lerp").map((s) => s.exampleMarkdown);
    expect(examples.every((e) => e !== undefined)).toBe(true);
    expect(new Set(examples).size).toBe(3);
    expect(examples[1]).toContain("vmath.quat");
  });

  test("outerCallParams names the outer call's parameters", () => {
    expect(
      outerCallParams("vmath.lerp<T extends Vector3 | Vector4>(t: number, v1: T, v2: T): T"),
    ).toEqual(["t", "v1", "v2"]);
    expect(outerCallParams("msg.url(): Url")).toEqual([]);
    expect(
      outerCallParams("demo.f(a?: { x: number; y: number }, ...rest: string[]): void"),
    ).toEqual(["a", "rest"]);
    expect(outerCallParams("demo.v: (a: number) => void")).toBeNull();
  });

  test("outerCallSlots reads each slot's optionality and type text", () => {
    expect(outerCallSlots("demo.f(a?: { x: number; y: number }, ...rest: string[]): void")).toEqual(
      [
        { name: "a", isOptional: true, type: "{ x: number; y: number }" },
        { name: "rest", isOptional: false, type: "string[]" },
      ],
    );
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

  test("an override without a docs key renders each row with its paired entry's description", () => {
    const lerp = apiModuleSymbols(vmathPage(), {}, VMATH_OVERRIDES).filter(
      (s) => s.name === "vmath.lerp",
    );
    expect(lerp).toHaveLength(3);
    expect(lerp[0]?.docMarkdown).toBe(fixtureLerpVectorDoc);
    expect(lerp[1]?.docMarkdown).toStartWith("Linearly interpolate between two quaternions.");
    expect(lerp[2]?.docMarkdown).toStartWith("Linearly interpolate between two values.");
  });

  test("a short or null docs entry falls back to the fixture description for that row only", () => {
    const store: SignatureStore = {
      ...VMATH_OVERRIDES,
      // authored primary, explicit null secondary, and a third row absent (array
      // shorter than `signatures`) — both untyped rows fall back to their paired
      // fixture entry's description.
      "vmath.lerp": { signatures: VMATH_LERP, docs: ["Interpolate two vectors.", null] },
    };
    const lerp = apiModuleSymbols(vmathPage(), {}, store).filter((s) => s.name === "vmath.lerp");
    expect(lerp).toHaveLength(3);
    expect(lerp[0]?.docMarkdown).toBe("Interpolate two vectors.");
    expect(lerp[1]?.docMarkdown).toStartWith("Linearly interpolate between two quaternions.");
    expect(lerp[2]?.docMarkdown).toStartWith("Linearly interpolate between two values.");
  });

  // The committed override files, read the way `loadSignatureStore` reads them,
  // so these assertions run against the bytes `/api/go` and `/api/msg` render.
  function committedStore(file: string): SignatureStore {
    return JSON.parse(
      readFileSync(join(REAL_TYPES_DIR, "signatures", `${file}.json`), "utf8"),
    ) as SignatureStore;
  }

  function fixturePage(fixture: string): ApiPage {
    const raw = JSON.parse(
      readFileSync(join(REAL_TYPES_DIR, "fixtures", `${fixture}_doc.json`), "utf8"),
    );
    return pageWith(parseDefoldApiDoc(raw));
  }

  test("msg.url collapses its 3 fixture entries to the 6 authored override rows", () => {
    const store = committedStore("msg");
    const rows = apiModuleSymbols(fixturePage("msg"), {}, store).filter(
      (s) => s.name === "msg.url",
    );
    // 3 fixture entries x 6 authored signatures would render 18 rows without the
    // collapse; the authored set is a different length than the fixture's, so
    // neither count can stand in for the other.
    expect(rows).toHaveLength(6);
    expect(rows.map((s) => s.signature)).toEqual(store["msg.url"]?.signatures ?? []);
  });

  test("go.get renders 5 rows and its undocumented overloads fall back to the fixture prose", () => {
    const store = committedStore("go");
    const page = fixturePage("go");
    const fixtureGetDoc =
      apiModuleSymbols(page, {}, {}).find((s) => s.name === "go.get")?.docMarkdown ?? "";
    const rows = apiModuleSymbols(page, {}, store).filter((s) => s.name === "go.get");

    expect(rows).toHaveLength(5);
    expect(rows.map((s) => s.signature)).toEqual(store["go.get"]?.signatures ?? []);
    expect(rows[0]?.signature).toContain("<K extends keyof P>");
    for (const row of rows.slice(1)) expect(row.docMarkdown).toBe(fixtureGetDoc);
  });

  test("go.set and go.property rows carry exactly the committed store signatures", () => {
    const store = committedStore("go");
    const symbols = apiModuleSymbols(fixturePage("go"), {}, store);
    expect(symbols.filter((s) => s.name === "go.set").map((s) => s.signature)).toEqual(
      store["go.set"]?.signatures ?? [],
    );
    // Against the store rather than a count, so a wrong signature reds too. The
    // non-empty guard keeps the comparison from passing vacuously on both sides
    // if the store ever loses the key.
    const propertySignatures = store["go.property"]?.signatures ?? [];
    expect(propertySignatures.length).toBeGreaterThan(1);
    expect(symbols.filter((s) => s.name === "go.property").map((s) => s.signature)).toEqual(
      propertySignatures,
    );
  });

  function canonicalGoPage(): ApiPage {
    const page = canonicalApiPages(REAL_TYPES_DIR).find((p) => p.module.namespace === "go");
    if (!page) throw new Error("no canonical go page");
    return page;
  }

  test("go.property's undocumented rows inherit the first row's authored prose", () => {
    const page = canonicalGoPage();
    const refDoc =
      apiModuleSymbols(page, page.translations, {}).find((s) => s.name === "go.property")
        ?.docMarkdown ?? "";
    const rows = apiModuleSymbols(page, page.translations, page.signatures).filter(
      (s) => s.name === "go.property",
    );

    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0]?.docMarkdown).not.toBe(refDoc);
    for (const row of rows) expect(row.docMarkdown).toBe(rows[0]?.docMarkdown ?? "");
  });

  function availabilityRecordsFor(page: ApiPage, name: string): ApiAvailability[] {
    return [...(page.availability?.records.values() ?? [])].filter(
      (record) => record.identity.name === name,
    );
  }

  // The span a reader sees for a row: its own versions, else the page's whole axis.
  function presentIn(page: ApiPage, symbol: ApiSymbol | undefined): Set<string> {
    const own = symbol?.availability?.availableIn ?? [];
    return new Set(own.length > 0 ? own : (page.availability?.versions ?? []));
  }

  function identitySlotTypes(record: ApiAvailability, slot: number): readonly string[] {
    const signature = record.identity.signature ?? "";
    const params = JSON.parse(signature.slice(0, signature.indexOf("]->[") + 1)) as {
      types: string[];
    }[];
    return params[slot]?.types ?? [];
  }

  test("go.property's rows span every version its ref-doc signatures cover", () => {
    const page = canonicalGoPage();
    const records = availabilityRecordsFor(page, "go.property");
    // Two records: the ref-doc re-typed `value` in a later release, admitting a
    // `string` value only from then on, so the authored string form is newer
    // than the others while every other form spans both records.
    expect(records.length).toBeGreaterThan(1);
    const covered = new Set(records.flatMap((record) => record.availableIn));

    const rows = apiModuleSymbols(page, page.translations, page.signatures).filter(
      (s) => s.name === "go.property",
    );
    const others = rows.filter(
      (s) => !s.signature.endsWith("value: string): ScriptProperty<string>"),
    );
    expect(others.length).toBe(rows.length - 1);
    expect(new Set(others[0]?.availability?.availableIn)).toEqual(covered);
    for (const row of others) expect(presentIn(page, row)).toEqual(covered);
  });

  test("go.property's string form spans only the ref-doc signature that admits a string value", () => {
    const page = canonicalGoPage();
    const admitting = availabilityRecordsFor(page, "go.property").filter((record) =>
      identitySlotTypes(record, 1).includes("string"),
    );
    expect(admitting).toHaveLength(1);

    const stringRow = apiModuleSymbols(page, page.translations, page.signatures).find(
      (s) =>
        s.name === "go.property" && s.signature.endsWith("value: string): ScriptProperty<string>"),
    );
    expect(stringRow?.availability?.availableIn).toEqual(admitting[0]?.availableIn);
  });

  test("an override group whose forms no ref-doc signature singles out keeps one shared span", () => {
    const pages = canonicalApiPages(REAL_TYPES_DIR);
    for (const [namespace, name] of [
      ["go", "go.get"],
      ["go", "go.set"],
      ["msg", "msg.url"],
    ] as const) {
      const page = pages.find((p) => p.module.namespace === namespace);
      if (!page) throw new Error(`no canonical ${namespace} page`);
      const rows = apiModuleSymbols(page, page.translations, page.signatures).filter(
        (s) => s.name === name,
      );
      expect(rows.length).toBeGreaterThan(1);
      const records = availabilityRecordsFor(page, name);
      const union = records.flatMap((record) => record.availableIn);
      expect(new Set(rows[0]?.availability?.availableIn ?? [])).toEqual(new Set(union));
      for (const row of rows.slice(1)) expect(row.availability).toBeUndefined();
      const head = presentIn(page, rows[0]);
      for (const row of rows) expect(presentIn(page, row)).toEqual(head);
    }
  });

  test("msg.post's primary row keeps the authored bullet list through the projection", () => {
    const store = committedStore("msg");
    const rows = apiModuleSymbols(fixturePage("msg"), {}, store).filter(
      (s) => s.name === "msg.post",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.docMarkdown).toContain('- `"."` the current game object');
    expect(rows[0]?.docMarkdown).toContain('- `"#"` the current component');
    expect(rows[0]?.docMarkdown).toContain("\n\n");
  });

  test("msg.url's rows report the arity of their own call list", () => {
    expect(outerCallArity("msg.url(): Url")).toBe(0);
    expect(
      outerCallArity(
        "msg.url(socket: string | Hash | undefined, path: string | Hash, fragment: string | Hash): Url",
      ),
    ).toBe(3);
  });

  test("a leading generic list and a nested one never split the call list", () => {
    expect(
      outerCallArity(
        "msg.post<K extends string>(receiver: string | Url | Hash, message_id: K, message?: MsgPostPayload<K>): void",
      ),
    ).toBe(3);
  });

  test("a curried form reports its outer arity, not the function it returns", () => {
    expect(
      outerCallArity(
        "go.get<P>(): <K extends keyof P>(url: string | Hash | Url, property: K, options?: GoPropertyOptions) => P[K]",
      ),
    ).toBe(0);
  });

  test("a rest parameter counts once and a Lua method colon is not an annotation", () => {
    expect(outerCallArity("string.format(formatstring: string, ...args: unknown[]): string")).toBe(
      2,
    );
    expect(outerCallArity("file:read(): string")).toBe(0);
  });

  test("a property-shaped override signature has no call arity", () => {
    const authored = committedStore("package")["package.loaders"]?.signatures[0] ?? "";
    expect(authored).toContain("package.loaders: ");
    expect(outerCallArity(authored)).toBeNull();
  });

  test("each msg.url row renders the fixture entry its call shape selects", () => {
    const store = committedStore("msg");
    const rows = apiModuleSymbols(fixturePage("msg"), {}, store).filter(
      (s) => s.name === "msg.url",
    );
    expect(rows).toHaveLength(6);
    expect(rows[1]?.docMarkdown).toContain("[socket:][path][#fragment]");
    expect(rows[2]?.docMarkdown).toContain("separate arguments");
    expect(rows[1]?.docMarkdown).not.toBe(rows[0]?.docMarkdown);
    expect(rows[2]?.docMarkdown).not.toBe(rows[0]?.docMarkdown);
    // A receiver-typed row shares the arity, and so the entry, of the plain row it mirrors.
    expect(rows[4]?.docMarkdown).toBe(rows[1]?.docMarkdown);
    expect(rows[5]?.docMarkdown).toBe(rows[2]?.docMarkdown);
  });

  test("msg.url still collapses to the authored rows, each carrying its own parameters", () => {
    const store = committedStore("msg");
    const rows = apiModuleSymbols(fixturePage("msg"), {}, store).filter(
      (s) => s.name === "msg.url",
    );
    expect(rows.map((s) => s.signature)).toEqual(store["msg.url"]?.signatures ?? []);
    expect(rows[0]?.parameters).toEqual([]);
    expect(rows[1]?.parameters.map((p) => p.name)).toEqual(["urlstring"]);
    expect(rows[2]?.parameters.map((p) => p.name)).toEqual(["socket", "path", "fragment"]);
    expect(rows[3]?.parameters).toEqual([]);
    expect(rows[4]?.parameters.map((p) => p.name)).toEqual(["urlstring"]);
    expect(rows[5]?.parameters.map((p) => p.name)).toEqual(["socket", "path", "fragment"]);
  });

  test("the curried go.get/go.set rows drop tables the row that accepts them takes over", () => {
    const store = committedStore("go");
    const symbols = apiModuleSymbols(fixturePage("go"), {}, store);
    for (const [fqn, params] of [
      ["go.get", ["url", "property", "options"]],
      ["go.set", ["url", "property", "value", "options"]],
    ] as const) {
      const rows = symbols.filter((s) => s.name === fqn);
      expect(rows).toHaveLength(5);
      expect(rows[0]?.parameters).toEqual([]);
      expect(rows[0]?.returnValues).toEqual([]);
      expect(rows[1]?.parameters).toEqual([]);
      expect(rows[2]?.parameters.map((p) => p.name)).toEqual([...params]);
      expect(rows[3]?.parameters).toEqual([]);
      expect(rows[4]?.parameters).toEqual([]);
    }
    // the `value` return row moves with the parameter table it belongs to
    expect(symbols.filter((s) => s.name === "go.get")[2]?.returnValues.map((r) => r.name)).toEqual([
      "value",
    ]);
  });

  test("the array-property APIs document a 1-based options.index passed unchanged", () => {
    for (const [fixture, store] of [
      ["go", committedStore("go")],
      ["gui", {}],
    ] as const) {
      const page = fixturePage(fixture);
      const optionDocs = apiModuleSymbols(page, {}, store)
        .filter((s) => ["go.get", "go.set", "gui.get", "gui.set"].includes(s.name))
        .flatMap((s) => s.parameters.filter((p) => p.name === "options").map((p) => p.doc));
      expect(optionDocs.length).toBeGreaterThan(0);
      for (const doc of optionDocs) {
        expect(doc).toContain("index into array property (1 based)");
        expect(doc.split("**⚠️ `index` is 1-based; passed to Defold unchanged.**").length - 1).toBe(
          1,
        );
      }
    }
  });

  test("a passed-through index names its base in the parameter and return rows", () => {
    const page = fixturePage("gui");
    const getIndex = apiModuleSymbols(page, {}, {}).find((s) => s.name === "gui.get_index");
    expect(getIndex?.returnValues[0]?.doc).toBe(
      "the index of the node. **0️⃣ 0-based; passed to Defold unchanged.**",
    );
    expect(apiModuleMarkdown(page)).toContain(
      "index — the index of the node. **0️⃣ 0-based; passed to Defold unchanged.**",
    );
  });

  test("no rendered zero-argument row on any real page carries a parameter table", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR);
    expect(pages.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const page of pages) {
      for (const symbol of apiModuleSymbols(page, page.translations, page.signatures)) {
        if (outerCallArity(symbol.signature) === 0 && symbol.parameters.length > 0) {
          offenders.push(`${page.route} ${symbol.signature}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("debug.getinfo's softer arity mismatch keeps its row-1 parameter table", () => {
    const store = committedStore("debug");
    const rows = apiModuleSymbols(fixturePage("debug"), {}, store).filter(
      (s) => s.name === "debug.getinfo",
    );
    expect(rows).toHaveLength(1);
    expect(outerCallArity(rows[0]?.signature ?? "")).toBe(2);
    expect(rows[0]?.parameters.map((p) => p.name)).toEqual(["thread", "function", "what"]);
  });

  test("renders `?` on an optional typedef property, leaving a required one unchanged", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        typedefs: [
          {
            name: "ShowOptions",
            properties: [
              {
                name: "clear",
                brief: "",
                description: "",
                types: ["boolean"],
                isOptional: true,
              },
              { name: "sequential", brief: "", description: "", types: ["boolean"] },
            ],
          },
        ],
      }),
    );
    expect(symbols.map((s) => s.signature)).toEqual([
      "demo.ShowOptions.clear?: boolean",
      "demo.ShowOptions.sequential: boolean",
    ]);
  });

  function slot(
    name: string,
    type: string,
    extra: Partial<ApiFunction["parameters"][number]> = {},
  ) {
    return { name, doc: "", types: [type], isOptional: false, ...extra };
  }

  function libraryPageWith(functions: ApiFunction[]): ApiPage {
    return { ...pageWith({ functions }), category: "library" };
  }

  const returnsNumber = [slot("request_id", "number")];

  test("an optional slot a required one follows renders as `T | undefined` in the signature and its row", () => {
    const symbols = apiModuleSymbols(
      libraryPageWith([
        {
          name: "demo.open_file",
          brief: "",
          description: "",
          parameters: [slot("callback", "function")],
          returnValues: returnsNumber,
        },
        {
          name: "demo.open_file",
          brief: "",
          description: "",
          parameters: [
            slot("options", "table", { isOptional: true }),
            slot("callback", "function"),
          ],
          returnValues: returnsNumber,
        },
      ]),
    ).filter((s) => s.name === "demo.open_file");
    expect(symbols.map((s) => s.signature)).toEqual([
      "demo.open_file(callback: function): number",
      "demo.open_file(options: table | undefined, callback: function): number",
    ]);
    const [options, callback] = symbols[1]?.parameters ?? [];
    expect(options?.isOptional).toBe(false);
    expect(options?.types).toEqual(["table | undefined"]);
    expect(callback?.isOptional).toBe(false);
  });

  test("a trailing optional slot, or one only a vararg follows, keeps its `?`", () => {
    const symbols = apiModuleSymbols(
      libraryPageWith([
        {
          name: "demo.trim",
          brief: "",
          description: "",
          parameters: [slot("value", "string"), slot("chars", "string", { isOptional: true })],
          returnValues: [],
        },
        {
          name: "demo.fmt",
          brief: "",
          description: "",
          parameters: [
            slot("prefix", "string", { isOptional: true }),
            slot("...args", "string", { isVararg: true }),
          ],
          returnValues: [],
        },
      ]),
    );
    const trim = symbols.find((s) => s.name === "demo.trim");
    expect(trim?.signature).toBe("demo.trim(value: string, chars?: string)");
    expect(trim?.parameters[1]?.isOptional).toBe(true);
    const fmt = symbols.find((s) => s.name === "demo.fmt");
    expect(outerCallSlots(fmt?.signature ?? "")?.[0]).toEqual({
      name: "prefix",
      isOptional: true,
      type: "string",
    });
    expect(fmt?.parameters[0]?.isOptional).toBe(true);
  });

  test("a class method's row matches its interior optional slot, and table fields keep their flag", () => {
    const symbols = apiModuleSymbols({
      ...pageWith({
        typedefs: [
          {
            name: "Handle",
            functions: [
              {
                name: "open",
                brief: "",
                description: "",
                parameters: [
                  slot("options", "table", {
                    isOptional: true,
                    fields: [
                      slot("timeout", "number", { isOptional: true }),
                      slot("path", "string"),
                    ],
                  }),
                  slot("callback", "function"),
                ],
                returnValues: [],
              },
            ],
          },
        ],
      }),
      category: "library",
    });
    const open = symbols.find((s) => s.name === "Handle.open");
    expect(open?.signature).toContain("options: table | undefined, callback: function");
    const [options] = open?.parameters ?? [];
    expect(options?.isOptional).toBe(false);
    expect(options?.types).toEqual(["table | undefined"]);
    expect(options?.fields?.[0]).toMatchObject({ isOptional: true, types: ["number"] });
  });

  test("a lua-stdlib page keeps the `?` of a leading slot Lua skips by shifting", () => {
    const symbol = apiModuleSymbols({
      ...pageWith({
        functions: [
          {
            name: "demo.sethook",
            brief: "",
            description: "",
            parameters: [slot("thread", "string", { isOptional: true }), slot("hook", "function")],
            returnValues: [],
          },
        ],
      }),
      category: "lua-stdlib",
    })[0];
    expect(outerCallSlots(symbol?.signature ?? "")?.[0]).toEqual({
      name: "thread",
      isOptional: true,
      type: "string",
    });
    expect(symbol?.parameters[0]).toMatchObject({ isOptional: true, types: ["string"] });
  });

  test("an engine page with no authoritative maps renders an interior optional slot the same way", () => {
    const symbol = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "demo.pick",
            brief: "",
            description: "",
            parameters: [
              slot("size", "string", { isOptional: true }),
              slot("callback", "function"),
            ],
            returnValues: [],
          },
        ],
      }),
    )[0];
    expect(outerCallSlots(symbol?.signature ?? "")?.[0]).toEqual({
      name: "size",
      isOptional: false,
      type: "string | undefined",
    });
  });
});

describe("index-base notes", () => {
  const pages = loadApiSurface(REAL_TYPES_DIR);
  const page = (namespace: string, category: ApiPage["category"] = "engine"): ApiPage => {
    const found = pages.find((p) => p.namespace === namespace && p.category === category);
    if (!found) throw new Error(`no ${category} page ${namespace}`);
    return found;
  };
  const symbols = (p: ApiPage): ApiSymbol[] => apiModuleSymbols(p, p.translations, p.signatures);
  const paramDoc = (p: ApiPage, name: string, param: string): string | undefined =>
    symbols(p)
      .filter((s) => s.name === name)
      .flatMap((s) => s.parameters)
      .find((row) => row.name === param)?.doc;

  test("the engine gui page keeps its Defold note", () => {
    expect(paramDoc(page("gui", "engine"), "gui.set", "options")).toContain(
      "passed to Defold unchanged",
    );
  });
});

describe("apiModuleSymbols / apiModuleMarkdown authoritative signatures", () => {
  const getConstants: ApiFunction = {
    name: "compute.get_constants",
    brief: "",
    description: "Gets constants.",
    parameters: [{ name: "path", doc: "", types: ["hash", "string"], isOptional: false }],
    returnValues: [{ name: "", doc: "", types: ["table"], isOptional: false }],
  };
  const AUTH_SIG =
    "compute.get_constants(path: Hash | string): { name: Hash; type: number; value: Vector4 | Matrix4 }[]";
  function computePage(withMap: boolean): ApiPage {
    const key = symbolIdentityKey({
      namespace: "compute",
      kind: "FUNCTION",
      name: getConstants.name,
      signature: normalizedFunctionSignature(getConstants),
    });
    return {
      namespace: "compute",
      route: "/api/combined/compute",
      brief: "",
      module: {
        namespace: "compute",
        brief: "",
        description: "",
        functions: [getConstants],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [],
      },
      translations: {},
      signatures: {},
      category: "engine",
      ...(withMap ? { authoritativeSignatures: new Map([[key, AUTH_SIG]]) } : {}),
    };
  }

  test("apiModuleSymbols renders the authoritative structured return, not the ref-doc token", () => {
    const symbol = apiModuleSymbols(computePage(true))[0];
    expect(symbol?.signature).toBe(AUTH_SIG);
    expect(symbol?.signature).not.toContain("Record<string | number, unknown>");
  });

  test("apiModuleMarkdown heading uses the same authoritative signature", () => {
    const md = apiModuleMarkdown(computePage(true));
    expect(md).toContain(`### \`${AUTH_SIG}\``);
  });

  test("a symbol absent from the map falls back to the token-derived functionSignature", () => {
    const withEmpty = { ...computePage(true), authoritativeSignatures: new Map<string, string>() };
    const fallback = apiModuleSymbols(computePage(false))[0]?.signature;
    expect(apiModuleSymbols(withEmpty)[0]?.signature).toBe(fallback);
    expect(fallback).not.toBe(AUTH_SIG);
  });

  test("an exact-version page (no map) renders the token-derived signature, not the authoritative one", () => {
    const noMap = computePage(false);
    const rendered = apiModuleSymbols(noMap)[0]?.signature;
    expect(rendered).not.toBe(AUTH_SIG);
    expect(rendered).toBe(
      "compute.get_constants(path: Hash | string): Record<string | number, unknown>",
    );
    expect(apiModuleMarkdown(noMap)).toContain(`### \`${rendered}\``);
  });
});

describe("apiModuleSymbols / apiModuleMarkdown authoritative member signatures", () => {
  const NS = "demo";
  // Constants carry the namespace-qualified public identity name; properties are
  // bare. The rendered signature is the map's identity-name inner form.
  const constKey = symbolIdentityKey({
    namespace: NS,
    kind: "CONSTANT",
    name: "demo.B2_DYNAMIC_BODY",
    signature: "",
  });
  const propKey = symbolIdentityKey({
    namespace: NS,
    kind: "PROPERTY",
    name: "material",
    signature: "",
  });
  const CONST_SIG = 'demo.B2_DYNAMIC_BODY: number & { readonly __brand: "demo.B2_DYNAMIC_BODY" }';
  const PROP_SIG = 'material: Hash & { readonly __brand: "demo.material" }';

  function memberPage(withMap: boolean): ApiPage {
    return {
      namespace: NS,
      route: "/api/combined/demo",
      brief: "",
      module: {
        namespace: NS,
        brief: "",
        description: "",
        functions: [],
        // `spin` is deliberately absent from the map to prove the fallback path.
        variables: [{ name: "spin", brief: "", description: "", types: ["number"] }],
        constants: [{ name: "demo.B2_DYNAMIC_BODY", brief: "", description: "" }],
        properties: [{ name: "material", types: ["hash"], brief: "", description: "" }],
        typedefs: [],
      },
      translations: {},
      signatures: {},
      category: "engine",
      ...(withMap
        ? {
            authoritativeSignatures: new Map([
              [constKey, CONST_SIG],
              [propKey, PROP_SIG],
            ]),
          }
        : {}),
    };
  }

  test("apiModuleSymbols renders authoritative constant/property signatures, not the token form", () => {
    const symbols = apiModuleSymbols(memberPage(true));
    expect(symbols.find((s) => s.name === "demo.B2_DYNAMIC_BODY")?.signature).toBe(CONST_SIG);
    expect(symbols.find((s) => s.name === "material")?.signature).toBe(PROP_SIG);
  });

  test("a member absent from the map falls back to its token-derived signature unchanged", () => {
    const withMap = apiModuleSymbols(memberPage(true));
    const fallback = apiModuleSymbols(memberPage(false));
    const varWith = withMap.find((s) => s.name === "spin")?.signature;
    const varFallback = fallback.find((s) => s.name === "spin")?.signature;
    expect(varWith).toBe(varFallback);
    expect(varFallback).toBe("spin: number");
  });

  test("apiModuleMarkdown renders the same authoritative member signatures in its headings", () => {
    const md = apiModuleMarkdown(memberPage(true));
    expect(md).toContain(`### \`${CONST_SIG}\``);
    expect(md).toContain(`### \`${PROP_SIG}\``);
  });

  test("correspondence guard: every rendered signature with a map entry equals its Combined inner form", () => {
    const surface = loadCombinedSurface(REAL_TYPES_DIR);
    for (const ns of surface.namespaces) {
      const page = combinedNamespaceToApiPage(ns);
      const map = page.authoritativeSignatures;
      if (!map) continue;
      const rendered = new Set(apiModuleSymbols(page).map((s) => s.signature));
      for (const entry of ns.entries) {
        // TYPEDEF rows are covered in both projections by the "authoritative
        // TYPEDEF rows on Combined pages" describe; this guard covers the rest.
        if (entry.identity.kind === "TYPEDEF") continue;
        const inner = map.get(symbolIdentityKey(entry.identity));
        if (inner === undefined) continue;
        expect(rendered.has(inner)).toBe(true);
      }
    }
  });
});

describe("authoritative TYPEDEF rows on Combined pages (committed artifacts)", () => {
  const surface = loadCombinedSurface(REAL_TYPES_DIR);
  const newest =
    (
      JSON.parse(readFileSync(join(REAL_TYPES_DIR, "api-signatures.json"), "utf8")) as {
        versions: Record<string, Record<string, string>>;
      }
    ).versions[surface.versions[0] ?? ""] ?? {};

  function pageFor(namespace: string): ApiPage {
    const ns = surface.namespaces.find((n) => n.namespace === namespace);
    if (ns === undefined) throw new Error(`no Combined namespace ${namespace}`);
    return combinedNamespaceToApiPage(ns);
  }

  function typeRow(page: ApiPage, name: string) {
    return {
      symbols: apiModuleSymbols(page).filter((s) => s.kind === "type" && s.name === name),
      markdown:
        apiModuleSections(page).sections.find((s) => s.kind === "type" && s.name === name)
          ?.markdown ?? "",
    };
  }

  // The ledger declares a type by its leaf inside the namespace; the page row
  // names its qualified path and keeps the rest of the definition.
  function qualifiedRow(namespace: string, name: string, definition: string): string {
    const [, keyword, rest] = /^(type|interface) [\w$]+(.*)$/s.exec(definition) ?? [];
    return keyword === undefined ? definition : `${keyword} ${namespace}.${name}${rest}`;
  }

  test("every signed TYPEDEF renders its authoritative definition", () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const ns of surface.namespaces) {
      const page = combinedNamespaceToApiPage(ns);
      for (const entry of ns.entries) {
        if (entry.identity.kind !== "TYPEDEF" || entry.authoritativeSignature.trim() === "") {
          continue;
        }
        const { name } = entry.identity;
        const expected = page.authoritativeSignatures?.get(symbolIdentityKey(entry.identity));
        if (expected === undefined) {
          offenders.push(`${ns.namespace} ${name} no map entry`);
          continue;
        }
        checked++;
        const { symbols, markdown } = typeRow(page, name);
        if (symbols.length !== 1) offenders.push(`${ns.namespace} ${name} ${symbols.length} rows`);
        else if (symbols[0]?.signature !== qualifiedRow(ns.namespace, name, expected)) {
          offenders.push(`${ns.namespace} ${name} signature ${symbols[0]?.signature}`);
        }
        if (!markdown.includes(`\`${expected}\``)) {
          offenders.push(`${ns.namespace} ${name} markdown`);
        }
      }
    }
    expect(offenders).toEqual([]);
    expect(checked).toBeGreaterThan(0);
  });

  test("socket handles render their committed interfaces", () => {
    const page = pageFor("socket");
    for (const name of [
      "SocketClient",
      "SocketConnected",
      "SocketMaster",
      "SocketServer",
      "SocketUnconnected",
    ]) {
      const expected = newest[`socket\0TYPEDEF\0${name}\0`]?.trim() ?? "";
      expect(expected.startsWith(`interface ${name} {`)).toBe(true);
      const { symbols, markdown } = typeRow(page, name);
      expect(symbols.map((s) => s.signature)).toEqual([
        `interface socket.${name}${expected.slice(`interface ${name}`.length)}`,
      ]);
      expect(markdown).toContain(`\`${expected}\``);
    }
  });

  test("authoritative type aliases keep rendering", () => {
    const expected = (newest["gui\0TYPEDEF\0Easing\0"] ?? "").trim().replace(/;$/, "");
    expect(expected.startsWith("type Easing =")).toBe(true);
    const { symbols, markdown } = typeRow(pageFor("gui"), "Easing");
    expect(symbols.map((s) => s.signature)).toEqual([
      `type gui.Easing${expected.slice("type Easing".length)}`,
    ]);
    expect(markdown).toContain(`\`${expected}\``);
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
    expect(md).toBe("```ts\ndemo.run(); // ts\n```\n\n```lua original\ndemo.run()\n```");
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

  const twoBlocks = `${luaExample}Then:<br>${luaExample.replace("run", "stop")}`;
  const twoFn: ApiFunction = { ...fn, name: "demo.pair", examples: twoBlocks };
  const segmentHashes = splitExampleSources(twoBlocks).map((segment) =>
    hashExampleSource(segment.code),
  );

  test("an element whose segments all resolve renders one ```ts fence per example", () => {
    expect(segmentHashes).toHaveLength(2);
    const md = exampleMarkdownFor(twoFn, {
      "demo.pair": [
        { sourceHash: segmentHashes[0] ?? "", ts: "demo.run(); // first" },
        { sourceHash: segmentHashes[1] ?? "", ts: "demo.stop(); // second" },
      ],
    });
    expect(md).toBe(
      [
        "```ts\ndemo.run(); // first\n```",
        "```lua original\ndemo.run()\n```",
        "Then:",
        "```ts\ndemo.stop(); // second\n```",
        "```lua original\ndemo.stop()\n```",
      ].join("\n\n"),
    );
  });

  const wholeBlobFallback = "```lua\ndemo.run()\n```\n\nThen:\n\n```lua\ndemo.stop()\n```";

  test("an element whose segments resolve only partly falls back to the complete Lua rendering", () => {
    const md = exampleMarkdownFor(twoFn, {
      "demo.pair": [{ sourceHash: segmentHashes[0] ?? "", ts: "demo.run(); // first" }],
    });
    expect(md).toBe(wholeBlobFallback);
    expect(md).not.toContain("demo.run(); // first");
  });

  test("an element holding only a whole-blob entry renders the complete Lua rendering", () => {
    const md = exampleMarkdownFor(twoFn, {
      "demo.pair": [{ sourceHash: hashExampleSource(htmlToCodeText(twoBlocks)), ts: "welded();" }],
    });
    expect(md).toBe(wholeBlobFallback);
  });

  test("a single-example element with a whole-blob entry renders that body with no prose line", () => {
    const withProse = `Query a position:<br>${luaExample}`;
    const md = exampleMarkdownFor(
      { ...fn, examples: withProse },
      {
        "demo.run": [
          { sourceHash: hashExampleSource(htmlToCodeText(withProse)), ts: "demo.run();" },
        ],
      },
    );
    expect(md).toBe("```ts\ndemo.run();\n```\n\n```lua original\ndemo.run()\n```");
  });

  test("an element whose trailing segment alone resolves falls back to the same complete rendering", () => {
    const md = exampleMarkdownFor(twoFn, {
      "demo.pair": [{ sourceHash: segmentHashes[1] ?? "", ts: "demo.stop(); // second" }],
    });
    expect(md).toBe(wholeBlobFallback);
    expect(md).not.toContain("demo.stop(); // second");
  });

  test("each resolved segment's prose renders as a paragraph above its fence", () => {
    const segments = splitExampleSources(twoBlocks);
    expect(segments.map((segment) => segment.prose)).toEqual(["", "Then:"]);
    const md = exampleMarkdownFor(twoFn, {
      "demo.pair": [
        { sourceHash: segmentHashes[0] ?? "", ts: "demo.run(); // first" },
        { sourceHash: segmentHashes[1] ?? "", ts: "demo.stop(); // second" },
      ],
    });
    expect(md).toBe(
      [
        "```ts\ndemo.run(); // first\n```",
        "```lua original\ndemo.run()\n```",
        "Then:",
        "```ts\ndemo.stop(); // second\n```",
        "```lua original\ndemo.stop()\n```",
      ].join("\n\n"),
    );
  });

  test("a segment's authored caption renders in place of its upstream prose", () => {
    const md = exampleMarkdownFor(twoFn, {
      "demo.pair": [
        { sourceHash: segmentHashes[0] ?? "", ts: "demo.run(); // first" },
        { sourceHash: segmentHashes[1] ?? "", ts: "demo.stop(); // second", prose: "Finally:" },
      ],
    });
    expect(md).toBe(
      [
        "```ts\ndemo.run(); // first\n```",
        "```lua original\ndemo.run()\n```",
        "Finally:",
        "```ts\ndemo.stop(); // second\n```",
        "```lua original\ndemo.stop()\n```",
      ].join("\n\n"),
    );
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
    expect(md).not.toMatch(/^```lua$/m);
    expect(md).not.toContain("<div");
    expect(md).not.toContain("<span");
    expect(md).not.toContain("codehilite");
  });

  test("camera.get_cameras renders the authored TypeScript, not raw Lua or HTML", () => {
    const fn = cameraPage?.module.functions.find((f) => f.name === "camera.get_cameras");
    expect(fn).toBeDefined();
    const md = fn ? exampleMarkdownFor(fn, cameraPage?.translations) : undefined;
    expect(md).toContain("```ts");
    expect(md).not.toMatch(/^```lua$/m);
    expect(md).not.toContain("<span");
  });

  // 1.13.2 drops the sample from this return doc, so the 1.13.1 surface carries it.
  test("physics.get_maskbit's return doc renders its prose sample as the pinned TypeScript", () => {
    const physicsPage = loadApiSurfaceForVersion(REAL_TYPES_DIR, "defold-1.13.1").find(
      (p) => p.namespace === "physics",
    );
    expect(physicsPage).toBeDefined();
    if (!physicsPage) return;
    const symbol = apiModuleSymbols(
      physicsPage,
      physicsPage.translations,
      physicsPage.signatures,
    ).find((s) => s.kind === "function" && s.name === "physics.get_maskbit");
    const doc = symbol?.returnValues[0]?.doc ?? "";
    expect(doc).toContain("```ts");
    expect(doc).not.toMatch(/^```lua$/m);
    const flat = apiModuleMarkdown(physicsPage, physicsPage.translations);
    expect(flat).toContain("```lua original\nlocal function is_invincible()");
    expect(flat).not.toContain("```lua\nlocal function is_invincible()");
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

describe("groupTypeSymbols", () => {
  function typeSymbol(name: string): ApiSymbol {
    return {
      kind: "type",
      name,
      signature: name,
      docMarkdown: "",
      parameters: [],
      returnValues: [],
    };
  }

  test("lists every member-less type as a row, in input order", () => {
    const layout = groupTypeSymbols([
      typeSymbol("EASING"),
      typeSymbol("Shape.member"),
      typeSymbol("ADJUST"),
    ]);
    expect(layout.types).toEqual([typeSymbol("EASING"), typeSymbol("ADJUST")]);
    expect(layout.shapes.map((s) => s.label)).toEqual(["Shape"]);
  });

  test("returns one shape per owning shape, labeled bare, preserving both orders", () => {
    const layout = groupTypeSymbols([
      typeSymbol("ShowOptions.visible"),
      typeSymbol("Transition.easing"),
      typeSymbol("ShowOptions.sequential"),
    ]);
    expect(layout).toEqual({
      types: [],
      shapes: [
        {
          label: "ShowOptions",
          symbols: [typeSymbol("ShowOptions.visible"), typeSymbol("ShowOptions.sequential")],
        },
        { label: "Transition", symbols: [typeSymbol("Transition.easing")] },
      ],
    });
  });

  test("splits at the first dot, so a dotted member stays with its shape", () => {
    const layout = groupTypeSymbols([typeSymbol("Config.window.width")]);
    expect(layout).toEqual({
      types: [],
      shapes: [{ label: "Config", symbols: [typeSymbol("Config.window.width")] }],
    });
  });

  test("heads a shape with its dotless definition symbol and keeps it out of the rows", () => {
    const layout = groupTypeSymbols([
      typeSymbol("ManifoldHit"),
      typeSymbol("ManifoldHit.normal"),
      typeSymbol("other"),
      typeSymbol("ManifoldHit.depth"),
    ]);
    expect(layout).toEqual({
      types: [typeSymbol("other")],
      shapes: [
        {
          label: "ManifoldHit",
          symbols: [
            typeSymbol("ManifoldHit"),
            typeSymbol("ManifoldHit.normal"),
            typeSymbol("ManifoldHit.depth"),
          ],
        },
      ],
    });
  });

  test("yields empty rows and shapes for empty input", () => {
    expect(groupTypeSymbols([])).toEqual({ types: [], shapes: [] });
  });
});

describe("engine type rows name their qualified path", () => {
  const pages = canonicalApiPages(REAL_TYPES_DIR);
  const typeRow = (namespace: string, name: string) => {
    const page = pages.find((p) => p.namespace === namespace);
    if (!page) throw new Error(`no ${namespace} page`);
    return apiModuleSymbols(page, page.translations, page.signatures).find(
      (s) => s.kind === "type" && s.name === name,
    );
  };

  test("an engine definition row names its namespace", () => {
    expect(typeRow("image", "Type")?.signature).toStartWith("type image.Type =");
    expect(typeRow("image", "LoadResult")?.signature).toStartWith("interface image.LoadResult {");
  });

  test("a nested engine row names its whole path, not just its leaf", () => {
    expect(typeRow("go", "on_input.Action")?.signature).toStartWith(
      "interface go.on_input.Action {",
    );
    expect(typeRow("socket", "dns.AddressInfo")?.signature).toStartWith(
      "interface socket.dns.AddressInfo {",
    );
  });

  test("an engine shape's member rows name their namespace", () => {
    const page: ApiPage = {
      namespace: "demo",
      route: "/api/demo",
      brief: "Demo",
      module: {
        namespace: "demo",
        brief: "Demo",
        description: "Engine type demo.",
        functions: [],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [
          {
            name: "Logger",
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
      translations: {},
      signatures: {},
      category: "engine",
    };
    const signatures = apiModuleSymbols(page)
      .filter((s) => s.kind === "type")
      .map((s) => s.signature);
    expect(signatures).toEqual(["demo.Logger.info(message: string)", "demo.Logger.level: number"]);
  });
});

describe("engine token rendering", () => {
  function eventPage(module: Partial<ApiPage["module"]>): ApiPage {
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
      category: "engine",
    };
  }

  test("a vararg param stays `...args: T`", () => {
    const module: Partial<ApiPage["module"]> = {
      functions: [
        {
          name: "event.fmt",
          brief: "",
          description: "Format.",
          parameters: [
            { name: "...args", doc: "", types: ["string"], isOptional: false, isVararg: true },
          ],
          returnValues: [{ name: "", doc: "", types: ["number"], isOptional: false }],
        },
      ],
    };
    expect(apiModuleSymbols(eventPage(module))[0]?.signature).toBe(
      "event.fmt(...args: string): number",
    );
  });

  test("a >1-return function stays `a, b`", () => {
    const module: Partial<ApiPage["module"]> = {
      functions: [
        {
          name: "event.measure",
          brief: "",
          description: "Measure.",
          parameters: [],
          returnValues: [
            { name: "", doc: "", types: ["number"], isOptional: false },
            { name: "", doc: "", types: ["number"], isOptional: false },
          ],
        },
      ],
    };
    expect(apiModuleSymbols(eventPage(module))[0]?.signature).toBe(
      "event.measure(): number, number",
    );
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

describe("generic shape definitions", () => {
  const source = `declare module "gen.shape" {
  export type Box<T extends string = "a"> = { value: T };
  export interface Room<State = unknown> { state: State }
  export interface Base<T> { base: T }
  export interface Tagged<T> extends Base<T> { tag: T }
  export type Flat = { id: number };
  export interface Plain { id: number }
  export type Unused<T> = { unused: T };
  export function box(): Box;
  export function room(): Room;
  export function tagged(): Tagged<number>;
  export function flat(): Flat;
  export function plain(): Plain;
}`;
  const page: ApiPage = {
    namespace: "gen.shape",
    route: "/api/gen.shape",
    brief: "",
    module: parseDefoldApiDoc(extractApiDoc(source, "gen.shape")),
    translations: {},
    signatures: {},
    category: "global-type",
  };
  const symbols = apiModuleSymbols(page).filter((s) => s.kind === "type");
  const layout = groupTypeSymbols(symbols);
  const group = (label: string) => layout.shapes.find((g) => g.label === label);

  test("heads a generic alias shape with its parameters, constraint and default", () => {
    const box = group("Box");
    expect(box?.symbols[0]).toMatchObject({
      name: "Box",
      signature: 'Box<T extends string = "a">',
    });
    expect(box?.symbols.find((s) => s.name === "Box.value")?.signature).toBe("Box.value: T");
  });

  test("heads a generic interface shape with its parameters and default", () => {
    const room = group("Room");
    expect(room?.symbols[0]).toMatchObject({ name: "Room", signature: "Room<State = unknown>" });
    expect(room?.symbols.map((s) => s.name)).toContain("Room.state");
  });

  test("keeps the parameters on an interface that extends a parent", () => {
    expect(group("Tagged")?.symbols[0]).toMatchObject({
      name: "Tagged",
      signature: "interface Tagged<T> extends Base<T>",
    });
  });

  test("leaves a non-generic shape without a definition row", () => {
    for (const label of ["Flat", "Plain"]) {
      const names = group(label)?.symbols.map((s) => s.name) ?? [];
      expect(names.length).toBeGreaterThan(0);
      expect(names.every((name) => name.includes("."))).toBe(true);
    }
    expect(layout.types).toEqual([]);
  });

  test("lists no generic alias that has no members", () => {
    expect(symbols.some((s) => s.name === "Unused")).toBe(false);
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
    const list = functionOverviewCards(
      [
        fnSymbol("go.get_position", {
          signature: "go.get_position(): vector3",
          docMarkdown: "Gets the world position. More prose.",
        }),
        fnSymbol("go.set_position", {
          signature: "go.set_position(position: vector3): void",
          docMarkdown: "Sets the world position.",
        }),
      ],
      [],
    );
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
      [],
    );
    for (const signature of signatures) {
      const id = await renderedHeadingId(signature);
      expect(cards).toContain(`](#${id})`);
    }
  });

  test("keeps descriptions out of the overview and returns empty string for no symbols", async () => {
    const list = functionOverviewCards(
      [
        fnSymbol("demo.escape", {
          signature: 'demo.escape(value: "Hash | <Url> & string")',
          docMarkdown: 'Uses `a | b` and <unsafe> "quotes" & ampersands. Second sentence.',
        }),
      ],
      [],
    );
    expect(list).toContain(
      '[`demo.escape(value: "Hash | <Url> & string")`](#demoescapevalue-hash--url--string)',
    );
    expect(list).not.toContain("Uses `a | b`");
    expect(list).not.toContain("title=");
    expect(list).not.toContain("\\|");
    expect(functionOverviewCards([], [])).toBe("");

    const html = await renderMarkdown(list, { highlightSignatureHeadings: true });
    expect(html).toContain('<code class="api-signature');
    expect(html).toContain("--shiki-light:");
  });

  test("a markerFor callback appends its HTML after each signature link in the same item", () => {
    const list = functionOverviewCards(
      [
        fnSymbol("go.get_position", { signature: "go.get_position(): vector3" }),
        fnSymbol("go.set_position", { signature: "go.set_position(position: vector3): void" }),
      ],
      [],
      (group) => `<i data-mark="${group[0]?.name}"></i>`,
    );
    expect(list).toContain(
      '- [`go.get_position(): vector3`](#goget_position-vector3)<i data-mark="go.get_position"></i>',
    );
    expect(list).toContain(
      '- [`go.set_position(position: vector3): void`](#goset_positionposition-vector3-void)<i data-mark="go.set_position"></i>',
    );
  });

  test("an empty markerFor return leaves output byte-identical to the no-callback form", () => {
    const symbols = [fnSymbol("go.get_position", { signature: "go.get_position(): vector3" })];
    expect(functionOverviewCards(symbols, [], () => "")).toBe(functionOverviewCards(symbols, []));
  });
});

describe("availability join", () => {
  const fooOverloadA: ApiFunction = {
    name: "b2d.body.foo",
    brief: "",
    description: "First overload.",
    parameters: [{ name: "body", doc: "", types: ["b2Body"], isOptional: false }],
    returnValues: [],
  };
  const fooOverloadB: ApiFunction = {
    name: "b2d.body.foo",
    brief: "",
    description: "Second overload.",
    parameters: [
      { name: "body", doc: "", types: ["b2Body"], isOptional: false },
      { name: "flag", doc: "", types: ["boolean"], isOptional: false },
    ],
    returnValues: [],
  };

  function pageWith(module: Partial<ApiPage["module"]>, availability: AvailabilityLookup): ApiPage {
    return {
      namespace: "b2d.body",
      route: "/api/b2d.body",
      brief: "",
      module: {
        namespace: "b2d.body",
        brief: "",
        description: "Physics body.",
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
      availability,
    };
  }

  const AV_VERSIONS = ["1.13.0", "1.12.4"];

  function lookup(records: ApiAvailability[]): AvailabilityLookup {
    return {
      versions: AV_VERSIONS,
      records: new Map(records.map((r) => [symbolIdentityKey(r.identity), r])),
      transitions: signatureTransitionNames(records, AV_VERSIONS),
    };
  }

  test("attaches availability to the exact overload and leaves the sibling unlabelled", () => {
    const availability = lookup([
      {
        identity: {
          namespace: "b2d.body",
          kind: "FUNCTION",
          name: "b2d.body.foo",
          signature: normalizedFunctionSignature(fooOverloadA),
        },
        availableIn: ["1.13.0"],
      },
    ]);
    const symbols = apiModuleSymbols(
      pageWith({ functions: [fooOverloadA, fooOverloadB] }, availability),
    );
    expect(symbols).toHaveLength(2);
    expect(symbols[0]?.availability?.availableIn).toEqual(["1.13.0"]);
    expect(symbols[1]?.availability).toBeUndefined();
  });

  test("joins a non-function symbol by its empty-signature identity", () => {
    const availability = lookup([
      {
        identity: {
          namespace: "b2d.body",
          kind: "CONSTANT",
          name: "b2d.body.STATIC",
          signature: "",
        },
        availableIn: AV_VERSIONS,
        deprecatedSince: "1.12.0",
      },
    ]);
    const symbols = apiModuleSymbols(
      pageWith(
        { constants: [{ name: "b2d.body.STATIC", brief: "", description: "Static body." }] },
        availability,
      ),
    );
    expect(symbols[0]?.availability?.deprecatedSince).toBe("1.12.0");
  });

  test("no availability lookup leaves every symbol unlabelled", () => {
    const symbols = apiModuleSymbols(
      pageWith(
        { functions: [fooOverloadA] },
        { versions: [], records: new Map(), transitions: new Set() },
      ),
    );
    expect(symbols[0]?.availability).toBeUndefined();
  });

  test("apiModuleMarkdown threads lifecycle prose so the search projection carries it", () => {
    const availability = lookup([
      {
        identity: {
          namespace: "b2d.body",
          kind: "FUNCTION",
          name: "b2d.body.foo",
          signature: normalizedFunctionSignature(fooOverloadA),
        },
        availableIn: ["1.12.4"],
      },
    ]);
    const md = apiModuleMarkdown(pageWith({ functions: [fooOverloadA] }, availability));
    expect(md).toContain("Removed in Defold 1.13.0");
  });

  // The join is proven by a symbol that carries *some* proper subset of the tracked
  // releases — one absent from at least one of them. Requiring exactly `[newest]`
  // silently made the assertion depend on the current release having promoted
  // something into this namespace, which a patch release need not do.
  test("the real default surface joins a lifecycle-labelled symbol onto its b2d.body page", () => {
    const tracked = versionsWithDiskFixtures(REAL_TYPES_DIR).length;
    const pages = loadApiSurface(REAL_TYPES_DIR);
    const body = pages.find((p) => p.namespace === "b2d.body");
    expect(body).toBeDefined();
    if (!body) return;
    expect(body.availability?.records.size ?? 0).toBeGreaterThan(0);
    const labelled = apiModuleSymbols(body, body.translations, body.signatures).filter(
      (s) =>
        s.availability !== undefined &&
        s.availability.availableIn.length > 0 &&
        s.availability.availableIn.length < tracked,
    );
    expect(labelled.length).toBeGreaterThan(0);
  });
});

describe("badgeCategory", () => {
  const VERSIONS = ["1.13.0", "1.12.4"];
  const V3 = ["1.14.0", "1.13.0", "1.12.4"];
  const identity = { namespace: "m", kind: "FUNCTION", name: "m.f", signature: "" };
  const av = (availableIn: string[], deprecatedSince?: string): ApiAvailability =>
    deprecatedSince === undefined
      ? { identity, availableIn }
      : { identity, availableIn, deprecatedSince };

  test("a since-newest span is New only", () => {
    expect(badgeCategory(av(["1.13.0"]), VERSIONS)).toEqual({
      isNew: true,
      isChanged: false,
      isDeprecated: false,
    });
  });

  test("a through-oldest span is Changed only", () => {
    expect(badgeCategory(av(["1.12.4"]), VERSIONS)).toEqual({
      isNew: false,
      isChanged: true,
      isDeprecated: false,
    });
  });

  test("a contiguous mid-range span is Changed", () => {
    expect(badgeCategory(av(["1.13.0"]), V3)).toEqual({
      isNew: false,
      isChanged: true,
      isDeprecated: false,
    });
  });

  test("a discrete (non-contiguous) span is Changed", () => {
    expect(badgeCategory(av(["1.14.0", "1.12.4"]), V3)).toEqual({
      isNew: false,
      isChanged: true,
      isDeprecated: false,
    });
  });

  test("an all-versions span carries no category", () => {
    expect(badgeCategory(av(VERSIONS), VERSIONS)).toEqual({
      isNew: false,
      isChanged: false,
      isDeprecated: false,
    });
  });

  test("deprecation co-occurs with a changed span", () => {
    expect(badgeCategory(av(["1.12.4"], "1.12.0"), VERSIONS)).toEqual({
      isNew: false,
      isChanged: true,
      isDeprecated: true,
    });
  });

  test("deprecation applies regardless of span (all-versions and deprecated)", () => {
    expect(badgeCategory(av(VERSIONS, "1.12.0"), VERSIONS)).toEqual({
      isNew: false,
      isChanged: false,
      isDeprecated: true,
    });
  });

  test("undefined availability yields all false", () => {
    expect(badgeCategory(undefined, VERSIONS)).toEqual({
      isNew: false,
      isChanged: false,
      isDeprecated: false,
    });
  });
});

describe("windowedBadgeCategory", () => {
  const V3 = ["1.14.0", "1.13.0", "1.12.4"];
  const cat = (isNew: boolean, isChanged: boolean, isDeprecated = false) => ({
    isNew,
    isChanged,
    isDeprecated,
  });

  describe("span categories inside the window", () => {
    const window = { from: "1.13.0", to: "1.14.0" };

    test("a span covering the whole window carries no category", () => {
      expect(windowedBadgeCategory(["1.14.0", "1.13.0"], undefined, V3, window)).toEqual(
        cat(false, false),
      );
    });

    test("a span reaching `to` but not `from` is New", () => {
      expect(windowedBadgeCategory(["1.14.0"], undefined, V3, window)).toEqual(cat(true, false));
    });

    test("a span reaching `from` but not `to` is Changed", () => {
      expect(windowedBadgeCategory(["1.13.0", "1.12.4"], undefined, V3, window)).toEqual(
        cat(false, true),
      );
    });

    test("a symbol absent from the window carries no category", () => {
      expect(windowedBadgeCategory(["1.12.4"], undefined, V3, window)).toEqual(cat(false, false));
    });

    test("an absent symbol stays uncategorized even when deprecated", () => {
      expect(windowedBadgeCategory(["1.12.4"], "1.12.4", V3, window)).toEqual(cat(false, false));
    });
  });

  describe("interior and gapped spans inside a wider window", () => {
    const V4 = ["1.15.0", "1.14.0", "1.13.0", "1.12.4"];
    const window = { from: "1.13.0", to: "1.15.0" };

    test("an interior span is Changed", () => {
      expect(windowedBadgeCategory(["1.14.0"], undefined, V4, window)).toEqual(cat(false, true));
    });

    test("a gapped span is Changed", () => {
      expect(windowedBadgeCategory(["1.15.0", "1.13.0"], undefined, V4, window)).toEqual(
        cat(false, true),
      );
    });
  });

  describe("the full-range window reproduces badgeCategory", () => {
    const full = { from: "1.12.4", to: "1.14.0" };
    const identity = { namespace: "m", kind: "FUNCTION", name: "m.f", signature: "" };
    const spans: { readonly availableIn: string[]; readonly deprecatedSince?: string }[] = [
      { availableIn: V3 },
      { availableIn: ["1.14.0"] },
      { availableIn: ["1.14.0", "1.13.0"] },
      { availableIn: ["1.13.0"] },
      { availableIn: ["1.13.0", "1.12.4"] },
      { availableIn: ["1.12.4"] },
      { availableIn: ["1.14.0", "1.12.4"] },
      { availableIn: V3, deprecatedSince: "1.12.4" },
      { availableIn: ["1.13.0"], deprecatedSince: "1.13.0" },
    ];

    for (const span of spans) {
      const name = `${span.availableIn.join("+")}${span.deprecatedSince ? ` dep@${span.deprecatedSince}` : ""}`;
      test(`agrees for ${name}`, () => {
        const av: ApiAvailability =
          span.deprecatedSince === undefined
            ? { identity, availableIn: span.availableIn }
            : {
                identity,
                availableIn: span.availableIn,
                deprecatedSince: span.deprecatedSince,
              };
        expect(windowedBadgeCategory(span.availableIn, span.deprecatedSince, V3, full)).toEqual(
          badgeCategory(av, V3),
        );
      });
    }
  });

  describe("deprecation is bounded by `to`", () => {
    const window = { from: "1.12.4", to: "1.13.0" };

    test("a deprecation newer than `to` does not mark the symbol", () => {
      expect(windowedBadgeCategory(["1.13.0", "1.12.4"], "1.14.0", V3, window).isDeprecated).toBe(
        false,
      );
    });

    test("a deprecation at `to` marks the symbol", () => {
      expect(windowedBadgeCategory(["1.13.0", "1.12.4"], "1.13.0", V3, window).isDeprecated).toBe(
        true,
      );
    });

    test("a deprecation older than `to` marks the symbol", () => {
      expect(windowedBadgeCategory(["1.13.0", "1.12.4"], "1.12.4", V3, window).isDeprecated).toBe(
        true,
      );
    });

    test("a deprecation absent from the axis stays Deprecated", () => {
      expect(windowedBadgeCategory(["1.13.0", "1.12.4"], "0.9.0", V3, window).isDeprecated).toBe(
        true,
      );
    });
  });

  describe("unresolvable bounds widen to the full axis", () => {
    const full = { from: "1.12.4", to: "1.14.0" };
    const widened = windowedBadgeCategory(["1.14.0"], undefined, V3, full);

    test("an untracked `from` widens rather than emptying the slice", () => {
      expect(
        windowedBadgeCategory(["1.14.0"], undefined, V3, { from: "9.9.9", to: "1.14.0" }),
      ).toEqual(widened);
    });

    test("an untracked `to` widens rather than emptying the slice", () => {
      expect(
        windowedBadgeCategory(["1.14.0"], undefined, V3, { from: "1.13.0", to: "9.9.9" }),
      ).toEqual(widened);
    });

    test("an inverted window widens rather than emptying the slice", () => {
      expect(
        windowedBadgeCategory(["1.14.0"], undefined, V3, { from: "1.14.0", to: "1.12.4" }),
      ).toEqual(widened);
    });
  });

  describe("either vocabulary is accepted on either side", () => {
    test("route-id bounds match bare-semver bounds", () => {
      const bare = windowedBadgeCategory(["1.14.0"], undefined, V3, {
        from: "1.13.0",
        to: "1.14.0",
      });
      expect(
        windowedBadgeCategory(["1.14.0"], undefined, V3, {
          from: "defold-1.13.0",
          to: "defold-1.14.0",
        }),
      ).toEqual(bare);
    });

    test("a route-id axis matches a bare-semver axis", () => {
      const bare = windowedBadgeCategory(["1.14.0"], undefined, V3, {
        from: "1.13.0",
        to: "1.14.0",
      });
      expect(
        windowedBadgeCategory(
          ["defold-1.14.0"],
          undefined,
          V3.map((v) => `defold-${v}`),
          { from: "1.13.0", to: "1.14.0" },
        ),
      ).toEqual(bare);
    });
  });
});

describe("functionBadgeCategory", () => {
  const AXIS = ["1.13.2", "1.13.1", "1.13.0", "1.12.4"];
  const full = { from: "1.12.4", to: "1.13.2" };
  const cat = (isNew: boolean, isChanged: boolean, isDeprecated = false) => ({
    isNew,
    isChanged,
    isDeprecated,
  });

  describe("a signature transition [through 1.13.1, since 1.13.2]", () => {
    const members = [{ availableIn: ["1.13.1", "1.13.0", "1.12.4"] }, { availableIn: ["1.13.2"] }];

    test("is Changed only at the full range", () => {
      expect(functionBadgeCategory(members, AXIS, full)).toEqual(cat(false, true));
    });

    test("carries no category in a window holding only the new form", () => {
      expect(functionBadgeCategory(members, AXIS, { from: "1.13.2", to: "1.13.2" })).toEqual(
        cat(false, false),
      );
    });
  });

  describe("a function added in 1.13.0 and changed in 1.13.2", () => {
    const members = [{ availableIn: ["1.13.1", "1.13.0"] }, { availableIn: ["1.13.2"] }];

    test("is New only at the full range", () => {
      expect(functionBadgeCategory(members, AXIS, full)).toEqual(cat(true, false));
    });

    test("is Changed only in a window starting after it appeared", () => {
      expect(functionBadgeCategory(members, AXIS, { from: "1.13.1", to: "1.13.2" })).toEqual(
        cat(false, true),
      );
    });
  });

  test("two members spanning the whole axis carry no category", () => {
    expect(
      functionBadgeCategory([{ availableIn: AXIS }, { availableIn: AXIS }], AXIS, full),
    ).toEqual(cat(false, false));
  });

  describe("deprecation answers for the function", () => {
    test("every member deprecated is Deprecated and not Changed", () => {
      const members = [
        { availableIn: AXIS, deprecatedSince: "1.13.1" },
        { availableIn: AXIS, deprecatedSince: "1.13.1" },
      ];
      expect(functionBadgeCategory(members, AXIS, full)).toEqual(cat(false, false, true));
    });

    test("one member deprecated is Changed and not Deprecated", () => {
      const members = [{ availableIn: AXIS, deprecatedSince: "1.13.1" }, { availableIn: AXIS }];
      expect(functionBadgeCategory(members, AXIS, full)).toEqual(cat(false, true, false));
    });
  });

  describe("members the window does not contain are ignored", () => {
    const window = { from: "1.13.0", to: "1.13.2" };

    test("an absent member neither bounds nor deprecates the function", () => {
      const members = [
        { availableIn: ["1.12.4"], deprecatedSince: "1.12.4" },
        { availableIn: ["1.13.2", "1.13.1", "1.13.0"] },
      ];
      expect(functionBadgeCategory(members, AXIS, window)).toEqual(cat(false, false));
    });

    test("no member present carries no category", () => {
      expect(functionBadgeCategory([{ availableIn: ["1.12.4"] }], AXIS, window)).toEqual(
        cat(false, false),
      );
      expect(functionBadgeCategory([], AXIS, window)).toEqual(cat(false, false));
    });
  });
});

describe("complete release snapshots", () => {
  interface RegistryTarget {
    id: string;
    default?: boolean;
    modules: { namespace: string }[];
    luaStdlib?: { namespace: string }[];
  }

  function registryTargets(): RegistryTarget[] {
    const { targets } = JSON.parse(
      readFileSync(join(REAL_TYPES_DIR, "api-targets.json"), "utf8"),
    ) as { targets: RegistryTarget[] };
    return targets;
  }

  // The materialized registry targets — the canonical default and the historical
  // previous release.
  // A ref-doc-sourced target with no committed fixtures is not a release
  // snapshot and is excluded by `versionsWithDiskFixtures`.
  const completeTargets = versionsWithDiskFixtures(REAL_TYPES_DIR);

  function pagesForCompleteTargets(): Record<string, ApiPage[]> {
    const pagesByVersion: Record<string, ApiPage[]> = {};
    for (const version of completeTargets) {
      pagesByVersion[version.id] = loadApiSurfaceForVersion(REAL_TYPES_DIR, version.id);
    }
    return pagesByVersion;
  }

  test("both complete targets are present: canonical default plus historical 1.12.4", () => {
    expect(completeTargets.filter((v) => v.isDefault)).toHaveLength(1);
    expect(completeTargets.some((v) => v.id === "defold-1.12.4" && !v.isDefault)).toBe(true);
  });

  test("every registry-declared engine module of each complete target materializes at its exact version route", () => {
    const targets = registryTargets();
    const pagesByVersion = pagesForCompleteTargets();
    for (const version of completeTargets) {
      const target = targets.find((t) => t.id === version.id);
      expect(target).toBeDefined();
      if (!target) continue;
      // Every version — the default included — now owns an explicit `/api/<id>/…`
      // engine family. Lua stdlib is version-independent and canonical-only, so it
      // is no longer part of any version's exact-route family.
      const declared = target.modules.map((m) => m.namespace);
      const routeByNamespace = new Map(
        pagesByVersion[version.id]?.map((p) => [p.namespace, p.route]),
      );
      for (const namespace of declared) {
        expect(routeByNamespace.get(namespace)).toBe(`/api/${version.id}/${namespace}`);
      }
    }
  });

  test("every version — the default included — serves its engine family under its own id prefix", () => {
    const defaultId = completeTargets.find((v) => v.isDefault)?.id as string;
    const canonicalVersion = loadApiSurfaceForVersion(REAL_TYPES_DIR, defaultId);
    const historical = loadApiSurfaceForVersion(REAL_TYPES_DIR, "defold-1.12.4");
    expect(canonicalVersion.find((p) => p.namespace === "go")?.route).toBe(`/api/${defaultId}/go`);
    expect(historical.find((p) => p.namespace === "go")?.route).toBe("/api/defold-1.12.4/go");
  });

  test("the canonical unprefixed surface serves Combined engine plus version-independent pages", () => {
    const canonical = canonicalApiPages(REAL_TYPES_DIR);
    expect(canonical.find((p) => p.namespace === "go")?.route).toBe("/api/go");
    expect(canonical.find((p) => p.namespace === "base")?.route).toBe("/api/base");
  });

  test("each complete target carries a human version label", () => {
    expect(versionLabel("defold-1.13.0")).toBe("Defold 1.13.0");
    expect(versionLabel("defold-1.12.4")).toBe("Defold 1.12.4");
  });
});

describe("rendered /api examples keep fence markers on block boundaries", () => {
  // Every line of `markdown` sitting strictly inside a fenced block.
  function interiorLines(markdown: string): string[] {
    const out: string[] = [];
    let inBlock = false;
    for (const line of markdown.split("\n")) {
      if (!inBlock) {
        if (line.startsWith("```")) inBlock = true;
        continue;
      }
      if (line.trim() === "```") {
        inBlock = false;
        continue;
      }
      out.push(line);
    }
    return out;
  }

  test("no example-bearing function renders a fence marker inside a code block", () => {
    const pages = canonicalApiPages(REAL_TYPES_DIR);
    const offenders: string[] = [];
    let examined = 0;
    for (const page of pages) {
      for (const fn of page.module.functions) {
        if (!fn.examples) continue;
        const md = exampleMarkdownFor(fn);
        if (md === undefined) continue;
        examined += 1;
        if (interiorLines(md).some((line) => line.trimStart().startsWith("```"))) {
          offenders.push(fn.name);
        }
      }
    }
    expect(examined).toBeGreaterThan(200);
    expect(offenders).toEqual([]);
  });
});

describe("canonical /api pages render every resolvable authored translation", () => {
  const pages = canonicalApiPages(REAL_TYPES_DIR).filter((page) => page.category === "engine");

  // The partition the resolver itself keys on, rebuilt from the same production
  // hashing primitives: a blob resolves when its segment hashes all resolve. A
  // single-example blob's one segment is the whole blob.
  const resolvesToStored = (fn: ApiFunction, store: TranslationStore): boolean => {
    if (!fn.examples) return false;
    return (
      lookupExampleTranslations(
        store,
        fn.name,
        splitExampleSources(fn.examples).map((segment) => hashExampleSource(segment.code)),
      ) !== null
    );
  };

  // One row per example-bearing function, with `resolvable` decided by the
  // resolver's own partition *before* the render, so a row never leaves the
  // partition because the render it is about to be judged on changed.
  type ExampleRow = { name: string; resolvable: boolean; md: string | undefined };

  const rowsFor = (storeOf: (page: ApiPage) => TranslationStore): ExampleRow[] => {
    const rows: ExampleRow[] = [];
    for (const page of pages) {
      const store = storeOf(page);
      for (const fn of page.module.functions) {
        if (!fn.examples) continue;
        rows.push({
          name: fn.name,
          resolvable: resolvesToStored(fn, store),
          md: exampleMarkdownFor(fn, store),
        });
      }
    }
    return rows;
  };

  // Every stored body kept under its own FQN with its own text, re-pinned to a
  // hash no ref-doc source produces: the drift the `sourceHash` pin exists to
  // catch, over the real corpus rather than an empty store.
  const misKeyedStore = (store: TranslationStore): TranslationStore =>
    Object.fromEntries(
      Object.entries(store).map(([fqn, entries]) => [
        fqn,
        entries.map((entry) => ({
          ...entry,
          sourceHash: hashExampleSource(`drifted:${entry.sourceHash}`),
        })),
      ]),
    );

  const rows = rowsFor((page) => page.translations);
  const misKeyedRows = rowsFor((page) => misKeyedStore(page.translations));

  test("every example-bearing function renders markdown", () => {
    expect(rows.filter((row) => row.md === undefined).map((row) => row.name)).toEqual([]);
  });

  // A per-segment rendering opens with the prose introducing its first example,
  // so the fence languages are the invariant, not the first line.
  const fenceLangs = (md: string | undefined): string[] =>
    [...(md ?? "").matchAll(/^```(\w+)$/gm)].map((m) => m[1] ?? "");

  test("a function whose stored hash resolves renders TypeScript throughout", () => {
    const resolvable = rows.filter((row) => row.resolvable);
    expect(
      resolvable
        .filter((row) => {
          const langs = fenceLangs(row.md);
          return langs.length === 0 || langs.some((lang) => lang !== "ts");
        })
        .map((row) => row.name),
    ).toEqual([]);
  });

  test("a mis-keyed store renders every example as Lua and none as TypeScript", () => {
    expect(misKeyedRows.filter((row) => row.md === undefined).map((row) => row.name)).toEqual([]);
    expect(
      misKeyedRows.filter((row) => !row.md?.includes("```lua")).map((row) => row.name),
    ).toEqual([]);
    expect(misKeyedRows.filter((row) => row.md?.includes("```ts")).map((row) => row.name)).toEqual(
      [],
    );
  });

  test("the resolvable set is non-trivial", () => {
    expect(rows.filter((row) => row.resolvable).length).toBeGreaterThan(200);
  });

  test("resource.set_texture renders on /api/resource what the versioned page renders", () => {
    const canonical = pages.find((page) => page.route === "/api/resource");
    // The canonical page is the current release's, so it matches that release's own page.
    const current = (
      JSON.parse(readFileSync(join(REAL_TYPES_DIR, "api-targets.json"), "utf8")) as {
        targets: { id: string; default?: boolean }[];
      }
    ).targets.find((target) => target.default === true)?.id;
    if (current === undefined) throw new Error("no default target");
    const versioned = loadApiSurfaceForVersion(REAL_TYPES_DIR, current).find(
      (page) => page.namespace === "resource",
    );
    expect(canonical).toBeDefined();
    expect(versioned).toBeDefined();
    if (!canonical || !versioned) return;
    const fnOf = (page: ApiPage) =>
      page.module.functions.find((fn) => fn.name === "resource.set_texture");
    const canonicalFn = fnOf(canonical);
    const versionedFn = fnOf(versioned);
    expect(canonicalFn).toBeDefined();
    expect(versionedFn).toBeDefined();
    if (!canonicalFn || !versionedFn) return;
    expect(exampleMarkdownFor(canonicalFn, canonical.translations)).toBe(
      exampleMarkdownFor(versionedFn, versioned.translations),
    );
  });
});

describe("rendered /api pages keep every symbol heading outside a code fence", () => {
  // Walk the render the way a Markdown parser does: a line opening a fence puts
  // everything after it inside the block until the matching close.
  const fenceScan = (md: string): { trapped: string[]; endsOpen: boolean } => {
    const trapped: string[] = [];
    let open = false;
    for (const line of md.split("\n")) {
      if (line.startsWith("```")) {
        open = !open;
        continue;
      }
      if (open && line.startsWith("### ")) trapped.push(line);
    }
    return { trapped, endsOpen: open };
  };

  const surfaces: { label: string; pages: ApiPage[] }[] = [
    { label: "canonical", pages: canonicalApiPages(REAL_TYPES_DIR) },
    ...versionsWithDiskFixtures(REAL_TYPES_DIR).map((version) => ({
      label: version.id,
      pages: loadApiSurfaceForVersion(REAL_TYPES_DIR, version.id),
    })),
  ];

  test.each(
    surfaces.map((surface) => [surface.label, surface] as const),
  )("%s: no symbol heading is swallowed by a fence", (_label, surface) => {
    const offenders: string[] = [];
    for (const page of surface.pages) {
      for (const heading of fenceScan(apiModuleMarkdown(page, page.translations)).trapped) {
        offenders.push(`${page.route}: ${heading}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test.each(
    surfaces.map((surface) => [surface.label, surface] as const),
  )("%s: no page render ends with a fence still open", (_label, surface) => {
    const offenders = surface.pages
      .filter((page) => fenceScan(apiModuleMarkdown(page, page.translations)).endsOpen)
      .map((page) => page.route);
    expect(offenders).toEqual([]);
  });
});

describe("rendered /api pages keep every list marker beside its value", () => {
  // A marker alone on its line renders as an empty bullet and drops the value
  // it described out of the list. Lines inside a fence are sample source.
  const strandedMarkers = (md: string): number[] => {
    const lines: number[] = [];
    let open = false;
    md.split("\n").forEach((line, index) => {
      if (line.startsWith("```")) {
        open = !open;
        return;
      }
      if (!open && line.trim() === "-") lines.push(index + 1);
    });
    return lines;
  };

  const surfaces: { label: string; pages: ApiPage[] }[] = [
    { label: "canonical", pages: canonicalApiPages(REAL_TYPES_DIR) },
    ...versionsWithDiskFixtures(REAL_TYPES_DIR).map((version) => ({
      label: version.id,
      pages: loadApiSurfaceForVersion(REAL_TYPES_DIR, version.id),
    })),
  ];

  test.each(
    surfaces.map((surface) => [surface.label, surface] as const),
  )("%s: no rendered list marker is left without a value", (_label, surface) => {
    const offenders: string[] = [];
    for (const page of surface.pages) {
      for (const line of strandedMarkers(apiModuleMarkdown(page, page.translations))) {
        offenders.push(`${page.route}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("rendered /api pages print characters, not entity source, inside code", () => {
  // Markdown decodes an entity in prose but prints it verbatim inside a code
  // span or a fence, so an undecoded one there reaches the reader as `&#x22C5;`.
  const ENTITY = /&(?:#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/;
  const entityCode = (md: string): string[] => {
    const found: string[] = [];
    let open = false;
    for (const line of md.split("\n")) {
      if (line.startsWith("```")) {
        open = !open;
        continue;
      }
      if (open) {
        if (ENTITY.test(line)) found.push(line);
        continue;
      }
      for (const [span] of line.matchAll(/`[^`]+`/g)) {
        if (ENTITY.test(span)) found.push(span);
      }
    }
    return found;
  };

  const surfaces: { label: string; pages: ApiPage[] }[] = [
    { label: "canonical", pages: canonicalApiPages(REAL_TYPES_DIR) },
    ...versionsWithDiskFixtures(REAL_TYPES_DIR).map((version) => ({
      label: version.id,
      pages: loadApiSurfaceForVersion(REAL_TYPES_DIR, version.id),
    })),
  ];

  test.each(
    surfaces.map((surface) => [surface.label, surface] as const),
  )("%s: no code span or fence holds an undecoded HTML entity", (_label, surface) => {
    const offenders: string[] = [];
    for (const page of surface.pages) {
      for (const code of entityCode(apiModuleMarkdown(page, page.translations))) {
        offenders.push(`${page.route}: ${code}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("overload grouping (committed artifacts)", () => {
  const combinedPages = loadCombinedSurface(REAL_TYPES_DIR).namespaces.map(
    combinedNamespaceToApiPage,
  );
  const functionRows = (page: ApiPage): ApiSymbol[] =>
    apiModuleSymbols(page, page.translations, page.signatures).filter((s) => s.kind === "function");

  test("groupFunctionRevisions places every form once, in first-appearance and input order", () => {
    let grouped = 0;
    let paired = 0;
    for (const page of combinedPages) {
      const rows = functionRows(page);
      const axis = page.availability?.versions ?? [];
      const groups = groupFunctionRevisions(rows, axis);
      const placed = groups.flatMap((group) =>
        [...group.forms, ...group.removed].flatMap((chain) => [
          chain.symbol,
          ...chain.predecessors.map((p) => p.symbol),
        ]),
      );
      expect(placed).toHaveLength(rows.length);
      expect(new Set(placed)).toEqual(new Set(rows));
      const live = groupOverloadForms(rows, axis);
      expect(live.flat()).toEqual(rows.filter((row) => live.flat().includes(row)));
      expect(live.map((g) => g[0]?.name)).toEqual([...new Set(rows.map((r) => r.name))]);
      for (const group of live) expect(new Set(group.map((s) => s.name)).size).toBe(1);
      grouped += live.filter((g) => g.length > 1).length;
      paired += groups.filter((g) => g.forms.some((f) => f.predecessors.length > 0)).length;
    }
    expect(grouped).toBeGreaterThan(0);
    expect(paired).toBeGreaterThan(0);
  });

  test("an overload heading carries the return type every form shares, and names the anchor", () => {
    const counts = { shared: 0, differing: 0 };
    for (const page of combinedPages) {
      for (const group of groupOverloadForms(
        functionRows(page),
        page.availability?.versions ?? [],
      )) {
        const [head] = group;
        if (group.length < 2 || head === undefined) continue;
        const returns = group.map((s) => splitCallForm(s).returns);
        const common = returns[0] ?? null;
        const shared = common !== null && returns.every((r) => r === common) ? common : "";
        expect({ name: head.name, heading: overloadHeading(group) }).toEqual({
          name: head.name,
          heading: `${head.name}(...)${shared}`,
        });
        expect(functionAnchorText(group)).toBe(overloadHeading(group));
        counts[shared ? "shared" : "differing"] += 1;
      }
    }
    expect(counts.shared).toBeGreaterThan(0);
    expect(counts.differing).toBeGreaterThan(0);
  });

  test("the function overview nests each group's forms under its heading link", () => {
    let grouped = 0;
    for (const page of combinedPages) {
      const rows = functionRows(page);
      if (rows.length === 0) continue;
      const axis = page.availability?.versions ?? [];
      const lines = functionOverviewCards(rows, axis)
        .split("\n")
        .filter((line) => /^\s*- /.test(line));
      const expected = groupOverloadForms(rows, axis).flatMap((group) => {
        const [head] = group;
        if (head === undefined) return [];
        if (group.length === 1) return [`- [\`${head.signature}\`](#${slugify(head.signature)})`];
        grouped += 1;
        const anchor = slugify(overloadHeading(group));
        const splits = group.map(splitCallForm);
        const sameReturns = new Set(splits.map((s) => s.returns)).size === 1;
        return [
          `- [\`${overloadHeading(group)}\` <span class="api-overload-count">${group.length} overloads</span>](#${anchor})`,
          ...splits.map(
            (s) =>
              `  - [\`${sameReturns ? s.params : `${s.params}${s.returns ?? ""}`}\`](#${anchor})`,
          ),
        ];
      });
      expect({ namespace: page.namespace, lines }).toEqual({
        namespace: page.namespace,
        lines: expected,
      });
    }
    expect(grouped).toBeGreaterThan(10);
  });

  test("splitCallForm round-trips every function signature and keeps a generic head in params", () => {
    const pages = [...combinedPages, ...loadApiSurface(REAL_TYPES_DIR)];
    let split = 0;
    let generic = 0;
    for (const page of pages) {
      for (const row of functionRows(page)) {
        const { params, returns } = splitCallForm(row);
        const call = /^[<(]/.test(row.signature.slice(row.name.length));
        if (!row.signature.startsWith(row.name) || !call) {
          expect({ params, returns }).toEqual({ params: row.signature, returns: null });
          continue;
        }
        expect(row.name + params + (returns ?? "")).toBe(row.signature);
        expect(params.endsWith(")")).toBe(true);
        if (row.signature[row.name.length] === "<") {
          expect(params.startsWith("<")).toBe(true);
          generic += 1;
        }
        split += 1;
      }
    }
    expect(split).toBeGreaterThan(1000);
    expect(generic).toBeGreaterThan(0);
  });

  test("a curried generic splits at the outer call list", () => {
    const row = fnSymbol("go.get", {
      signature: "go.get<P>(): <K extends keyof P>(url: Url, property: K) => P[K]",
    });
    expect(splitCallForm(row)).toEqual({
      params: "<P>()",
      returns: ": <K extends keyof P>(url: Url, property: K) => P[K]",
    });
  });
});

describe("groupFunctionRevisions", () => {
  const AXIS = ["1.13.2", "1.13.1", "1.13.0", "1.12.4"];
  const ALL = AXIS;
  const NEW = ["1.13.2"];
  const OLD = ["1.13.1", "1.13.0", "1.12.4"];
  // One form of `demo.fn`: its parameter list, its presence (none = no record)
  // and its return annotation.
  const form = (params: string, availableIn?: readonly string[], returns = ""): ApiSymbol => {
    const signature = `demo.fn(${params})${returns}`;
    return fnSymbol("demo.fn", {
      signature,
      ...(availableIn === undefined
        ? {}
        : {
            availability: {
              identity: { namespace: "demo", kind: "FUNCTION", name: "demo.fn", signature },
              availableIn,
            },
          }),
    });
  };
  const shape = (symbols: ApiSymbol[], axis: readonly string[] = AXIS) =>
    groupFunctionRevisions(symbols, axis).map((group) => ({
      forms: group.forms.map((f) => ({
        symbol: f.symbol.signature,
        predecessors: f.predecessors.map((p) => [p.symbol.signature, p.boundary]),
      })),
      removed: group.removed.map((f) => ({
        symbol: f.symbol.signature,
        boundary: f.boundary,
        predecessors: f.predecessors.map((p) => [p.symbol.signature, p.boundary]),
      })),
    }));

  test("a retype is one form whose predecessor is the replaced form", () => {
    const old = form("", OLD, ": X");
    const current = form("", NEW, ": X | undefined");
    const [group, ...rest] = groupFunctionRevisions([old, current], AXIS);
    expect(rest).toEqual([]);
    expect(group?.forms).toHaveLength(1);
    expect(group?.forms[0]?.symbol).toBe(current);
    expect(group?.forms[0]?.predecessors).toEqual([{ symbol: old, boundary: "1.13.2" }]);
    expect(group?.removed).toEqual([]);
    expect(functionAnchorText(groupOverloadForms([old, current], AXIS)[0] ?? [])).toBe(
      current.signature,
    );
  });

  test.each([
    ["a parameter retype", form("a: number", OLD), form("a: string", NEW)],
    ["an optional parameter added", form("a: number", OLD), form("a: number, b?: number", NEW)],
    ["a parameter rename", form("a: number", OLD), form("b: number", NEW)],
  ])("%s pairs its one ender with its one starter", (_label, old, current) => {
    expect(shape([old, current])).toEqual([
      {
        forms: [{ symbol: current.signature, predecessors: [[old.signature, "1.13.2"]] }],
        removed: [],
      },
    ]);
  });

  test("an ambiguous boundary pairs by parameter-name list", () => {
    const oldA = form("a: number", OLD);
    const oldAB = form("a: number, b: number", OLD);
    const newA = form("a: string", NEW);
    const newAB = form("a: string, b: string", NEW);
    expect(shape([oldA, oldAB, newA, newAB])).toEqual([
      {
        forms: [
          { symbol: newA.signature, predecessors: [[oldA.signature, "1.13.2"]] },
          { symbol: newAB.signature, predecessors: [[oldAB.signature, "1.13.2"]] },
        ],
        removed: [],
      },
    ]);
  });

  test("an ambiguous boundary whose name lists all match pairs nothing", () => {
    const enders = [form("a: number", OLD), form("a: boolean", OLD)];
    const starters = [form("a: string", NEW), form("a: Hash", NEW)];
    expect(shape([...enders, ...starters])).toEqual([
      {
        forms: starters.map((s) => ({ symbol: s.signature, predecessors: [] })),
        removed: enders.map((e) => ({ symbol: e.signature, boundary: "1.13.2", predecessors: [] })),
      },
    ]);
  });

  test("a form added beside a form present everywhere is a second live form", () => {
    const added = form("name: string", NEW);
    const always = form("name: number", ALL);
    expect(shape([added, always])).toEqual([
      {
        forms: [
          { symbol: added.signature, predecessors: [] },
          { symbol: always.signature, predecessors: [] },
        ],
        removed: [],
      },
    ]);
  });

  test("a form that stops early is a removed chain at the next newer version", () => {
    const always = form("a: number", ALL);
    const gone = form("a: number, b: number", ["1.13.0", "1.12.4"]);
    expect(shape([always, gone])).toEqual([
      {
        forms: [{ symbol: always.signature, predecessors: [] }],
        removed: [{ symbol: gone.signature, boundary: "1.13.1", predecessors: [] }],
      },
    ]);
  });

  test("overlapping spans, a gap and a form with no record never pair", () => {
    const overlapNew = form("a: string", ["1.13.2", "1.13.1"]);
    const overlapOld = form("a: number", OLD);
    expect(shape([overlapNew, overlapOld])).toEqual([
      {
        forms: [{ symbol: overlapNew.signature, predecessors: [] }],
        removed: [{ symbol: overlapOld.signature, boundary: "1.13.2", predecessors: [] }],
      },
    ]);
    const gapNew = form("a: string", NEW);
    const gapOld = form("a: number", ["1.13.0", "1.12.4"]);
    expect(shape([gapNew, gapOld])).toEqual([
      {
        forms: [{ symbol: gapNew.signature, predecessors: [] }],
        removed: [{ symbol: gapOld.signature, boundary: "1.13.1", predecessors: [] }],
      },
    ]);
    const unrecorded = form("a: number");
    const starter = form("a: string", NEW);
    expect(shape([unrecorded, starter])).toEqual([
      {
        forms: [
          { symbol: unrecorded.signature, predecessors: [] },
          { symbol: starter.signature, predecessors: [] },
        ],
        removed: [],
      },
    ]);
  });

  test("an empty axis returns every form as its own live form", () => {
    const old = form("", OLD, ": X");
    const current = form("", NEW, ": X | undefined");
    expect(shape([old, current], [])).toEqual([
      {
        forms: [
          { symbol: old.signature, predecessors: [] },
          { symbol: current.signature, predecessors: [] },
        ],
        removed: [],
      },
    ]);
  });

  test("adjacent spans chain into one live form, predecessors newest first", () => {
    const oldest = form("", ["1.12.4"], ": A");
    const middle = form("", ["1.13.1", "1.13.0"], ": B");
    const newest = form("", NEW, ": C");
    expect(shape([oldest, newest, middle])).toEqual([
      {
        forms: [
          {
            symbol: newest.signature,
            predecessors: [
              [middle.signature, "1.13.2"],
              [oldest.signature, "1.13.0"],
            ],
          },
        ],
        removed: [],
      },
    ]);
  });

  test("groups by name in first-appearance order and groupOverloadForms keeps the live forms", () => {
    const other = fnSymbol("demo.other");
    const symbols = [form("", OLD, ": X"), other, form("", NEW, ": X | undefined")];
    const groups = groupFunctionRevisions(symbols, AXIS);
    expect(groups.map((g) => g.forms[0]?.symbol.name)).toEqual(["demo.fn", "demo.other"]);
    expect(groupOverloadForms(symbols, AXIS)).toEqual(
      groups.map((g) => g.forms.map((f) => f.symbol)),
    );
    expect(groupOverloadForms(symbols, AXIS)[0]).toEqual([symbols[2] as ApiSymbol]);
  });
});

describe("functionOverviewCards over overload groups", () => {
  test("renders one card per grouped name, nesting one item per form under the group heading", () => {
    const shape = "b2d.shape.get_shape";
    const single = fnSymbol("go.get_position", { signature: "go.get_position(): vector3" });
    const forms = [
      fnSymbol(shape, { signature: `${shape}(shape_id: number): Info` }),
      fnSymbol(shape, { signature: `${shape}(body: Opaque<"b2Body">, shape_index: number): Info` }),
    ];
    const cards = functionOverviewCards([...forms, single], []);
    const heading = `${shape}(...): Info`;
    expect(overloadHeading(forms)).toBe(heading);
    expect(cards.split("\n").filter((line) => /^\s*- /.test(line))).toEqual([
      `- [\`${heading}\` <span class="api-overload-count">2 overloads</span>](#${slugify(heading)})`,
      `  - [\`(shape_id: number)\`](#${slugify(heading)})`,
      `  - [\`(body: Opaque<"b2Body">, shape_index: number)\`](#${slugify(heading)})`,
      ...functionOverviewCards([single], [])
        .split("\n")
        .filter((line) => line.startsWith("- ")),
    ]);
  });

  test("a group whose forms return different types heads without a return and keeps it per form", () => {
    const forms = [
      fnSymbol("vmath.lerp", {
        signature: "vmath.lerp(t: number, n1: number, n2: number): number",
      }),
      fnSymbol("vmath.lerp", {
        signature: "vmath.lerp(t: number, v1: Vector3, v2: Vector3): Vector3",
      }),
    ];
    expect(overloadHeading(forms)).toBe("vmath.lerp(...)");
    expect(overloadFormCodes(forms)).toEqual([
      "(t: number, n1: number, n2: number): number",
      "(t: number, v1: Vector3, v2: Vector3): Vector3",
    ]);
  });

  test("a group whose forms return nothing heads without a return", () => {
    const forms = [
      fnSymbol("msg.post", { signature: "msg.post(receiver: Url, id: Hash): void" }),
      fnSymbol("msg.post", { signature: "msg.post(receiver: Url)" }),
    ];
    expect(overloadHeading(forms)).toBe("msg.post(...)");
    expect(overloadHeading([forms[1] as ApiSymbol, forms[1] as ApiSymbol])).toBe("msg.post(...)");
  });

  test("the anchor text is the single form's signature or the overload heading", () => {
    const one = fnSymbol("go.get_position", { signature: "go.get_position(): vector3" });
    const group = [one, { ...one, signature: "go.get_position(id: Hash): vector3" }];
    expect(functionAnchorText([one])).toBe(one.signature);
    expect(functionAnchorText(group)).toBe(overloadHeading(group));
    expect(overloadHeading(group)).toBe("go.get_position(...): vector3");
  });
});

describe("authored arm availability on the API pages (committed artifacts)", () => {
  const combined = loadCombinedSurface(REAL_TYPES_DIR);
  const store = combined.signatureStore?.["gui.set"];
  const gate = store?.since?.findIndex((since) => since !== null) ?? -1;
  const since = store?.since?.[gate] as string;
  const removal = store?.signatures[gate] as string;
  const atOrAfterSince = (version: string): boolean => compareSemverDesc(version, since) <= 0;
  const guiSetRows = (page: ApiPage | undefined): ApiSymbol[] =>
    page
      ? apiModuleSymbols(page, page.translations, page.signatures).filter(
          (symbol) => symbol.kind === "function" && symbol.name === "gui.set",
        )
      : [];

  test("the Combined gui page dates the gui.set removal row from its store since", () => {
    expect(removal).toContain("value: undefined");
    const page = combinedApiPages(combined).find((p) => p.namespace === "gui");
    const rows = guiSetRows(page);
    expect(rows.map((row) => row.signature)).toEqual(store?.signatures ?? []);
    for (const row of rows) {
      // A row with no record is present on the whole axis, as the page renders it.
      const presentIn = row.availability?.availableIn?.length
        ? row.availability.availableIn
        : combined.versions;
      expect({ row: row.signature, presentIn }).toEqual({
        row: row.signature,
        presentIn:
          row.signature === removal ? combined.versions.filter(atOrAfterSince) : combined.versions,
      });
    }
  });

  test("an exact-version gui page lists the removal row only from its store since", () => {
    const seen = new Set<boolean>();
    for (const version of versionsWithDiskFixtures(REAL_TYPES_DIR)) {
      const bare = version.id.replace(/^defold-/, "");
      const page = loadApiSurfaceForVersion(REAL_TYPES_DIR, version.id).find(
        (p) => p.namespace === "gui",
      );
      const rows = guiSetRows(page).map((row) => row.signature);
      expect(rows.length).toBeGreaterThan(0);
      expect({ version: bare, removal: rows.includes(removal) }).toEqual({
        version: bare,
        removal: atOrAfterSince(bare),
      });
      seen.add(atOrAfterSince(bare));
    }
    expect([...seen].sort()).toEqual([false, true]);
  });

  test("a versioned gui route lists the removal row only from its store since", () => {
    const axis = combined.versions;
    const oldest = axis[axis.length - 1] as string;
    const shared = (store?.signatures ?? []).filter((_, index) => store?.since?.[index] == null);
    expect(shared.length).toBeGreaterThan(0);
    const seen = new Set<boolean>();
    for (const to of axis) {
      const page = windowedApiPages({ from: oldest, to }, REAL_TYPES_DIR).find(
        (p) => p.namespace === "gui",
      );
      const rows = guiSetRows(page).map((row) => row.signature);
      expect({
        to,
        removal: rows.includes(removal),
        shared: shared.filter((arm) => !rows.includes(arm)),
      }).toEqual({
        to,
        removal: atOrAfterSince(to),
        shared: [],
      });
      seen.add(atOrAfterSince(to));
    }
    expect([...seen].sort()).toEqual([false, true]);
  });
});

describe("defoldTypeRef", () => {
  test("agrees with every runtime Open in Browser link the reference annotations carry", () => {
    const target = loadApiTargets().find((candidate) => candidate.default === true);
    if (target === undefined) throw new Error("api-targets.json has no default target");
    const annotations = loadAnnotations(target);
    const engine = canonicalApiPages(REAL_TYPES_DIR).filter((page) => page.category === "engine");
    // Every entry the engine pages give the name: `b2Body` is on both `b2d` and
    // `b2d.body`, while upstream links one.
    const entries = (name: string): string[] =>
      engine.flatMap(({ module }) =>
        [...(module.enums ?? []), ...(module.structs ?? []), ...module.typedefs]
          .filter((element) => element.name === name)
          .map((element) => defoldTypeRef(module, element).url),
      );
    const undeclared: string[] = [];
    const mismatched: string[] = [];
    let agreed = 0;
    for (const declaration of [
      ...annotations.aliases.values(),
      ...annotations.enums.values(),
      ...annotations.classes.values(),
    ]) {
      const { name, url } = declaration;
      if (declaration.surface !== "runtime" || url === undefined) continue;
      const given = entries(name);
      if (given.length === 0) {
        undeclared.push(`${name} ${url}`);
      } else if (given.includes(url)) {
        agreed++;
      } else {
        mismatched.push(`${name} ${url} given ${given.join(", ")}`);
      }
    }
    expect(mismatched).toEqual([]);
    expect(agreed).toBeGreaterThan(0);
    expect(undeclared.sort()).toEqual([
      "hash https://defold.com/ref/builtins-lua#hash",
      "script_instance https://defold.com/ref/builtins-lua#script_instance",
    ]);
  });
});
