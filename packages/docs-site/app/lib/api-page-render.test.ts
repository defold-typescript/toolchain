import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  type ApiAvailability,
  type ApiFunction,
  normalizedFunctionSignature,
  signatureTransitionNames,
  symbolIdentityKey,
} from "@defold-typescript/types";
import { LibraryHeading } from "../routes/api/[namespace]";
import { canonicalApiPages } from "./api-content";
import {
  apiLinkify,
  apiPageMarkdown,
  apiReplacementResolver,
  apiSignatureSymbolLinks,
  isKnownVersionId,
  namespaceCountBadges,
  navNamespaceBadges,
  versionedApiParams,
} from "./api-page-render";
import { type ApiPage, type AvailabilityLookup, apiModuleSymbols } from "./api-surface";
import {
  loadApiSurface,
  loadApiSurfaceForVersion,
  loadCombinedSurface,
} from "./api-surface-loader";
import { buildCombinedSurface, combinedNamespaceToApiPage } from "./combined-surface";
import { slugify } from "./headings";
import { renderMarkdown } from "./markdown";
import { buildSymbolIndex } from "./symbol-index";

const FIXTURE_DIR = join(import.meta.dir, "__fixtures__/api-surface");
const MISSING_VERSION_FIXTURE_DIR = join(
  import.meta.dir,
  "__fixtures__/api-surface-missing-version",
);
const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");
const REAL_LIBRARY_TYPES_DIR = join(import.meta.dir, "../../../library-types");

// A non-default surface page: its route already carries the version prefix, so
// any link derived from it must stay version-scoped.
function versionedWmathPage(): ApiPage {
  return {
    namespace: "wmath",
    route: "/api/old/wmath",
    brief: "Old math",
    module: {
      namespace: "wmath",
      brief: "Old math",
      description: "Old-version math helpers.",
      functions: [
        {
          name: "wmath.dot",
          brief: "",
          description: "Dot product.",
          parameters: [],
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
}

// A library page whose one function has a parameter typed as an inline object
// literal with a nested member, so the render must emit an indented field tree.
function fieldsPage(): ApiPage {
  return {
    namespace: "fld",
    route: "/api/fld",
    brief: "Fields",
    module: {
      namespace: "fld",
      brief: "Fields",
      description: "Field demo.",
      functions: [
        {
          name: "fld.follow",
          brief: "",
          description: "Follow.",
          parameters: [
            {
              name: "options",
              doc: "the options",
              types: ["{ lerp?: number; nested?: { deep?: boolean; }; }"],
              isOptional: true,
              fields: [
                { name: "lerp", doc: "Lerp factor.", types: ["number"], isOptional: true },
                {
                  name: "nested",
                  doc: "Nested config.",
                  types: ["{ deep?: boolean; }"],
                  isOptional: true,
                  fields: [
                    { name: "deep", doc: "Deep flag.", types: ["boolean"], isOptional: true },
                  ],
                },
              ],
            },
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
    category: "library",
  };
}

function typedefPage(): ApiPage {
  return {
    namespace: "demo",
    route: "/api/demo",
    brief: "Demo",
    module: {
      namespace: "demo",
      brief: "Demo",
      description: "Type demo.",
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
    translations: {},
    signatures: {},
    category: "library",
  };
}

// A vendored library page carrying the structured provenance metadata the
// uniform render block reads.
function libraryPageWithMeta(overrides: Partial<ApiPage> = {}): ApiPage {
  return {
    namespace: "orthographic.camera",
    route: "/api/orthographic.camera",
    brief: "Camera",
    module: {
      namespace: "orthographic.camera",
      brief: "Camera",
      description: "Orthographic camera helpers.",
      functions: [],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    },
    translations: {},
    signatures: {},
    category: "library",
    libraryMeta: {
      author: "Britzl",
      authorUrl: "https://github.com/britzl/defold-orthographic",
      commit: "2fe3aed3352a913d2859e6e85d34a8b23d821368",
      sourceUrl:
        "https://github.com/ts-defold/library/blob/2fe3aed3352a913d2859e6e85d34a8b23d821368/packages/defold-orthographic/orthographic.camera.d.ts",
      importString: 'import * as camera from "orthographic.camera"',
      license: "MIT",
      authoredHere: false,
    },
    ...overrides,
  };
}

describe("versionedApiParams", () => {
  test("yields one {version, namespace} per on-disk engine page of every materialized version, default included", () => {
    expect(versionedApiParams(FIXTURE_DIR)).toEqual([
      { version: "cur", namespace: "globals" },
      { version: "cur", namespace: "alpha" },
      { version: "cur", namespace: "camera" },
      { version: "old", namespace: "wmath" },
    ]);
  });

  test("an unmaterialized non-default version contributes nothing; the default still materializes", () => {
    expect(versionedApiParams(MISSING_VERSION_FIXTURE_DIR)).toEqual([
      { version: "cur", namespace: "camera" },
    ]);
  });
});

describe("apiPageMarkdown", () => {
  test("renders the camera fixture page unchanged by the lift (snapshot)", () => {
    const pages = loadApiSurface(FIXTURE_DIR);
    const camera = pages.find((p) => p.namespace === "camera");
    expect(camera).toBeDefined();
    if (!camera) return;
    expect(apiPageMarkdown(camera, apiLinkify(pages))).toMatchSnapshot();
  });

  test("renders the authored io.open signature from the store, not the thin ref-doc one", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR);
    const io = pages.find((p) => p.namespace === "io");
    expect(io).toBeDefined();
    if (!io) return;
    const thin = apiModuleSymbols(io, io.translations).find((s) => s.name === "io.open")?.signature;
    expect(thin).toBeDefined();
    const md = apiPageMarkdown(io, apiLinkify(pages));
    expect(md).toContain("io.open(filename: string, mode?: string): LuaFile | undefined");
    expect(md).not.toContain(`\`${thin}\``);
  });

  test("renders the authored string.byte overload from the store, not the thin ref-doc one", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR);
    const str = pages.find((p) => p.namespace === "string");
    expect(str).toBeDefined();
    if (!str) return;
    const thin = apiModuleSymbols(str, str.translations).find(
      (s) => s.name === "string.byte",
    )?.signature;
    expect(thin).toBeDefined();
    const md = apiPageMarkdown(str, apiLinkify(pages));
    expect(md).toContain("string.byte(s: string, i?: number): number");
    expect(md).not.toContain(`\`${thin}\``);
  });

  test("renders the authored os.date overload from the store, not the thin ref-doc one", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR);
    const os = pages.find((p) => p.namespace === "os");
    expect(os).toBeDefined();
    if (!os) return;
    const thin = apiModuleSymbols(os, os.translations).find((s) => s.name === "os.date")?.signature;
    expect(thin).toBeDefined();
    const md = apiPageMarkdown(os, apiLinkify(pages));
    expect(md).toContain("os.date(format?: string, time?: number): string");
    expect(md).toContain('os.date(format: "*t", time?: number): LuaDateInfoResult');
    expect(md).not.toContain(`\`${thin}\``);
  });

  test("renders the authored math.random signature from the store, not the thin ref-doc one", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR);
    const math = pages.find((p) => p.namespace === "math");
    expect(math).toBeDefined();
    if (!math) return;
    const thin = apiModuleSymbols(math, math.translations).find(
      (s) => s.name === "math.random",
    )?.signature;
    expect(thin).toBeDefined();
    const md = apiPageMarkdown(math, apiLinkify(pages));
    expect(md).toContain("math.random(m?: number, n?: number): number");
    expect(md).not.toContain(`\`${thin}\``);
  });

  test("renders the authored bit.tohex signature from the store, not the thin ref-doc one", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR);
    const bit = pages.find((p) => p.namespace === "bit");
    expect(bit).toBeDefined();
    if (!bit) return;
    const thin = apiModuleSymbols(bit, bit.translations).find(
      (s) => s.name === "bit.tohex",
    )?.signature;
    expect(thin).toBeDefined();
    const md = apiPageMarkdown(bit, apiLinkify(pages));
    expect(md).toContain("bit.tohex(x: number, n?: number): string");
    expect(md).not.toContain(`\`${thin}\``);
  });

  test("renders the authored bare base.select signature from the store, not the thin ref-doc one", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR);
    const base = pages.find((p) => p.namespace === "base");
    expect(base).toBeDefined();
    if (!base) return;
    const thin = apiModuleSymbols(base, base.translations).find(
      (s) => s.name === "select",
    )?.signature;
    expect(thin).toBeDefined();
    const md = apiPageMarkdown(base, apiLinkify(pages));
    expect(md).toContain("select<T>(index: number, ...args: T[]): LuaMultiReturn<T[]>");
    expect(md).toContain('select<T>(index: "#", ...args: T[]): number');
    expect(md).not.toContain(`\`${thin}\``);
  });

  test("renders the authored socket client:receive receiver signature from the store, not the thin ref-doc one", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR);
    const socket = pages.find((p) => p.namespace === "socket");
    expect(socket).toBeDefined();
    if (!socket) return;
    const thin = apiModuleSymbols(socket, socket.translations).find(
      (s) => s.name === "client:receive",
    )?.signature;
    expect(thin).toBeDefined();
    const md = apiPageMarkdown(socket, apiLinkify(pages));
    expect(md).toContain(
      "client:receive(pattern?: string | number, prefix?: string): LuaMultiReturn<[string | undefined, string | undefined, string | undefined]>",
    );
    expect(md).not.toContain(`\`${thin}\``);
  });

  test("renders member-bearing typedefs as a Types section", () => {
    const md = apiPageMarkdown(typedefPage(), (t) => t);
    expect(md).toContain("## Types");
    expect(md).toContain("### `LoggerInstance.info(message: string)`");
    expect(md).toContain("Writes an info message.");
    expect(md).toContain("- `message`: `string` — message text");
    expect(md).toContain("### `LoggerInstance.level: number`");
    expect(md).toContain("Current log level.");
  });
});

