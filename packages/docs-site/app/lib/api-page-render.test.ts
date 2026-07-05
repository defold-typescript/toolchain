import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  apiLinkify,
  apiPageMarkdown,
  isKnownVersionId,
  versionedApiParams,
} from "./api-page-render";
import { type ApiPage, apiModuleSymbols } from "./api-surface";
import { loadApiSurface } from "./api-surface-loader";

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
      sourceUrl:
        "https://github.com/ts-defold/library/tree/2fe3aed3352a913d2859e6e85d34a8b23d821368/packages/defold-orthographic",
      commitUrl:
        "https://github.com/ts-defold/library/tree/2fe3aed3352a913d2859e6e85d34a8b23d821368",
      importString: "import * as camera from 'orthographic.camera'",
      license: "MIT",
      attribution:
        "defold-orthographic library by Britzl (https://github.com/britzl/defold-orthographic), vendored via ts-defold/library",
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
  test("emits the five ordered provenance bullets after the description for a library page", () => {
    const md = apiPageMarkdown(libraryPageWithMeta(), (t) => t);
    const iDesc = md.indexOf("Orthographic camera helpers.");
    const iSource = md.indexOf("- Source:");
    const iCommit = md.indexOf("- Commit pin:");
    const iImport = md.indexOf("- Import:");
    const iLicense = md.indexOf("- License:");
    const iAttribution = md.indexOf("- Attribution:");
    for (const i of [iDesc, iSource, iCommit, iImport, iLicense, iAttribution]) {
      expect(i).toBeGreaterThan(-1);
    }
    expect(iDesc).toBeLessThan(iSource);
    expect(iSource).toBeLessThan(iCommit);
    expect(iCommit).toBeLessThan(iImport);
    expect(iImport).toBeLessThan(iLicense);
    expect(iLicense).toBeLessThan(iAttribution);
  });

  test("renders the Commit pin as a clickable GitHub tree link and fences the import string", () => {
    const md = apiPageMarkdown(libraryPageWithMeta(), (t) => t);
    expect(md).toContain("](https://github.com/ts-defold/library/tree/");
    expect(md).toContain("`import * as camera from 'orthographic.camera'`");
  });

  test("a non-library page emits no provenance block", () => {
    const md = apiPageMarkdown(versionedWmathPage(), (t) => t);
    expect(md).not.toContain("- Commit pin:");
    expect(md).not.toContain("- Attribution:");
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
