import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ApiAvailability,
  type ApiFunction,
  hashExampleSource,
  htmlToCodeText,
  normalizedFunctionSignature,
  parseDefoldApiDoc,
  type SignatureStore,
  symbolIdentityKey,
} from "@defold-typescript/types";
import { canonicalApiPages } from "./api-content";
import {
  type ApiPage,
  type ApiSymbol,
  type AvailabilityLookup,
  apiModuleMarkdown,
  apiModuleSymbols,
  badgeCategory,
  exampleMarkdownFor,
  functionOverviewCards,
  groupFunctionSymbols,
  mapDocType,
  outerCallArity,
} from "./api-surface";
import {
  libraryModuleDirs,
  libraryOriginByNamespace,
  libraryRouteSlug,
  listApiVersions,
  loadApiSurface,
  loadApiSurfaceForVersion,
  loadCombinedSurface,
  versionsWithDiskFixtures,
} from "./api-surface-loader";
import { combinedNamespaceToApiPage } from "./combined-surface";
import { pageHeadings } from "./headings";
import { renderMarkdown } from "./markdown";
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

const FIXTURE_DIR = join(import.meta.dir, "__fixtures__/api-surface");
const NO_GLOBALS_FIXTURE_DIR = join(import.meta.dir, "__fixtures__/api-surface-no-globals");
const MISSING_VERSION_FIXTURE_DIR = join(
  import.meta.dir,
  "__fixtures__/api-surface-missing-version",
);
const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");
const REAL_LIBRARY_TYPES_DIR = join(import.meta.dir, "../../../library-types");

// The ten `britzl/defold-input` modules, severed together into the authored lane.
const DEFOLD_INPUT_MODULES = [
  "accelerometer",
  "button",
  "cursor",
  "gesture",
  "keyboard",
  "mapper",
  "onscreen",
  "state",
  "textbox",
  "triggers",
];

// The three `britzl/defold-richtext` modules, severed together into the authored
// lane. Their classification dir is `defold-richtext` but their top namespace
// segment is `richtext`, so the severance regroups them.
const RICHTEXT_MODULES = ["color", "richtext", "tags"];

// The two `britzl/defold-metrics` modules, severed together into the authored
// lane. Their classification dir is `defold-metrics` against a `metrics` top
// namespace segment, so the severance regroups them the way richtext's did.
const METRICS_MODULES = ["fps", "mem"];

// Every `api-doc/*.json` fixture that also has a vendored `generated/*.d.ts`
// sibling — the exact set the loader is expected to surface as `library` pages.
// A markdown-front-end target whose recorded fidelity `decision` is not `go`
// stays ts-defold-sourced; its golden is a regeneration proof, not a published
// page, so it is excluded here exactly as the loader excludes it.
function markdownDeferredNamespaces(): Set<string> {
  const path = join(REAL_LIBRARY_TYPES_DIR, "markdown-targets.json");
  if (!existsSync(path)) return new Set();
  const { targets } = JSON.parse(readFileSync(path, "utf8")) as {
    targets: { namespace: string; decision?: string }[];
  };
  return new Set(targets.filter((t) => t.decision !== "go").map((t) => t.namespace));
}