describe("apiPageMarkdown field tree", () => {
  // The en space (U+2002) is the wider gap `nameTypeLabel` puts after the `:`.
  const G = "\u2002";
  test("renders a parameter's fields as an indented nested list, one indent per depth", () => {
    const md = apiPageMarkdown(fieldsPage(), (t) => t);
    expect(md).toContain(
      `- \`options\`?:${G}\`{ lerp?: number; nested?: { deep?: boolean; }; }\` — the options`,
    );
    expect(md).toContain(`  - \`lerp\`?:${G}\`number\` — Lerp factor.`);
    expect(md).toContain(`  - \`nested\`?:${G}\`{ deep?: boolean; }\` — Nested config.`);
    expect(md).toContain(`    - \`deep\`?:${G}\`boolean\` — Deep flag.`);
  });

  test("a parameter without fields renders no sub-list", () => {
    const md = apiPageMarkdown(versionedWmathPage(), (t) => t);
    expect(md).not.toContain("  - `");
  });

  test("linkify recurses into nested field docs", () => {
    const seen: string[] = [];
    apiPageMarkdown(fieldsPage(), (t) => {
      seen.push(t);
      return t;
    });
    expect(seen).toContain("Lerp factor.");
    expect(seen).toContain("Deep flag.");
  });
});

