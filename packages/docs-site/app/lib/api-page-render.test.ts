import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  type ApiAvailability,
  type ApiFunction,
  normalizedFunctionSignature,
  symbolIdentityKey,
} from "@defold-typescript/types";
import {
  apiLinkify,
  apiPageMarkdown,
  apiReplacementResolver,
  isKnownVersionId,
  namespaceCountBadges,
  versionedApiParams,
} from "./api-page-render";
import { type ApiPage, type AvailabilityLookup, apiModuleSymbols } from "./api-surface";
import { loadApiSurface, loadCombinedSurface } from "./api-surface-loader";
import { combinedNamespaceToApiPage } from "./combined-surface";
import { slugify } from "./headings";
import { renderMarkdown } from "./markdown";

const FIXTURE_DIR = join(import.meta.dir, "__fixtures__/api-surface");
const MISSING_VERSION_FIXTURE_DIR = join(
  import.meta.dir,
  "__fixtures__/api-surface-missing-version",
);
const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");

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
    },
    ...overrides,
  };
}

describe("versionedApiParams", () => {
  test("yields one {version, namespace} per on-disk non-default page", () => {
    expect(versionedApiParams(FIXTURE_DIR)).toEqual([{ version: "old", namespace: "wmath" }]);
  });

  test("is empty when no non-default version has on-disk fixtures (slice ships standalone)", () => {
    expect(versionedApiParams(MISSING_VERSION_FIXTURE_DIR)).toEqual([]);
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
      "client:receive(pattern?: string | number, prefix?: string): LuaMultiReturn<[string | unknown, string | unknown, string | unknown]>",
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

  test("is false for the default version id (served at /api, not a version index)", () => {
    expect(isKnownVersionId("cur", versions)).toBe(false);
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
    };
  }

  function modelPage(
    fn: ApiFunction,
    record: Omit<ApiAvailability, "identity">,
    route = "/api/model",
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
      availability: lookup([{ identity, ...record }]),
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

  test("renders deprecated-since and through-oldest span badges", () => {
    const md = apiPageMarkdown(
      modelPage(material, { availableIn: ["1.12.4"], deprecatedSince: "1.12.0" }),
      noLink,
    );
    expect(md).toContain("Deprecated since 1.12.0");
    expect(md).toContain("Available through Defold 1.12.4");
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
    page.availability = { versions: VERSIONS, records: new Map() };
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
});

describe("apiPageMarkdown title badges", () => {
  test("injects titleBadges immediately after the H1 and before the intro", () => {
    const md = apiPageMarkdown(versionedWmathPage(), (t) => t, {
      titleBadges: '<div class="api-badge-counts">PILLS</div>',
    });
    const iH1 = md.indexOf("# wmath");
    const iBadges = md.indexOf('<div class="api-badge-counts">PILLS</div>');
    const iIntro = md.indexOf("Old-version math helpers.");
    expect(iH1).toBe(0);
    expect(iBadges).toBeGreaterThan(iH1);
    expect(iBadges).toBeLessThan(iIntro);
  });

  test("omitting titleBadges leaves the heading unchanged", () => {
    const md = apiPageMarkdown(versionedWmathPage(), (t) => t);
    expect(md).not.toContain("api-badge-counts");
    expect(md.startsWith("# wmath")).toBe(true);
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

describe("apiReplacementResolver", () => {
  test("resolves a known member to its page route with anchor and returns undefined otherwise", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR);
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
});