function vendoredLibraryModules(): string[] {
  const apiDocDir = join(REAL_LIBRARY_TYPES_DIR, "api-doc");
  const deferred = markdownDeferredNamespaces();
  return readdirSync(apiDocDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .filter((mod) => existsSync(join(REAL_LIBRARY_TYPES_DIR, "generated", `${mod}.d.ts`)))
    .filter((mod) => !deferred.has(mod));
}

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

  // `library-targets.json` reached zero rows, so nothing shipping is
  // ts-defold-sourced any more and the still-vendored exemplar this test used to
  // carry (it was `monarch.monarch`, then `gooey.gooey`, then `nakama.nakama`)
  // has no subject left. The inverse is the honest real-corpus claim; the
  // vendored branch keeps a witness against the fixture corpus in
  // `api-surface-loader.test.ts`.
  test("no library page is ts-defold-sourced any more", () => {
    expect(libraryPages.length).toBeGreaterThan(0);
    for (const page of libraryPages) {
      const meta = page.libraryMeta;
      expect(meta).toBeDefined();
      expect(meta?.authoredHere).toBe(true);
      expect(meta?.commit).not.toBe("2fe3aed3352a913d2859e6e85d34a8b23d821368");
      expect(meta?.sourceUrl ?? "").not.toContain("ts-defold/library");
    }
  });

  test("builds a structured libraryMeta with author/upstream repo, tag pin, import, and license", () => {
    const nakama = libraryPages.find((p) => p.namespace === "nakama");
    expect(nakama).toBeDefined();
    expect(nakama?.route).toBe("/api/nakama");
    const meta = nakama?.libraryMeta;
    expect(meta).toBeDefined();
    if (!meta) return;
    expect(meta.authoredHere).toBe(true);
    expect(meta.authorUrl).toBe("https://github.com/heroiclabs/nakama-defold");
    expect(meta.commit).toBe("v3.4.0");
    // The bare namespace changes the route but not the import: the alias was
    // already derived as `nakama` from the dotted namespace.
    expect(meta.importString).toBe('import * as nakama from "nakama.nakama"');
    expect(meta.license).toBe("Apache-2.0");
    expect("commitUrl" in meta).toBe(false);
    expect("attribution" in meta).toBe(false);
  });

  test("the nakama page keeps a description once its classification dir is gone", () => {
    const nakama = libraryPages.find((p) => p.namespace === "nakama");
    expect(nakama).toBeDefined();
    // The module JSDoc is `@see` + `@noResolution` only, so the intro comes from
    // the description fallback. With no `nakama-defold` dir left, the fallback
    // keys on the namespace and only the override supplies it. The
    // `nakama.nakama` half is what catches a half-finished cutover that kept the
    // dotted module mapped to its old dir.
    const dirs = libraryModuleDirs(REAL_LIBRARY_TYPES_DIR);
    expect(dirs.has("nakama.nakama")).toBe(false);
    expect(dirs.has("nakama")).toBe(false);
    expect((nakama?.module.description ?? "").length).toBeGreaterThan(0);
  });

  // orthographic severed to the authored lane under its dotted namespace, so its
  // pin swings from the shared ts-defold/library commit to the upstream tag while
  // the route and import string stay byte-identical.
  test("a severed library's libraryMeta pins upstream and keeps its import string", () => {
    const camera = libraryPages.find((p) => p.namespace === "orthographic.camera");
    expect(camera).toBeDefined();
    const meta = camera?.libraryMeta;
    expect(meta).toBeDefined();
    if (!meta) return;
    expect(meta.authoredHere).toBe(true);
    expect(meta.authorUrl).toBe("https://github.com/britzl/defold-orthographic");
    expect(meta.commit).toBe("3.6.3");
    expect(meta.importString).toBe('import * as camera from "orthographic.camera"');
  });

  // monarch severed all three modules under their dotted namespaces, so nothing
  // consumer-visible moves: same routes, same import strings, same descriptions
  // and the same `britzl / monarch · <leaf>` grouping — only the pin banner
  // flips from the shared ts-defold commit to the upstream tag.
  test("the three severed monarch pages keep route, import string and display name", () => {
    const LEAVES: Record<string, string> = {
      "monarch.monarch": "monarch",
      "monarch.transitions.easings": "transitions_easings",
      "monarch.transitions.gui": "transitions_gui",
    };
    for (const [namespace, alias] of Object.entries(LEAVES)) {
      const page = libraryPages.find((p) => p.namespace === namespace);
      expect(page).toBeDefined();
      if (!page) continue;
      expect(page.route).toBe(`/api/${namespace}`);
      // Every module keeps a description: two carry their own doc comment, and
      // `transitions.easings` has an empty one, so it reads through the override.
      expect(page.module.description).not.toBe("");
      expect(page.displayName).toContain("britzl / monarch");
      const meta = page.libraryMeta;
      expect(meta).toBeDefined();
      if (!meta) continue;
      expect(meta.authoredHere).toBe(true);
      expect(meta.authorUrl).toBe("https://github.com/britzl/monarch");
      expect(meta.commit).toBe("6.0.2");
      expect(meta.importString).toBe(`import * as ${alias} from "${namespace}"`);
    }
  });

  // yagames severed under the *bare* namespace, so unlike orthographic its route
  // moves (`/api/yagames.yagames` -> `/api/yagames`) while the import string is
  // still byte-identical: the alias comes from the namespace's trailing segment
  // and the path from the unchanged `moduleId`.
  test("a bare-namespace severed library moves its route but keeps its import string", () => {
    const yagames = libraryPages.find((p) => p.namespace === "yagames");
    expect(yagames).toBeDefined();
    expect(yagames?.route).toBe("/api/yagames");
    const meta = yagames?.libraryMeta;
    expect(meta).toBeDefined();
    if (!meta) return;
    expect(meta.authoredHere).toBe(true);
    expect(meta.authorUrl).toBe("https://github.com/indiesoftby/defold-yagames");
    expect(meta.commit).toBe("0.19.0");
    expect(meta.importString).toBe('import * as yagames from "yagames.yagames"');
  });

  // starly severed under the bare namespace like yagames, and is the corpus's one
  // `export =` surface — so this also proves the handle's members survive the
  // authored lane far enough to render a page at all.
  test("the severed export-handle library renders as maintained-here at its pin", () => {
    const starly = libraryPages.find((p) => p.namespace === "starly");
    expect(starly).toBeDefined();
    expect(starly?.route).toBe("/api/starly");
    const meta = starly?.libraryMeta;
    expect(meta).toBeDefined();
    if (!meta) return;
    expect(meta.authoredHere).toBe(true);
    expect(meta.authorUrl).toBe("https://github.com/VowSoftware/starly");
    expect(meta.commit).toBe("85d1b2af8bf0618e7f297da41d03eb55d27e49b6");
    expect(meta.importString).toBe('import * as starly from "starly.starly"');
  });

  // defold-input severed all ten modules at once under `namespace === moduleId`,
  // so unlike every prior severance no page moved: the routes and import strings
  // are the ones the ts-defold rows already published, and only the provenance
  // flips to maintained-here.
  test("the ten severed in.* pages keep their routes and import strings as maintained-here", () => {
    for (const mod of DEFOLD_INPUT_MODULES) {
      const namespace = `in.${mod}`;
      const page = libraryPages.find((p) => p.namespace === namespace);
      expect(page).toBeDefined();
      expect(page?.route).toBe(`/api/${namespace}`);
      const meta = page?.libraryMeta;
      expect(meta).toBeDefined();
      expect(meta?.authoredHere).toBe(true);
      expect(meta?.authorUrl).toBe("https://github.com/britzl/defold-input");
      expect(meta?.commit).toBe("4.7.1");
      expect(meta?.importString).toBe(`import * as ${mod} from "${namespace}"`);
    }
  });

  // The one user-visible movement the severance does cause: dropping the
  // classification dir moves the group key onto the recorded GitHub origin. The
  // ten group under `defold-input` — the repo a user installs — not under the
  // `in` namespace prefix the dir used to stand in for.
  test("the ten group under the britzl/defold-input origin, with no defold-input dir left", () => {
    const dirs = libraryModuleDirs(REAL_LIBRARY_TYPES_DIR);
    const origins = libraryOriginByNamespace(REAL_LIBRARY_TYPES_DIR);
    for (const mod of DEFOLD_INPUT_MODULES) {
      expect(origins.get(`in.${mod}`)).toEqual({ owner: "britzl", repo: "defold-input" });
    }
    for (const page of libraryPages) {
      expect(dirs.get(page.namespace)).not.toBe("defold-input");
    }
  });

  // richtext severed all three modules under `namespace === moduleId` too, so
  // again no route or import string moves — only the provenance flips.
  test("the three severed richtext.* pages keep their routes and import strings as maintained-here", () => {
    for (const mod of RICHTEXT_MODULES) {
      const namespace = `richtext.${mod}`;
      const page = libraryPages.find((p) => p.namespace === namespace);
      expect(page).toBeDefined();
      expect(page?.route).toBe(`/api/${namespace}`);
      const meta = page?.libraryMeta;
      expect(meta).toBeDefined();
      expect(meta?.authoredHere).toBe(true);
      expect(meta?.authorUrl).toBe("https://github.com/britzl/defold-richtext");
      expect(meta?.commit).toBe("5.22.1");
      expect(meta?.importString).toBe(`import * as ${mod} from "${namespace}"`);
    }
  });

  // richtext's repo name and namespace prefix differ, so the origin-keyed group is
  // `defold-richtext` while the modules still import as `richtext.*`.
  test("the three group under the britzl/defold-richtext origin, with no defold-richtext dir left", () => {
    const dirs = libraryModuleDirs(REAL_LIBRARY_TYPES_DIR);
    const origins = libraryOriginByNamespace(REAL_LIBRARY_TYPES_DIR);
    for (const page of libraryPages) {
      expect(dirs.get(page.namespace)).not.toBe("defold-richtext");
    }
    // Three modules in the group and no leaf repeats the repo name, so every page
    // keeps the `· <leaf>` distinguisher.
    for (const mod of RICHTEXT_MODULES) {
      expect(origins.get(`richtext.${mod}`)).toEqual({ owner: "britzl", repo: "defold-richtext" });
      const page = libraryPages.find((p) => p.namespace === `richtext.${mod}`);
      expect(page?.displayName).toBe(`britzl / defold-richtext · ${mod}`);
    }
  });

  // metrics severed under `namespace === moduleId` as well, so nothing a user
  // imports moves here either.
  test("the two severed metrics.* pages keep their routes and import strings as maintained-here", () => {
    for (const mod of METRICS_MODULES) {
      const namespace = `metrics.${mod}`;
      const page = libraryPages.find((p) => p.namespace === namespace);
      expect(page).toBeDefined();
      expect(page?.route).toBe(`/api/${namespace}`);
      const meta = page?.libraryMeta;
      expect(meta).toBeDefined();
      expect(meta?.authoredHere).toBe(true);
      expect(meta?.authorUrl).toBe("https://github.com/britzl/defold-metrics");
      expect(meta?.commit).toBe("1.2.1");
      expect(meta?.importString).toBe(`import * as ${mod} from "${namespace}"`);
    }
  });

  // `defold-metrics` differs from the `metrics` namespace segment, so the group key
  // is the repo exactly as richtext's is. Neither leaf repeats the repo name, so
  // both pages keep the `· <leaf>` distinguisher.
  test("the two group under the britzl/defold-metrics origin, with no defold-metrics dir left", () => {
    const dirs = libraryModuleDirs(REAL_LIBRARY_TYPES_DIR);
    const origins = libraryOriginByNamespace(REAL_LIBRARY_TYPES_DIR);
    for (const page of libraryPages) {
      expect(dirs.get(page.namespace)).not.toBe("defold-metrics");
    }
    for (const mod of METRICS_MODULES) {
      expect(origins.get(`metrics.${mod}`)).toEqual({ owner: "britzl", repo: "defold-metrics" });
      const page = libraryPages.find((p) => p.namespace === `metrics.${mod}`);
      expect(page?.displayName).toBe(`britzl / defold-metrics · ${mod}`);
    }
  });

  // The authored correction is only worth anything if it reaches the page a user
  // reads, so this asserts the three module-level members upstream defines are
  // listed alongside the factory — the instance methods stay on the `Metrics`
  // typedef and are deliberately not part of this list.
  test("each severed metrics.* page lists the corrected module-level members", () => {
    for (const mod of METRICS_MODULES) {
      const page = libraryPages.find((p) => p.namespace === `metrics.${mod}`);
      expect((page?.module.functions ?? []).map((f) => f.name).sort()).toEqual(
        ["create", "draw", mod, "update"].sort(),
      );
    }
  });

  // gooey severed under the bare namespace, so its route moves
  // (`/api/gooey.gooey` -> `/api/gooey`) while the import string stays
  // byte-identical. The severance also carries an arity correction, and the page
  // is where a reader would see it, so `group`'s four parameters are asserted on
  // the rendered surface rather than only in the `.d.ts`.
  test("the severed gooey page is maintained-here at its tag and lists the corrected group arity", () => {
    const gooey = libraryPages.find((p) => p.namespace === "gooey");
    expect(gooey).toBeDefined();
    expect(gooey?.route).toBe("/api/gooey");
    const meta = gooey?.libraryMeta;
    expect(meta).toBeDefined();
    if (!meta) return;
    expect(meta.authoredHere).toBe(true);
    expect(meta.authorUrl).toBe("https://github.com/britzl/gooey");
    expect(meta.commit).toBe("10.5.3");
    expect(meta.importString).toBe('import * as gooey from "gooey.gooey"');

    const group = (gooey?.module.functions ?? []).find((f) => f.name === "group");
    expect(group).toBeDefined();
    expect((group?.parameters ?? []).map((p) => p.name)).toEqual([
      "group_id",
      "action_id",
      "action",
      "group_fn",
    ]);
  });

  // bzAnim severs under the bare namespace too, but unlike gooey its import
  // *alias* moves: `libraryImportString` derives the alias from the page
  // namespace, so `bzAnim.bzLibrary` -> `bzAnim` renames the binding while the
  // module path stays byte-identical. The severance lands no correction, so the
  // page's proof is the hand-written options tables the fork exists to keep.
  test("the severed bzAnim page is maintained-here at its tag, keeps its module path, and documents its options tables", () => {
    const bzAnim = libraryPages.find((p) => p.namespace === "bzAnim");
    expect(bzAnim).toBeDefined();
    expect(bzAnim?.route).toBe("/api/bzAnim");
    const meta = bzAnim?.libraryMeta;
    expect(meta).toBeDefined();
    if (!meta) return;
    expect(meta.authoredHere).toBe(true);
    expect(meta.authorUrl).toBe("https://github.com/jbp4444/bzAnim");
    expect(meta.commit).toBe("v.1.2");
    expect(meta.license).toBe("Apache-2.0");
    expect(meta.importString).toBe('import * as bzAnim from "bzAnim.bzLibrary"');

    const animate = (bzAnim?.module.functions ?? []).find((f) => f.name === "animate");
    expect(animate).toBeDefined();
    expect((animate?.parameters ?? []).map((p) => p.types?.join("|"))).toEqual(["AnimateArgs"]);

    const typedefs = bzAnim?.module.typedefs ?? [];
    for (const name of ["AnimateArgs", "AnimateSequenceArgs"]) {
      const typedef = typedefs.find((t) => t.name === name);
      expect(typedef).toBeDefined();
      expect((typedef?.properties ?? []).map((p) => p.name)).toContain("easing");
    }
  });

  // platypus is the first bare-namespace severance that moves neither the import
  // alias nor the module path: `libraryImportString` already derived the alias
  // `platypus` from the dotted namespace's second segment, so the documented
  // binding is byte-identical on both sides of the cutover. The severance lands no
  // correction, so the page's proof is the config and instance shapes the fork
  // exists to keep — neither of which any generated source documents.
  test("the severed platypus page is maintained-here at its tag, keeps its import binding, and documents both interfaces", () => {
    const platypus = libraryPages.find((p) => p.namespace === "platypus");
    expect(platypus).toBeDefined();
    expect(platypus?.route).toBe("/api/platypus");
    const meta = platypus?.libraryMeta;
    expect(meta).toBeDefined();
    if (!meta) return;
    expect(meta.authoredHere).toBe(true);
    expect(meta.authorUrl).toBe("https://github.com/britzl/platypus");
    expect(meta.commit).toBe("4.3.1");
    expect(meta.license).toBe("MIT");
    expect(meta.importString).toBe('import * as platypus from "platypus.platypus"');

    const create = (platypus?.module.functions ?? []).find((f) => f.name === "create");
    expect(create).toBeDefined();
    expect((create?.parameters ?? []).map((p) => p.types?.join("|"))).toEqual(["PlatypusConfig"]);
    expect((create?.returnValues ?? []).map((r) => r.types?.join("|"))).toEqual([
      "PlatypusInstance",
    ]);

    const typedefs = platypus?.module.typedefs ?? [];
    const config = typedefs.find((t) => t.name === "PlatypusConfig");
    expect((config?.properties ?? []).map((p) => p.name)).toContain("collisions");
    const instance = typedefs.find((t) => t.name === "PlatypusInstance");
    expect((instance?.properties ?? []).map((p) => p.name)).toContain("velocity");
    expect((instance?.functions ?? []).map((f) => f.name)).toContain("set_collisions");
  });

  // dicebag is the first severance whose markdown verdict was *about* types
  // rather than lost members, so the page's proof is the three types the fork
  // exists to keep — each one a place the markdown lane would have published
  // `unknown`. Like platypus the alias and module path do not move, so the
  // import binding is asserted byte-identical across the cutover.
  test("the severed dicebag page is maintained-here at its tag, keeps its import binding, and documents the surface at full precision", () => {
    const dicebag = libraryPages.find((p) => p.namespace === "dicebag");
    expect(dicebag).toBeDefined();
    expect(dicebag?.route).toBe("/api/dicebag");
    const meta = dicebag?.libraryMeta;
    expect(meta).toBeDefined();
    if (!meta) return;
    expect(meta.authoredHere).toBe(true);
    expect(meta.authorUrl).toBe("https://github.com/8bitskull/dicebag");
    expect(meta.commit).toBe("0.3");
    expect(meta.license).toBe("CC0-1.0");
    expect(meta.importString).toBe('import * as dicebag from "dicebag.dicebag"');

    const functions = dicebag?.module.functions ?? [];
    expect(functions).toHaveLength(11);

    const rollCustom = functions.find((f) => f.name === "roll_custom_dice");
    const sides = (rollCustom?.parameters ?? []).find((p) => p.name === "sides");
    expect(sides?.types?.join("|")).not.toBe("unknown");

    const bagDraw = functions.find((f) => f.name === "bag_draw");
    expect(bagDraw?.parameters ?? []).toHaveLength(1);
    expect((bagDraw?.returnValues ?? []).map((r) => r.types?.join("|"))).toEqual(["boolean"]);
  });

  // rendy's markdown verdict was `signature-loss` — a prose-only README that
  // documents names but no parameters or returns — so the page's proof is the
  // parameter lists themselves, each one a place the markdown lane would have
  // published a zero-arity stub. This is also where the upstream account rename
  // reaches a user: nothing inside the fork was edited, but `authored-targets`
  // carries the current `whiteboxdev` slug, which drives the page's GitHub link.
  test("the severed rendy page is maintained-here at its pin under the current slug and documents the surface at full precision", () => {
    const rendy = libraryPages.find((p) => p.namespace === "rendy");
    expect(rendy).toBeDefined();
    expect(rendy?.route).toBe("/api/rendy");
    const meta = rendy?.libraryMeta;
    expect(meta).toBeDefined();
    if (!meta) return;
    expect(meta.authoredHere).toBe(true);
    expect(meta.authorUrl).toBe("https://github.com/whiteboxdev/library-defold-rendy");
    expect(meta.commit).toBe("b72ee2419f2cd5e1a2281e1eed5cc4081b5cbcc3");
    expect(meta.license).toBe("Zlib");
    expect(meta.importString).toBe('import * as rendy from "rendy.rendy"');

    const functions = rendy?.module.functions ?? [];
    expect(functions).toHaveLength(13);

    const getStack = functions.find((f) => f.name === "get_stack");
    expect(getStack?.parameters ?? []).toHaveLength(2);
    expect((getStack?.returnValues ?? []).map((r) => r.types?.join("|"))).not.toEqual(["unknown"]);

    const shake = functions.find((f) => f.name === "shake");
    const shakeParams = shake?.parameters ?? [];
    expect(shakeParams).toHaveLength(5);
    expect(shakeParams[4]?.name).toBe("scaler");
    expect(shakeParams[4]?.isOptional).toBe(true);
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

  test("a versioned engine surface yields zero library pages (libraries are canonical-only)", () => {
    const versioned = loadApiSurfaceForVersion(FIXTURE_DIR, "old");
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

  // orthographic severed into the authored lane, so it has no classification dir
  // left to key on and resolves through the namespace half of the fallback.
  test("a description-less api-doc page (orthographic.camera) gets its description from the vendored map", () => {
    const orthographic = libraryPages.find((p) => p.namespace === "orthographic.camera");
    expect(orthographic).toBeDefined();
    expect(orthographic?.module.description).toBe(descByDir["orthographic.camera"]);
    expect(orthographic?.module.description ?? "").not.toContain("vendored via");
    expect(orthographic?.module.description ?? "").not.toContain("tree/");
  });

  // Same fallback, exercised at the bare namespace: deleting the `defold-yagames`
  // classification dir kills the dir-keyed lookup, so without a namespace-keyed
  // entry the page would render description-less.
  test("a description-less api-doc page (yagames) gets its description from the vendored map", () => {
    const yagames = libraryPages.find((p) => p.namespace === "yagames");
    expect(yagames).toBeDefined();
    expect(yagames?.module.description).toBe(descByDir.yagames);
    expect(yagames?.module.description?.length ?? 0).toBeGreaterThan(0);
  });

  // starly is the case where the classification dir and the publish namespace are
  // the same string, so no `library-description-overrides.json` key was needed.
  // That coincidence does not make the dir half of the fallback sufficient: the
  // dir map is keyed by *module* (`starly.starly`), never by the bare namespace,
  // so `dir` is undefined here and the namespace half is what carries the text.
  test("a description-less api-doc page (starly) resolves through the namespace half alone", () => {
    const starly = libraryPages.find((p) => p.namespace === "starly");
    expect(starly).toBeDefined();
    expect(starly?.module.description).toBe(descByDir.starly);
    expect(starly?.module.description?.length ?? 0).toBeGreaterThan(0);
    expect(libraryModuleDirs(REAL_LIBRARY_TYPES_DIR).get("starly")).toBeUndefined();
  });

  // Ten pages whose description was keyed on the `defold-input` classification
  // dir the severance deletes. The dir half of the fallback cannot be what keeps
  // them non-empty afterwards — `libraryModuleDirs` has no entry for them at all —
  // so the namespace half carries every one, which is why the override map had to
  // gain ten `in.<mod>` keys rather than keep its single `defold-input` one.
  test("the ten severed in.* pages resolve their descriptions through the namespace half alone", () => {
    const dirs = libraryModuleDirs(REAL_LIBRARY_TYPES_DIR);
    for (const mod of DEFOLD_INPUT_MODULES) {
      const namespace = `in.${mod}`;
      const page = libraryPages.find((p) => p.namespace === namespace);
      expect(dirs.get(namespace)).toBeUndefined();
      expect(page?.module.description).toBe(descByDir[namespace]);
      expect(page?.module.description?.length ?? 0).toBeGreaterThan(0);
    }
  });

  // The same loss the ten in.* pages faced, and certain rather than incidental
  // here: all three `api-doc/richtext.*.json` carry an empty `info.description`,
  // so every page reaches the fallback, whose dir arm dies with the dropped
  // `defold-richtext` dir. The single dir key had to become three namespace keys.
  test("the three severed richtext.* pages resolve their descriptions through the namespace half alone", () => {
    const dirs = libraryModuleDirs(REAL_LIBRARY_TYPES_DIR);
    for (const mod of RICHTEXT_MODULES) {
      const namespace = `richtext.${mod}`;
      const page = libraryPages.find((p) => p.namespace === namespace);
      expect(dirs.get(namespace)).toBeUndefined();
      expect(page?.module.description).toBe(descByDir[namespace]);
      expect(page?.module.description?.length ?? 0).toBeGreaterThan(0);
    }
  });

  // The sharpest form of that loss so far: metrics had no
  // `library-description-overrides.json` entry at all, only the merged artifact's
  // `defold-metrics` dir key, so the severance would have left both pages
  // description-less had the dir key not become two namespace keys.
  test("the two severed metrics.* pages resolve their descriptions through the namespace half alone", () => {
    const dirs = libraryModuleDirs(REAL_LIBRARY_TYPES_DIR);
    for (const mod of METRICS_MODULES) {
      const namespace = `metrics.${mod}`;
      const page = libraryPages.find((p) => p.namespace === namespace);
      expect(dirs.get(namespace)).toBeUndefined();
      expect(page?.module.description).toBe(descByDir[namespace]);
      expect(page?.module.description?.length ?? 0).toBeGreaterThan(0);
    }
  });

  // gooey is the inverse of the metrics case: its dir and its bare namespace are
  // the same string, so the fallback hands the *same* key to the namespace arm
  // once the dir is dropped. The description survives only because the key was
  // written into `library-description-overrides.json` — without that the merged
  // artifact loses a key no dir generates any more.
  test("the severed gooey page resolves its description through the namespace half alone", () => {
    const dirs = libraryModuleDirs(REAL_LIBRARY_TYPES_DIR);
    const page = libraryPages.find((p) => p.namespace === "gooey");
    expect(dirs.get("gooey")).toBeUndefined();
    expect(page?.module.description).toBe(descByDir.gooey);
    expect(page?.module.description?.length ?? 0).toBeGreaterThan(0);
  });

  // bzAnim is gooey's case again: dir and bare namespace are both `bzAnim`, so
  // dropping the dir leaves the description resolvable only through the override
  // written in the same cutover.
  test("the severed bzAnim page resolves its description through the namespace half alone", () => {
    const dirs = libraryModuleDirs(REAL_LIBRARY_TYPES_DIR);
    const page = libraryPages.find((p) => p.namespace === "bzAnim");
    expect(dirs.get("bzAnim")).toBeUndefined();
    expect(page?.module.description).toBe(descByDir.bzAnim);
    expect(page?.module.description?.length ?? 0).toBeGreaterThan(0);
  });

  // platypus inverts gooey's and bzAnim's case. Its dir and bare namespace are
  // the same string too, but the fallback is never reached: the fork's module
  // JSDoc gives `api-doc/platypus.json` its own `info.description`. Writing an
  // override key would be a second model of a description the fork already
  // carries, so the absence of one is asserted rather than left to drift in.
  test("the severed platypus page keeps its description from its own api-doc, with no override written", () => {
    const dirs = libraryModuleDirs(REAL_LIBRARY_TYPES_DIR);
    const overrides = JSON.parse(
      readFileSync(join(REAL_LIBRARY_TYPES_DIR, "library-description-overrides.json"), "utf8"),
    ) as Record<string, string>;
    const page = libraryPages.find((p) => p.namespace === "platypus");
    expect(dirs.get("platypus")).toBeUndefined();
    expect("platypus" in overrides).toBe(false);
    expect(page?.module.description?.length ?? 0).toBeGreaterThan(0);
  });

  // dicebag repeats platypus's shape: dir and bare namespace are the same
  // string, but the fork's module JSDoc gives `api-doc/dicebag.json` its own
  // `info.description`, so the `descByDir` fallback is never on the path. The
  // `dicebag.dicebag` half is what catches a partial cutover — a retained row or
  // dir would leave that module key populated; the bare `dicebag` half was
  // vacuous before the cutover too and is asserted only for symmetry.
  test("the severed dicebag page keeps its description from its own api-doc, with no override written", () => {
    const dirs = libraryModuleDirs(REAL_LIBRARY_TYPES_DIR);
    const overrides = JSON.parse(
      readFileSync(join(REAL_LIBRARY_TYPES_DIR, "library-description-overrides.json"), "utf8"),
    ) as Record<string, string>;
    const page = libraryPages.find((p) => p.namespace === "dicebag");
    expect(dirs.get("dicebag.dicebag")).toBeUndefined();
    expect(dirs.get("dicebag")).toBeUndefined();
    expect("dicebag" in overrides).toBe(false);
    expect(page?.module.description?.length ?? 0).toBeGreaterThan(0);
  });

  // rendy repeats dicebag's shape, except its classification dir was
  // `library-defold-rendy` rather than the namespace string. The fork's module
  // JSDoc gives `api-doc/rendy.json` its own `info.description`, so `descByDir`
  // is never on the path. The `rendy.rendy` half is what catches a partial
  // cutover; the bare `rendy` half was vacuous before it too.
  test("the severed rendy page keeps its description from its own api-doc, with no override written", () => {
    const dirs = libraryModuleDirs(REAL_LIBRARY_TYPES_DIR);
    const overrides = JSON.parse(
      readFileSync(join(REAL_LIBRARY_TYPES_DIR, "library-description-overrides.json"), "utf8"),
    ) as Record<string, string>;
    const page = libraryPages.find((p) => p.namespace === "rendy");
    expect(dirs.get("rendy.rendy")).toBeUndefined();
    expect(dirs.get("rendy")).toBeUndefined();
    expect("rendy" in overrides).toBe(false);
    expect(page?.module.description?.length ?? 0).toBeGreaterThan(0);
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

  test("a library function carrying generics prints `name<...>(...)`; absent generics is unchanged", () => {
    const libraryPage: ApiPage = {
      ...pageWith({}),
      category: "library",
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
    const symbols = apiModuleSymbols(libraryPage);
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

  test("projects the ambient-global marker onto function, variable, and typedef-member symbols", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "describe",
            brief: "",
            description: "",
            global: true,
            parameters: [],
            returnValues: [],
          },
          { name: "demo.boot", brief: "", description: "", parameters: [], returnValues: [] },
        ],
        variables: [
          { name: "COUNT", brief: "", description: "", types: ["number"], global: true },
          { name: "demo.SIZE", brief: "", description: "", types: ["number"] },
        ],
        typedefs: [
          {
            name: "AreaComp",
            global: true,
            functions: [
              { name: "has_point", brief: "", description: "", parameters: [], returnValues: [] },
            ],
            properties: [{ name: "tag", brief: "", description: "", types: ["string"] }],
          },
          {
            name: "Options",
            properties: [{ name: "clear", brief: "", description: "", types: ["boolean"] }],
          },
        ],
      }),
    );
    const by = (name: string) => symbols.find((s) => s.name === name);

    expect(by("describe")?.global).toBe(true);
    expect(by("COUNT")?.global).toBe(true);
    // A typedef declared at file scope is itself ambient, so each of its members
    // inherits the marker.
    expect(by("AreaComp.has_point")?.global).toBe(true);
    expect(by("AreaComp.tag")?.global).toBe(true);

    for (const name of ["demo.boot", "demo.SIZE", "Options.clear"]) {
      expect(by(name)).toBeDefined();
      expect(by(name)?.global).toBeUndefined();
      expect(Object.keys(by(name) ?? {})).not.toContain("global");
    }
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
    // the zero-argument row cannot take the entry's `format` table, so it moves
    // to the one-argument row that accepts it; the example stays on row 1
    expect(symbols[0]?.parameters).toEqual([]);
    expect(symbols[0]?.returnValues).toEqual([]);
    expect(symbols[0]?.exampleMarkdown).toContain("```lua");
    expect(symbols[1]?.parameters).toEqual([
      { name: "format", doc: "the read format", types: ["string"], isOptional: true },
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

  test("msg.url collapses its 3 fixture entries to the 3 authored override rows", () => {
    const store = committedStore("msg");
    const rows = apiModuleSymbols(fixturePage("msg"), {}, store).filter(
      (s) => s.name === "msg.url",
    );
    // 3 fixture entries x 3 authored signatures would render 9 rows without the
    // collapse; the authored set is a different length than the fixture's, so
    // neither count can stand in for the other.
    expect(rows).toHaveLength(3);
    expect(rows.map((s) => s.signature)).toEqual(store["msg.url"]?.signatures ?? []);
  });

  test("go.get renders 3 rows and its undocumented overloads fall back to the fixture prose", () => {
    const store = committedStore("go");
    const page = fixturePage("go");
    const fixtureGetDoc =
      apiModuleSymbols(page, {}, {}).find((s) => s.name === "go.get")?.docMarkdown ?? "";
    const rows = apiModuleSymbols(page, {}, store).filter((s) => s.name === "go.get");

    expect(rows).toHaveLength(3);
    expect(rows.map((s) => s.signature)).toEqual(store["go.get"]?.signatures ?? []);
    expect(rows[0]?.signature).toContain("<K extends keyof P>");
    expect(rows[1]?.docMarkdown).toBe(fixtureGetDoc);
    expect(rows[2]?.docMarkdown).toBe(fixtureGetDoc);
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
        "msg.url(socket: string | Hash, path: string | Hash, fragment: string | Hash): Url",
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
    expect(rows).toHaveLength(3);
    expect(rows[1]?.docMarkdown).toContain("[socket:][path][#fragment]");
    expect(rows[2]?.docMarkdown).toContain("separate arguments");
    expect(rows[1]?.docMarkdown).not.toBe(rows[0]?.docMarkdown);
    expect(rows[2]?.docMarkdown).not.toBe(rows[0]?.docMarkdown);
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
  });

  test("the curried go.get/go.set rows drop tables the row that accepts them takes over", () => {
    const store = committedStore("go");
    const symbols = apiModuleSymbols(fixturePage("go"), {}, store);
    for (const [fqn, params] of [
      ["go.get", ["url", "property", "options"]],
      ["go.set", ["url", "property", "value", "options"]],
    ] as const) {
      const rows = symbols.filter((s) => s.name === fqn);
      expect(rows).toHaveLength(3);
      expect(rows[0]?.parameters).toEqual([]);
      expect(rows[0]?.returnValues).toEqual([]);
      expect(rows[1]?.parameters.map((p) => p.name)).toEqual([...params]);
      expect(rows[2]?.parameters).toEqual([]);
    }
    // the `value` return row moves with the parameter table it belongs to
    expect(symbols.filter((s) => s.name === "go.get")[1]?.returnValues.map((r) => r.name)).toEqual([
      "value",
    ]);
  });

  test("no rendered zero-argument row on any real page carries a parameter table", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
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
      "ShowOptions.clear?: boolean",
      "ShowOptions.sequential: boolean",
    ]);
  });

  test("a real library options shape reaches /api with its optional field marked", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const monarch = pages.find((p) => p.namespace === "monarch.monarch");
    expect(monarch).toBeDefined();
    if (!monarch) return;
    const symbols = apiModuleSymbols(monarch, monarch.translations, monarch.signatures);
    const clear = symbols.find((s) => s.kind === "type" && s.name === "ShowOptions.clear");
    expect(clear?.signature).toBe("ShowOptions.clear?: boolean");
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
        // Standalone typedef aliases carry a (dormant) map entry but are never
        // rendered as page symbols; the guard covers the rendered kinds only.
        if (entry.identity.kind === "TYPEDEF") continue;
        const inner = map.get(symbolIdentityKey(entry.identity));
        if (inner === undefined) continue;
        expect(rendered.has(inner)).toBe(true);
      }
    }
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

  test("a library vararg param renders `...args: T[]`; the same param on an engine page stays `...args: T`", () => {
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
    const librarySig = apiModuleSymbols(libraryPage(module))[0]?.signature;
    expect(librarySig).toBe("event.fmt(...args: string[]): number");

    const enginePage: ApiPage = { ...libraryPage(module), category: "engine" };
    expect(apiModuleSymbols(enginePage)[0]?.signature).toBe("event.fmt(...args: string): number");
  });

  test("a library vararg param over a union parenthesizes the element type", () => {
    const module: Partial<ApiPage["module"]> = {
      functions: [
        {
          name: "event.pick",
          brief: "",
          description: "Pick.",
          parameters: [
            {
              name: "...args",
              doc: "",
              types: ["string", "any"],
              isOptional: false,
              isVararg: true,
            },
          ],
          returnValues: [],
        },
      ],
    };
    expect(apiModuleSymbols(libraryPage(module))[0]?.signature).toBe(
      "event.pick(...args: (string | any)[])",
    );
  });

  test("a library >1-return function wraps in LuaMultiReturn; the same on an engine page stays `a, b`", () => {
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
    expect(apiModuleSymbols(libraryPage(module))[0]?.signature).toBe(
      "event.measure(): LuaMultiReturn<[number, number]>",
    );

    const enginePage: ApiPage = { ...libraryPage(module), category: "engine" };
    expect(apiModuleSymbols(enginePage)[0]?.signature).toBe("event.measure(): number, number");
  });

  test("a library typedef member renders vararg + multi-return like the emitter", () => {
    const module: Partial<ApiPage["module"]> = {
      typedefs: [
        {
          name: "druid_text",
          functions: [
            {
              name: "get_text_size",
              brief: "",
              description: "Measure.",
              parameters: [
                {
                  name: "text",
                  doc: "",
                  types: ["string | undefined"],
                  isOptional: false,
                  isVararg: false,
                },
              ],
              returnValues: [
                { name: "", doc: "", types: ["number"], isOptional: false },
                { name: "", doc: "", types: ["number"], isOptional: false },
              ],
            },
          ],
          properties: [],
        },
      ],
    };
    const sig = apiModuleSymbols(libraryPage(module)).find(
      (s) => s.name === "druid_text.get_text_size",
    )?.signature;
    expect(sig).toBe(
      "druid_text.get_text_size(text: string | undefined): LuaMultiReturn<[number, number]>",
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

  test("a markerFor callback appends its HTML after each signature link in the same item", () => {
    const list = functionOverviewCards(
      [
        fnSymbol("go.get_position", { signature: "go.get_position(): vector3" }),
        fnSymbol("go.set_position", { signature: "go.set_position(position: vector3): void" }),
      ],
      (s) => `<i data-mark="${s.name}"></i>`,
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
    expect(functionOverviewCards(symbols, () => "")).toBe(functionOverviewCards(symbols));
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
      pageWith({ functions: [fooOverloadA] }, { versions: [], records: new Map() }),
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
    expect(md).toContain("Available through Defold 1.12.4");
  });

  test("the real default surface joins a since-1.13.0 symbol onto its b2d.body page", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR);
    const body = pages.find((p) => p.namespace === "b2d.body");
    expect(body).toBeDefined();
    if (!body) return;
    expect(body.availability?.records.size ?? 0).toBeGreaterThan(0);
    const labelled = apiModuleSymbols(body, body.translations, body.signatures).filter(
      (s) => s.availability?.availableIn.length === 1 && s.availability.availableIn[0] === "1.13.0",
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

  // The materialized registry targets — canonical 1.13.0 and historical 1.12.4.
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
    expect(completeTargets.some((v) => v.id === "defold-1.13.0" && v.isDefault)).toBe(true);
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
    const canonicalVersion = loadApiSurfaceForVersion(REAL_TYPES_DIR, "defold-1.13.0");
    const historical = loadApiSurfaceForVersion(REAL_TYPES_DIR, "defold-1.12.4");
    expect(canonicalVersion.find((p) => p.namespace === "go")?.route).toBe("/api/defold-1.13.0/go");
    expect(historical.find((p) => p.namespace === "go")?.route).toBe("/api/defold-1.12.4/go");
  });

  test("the canonical unprefixed surface serves Combined engine plus version-independent pages", () => {
    const canonical = canonicalApiPages(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    expect(canonical.find((p) => p.namespace === "go")?.route).toBe("/api/go");
    expect(canonical.find((p) => p.namespace === "base")?.route).toBe("/api/base");
  });

  test("each complete target carries a human version label", () => {
    expect(versionLabel("defold-1.13.0")).toBe("Defold 1.13.0");
    expect(versionLabel("defold-1.12.4")).toBe("Defold 1.12.4");
  });
});