describe("apiPageMarkdown library provenance block", () => {
  test("emits a single GitHub provenance bullet (no Author/License) with the numbered steps nested directly under it", () => {
    const md = apiPageMarkdown(libraryPageWithMeta(), (t) => t);
    const iDesc = md.indexOf("Orthographic camera helpers.");
    const iGithub = md.indexOf("- GitHub:");
    const iStep1 = md.indexOf("  1. Pick a release");
    for (const i of [iDesc, iGithub, iStep1]) {
      expect(i).toBeGreaterThan(-1);
    }
    expect(iDesc).toBeLessThan(iGithub);
    // The steps nest directly under the GitHub bullet — no `Usage:` label.
    expect(iGithub).toBeLessThan(iStep1);
    expect(md).toContain(
      "- GitHub: [britzl/defold-orthographic](https://github.com/britzl/defold-orthographic) — pinned to [`2fe3aed`](https://github.com/ts-defold/library/blob/2fe3aed3352a913d2859e6e85d34a8b23d821368/packages/defold-orthographic/orthographic.camera.d.ts)",
    );
    // Author and License are omitted; the reader gets them from the linked repo.
    expect(md).not.toContain("Author:");
    expect(md).not.toContain("License:");
    expect(md).not.toContain("- Usage:");
    expect(md).not.toContain("- Commit pin:");
    // The import nests as a fenced code block under step 3, not a top-level bullet.
    expect(md).not.toContain("- Import");
    expect(md).not.toContain("- Source:");
    expect(md).not.toContain("- Attribution:");
    expect(md).not.toContain("vendored via ts-defold/library");
  });

  test("GitHub links the upstream author repo, the pin links the generating .d.ts, and add/resolve/import nest as numbered steps", () => {
    const md = apiPageMarkdown(libraryPageWithMeta(), (t) => t);
    expect(md).toContain("](https://github.com/britzl/defold-orthographic)");
    expect(md).toContain(
      "](https://github.com/ts-defold/library/blob/2fe3aed3352a913d2859e6e85d34a8b23d821368/packages/defold-orthographic/orthographic.camera.d.ts)",
    );
    // Step 1 links the repo's /releases page so the user picks a pinned version
    // (never a minted moving archive URL); step 2 runs resolve; step 3 folds the
    // import in as a fenced block at the ordered-item content column.
    expect(md).toContain(
      "  1. Pick a release from [britzl/defold-orthographic releases](https://github.com/britzl/defold-orthographic/releases) and add its **Source code (zip)** URL (or a packaged `.zip` asset, if the library ships one) to `game.project` under `[project]` `dependencies`, then **Fetch Libraries** in the Defold editor.",
    );
    // No auto-minted moving archive URL — no HEAD.zip, no branch-specific zips.
    expect(md).not.toContain("HEAD.zip");
    expect(md).not.toContain("master.zip");
    expect(md).not.toContain("main.zip");
    expect(md).toContain(
      "  2. Run `bunx @defold-typescript/cli resolve` to materialize its types.",
    );
    expect(md).toContain(
      '  3. Import it under a namespace alias of your choice:\n     ```ts\n     import * as camera from "orthographic.camera"\n     ```',
    );
  });

  test("a library page with an empty author omits Author and GitHub, starts at Commit pin, and names the dependency step without a link", () => {
    const md = apiPageMarkdown(
      libraryPageWithMeta({
        libraryMeta: {
          author: "",
          authorUrl: "",
          commit: "2fe3aed3352a913d2859e6e85d34a8b23d821368",
          sourceUrl:
            "https://github.com/ts-defold/library/blob/2fe3aed3352a913d2859e6e85d34a8b23d821368/packages/defold-orthographic/orthographic.camera.d.ts",
          importString: 'import * as camera from "orthographic.camera"',
          license: "MIT",
          authoredHere: false,
        },
      }),
      (t) => t,
    );
    const iCommit = md.indexOf("- Commit pin:");
    const iStep1 = md.indexOf("  1. Pick a release");
    expect(iCommit).toBeGreaterThan(-1);
    expect(iStep1).toBeGreaterThan(iCommit);
    expect(md).not.toContain("- Author:");
    expect(md).not.toContain("- GitHub:");
    // With no author, the bullet is the standalone Commit pin; Author/License omitted.
    expect(md).toContain(
      "- Commit pin: [`2fe3aed`](https://github.com/ts-defold/library/blob/2fe3aed3352a913d2859e6e85d34a8b23d821368/packages/defold-orthographic/orthographic.camera.d.ts)",
    );
    expect(md).not.toContain("License:");
    expect(md).not.toContain("- Usage:");
    // No NOTICE credit → no repo, so step 1 is named generically with no /releases link.
    expect(md).toContain(
      "  1. Pick a release from the library's GitHub repository and add its **Source code (zip)** URL (or a packaged `.zip` asset, if the library ships one) to `game.project` under `[project]` `dependencies`, then **Fetch Libraries** in the Defold editor.",
    );
    expect(md).not.toContain("/releases");
    expect(md).not.toContain("HEAD.zip");
  });

  test("a non-library page emits no provenance block", () => {
    const md = apiPageMarkdown(versionedWmathPage(), (t) => t);
    expect(md).not.toContain("- Commit pin:");
    expect(md).not.toContain("- Attribution:");
  });

  test("the druid page renders its component typedefs and pins to Insality/druid, not ts-defold/library", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const druid = pages.find((p) => p.namespace === "druid");
    expect(druid).toBeDefined();
    if (!druid) return;
    const md = apiPageMarkdown(druid, apiLinkify(pages));
    // Emitter-equivalent signatures: a mapped/sanitized generic module function and a
    // sanitized typedef method, not the raw LuaLS `druid.`-dotted / unbound-`T` form.
    expect(md).toContain("get_widget<T extends druid_widget>");
    expect(md).toContain("druid_button.set_enabled(state?: boolean | undefined): druid_button");
    // No raw LuaLS token survives in a signature position (heading lines). Prose doc
    // text may still mention `fun(self, ...)` and `druid.<component>` verbatim.
    const signatureLines = md
      .split("\n")
      .filter((line) => line.startsWith("### ") || line.startsWith("#### "));
    for (const line of signatureLines) {
      expect(line).not.toContain("table|nil");
      expect(line).not.toContain("fun(");
      expect(line).not.toMatch(/druid\.[a-z]/);
    }
    expect(md).not.toContain("table|nil");
    // Emitter-equivalent variadic + multi-return: arrayified vararg and a tuple,
    // never the pre-lift `...: string` param or `): number, number` return token.
    expect(md).toContain("...args: string[]");
    expect(md).toContain("LuaMultiReturn<[number, number]>");
    expect(md).not.toContain("...: string");
    expect(md).not.toContain("): number, number");
    expect(md).toContain("[Insality/druid](https://github.com/Insality/druid)");
    expect(md).not.toContain("ts-defold/library");
    expect(md).toMatchSnapshot();
  });

  // Projected through the real committed corpus, so a clause that survives extraction
  // but is lost in the render still reds. The boom pair is also the collapse proof: its
  // declaration spans five source lines and must render as one, and the second form is
  // a typedef method rather than a module function.
  test("the authored generic pages declare the type parameter their signatures reference", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const md = (namespace: string) => {
      const page = pages.find((p) => p.namespace === namespace);
      expect(page).toBeDefined();
      return page ? apiPageMarkdown(page, apiLinkify(pages)) : "";
    };

    expect(md("checkpoint")).toContain(
      "read<T = unknown>(path: string): LuaMultiReturn<[ T | false, string | undefined ]>",
    );
    expect(md("deftest")).toContain("assert_equal<T>(a: T, b: T)");
    const boom = md("boom");
    expect(boom).toContain(
      "add<T extends (BoomComponent | BoomTag)[]>(comps: T): BoomGameObject<T>",
    );
    expect(boom).toContain(
      "BoomBlankGameObject.add<T extends (BoomComponent | BoomTag)[]>(comps: T): BoomGameObject<T>",
    );
  });

  test("the migrated tweener page pins to Insality/defold-tweener, not the ts-defold/library corpus", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const tweener = pages.find((p) => p.namespace === "tweener");
    expect(tweener).toBeDefined();
    if (!tweener) return;
    expect(tweener.category).toBe("library");
    const md = apiPageMarkdown(tweener, apiLinkify(pages));
    expect(md).toContain("[Insality/defold-tweener](https://github.com/Insality/defold-tweener)");
    expect(md).not.toContain("ts-defold/library");
  });

  test("the migrated event page pins to Insality/defold-event, not the ts-defold/library corpus", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const event = pages.find((p) => p.namespace === "event");
    expect(event).toBeDefined();
    if (!event) return;
    expect(event.category).toBe("library");
    const md = apiPageMarkdown(event, apiLinkify(pages));
    expect(md).toContain("[Insality/defold-event](https://github.com/Insality/defold-event)");
    expect(md).not.toContain("ts-defold/library");
  });

  test("the migrated lang page pins to Insality/defold-lang, not the ts-defold/library corpus", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const lang = pages.find((p) => p.namespace === "lang");
    expect(lang).toBeDefined();
    if (!lang) return;
    expect(lang.category).toBe("library");
    const md = apiPageMarkdown(lang, apiLinkify(pages));
    expect(md).toContain("[Insality/defold-lang](https://github.com/Insality/defold-lang)");
    expect(md).not.toContain("ts-defold/library");
  });

  test("the migrated log page pins to Insality/defold-log, not the ts-defold/library corpus", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const log = pages.find((p) => p.namespace === "log");
    expect(log).toBeDefined();
    if (!log) return;
    expect(log.category).toBe("library");
    const md = apiPageMarkdown(log, apiLinkify(pages));
    expect(md).toContain("[Insality/defold-log](https://github.com/Insality/defold-log)");
    expect(md).not.toContain("ts-defold/library");
  });

  test("the migrated proto page pins to Insality/defold-proto, not the ts-defold/library corpus", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const proto = pages.find((p) => p.namespace === "proto");
    expect(proto).toBeDefined();
    if (!proto) return;
    expect(proto.category).toBe("library");
    const md = apiPageMarkdown(proto, apiLinkify(pages));
    expect(md).toContain("[Insality/defold-proto](https://github.com/Insality/defold-proto)");
    expect(md).not.toContain("ts-defold/library");
  });

  test("the migrated immutable page pins to paweljarosz/lua-immutable, not the ts-defold/library corpus", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const immutable = pages.find((p) => p.namespace === "immutable");
    expect(immutable).toBeDefined();
    if (!immutable) return;
    expect(immutable.category).toBe("library");
    const md = apiPageMarkdown(immutable, apiLinkify(pages));
    expect(md).toContain(
      "[paweljarosz/lua-immutable](https://github.com/paweljarosz/lua-immutable)",
    );
    expect(md).not.toContain("ts-defold/library");
  });

  test("the migrated squid page pins to paweljarosz/squid, not the ts-defold/library corpus", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const squid = pages.find((p) => p.namespace === "squid");
    expect(squid).toBeDefined();
    if (!squid) return;
    expect(squid.category).toBe("library");
    const md = apiPageMarkdown(squid, apiLinkify(pages));
    expect(md).toContain("[paweljarosz/squid](https://github.com/paweljarosz/squid)");
    expect(md).not.toContain("ts-defold/library");
  });

  test("the migrated narrator page pins to astrochili/narrator, not the ts-defold/library corpus", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const narrator = pages.find((p) => p.namespace === "narrator");
    expect(narrator).toBeDefined();
    if (!narrator) return;
    expect(narrator.category).toBe("library");
    const md = apiPageMarkdown(narrator, apiLinkify(pages));
    expect(md).toContain("[astrochili/narrator](https://github.com/astrochili/narrator)");
    expect(md).not.toContain("ts-defold/library");
  });

  test("the migrated saver.saver page pins to Insality/defold-saver, not the ts-defold/library corpus", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const saver = pages.find((p) => p.namespace === "saver.saver");
    expect(saver).toBeDefined();
    if (!saver) return;
    expect(saver.category).toBe("library");
    const md = apiPageMarkdown(saver, apiLinkify(pages));
    expect(md).toContain("[Insality/defold-saver](https://github.com/Insality/defold-saver)");
    expect(md).not.toContain("ts-defold/library");
  });

  test("the migrated saver.storage page pins to Insality/defold-saver, not the ts-defold/library corpus", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const storage = pages.find((p) => p.namespace === "saver.storage");
    expect(storage).toBeDefined();
    if (!storage) return;
    expect(storage.category).toBe("library");
    const md = apiPageMarkdown(storage, apiLinkify(pages));
    expect(md).toContain("[Insality/defold-saver](https://github.com/Insality/defold-saver)");
    expect(md).not.toContain("ts-defold/library");
  });

  test("the migrated bridge page pins to Playgama/bridge-defold, not the ts-defold/library corpus", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const bridge = pages.find((p) => p.namespace === "bridge");
    expect(bridge).toBeDefined();
    if (!bridge) return;
    expect(bridge.category).toBe("library");
    const md = apiPageMarkdown(bridge, apiLinkify(pages));
    expect(md).toContain("[Playgama/bridge-defold](https://github.com/Playgama/bridge-defold)");
    expect(md).not.toContain("ts-defold/library");
  });

  test("the forked defcon page pins to britzl/defcon, not the ts-defold/library corpus", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const defcon = pages.find((p) => p.namespace === "defcon");
    expect(defcon).toBeDefined();
    if (!defcon) return;
    expect(defcon.category).toBe("library");
    const md = apiPageMarkdown(defcon, apiLinkify(pages));
    expect(md).toContain("[britzl/defcon](https://github.com/britzl/defcon)");
    expect(md).not.toContain("ts-defold/library");
  });

  test("the forked deftest page pins to britzl/deftest, not the ts-defold/library corpus", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const deftest = pages.find((p) => p.namespace === "deftest");
    expect(deftest).toBeDefined();
    if (!deftest) return;
    expect(deftest.category).toBe("library");
    const md = apiPageMarkdown(deftest, apiLinkify(pages));
    expect(md).toContain("[britzl/deftest](https://github.com/britzl/deftest)");
    expect(md).not.toContain("ts-defold/library");
  });

  test("the forked persist page pins to whiteboxdev/library-defold-persist, not the ts-defold/library corpus", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const persist = pages.find((p) => p.namespace === "persist");
    expect(persist).toBeDefined();
    if (!persist) return;
    expect(persist.category).toBe("library");
    const md = apiPageMarkdown(persist, apiLinkify(pages));
    expect(md).toContain(
      "[whiteboxdev/library-defold-persist](https://github.com/whiteboxdev/library-defold-persist)",
    );
    expect(md).not.toContain("ts-defold/library");
  });

  test("the forked defmath page pins to subsoap/defmath, not the ts-defold/library corpus", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const defmath = pages.find((p) => p.namespace === "defmath");
    expect(defmath).toBeDefined();
    if (!defmath) return;
    expect(defmath.category).toBe("library");
    const md = apiPageMarkdown(defmath, apiLinkify(pages));
    expect(md).toContain("[subsoap/defmath](https://github.com/subsoap/defmath)");
    expect(md).not.toContain("ts-defold/library");
  });

  test("the forked zzfx page pins to thejustinwalsh/defold-zzfx, not the ts-defold/library corpus", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const zzfx = pages.find((p) => p.namespace === "zzfx");
    expect(zzfx).toBeDefined();
    if (!zzfx) return;
    expect(zzfx.category).toBe("library");
    const md = apiPageMarkdown(zzfx, apiLinkify(pages));
    expect(md).toContain(
      "[thejustinwalsh/defold-zzfx](https://github.com/thejustinwalsh/defold-zzfx)",
    );
    expect(md).not.toContain("ts-defold/library");
  });

  test("the forked boom page pins to britzl/boom, not the ts-defold/library corpus", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const boom = pages.find((p) => p.namespace === "boom");
    expect(boom).toBeDefined();
    if (!boom) return;
    expect(boom.category).toBe("library");
    const md = apiPageMarkdown(boom, apiLinkify(pages));
    expect(md).toContain("[britzl/boom](https://github.com/britzl/boom)");
    expect(md).not.toContain("ts-defold/library");
  });

  test("the forked defsave page pins to subsoap/defsave, not the ts-defold/library corpus", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const defsave = pages.find((p) => p.namespace === "defsave");
    expect(defsave).toBeDefined();
    if (!defsave) return;
    expect(defsave.category).toBe("library");
    const md = apiPageMarkdown(defsave, apiLinkify(pages));
    expect(md).toContain("[subsoap/defsave](https://github.com/subsoap/defsave)");
    expect(md).not.toContain("ts-defold/library");
  });

  test("every forked nakama page pins to heroiclabs/nakama-defold, not the ts-defold/library corpus", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    for (const namespace of ["nakama", "nakama.engine.defold", "nakama.util.log"]) {
      const page = pages.find((p) => p.namespace === namespace);
      expect(page).toBeDefined();
      if (!page) continue;
      expect(page.category).toBe("library");
      const md = apiPageMarkdown(page, apiLinkify(pages));
      expect(md).toContain(
        "[heroiclabs/nakama-defold](https://github.com/heroiclabs/nakama-defold)",
      );
      expect(md).not.toContain("ts-defold/library");
    }
  });
});

