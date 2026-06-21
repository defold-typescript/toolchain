import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  apiLinkify,
  apiPageMarkdown,
  isKnownVersionId,
  versionedApiParams,
} from "./api-page-render";
import type { ApiPage } from "./api-surface";
import { loadApiSurface } from "./api-surface-loader";

const FIXTURE_DIR = join(import.meta.dir, "__fixtures__/api-surface");
const MISSING_VERSION_FIXTURE_DIR = join(
  import.meta.dir,
  "__fixtures__/api-surface-missing-version",
);

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
