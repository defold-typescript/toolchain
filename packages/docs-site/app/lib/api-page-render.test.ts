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
    expect(md).toContain('select(n: number | "#", ...args: any[]): any');
    expect(md).not.toContain(`\`${thin}\``);
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
