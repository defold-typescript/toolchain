import { describe, expect, test } from "bun:test";
import type { ApiVersion } from "./api-surface-loader";
import {
  activeVersionForRoute,
  buildVersionSwitcher,
  isApiRoute,
  versionLabel,
} from "./version-switch";

const versions: ApiVersion[] = [
  { id: "cur", isDefault: true },
  { id: "old", isDefault: false },
];

const realVersions: ApiVersion[] = [
  { id: "defold-1.13.0", isDefault: true },
  { id: "defold-1.12.4", isDefault: false },
];

const namespacesByVersion = {
  cur: ["camera", "alpha", "base", "bit", "shared"],
  old: ["wmath", "shared"],
};

describe("buildVersionSwitcher", () => {
  test("uses the default version on unprefixed API pages", () => {
    expect(buildVersionSwitcher({ versions, namespacesByVersion, route: "/api/camera" })).toEqual([
      { id: "cur", label: "cur", route: "/api/camera", isCurrent: true },
      { id: "old", label: "old", route: "/api/old", isCurrent: false },
    ]);
  });

  test("uses a prefixed version route as current and falls back when switching to a missing namespace", () => {
    expect(
      buildVersionSwitcher({ versions, namespacesByVersion, route: "/api/old/wmath" }),
    ).toEqual([
      { id: "cur", label: "cur", route: "/api", isCurrent: false },
      { id: "old", label: "old", route: "/api/old/wmath", isCurrent: true },
    ]);
  });

  test("preserves a shared namespace when switching versions", () => {
    expect(buildVersionSwitcher({ versions, namespacesByVersion, route: "/api/shared" })).toEqual([
      { id: "cur", label: "cur", route: "/api/shared", isCurrent: true },
      { id: "old", label: "old", route: "/api/old/shared", isCurrent: false },
    ]);
  });

  test("links indexes from the default index", () => {
    expect(buildVersionSwitcher({ versions, namespacesByVersion, route: "/api" })).toEqual([
      { id: "cur", label: "cur", route: "/api", isCurrent: true },
      { id: "old", label: "old", route: "/api/old", isCurrent: false },
    ]);
  });

  test("links each version's API index from a non-API route", () => {
    expect(buildVersionSwitcher({ versions, namespacesByVersion, route: "/guide/x" })).toEqual([
      { id: "cur", label: "cur", route: "/api", isCurrent: true },
      { id: "old", label: "old", route: "/api/old", isCurrent: false },
    ]);
  });

  test("carries the human label for real defold-<semver> ids", () => {
    const entries = buildVersionSwitcher({
      versions: realVersions,
      namespacesByVersion: { "defold-1.13.0": ["go"], "defold-1.12.4": ["go"] },
      route: "/api/go",
    });
    expect(entries.map((e) => e.label)).toEqual(["Defold 1.13.0", "Defold 1.12.4"]);
  });
});

describe("versionLabel", () => {
  test("derives 'Defold <semver>' from a defold-<semver> id", () => {
    expect(versionLabel("defold-1.13.0")).toBe("Defold 1.13.0");
    expect(versionLabel("defold-1.12.4")).toBe("Defold 1.12.4");
  });

  test("passes a non-defold id through unchanged", () => {
    expect(versionLabel("cur")).toBe("cur");
    expect(versionLabel("old")).toBe("old");
  });
});

describe("activeVersionForRoute", () => {
  test("resolves the default version on an unprefixed API route", () => {
    expect(activeVersionForRoute("/api/go", realVersions)).toEqual({
      id: "defold-1.13.0",
      isDefault: true,
    });
  });

  test("resolves the prefixed version on a historical route", () => {
    expect(activeVersionForRoute("/api/defold-1.12.4/go", realVersions)).toEqual({
      id: "defold-1.12.4",
      isDefault: false,
    });
  });

  test("falls back to the default version on a non-API route", () => {
    expect(activeVersionForRoute("/guide/x", realVersions)).toEqual({
      id: "defold-1.13.0",
      isDefault: true,
    });
  });

  test("treats an unknown version prefix as the default version, never a silent miss", () => {
    expect(activeVersionForRoute("/api/defold-9.9.9/go", realVersions)).toEqual({
      id: "defold-1.13.0",
      isDefault: true,
    });
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