describe("apiPageMarkdown display name", () => {
  test("renders the alias as the H1 and keeps the raw namespace visible beneath it", () => {
    const md = apiPageMarkdown(
      libraryPageWithMeta({ displayName: "britzl / defold-orthographic" }),
      (t) => t,
    );
    const iTitle = md.indexOf("# britzl / defold-orthographic");
    const iNamespace = md.indexOf("`orthographic.camera`");
    expect(iTitle).toBe(0);
    expect(iNamespace).toBeGreaterThan(iTitle);
    expect(md).not.toContain("# orthographic.camera");
  });

  test("a page without displayName renders `# <namespace>` unchanged", () => {
    const md = apiPageMarkdown(versionedWmathPage(), (t) => t);
    expect(md.startsWith("# wmath")).toBe(true);
  });
});

describe("apiLinkify", () => {
  test("links a bare member mention to the page's version-scoped route", () => {
    const linkify = apiLinkify([versionedWmathPage()]);
    const out = linkify("see wmath.dot for the product");
    expect(out).toContain('href="/api/old/wmath#');
    expect(out).not.toContain('href="/api/wmath');
  });

  test("leaves text untouched when the surface has no linkable members", () => {
    const linkify = apiLinkify([]);
    expect(linkify("plain wmath.dot text")).toBe("plain wmath.dot text");
  });

  test("links members of an exact-version surface to that version's prefixed route", () => {
    const linkify = apiLinkify(loadApiSurfaceForVersion(REAL_TYPES_DIR, "defold-1.12.4"));
    const out = linkify("call go.get_position each frame");
    expect(out).toContain('href="/api/defold-1.12.4/go#');
    expect(out).not.toContain('href="/api/go#');
  });
});

describe("isKnownVersionId", () => {
  const versions = [
    { id: "cur", isDefault: true },
    { id: "old", isDefault: false },
  ];

  test("is true for a non-default version id", () => {
    expect(isKnownVersionId("old", versions)).toBe(true);
  });

  test("is false for a real namespace param", () => {
    expect(isKnownVersionId("camera", versions)).toBe(false);
  });

  test("is true for the default version id (it now owns an explicit /api/<default> index)", () => {
    expect(isKnownVersionId("cur", versions)).toBe(true);
  });
});

