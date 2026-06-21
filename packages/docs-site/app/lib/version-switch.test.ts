import { describe, expect, test } from "bun:test";
import type { ApiVersion } from "./api-surface-loader";
import { buildVersionSwitcher, isApiRoute } from "./version-switch";

const versions: ApiVersion[] = [
  { id: "cur", isDefault: true },
  { id: "old", isDefault: false },
];

const namespacesByVersion = {
  cur: ["camera", "alpha", "base", "bit", "shared"],
  old: ["wmath", "shared"],
};

describe("buildVersionSwitcher", () => {
  test("uses the default version on unprefixed API pages", () => {
    expect(buildVersionSwitcher({ versions, namespacesByVersion, route: "/api/camera" })).toEqual([
      { id: "cur", route: "/api/camera", isCurrent: true },
      { id: "old", route: "/api/old", isCurrent: false },
    ]);
  });

  test("uses a prefixed version route as current and falls back when switching to a missing namespace", () => {
    expect(
      buildVersionSwitcher({ versions, namespacesByVersion, route: "/api/old/wmath" }),
    ).toEqual([
      { id: "cur", route: "/api", isCurrent: false },
      { id: "old", route: "/api/old/wmath", isCurrent: true },
    ]);
  });

  test("preserves a shared namespace when switching versions", () => {
    expect(buildVersionSwitcher({ versions, namespacesByVersion, route: "/api/shared" })).toEqual([
      { id: "cur", route: "/api/shared", isCurrent: true },
      { id: "old", route: "/api/old/shared", isCurrent: false },
    ]);
  });

  test("links indexes from the default index", () => {
    expect(buildVersionSwitcher({ versions, namespacesByVersion, route: "/api" })).toEqual([
      { id: "cur", route: "/api", isCurrent: true },
      { id: "old", route: "/api/old", isCurrent: false },
    ]);
  });

  test("links each version's API index from a non-API route", () => {
    expect(buildVersionSwitcher({ versions, namespacesByVersion, route: "/guide/x" })).toEqual([
      { id: "cur", route: "/api", isCurrent: true },
      { id: "old", route: "/api/old", isCurrent: false },
    ]);
  });
});

describe("isApiRoute", () => {
  test("matches API routes", () => {
    expect(isApiRoute("/api/go")).toBe(true);
    expect(isApiRoute("/api/old/wmath")).toBe(true);
  });

  test("rejects non-API routes", () => {
    expect(isApiRoute("/guide/x")).toBe(false);
    expect(isApiRoute("/")).toBe(false);
  });
});