describe("availability badges", () => {
  const setTexture: ApiFunction = {
    name: "model.set_texture",
    brief: "",
    description: "New texture accessor.",
    parameters: [{ name: "url", doc: "", types: ["url"], isOptional: false }],
    returnValues: [],
  };

  const VERSIONS = ["1.13.0", "1.12.4"];

  function lookup(records: ApiAvailability[]): AvailabilityLookup {
    return {
      versions: VERSIONS,
      records: new Map(records.map((r) => [symbolIdentityKey(r.identity), r])),
      transitions: signatureTransitionNames(records, VERSIONS),
    };
  }

  function modelPage(
    fn: ApiFunction,
    record: Omit<ApiAvailability, "identity">,
    route = "/api/model",
    siblings: ApiAvailability[] = [],
  ): ApiPage {
    const identity = {
      namespace: "model",
      kind: "FUNCTION",
      name: fn.name,
      signature: normalizedFunctionSignature(fn),
    };
    return {
      namespace: "model",
      route,
      brief: "",
      module: {
        namespace: "model",
        brief: "",
        description: "Model component.",
        functions: [fn],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [],
      },
      translations: {},
      signatures: {},
      category: "engine",
      availability: lookup([{ identity, ...record }, ...siblings]),
    };
  }

  const material: ApiFunction = {
    name: "model.material",
    brief: "",
    description: "Old material accessor.",
    parameters: [{ name: "url", doc: "", types: ["url"], isOptional: false }],
    returnValues: [],
  };
  const replacement = {
    namespace: "model",
    kind: "FUNCTION",
    name: "model.set_texture",
    signature: normalizedFunctionSignature(setTexture),
  };

  const noLink = (text: string) => text;

  test("renders a since-newest span badge with accessible text", () => {
    const md = apiPageMarkdown(modelPage(setTexture, { availableIn: ["1.13.0"] }), noLink);
    expect(md).toContain("Since Defold 1.13.0");
    expect(md).toContain('aria-label="Availability"');
  });

  // Slice one symbol's rendered block out of the page so a position comparison
  // cannot be satisfied by another symbol's markup.
  const blockOf = (md: string, headingPrefix: string): string => {
    const start = md.indexOf(headingPrefix);
    if (start < 0) throw new Error(`no symbol block for ${headingPrefix}`);
    const next = md.indexOf("\n### ", start + headingPrefix.length);
    return next < 0 ? md.slice(start) : md.slice(start, next);
  };

  test("opens a symbol body with the availability note, ahead of its description", () => {
    const md = apiPageMarkdown(
      modelPage(material, { availableIn: ["1.12.4"], deprecatedSince: "1.12.0" }),
      noLink,
    );
    const block = blockOf(md, "### `model.material");
    const note = block.indexOf('<div class="api-availability"');
    const description = block.indexOf("Old material accessor.");
    expect(note).toBeGreaterThan(-1);
    expect(description).toBeGreaterThan(-1);
    expect(note).toBeLessThan(description);
  });

  test("a symbol carrying no note still opens its body with the description", () => {
    const md = apiPageMarkdown(modelPage(material, { availableIn: VERSIONS }), noLink);
    const block = blockOf(md, "### `model.material");
    expect(block).not.toContain('<div class="api-availability"');
    const bodyOpen = block.indexOf('<div class="api-symbol-body">');
    const description = block.indexOf("Old material accessor.");
    expect(block.slice(bodyOpen, description).trim()).toBe('<div class="api-symbol-body">');
  });

  // The newer arm of the same logical name, differing only by an added optional
  // parameter, so `signatureTransitionNames` groups the two overloads and the
  // old arm's note must say the signature changed, not that the name is gone.
  const materialWithOptions: ApiFunction = {
    ...material,
    parameters: [
      ...material.parameters,
      { name: "options", doc: "", types: ["table"], isOptional: true },
    ],
  };
  const newMaterialArm: ApiAvailability = {
    identity: {
      namespace: "model",
      kind: "FUNCTION",
      name: "model.material",
      signature: normalizedFunctionSignature(materialWithOptions),
    },
    availableIn: ["1.13.0"],
  };

  test("renders the old arm of a signature transition as changed, not removed", () => {
    const md = apiPageMarkdown(
      modelPage(material, { availableIn: ["1.12.4"] }, "/api/model", [newMaterialArm]),
      noLink,
    );
    expect(md).toContain("Signature changed in Defold 1.13.0");
    expect(md).not.toContain("Removed in Defold");
    const block = blockOf(md, "### `model.material");
    const note = block.indexOf('<div class="api-availability"');
    const description = block.indexOf("Old material accessor.");
    expect(note).toBeGreaterThan(-1);
    expect(description).toBeGreaterThan(-1);
    expect(note).toBeLessThan(description);
  });

  test("renders deprecated-since and removed-in span badges", () => {
    const md = apiPageMarkdown(
      modelPage(material, { availableIn: ["1.12.4"], deprecatedSince: "1.12.0" }),
      noLink,
    );
    expect(md).toContain("Deprecated since 1.12.0");
    expect(md).toContain("Removed in Defold 1.13.0");
  });

  // The version-keyed engine wording stays authoritative: a symbol carrying both
  // facts renders one deprecation line, not two.
  test("an availability-deprecated symbol keeps the version-keyed line and gains no second one", () => {
    const md = apiPageMarkdown(
      modelPage(
        { ...material, deprecated: "Use `model.set_texture`." },
        {
          availableIn: ["1.12.4"],
          deprecatedSince: "1.12.0",
        },
      ),
      noLink,
    );
    expect(md).toContain("Deprecated since 1.12.0");
    expect(md).not.toContain("Deprecated —");
    expect(md.match(/Deprecated/g)).toHaveLength(1);
  });

  test("renders Box2D backend applicability with no span badge for an all-versions symbol", () => {
    const md = apiPageMarkdown(
      modelPage(material, { availableIn: VERSIONS, box2d: ["v2", "v3"] }),
      noLink,
    );
    expect(md).toContain("Box2D: v2, v3");
  });

  test("links a replacement that resolves within the surface", () => {
    const md = apiPageMarkdown(
      modelPage(material, { availableIn: ["1.12.4"], replacement }),
      noLink,
      {
        resolveReplacement: (id) =>
          id.name === "model.set_texture" ? "/api/model#model-set-texture" : undefined,
      },
    );
    expect(md).toContain("[model.set_texture](/api/model#model-set-texture)");
  });

  test("falls back to the default surface API index when a replacement is unresolved", () => {
    const md = apiPageMarkdown(
      modelPage(material, { availableIn: VERSIONS, replacement }),
      noLink,
      {
        resolveReplacement: () => undefined,
      },
    );
    expect(md).toContain("[model.set_texture](/api)");
  });

  test("an unresolved replacement on a versioned page never crosses versions", () => {
    const md = apiPageMarkdown(
      modelPage(material, { availableIn: ["1.12.4"], replacement }, "/api/1.12.4/model"),
      noLink,
      { resolveReplacement: () => undefined },
    );
    expect(md).toContain("[model.set_texture](/api/1.12.4)");
    expect(md).not.toContain("](/api/model");
  });

  test("a symbol with no availability record renders no badge block", () => {
    const page = modelPage(material, { availableIn: VERSIONS });
    page.availability = { versions: VERSIONS, records: new Map(), transitions: new Set() };
    const md = apiPageMarkdown(page, noLink);
    expect(md).not.toContain('aria-label="Availability"');
  });

  const headingLineOf = (md: string, prefix: string) =>
    md.split("\n").find((line) => line.startsWith(prefix));

  test("marks a since symbol with a New glyph chip on its signature heading (Combined only)", () => {
    const md = apiPageMarkdown(modelPage(setTexture, { availableIn: ["1.13.0"] }), noLink, {
      combinedMarkers: true,
    });
    const heading = headingLineOf(md, "### `model.set_texture");
    expect(heading).toContain(
      '<span class="api-badge-dot api-badge-dot--new" aria-label="New" title="New">N</span>',
    );
  });

  test("marks a deprecated symbol with a Deprecated glyph chip and no other marker", () => {
    const md = apiPageMarkdown(
      modelPage(material, { availableIn: VERSIONS, deprecatedSince: "1.12.0" }),
      noLink,
      { combinedMarkers: true },
    );
    const heading = headingLineOf(md, "### `model.material");
    expect(heading).toContain(
      'api-badge-dot--deprecated" aria-label="Deprecated" title="Deprecated">D</span>',
    );
    expect(heading).not.toContain("api-badge-dot--new");
    expect(heading).not.toContain("api-badge-dot--changed");
  });

  test("a universal symbol carrying no lifecycle fact emits no marker", () => {
    const md = apiPageMarkdown(modelPage(material, { availableIn: VERSIONS }), noLink, {
      combinedMarkers: true,
    });
    expect(md).not.toContain("api-badge-dot");
  });

  test("two co-occurring categories emit two glyph chips, changed before deprecated", () => {
    const md = apiPageMarkdown(
      modelPage(material, { availableIn: ["1.12.4"], deprecatedSince: "1.12.0" }),
      noLink,
      { combinedMarkers: true },
    );
    const heading = headingLineOf(md, "### `model.material");
    expect(heading).toBeDefined();
    if (!heading) return;
    expect(heading).toContain("api-badge-dot--changed");
    expect(heading).toContain("api-badge-dot--deprecated");
    expect(heading).not.toContain("api-badge-dot--new");
    expect(heading.indexOf("--changed")).toBeLessThan(heading.indexOf("--deprecated"));
  });

  test("an exact-version page (no combinedMarkers) keeps availability prose but emits no markers", () => {
    const md = apiPageMarkdown(
      modelPage(material, { availableIn: ["1.12.4"], deprecatedSince: "1.12.0" }),
      noLink,
    );
    expect(md).toContain('aria-label="Availability"');
    expect(md).toContain("Deprecated since 1.12.0");
    expect(md).not.toContain("api-badge-dot");
  });

  test("Combined: a newest-only symbol deprecated as of the newest version renders Deprecated, not New", () => {
    const resetConstant: ApiFunction = {
      name: "model.reset_constant",
      brief: "",
      description: "Reset a shader constant.",
      parameters: [{ name: "url", doc: "", types: ["url"], isOptional: false }],
      returnValues: [],
    };
    const identity = {
      namespace: "model",
      kind: "FUNCTION",
      name: resetConstant.name,
      signature: normalizedFunctionSignature(resetConstant),
    };
    const emptyModel = {
      namespace: "model",
      brief: "",
      description: "Model.",
      functions: [],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    const combined = buildCombinedSurface({
      surfaces: [
        { version: "1.13.0", modules: [{ ...emptyModel, functions: [resetConstant] }] },
        { version: "1.12.4", modules: [emptyModel] },
      ],
      signatures: {
        versions: {
          "1.13.0": { [symbolIdentityKey(identity)]: "function reset_constant(url: url): void;" },
        },
      },
      overlay: {
        versions: ["1.13.0", "1.12.4"],
        records: new Map([
          [
            symbolIdentityKey(identity),
            { identity, availableIn: ["1.13.0"], deprecatedSince: "1.13.0" },
          ],
        ]),
        transitions: new Set(),
      },
    });
    const ns = combined.namespaces.find((n) => n.namespace === "model");
    if (!ns) throw new Error("model namespace missing from combined surface");
    const md = apiPageMarkdown(combinedNamespaceToApiPage(ns), noLink, { combinedMarkers: true });
    const heading = headingLineOf(md, "### `model.reset_constant");
    expect(heading).toBeDefined();
    expect(heading).toContain("api-badge-dot--deprecated");
    expect(heading).not.toContain("api-badge-dot--new");
    expect(md).toContain("Deprecated since 1.13.0");
    expect(md).not.toContain("Since Defold");
  });

  const overviewRegion = (md: string): string => {
    const start = md.indexOf('<div class="api-overview"');
    const end = md.indexOf("</div>", start);
    return md.slice(start, end);
  };

  test("a Combined page appends the category dot after the function-overview signature link", () => {
    const md = apiPageMarkdown(modelPage(setTexture, { availableIn: ["1.13.0"] }), noLink, {
      combinedMarkers: true,
    });
    const overview = overviewRegion(md);
    expect(overview).toContain('api-badge-dot api-badge-dot--new" aria-label="New"');
    // The dot follows the signature link, not before it, inside the same item.
    expect(overview.indexOf("](#")).toBeLessThan(overview.indexOf("api-badge-dot"));
  });

  test("the same page without combinedMarkers renders the overview list with no dots", () => {
    const md = apiPageMarkdown(modelPage(setTexture, { availableIn: ["1.13.0"] }), noLink);
    expect(overviewRegion(md)).not.toContain("api-badge-dot");
  });
});

describe("apiPageMarkdown authoritative member signatures", () => {
  const CONST_SIG =
    'b2d.body.B2_DYNAMIC_BODY: number & { readonly __brand: "b2d.body.B2_DYNAMIC_BODY" }';
  const constKey = symbolIdentityKey({
    namespace: "b2d.body",
    kind: "CONSTANT",
    name: "b2d.body.B2_DYNAMIC_BODY",
    signature: "",
  });
  const noLink = (text: string) => text;

  function combinedConstPage(): ApiPage {
    return {
      namespace: "b2d.body",
      route: "/api/combined/b2d.body",
      brief: "",
      module: {
        namespace: "b2d.body",
        brief: "",
        description: "Box2D body.",
        functions: [],
        variables: [],
        constants: [
          { name: "b2d.body.B2_DYNAMIC_BODY", brief: "", description: "A dynamic body." },
        ],
        properties: [],
        typedefs: [],
      },
      translations: {},
      signatures: {},
      category: "engine",
      authoritativeSignatures: new Map([[constKey, CONST_SIG]]),
    };
  }

  test("a Combined constant heading and its symbol-index anchor slugify the authoritative identity-name form and agree", () => {
    const page = combinedConstPage();
    const md = apiPageMarkdown(page, noLink, { combinedMarkers: true });
    expect(md).toContain(`### \`${CONST_SIG}\``);
    const index = buildSymbolIndex([page]);
    expect(index["b2d.body.B2_DYNAMIC_BODY"]?.route).toBe(
      `/api/combined/b2d.body#${slugify(CONST_SIG)}`,
    );
  });

  test("an exact-version member page (no authoritative map) renders the token signature byte-for-byte", () => {
    const withMap = combinedConstPage();
    const page: ApiPage = {
      namespace: withMap.namespace,
      route: "/api/1.12.4/b2d.body",
      brief: withMap.brief,
      module: withMap.module,
      translations: {},
      signatures: {},
      category: "engine",
    };
    const md = apiPageMarkdown(page, noLink);
    expect(md).toContain("### `b2d.body.B2_DYNAMIC_BODY`");
    expect(md).not.toContain(CONST_SIG);
  });

  test("on the committed surface a Combined json.null variable heading never emits the _null alias", () => {
    const json = loadCombinedSurface(REAL_TYPES_DIR).namespaces.find((n) => n.namespace === "json");
    if (!json) throw new Error("json namespace missing from combined surface");
    const md = apiPageMarkdown(combinedNamespaceToApiPage(json), noLink, { combinedMarkers: true });
    expect(md).toContain("### `json.null: unknown`");
    // The `_null` emitter alias must not reach the rendered member form.
    expect(md).not.toContain("_null: unknown");
  });
});

describe("apiPageMarkdown title badges", () => {
  const h1LineOf = (md: string) => md.split("\n").find((line) => line.startsWith("# "));

  test("appends titleBadges inline on the H1 line, not as a standalone block after it", () => {
    const md = apiPageMarkdown(versionedWmathPage(), (t) => t, {
      titleBadges: '<span class="api-badge-counts">PILLS</span>',
    });
    const h1 = h1LineOf(md);
    // the pill rides the H1 line so it renders on the heading baseline, not below
    expect(h1).toBe('# wmath <span class="api-badge-counts">PILLS</span>');
    // never emitted as its own block line after the heading
    expect(md).not.toMatch(/\n<span class="api-badge-counts">PILLS<\/span>\n/);
    // still ahead of the intro prose
    expect(md.indexOf("PILLS")).toBeLessThan(md.indexOf("Old-version math helpers."));
  });

  test("omitting titleBadges leaves the heading unchanged", () => {
    const md = apiPageMarkdown(versionedWmathPage(), (t) => t);
    expect(md).not.toContain("api-badge-counts");
    expect(md.startsWith("# wmath")).toBe(true);
    expect(h1LineOf(md)).toBe("# wmath");
  });
});

describe("namespaceCountBadges visible text", () => {
  test("each pill shows its tally and category noun as visible text", () => {
    const html = namespaceCountBadges({ new: 12, changed: 3, deprecated: 1 });
    expect(html).toContain(">12 new</span>");
    expect(html).toContain(">3 changed</span>");
    expect(html).toContain(">1 deprecated</span>");
  });

  test("a zero category is omitted; an all-zero namespace shows nothing", () => {
    expect(namespaceCountBadges({ new: 2, changed: 0, deprecated: 0 })).not.toContain("changed");
    expect(namespaceCountBadges({ new: 0, changed: 0, deprecated: 0 })).toBe("");
  });

  test("wraps the pills in an inline span so they can ride a heading baseline", () => {
    const html = namespaceCountBadges({ new: 3, changed: 0, deprecated: 0 });
    expect(html).toContain('<span class="api-badge-counts"');
    expect(html).not.toContain("<div");
  });
});

describe("navNamespaceBadges (sidebar count pills)", () => {
  test("an all-zero namespace renders nothing", () => {
    expect(navNamespaceBadges({ new: 0, changed: 0, deprecated: 0 })).toBe("");
  });

  test("one nav-badge-count span per non-zero category, compact tally text + category aria-label", () => {
    const html = navNamespaceBadges({ new: 12, changed: 3, deprecated: 1 });
    expect(html).toContain(
      '<span class="nav-badge-count nav-badge-count--new" aria-label="12 new symbols">12</span>',
    );
    expect(html).toContain(
      '<span class="nav-badge-count nav-badge-count--changed" aria-label="3 changed symbols">3</span>',
    );
    expect(html).toContain(
      '<span class="nav-badge-count nav-badge-count--deprecated" aria-label="1 deprecated symbols">1</span>',
    );
    // Exactly three pills for three non-zero categories.
    expect(html.match(/nav-badge-count nav-badge-count--/g)).toHaveLength(3);
  });

  test("a zero category emits no pill", () => {
    const html = navNamespaceBadges({ new: 2, changed: 0, deprecated: 0 });
    expect(html).toContain("nav-badge-count--new");
    expect(html).not.toContain("nav-badge-count--changed");
    expect(html).not.toContain("nav-badge-count--deprecated");
  });
});

describe("Combined page authoritative render + markers", () => {
  const surface = loadCombinedSurface(REAL_TYPES_DIR);
  const combinedPage = (namespace: string): ApiPage => {
    const ns = surface.namespaces.find((n) => n.namespace === namespace);
    if (!ns) throw new Error(`namespace ${namespace} missing from combined surface`);
    return combinedNamespaceToApiPage(ns);
  };
  const noLink = (t: string) => t;

  test("compute page heading and its function-overview anchor slugify the authoritative signature", () => {
    const md = apiPageMarkdown(combinedPage("compute"), noLink, { combinedMarkers: true });
    const authoritative =
      "compute.get_constants(path: Hash | string): { name: Hash; type: number; value: Vector4 | Matrix4 }[]";
    const headingLine = md
      .split("\n")
      .find((l) => l.startsWith("### `") && l.includes("compute.get_constants("));
    expect(headingLine).toBeDefined();
    expect(headingLine).toContain(`### \`${authoritative}\``);
    // The rendered signature never falls back to the ref-doc token form; the
    // Returns detail table (a separate ref-doc projection) is out of scope.
    expect(headingLine).not.toContain("Record<string | number, unknown>");
    // The function-overview card links the same authoritative signature by its slug.
    expect(md).toContain(`(#${slugify(authoritative)})`);
  });

  test("both liveupdate.add_mount arms render distinctly and adjacently, oldest-first", () => {
    const md = apiPageMarkdown(combinedPage("liveupdate"), noLink, { combinedMarkers: true });
    const headings = md
      .split("\n")
      .filter((l) => l.startsWith("### `") && l.includes("liveupdate.add_mount("));
    expect(headings).toHaveLength(2);
    expect(headings[0]).not.toBe(headings[1]);
    // Oldest arm (fewer params) leads.
    expect((headings[0] as string).length).toBeLessThan((headings[1] as string).length);
  });

  test("the authoritative-signature heading id drops the marker glyph and matches the overview anchor", async () => {
    const html = await renderMarkdown(
      apiPageMarkdown(combinedPage("compute"), noLink, { combinedMarkers: true }),
      { highlightSignatureHeadings: true },
    );
    const authoritative =
      "compute.get_constants(path: Hash | string): { name: Hash; type: number; value: Vector4 | Matrix4 }[]";
    const slug = slugify(authoritative);
    expect(html).toContain(`id="${slug}"`);
    expect(html).toContain(`href="#${slug}"`);
    // The glyph chip must not leak into the slug.
    expect(html).not.toContain(`id="${slug}n"`);
    expect(html).not.toContain(`id="${slug}-n"`);
  });

  test("an exact-version page renders no markers even with availability records present", () => {
    const defaultPages = loadApiSurface(REAL_TYPES_DIR);
    const enginePage = defaultPages.find((p) => p.category === "engine" && p.availability);
    expect(enginePage).toBeDefined();
    const md = apiPageMarkdown(enginePage as ApiPage, noLink);
    expect(md).not.toContain("api-badge-dot");
  });
});

describe("signature brand deep-links", () => {
  // Track `<a`/`</a>` depth over the rendered HTML; any depth above 1 means an
  // anchor is nested inside another anchor — invalid, and the shipped-feature
  // regression this slice's guard exists to catch.
  function hasNestedAnchor(html: string): boolean {
    const re = /<a\b|<\/a>/g;
    let depth = 0;
    let m: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex-exec loop
    while ((m = re.exec(html)) !== null) {
      if (m[0] === "</a>") depth--;
      else if (++depth > 1) return true;
    }
    return false;
  }

  // Both real render sites in one document: an H3 signature heading (wrapped by
  // `slugify-headings` in a `heading-anchor`) and an overview `[`sig`](#anchor)`
  // jump item — each carrying an `Opaque<"node">` brand.
  const bothSitesMarkdown = [
    '### `factory.create(url: string): Opaque<"node">`',
    "",
    '- [`factory.create(url: string): Opaque<"node">`](#anchor)',
    "",
  ].join("\n");

  test("links the Opaque brand at both render sites with no nested anchors", async () => {
    const pages = canonicalApiPages(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const html = await renderMarkdown(bothSitesMarkdown, {
      highlightSignatureHeadings: true,
      signatureSymbolLinks: apiSignatureSymbolLinks(pages),
    });
    // One brand link per render site.
    expect((html.match(/class="signature-symbol-link"/g) ?? []).length).toBe(2);
    expect((html.match(/href="\/api\/Opaque"/g) ?? []).length).toBe(2);
    expect(hasNestedAnchor(html)).toBe(false);
  });

  test("the outer permalink/jump anchor still covers the non-brand signature text", async () => {
    const pages = canonicalApiPages(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const html = await renderMarkdown(bothSitesMarkdown, {
      highlightSignatureHeadings: true,
      signatureSymbolLinks: apiSignatureSymbolLinks(pages),
    });
    // The heading permalink still wraps the PRE fragment (the code up to Opaque).
    expect(html).toContain('<a class="heading-anchor"');
    expect(html).toMatch(/<a class="heading-anchor"[^>]*><code class="api-signature shiki">/);
    // The overview jump anchor still wraps its PRE fragment.
    expect(html).toMatch(/<a href="#anchor"><code class="api-signature shiki">/);
  });

  test("omitting signatureSymbolLinks produces no brand link and no nesting", async () => {
    const html = await renderMarkdown(bothSitesMarkdown, { highlightSignatureHeadings: true });
    expect(html).not.toContain("signature-symbol-link");
    expect(hasNestedAnchor(html)).toBe(false);
  });
});

describe("apiReplacementResolver", () => {
  test("resolves a known member to its page route with anchor and returns undefined otherwise", () => {
    const pages = canonicalApiPages(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const resolve = apiReplacementResolver(pages);
    const go = pages.find((p) => p.namespace === "go");
    expect(go).toBeDefined();
    const route = resolve({
      namespace: "go",
      kind: "FUNCTION",
      name: "go.get_position",
      signature: "",
    });
    expect(route).toBeDefined();
    expect(route?.startsWith("/api/go")).toBe(true);
    expect(
      resolve({ namespace: "go", kind: "FUNCTION", name: "go.nonexistent_symbol", signature: "" }),
    ).toBeUndefined();
  });

  test("resolves against an exact-version surface to that version's prefixed route", () => {
    const pages = loadApiSurfaceForVersion(REAL_TYPES_DIR, "defold-1.12.4");
    const resolve = apiReplacementResolver(pages);
    expect(pages.find((p) => p.namespace === "go")).toBeDefined();
    const route = resolve({
      namespace: "go",
      kind: "FUNCTION",
      name: "go.get_position",
      signature: "",
    });
    expect(route?.startsWith("/api/defold-1.12.4/go")).toBe(true);
  });
});

describe("LibraryHeading — path", () => {
  const headingHtml = (owner: string, repo: string, namespace: string): string =>
    LibraryHeading({ owner, repo, namespace }).toString();

  test("renders the owner, repo, and namespace as one accented path", () => {
    const h1 = headingHtml("whiteboxdev", "library-defold-persist", "persist");
    expect(h1).toContain("whiteboxdev");
    expect(h1).toContain("library-defold-persist");
    expect(h1).toContain('text-accent">persist');
  });

  test("collapses a namespace that repeats its repo name", () => {
    const h1 = headingHtml("Insality", "druid", "druid");
    expect(h1.split("druid").length - 1).toBe(1);
    expect(h1).toContain("Insality");
  });
});

// A fork whose surface is mostly ambient globals (`boom`, `deftest`) publishes
// symbols the page's single `import * as …` step does not reach, so the marker
// and the import caveat are what keep the page from reading as if it did.
describe("apiPageMarkdown ambient-global marker", () => {
  const noLink = (text: string) => text;

  const pageWithFunctions = (functions: (Partial<ApiFunction> & { name: string })[]): ApiPage =>
    libraryPageWithMeta({
      module: {
        namespace: "orthographic.camera",
        brief: "Camera",
        description: "Orthographic camera helpers.",
        functions: functions.map(
          (fn) =>
            ({
              brief: "",
              description: "",
              parameters: [],
              returnValues: [],
              ...fn,
            }) as ApiFunction,
        ),
        variables: [],
        constants: [],
        properties: [],
        typedefs: [],
      },
    });

  test("marks a global symbol's heading and leaves a module member's unmarked", () => {
    const md = apiPageMarkdown(
      pageWithFunctions([{ name: "describe", global: true }, { name: "camera.get_zoom" }]),
      noLink,
    );
    const heading = (signature: string) =>
      md.split("\n").find((line) => line.startsWith(`### \`${signature}\``)) ?? "";

    expect(heading("describe()")).toContain(
      'api-badge-dot--global" aria-label="Ambient global" title="Ambient global">G</span>',
    );
    expect(heading("camera.get_zoom()")).not.toContain("api-badge-dot");
  });

  test("a page with a global symbol adds the no-import caveat under the import step", () => {
    const md = apiPageMarkdown(
      pageWithFunctions([{ name: "describe", global: true }, { name: "camera.get_zoom" }]),
      noLink,
    );
    expect(md).toContain('import * as camera from "orthographic.camera"');
    expect(md).toContain("ambient globals");
    // The caveat belongs to the import step, so it sits after the fenced import.
    expect(md.indexOf("ambient globals")).toBeGreaterThan(
      md.indexOf('import * as camera from "orthographic.camera"'),
    );
  });

  test("a page with no global symbol leaves the provenance block unchanged", () => {
    const md = apiPageMarkdown(pageWithFunctions([{ name: "camera.get_zoom" }]), noLink);
    expect(md).toContain('import * as camera from "orthographic.camera"');
    expect(md).not.toContain("ambient globals");
    expect(md).not.toContain("api-badge-dot");
  });
});

// An imported brief is upstream's prose, not the fork's, and the page says so
// rather than presenting it as first-party. The marker reuses the `api-badge-dot`
// markup so the heading slugger's strip rule already covers it — adding provenance
// must not move an anchor a reader may have linked.
describe("apiPageMarkdown upstream-documentation marker", () => {
  const noLink = (text: string) => text;

  const pageWithFunctions = (functions: (Partial<ApiFunction> & { name: string })[]): ApiPage =>
    libraryPageWithMeta({
      module: {
        namespace: "orthographic.camera",
        brief: "Camera",
        description: "Orthographic camera helpers.",
        functions: functions.map(
          (fn) =>
            ({
              brief: "",
              description: "",
              parameters: [],
              returnValues: [],
              ...fn,
            }) as ApiFunction,
        ),
        variables: [],
        constants: [],
        properties: [],
        typedefs: [],
      },
    });

  const heading = (md: string, signature: string) =>
    md.split("\n").find((line) => line.startsWith(`### \`${signature}\``)) ?? "";

  test("marks an imported symbol's heading and leaves a fork-documented one unmarked", () => {
    const md = apiPageMarkdown(
      pageWithFunctions([
        { name: "camera.start", docSource: "upstream", brief: "Start the camera" },
        { name: "camera.get_zoom", brief: "Get the current zoom level of the camera." },
      ]),
      noLink,
    );

    expect(heading(md, "camera.start()")).toContain(
      'api-badge-dot--upstream" aria-label="Documentation imported from upstream" title="Documentation imported from upstream">U</span>',
    );
    expect(heading(md, "camera.get_zoom()")).not.toContain("api-badge-dot");
  });

  test("a page with no imported symbol renders no marker at all", () => {
    const md = apiPageMarkdown(pageWithFunctions([{ name: "camera.get_zoom" }]), noLink);
    expect(md).not.toContain("api-badge-dot--upstream");
    expect(md).not.toContain("Documentation imported from upstream");
  });

  // Through `renderMarkdown`, because the slug is derived there: the assertion has
  // to compare the anchors the site actually emits, not the markdown they come from.
  test("the marker leaves the heading anchor byte-identical to the unmarked page", async () => {
    const anchors = async (fn: Partial<ApiFunction> & { name: string }) => {
      const html = await renderMarkdown(apiPageMarkdown(pageWithFunctions([fn]), noLink));
      return [...html.matchAll(/<h3[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
    };

    const marked = await anchors({ name: "camera.start", docSource: "upstream" });
    const plain = await anchors({ name: "camera.start" });

    expect(marked).toContain("camerastart");
    expect(marked).toEqual(plain);
  });

  // End-to-end over the committed api-docs. Both namespaces come from the measured
  // precedence evidence: defcon's fork documents `start` nowhere, and
  // orthographic.camera's fork writes its own `get_zoom` brief over upstream's.
  test("the real defcon page marks start, and orthographic.camera does not mark get_zoom", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const page = (namespace: string) => {
      const found = pages.find((p) => p.namespace === namespace);
      if (!found) throw new Error(`no ${namespace} page in the real surface`);
      return apiPageMarkdown(found, apiLinkify(pages));
    };
    const headingFor = (md: string, signature: string) =>
      md.split("\n").find((line) => line.startsWith(`### \`${signature}`)) ?? "";

    const start = headingFor(page("defcon"), "start(");
    expect(start).toContain("api-badge-dot--upstream");
    expect(start).toContain("Documentation imported from upstream");

    const getZoom = headingFor(page("orthographic.camera"), "get_zoom(");
    expect(getZoom).not.toBe("");
    expect(getZoom).not.toContain("api-badge-dot");
  });

  test("both markers ride the same heading when a symbol is global and imported", () => {
    const md = apiPageMarkdown(
      pageWithFunctions([{ name: "describe", global: true, docSource: "upstream" }]),
      noLink,
    );
    expect(heading(md, "describe()")).toContain("api-badge-dot--global");
    expect(heading(md, "describe()")).toContain("api-badge-dot--upstream");
  });
});

// The `@deprecated` carried from an authored `.d.ts` renders as text in the same
// availability block that holds the engine lifecycle facts, so a `library` page —
// which never has an availability record — still shows the fact.
describe("apiPageMarkdown deprecation from the api-doc tag", () => {
  const noLink = (text: string) => text;

  function libraryPage(fn: Partial<ApiFunction> & { name: string }): ApiPage {
    return {
      namespace: "yagames",
      route: "/api/yagames",
      brief: "YaGames",
      module: {
        namespace: "yagames",
        brief: "YaGames",
        description: "Yandex Games bindings.",
        functions: [
          { brief: "", description: "", parameters: [], returnValues: [], ...fn } as ApiFunction,
        ],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [],
      },
      translations: {},
      signatures: {},
      category: "library",
    };
  }

  test("renders the label and the tag text as an availability list item", () => {
    const md = apiPageMarkdown(
      libraryPage({ name: "player_get_id", deprecated: "Use `player_get_unique_id` instead." }),
      noLink,
    );
    expect(md).toContain('aria-label="Availability"');
    expect(md).toContain("- Deprecated — Use `player_get_unique_id` instead.");
  });

  test("renders a bare tag as the label alone, with no dash", () => {
    const md = apiPageMarkdown(libraryPage({ name: "old_thing", deprecated: "" }), noLink);
    expect(md).toContain('aria-label="Availability"');
    expect(md).toContain("- Deprecated\n");
    expect(md).not.toContain("Deprecated —");
  });

  test("folds a wrapped tag onto one list item so a continuation cannot break the list", () => {
    const md = apiPageMarkdown(
      libraryPage({
        name: "leaderboards_init",
        deprecated: "The leaderboards subsystem no longer needs initializing;\n- the others work.",
      }),
      noLink,
    );
    expect(md).toContain(
      "- Deprecated — The leaderboards subsystem no longer needs initializing; - the others work.",
    );
  });

  test("opens the symbol body with a source-tag-only note, ahead of the description", () => {
    const md = apiPageMarkdown(
      libraryPage({
        name: "player_get_id",
        description: "Library function.",
        deprecated: "Use `player_get_unique_id` instead.",
      }),
      noLink,
    );
    const note = md.indexOf('<div class="api-availability"');
    const description = md.indexOf("Library function.");
    expect(note).toBeGreaterThan(-1);
    expect(description).toBeGreaterThan(-1);
    expect(note).toBeLessThan(description);
  });

  test("renders no availability block when the symbol carries neither fact", () => {
    const md = apiPageMarkdown(libraryPage({ name: "current_thing" }), noLink);
    expect(md).not.toContain('aria-label="Availability"');
    expect(md).not.toContain("Deprecated");
  });

  // The same page, but with a curated availability record joined onto the symbol —
  // the state where both an engine fact and a source tag exist at once.
  function pageWithAvailability(
    fn: Partial<ApiFunction> & { name: string },
    record: Omit<ApiAvailability, "identity">,
  ): ApiPage {
    const page = libraryPage(fn);
    const built = page.module.functions[0] as ApiFunction;
    const identity = {
      namespace: "yagames",
      kind: "FUNCTION",
      name: built.name,
      signature: normalizedFunctionSignature(built),
    };
    const availability: AvailabilityLookup = {
      versions: ["1.13.0", "1.12.4"],
      records: new Map([[symbolIdentityKey(identity), { identity, ...record }]]),
      transitions: new Set(),
    };
    return { ...page, availability };
  }

  test("a span-bearing record with no deprecatedSince still shows the source tag, listed first", () => {
    const md = apiPageMarkdown(
      pageWithAvailability(
        { name: "player_get_id", deprecated: "Use `player_get_unique_id` instead." },
        { availableIn: ["1.13.0"] },
      ),
      noLink,
    );

    const block = md.slice(md.indexOf('aria-label="Availability"'));
    expect(md.match(/aria-label="Availability"/g)).toHaveLength(1);
    const tagAt = block.indexOf("- Deprecated — Use `player_get_unique_id` instead.");
    const spanAt = block.indexOf("- Since Defold 1.13.0");
    expect(tagAt).toBeGreaterThanOrEqual(0);
    expect(spanAt).toBeGreaterThanOrEqual(0);
    expect(tagAt).toBeLessThan(spanAt);
  });

  test("a record carrying deprecatedSince keeps the version-keyed line and gains no second one", () => {
    const md = apiPageMarkdown(
      pageWithAvailability(
        { name: "player_get_id", deprecated: "Use `player_get_unique_id` instead." },
        { availableIn: ["1.12.4"], deprecatedSince: "1.12.0" },
      ),
      noLink,
    );

    expect(md).toContain("Deprecated since 1.12.0");
    expect(md).not.toContain("Deprecated — Use `player_get_unique_id` instead.");
    expect(md.match(/- Deprecated/g)).toHaveLength(1);
  });
});
