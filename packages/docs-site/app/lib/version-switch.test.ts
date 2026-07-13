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
  test("no concrete version is current on an unprefixed (Combined) page; every version route is prefixed", () => {
    expect(buildVersionSwitcher({ versions, namespacesByVersion, route: "/api/camera" })).toEqual([
      { id: "cur", label: "cur", route: "/api/cur/camera", isCurrent: false },
      { id: "old", label: "old", route: "/api/old", isCurrent: false },
    ]);
  });

  test("uses a prefixed version route as current and falls back when switching to a missing namespace", () => {
    expect(
      buildVersionSwitcher({ versions, namespacesByVersion, route: "/api/old/wmath" }),
    ).toEqual([
      { id: "cur", label: "cur", route: "/api/cur", isCurrent: false },
      { id: "old", label: "old", route: "/api/old/wmath", isCurrent: true },
    ]);
  });

  test("preserves a shared namespace when switching versions (both prefixed)", () => {
    expect(buildVersionSwitcher({ versions, namespacesByVersion, route: "/api/shared" })).toEqual([
      { id: "cur", label: "cur", route: "/api/cur/shared", isCurrent: false },
      { id: "old", label: "old", route: "/api/old/shared", isCurrent: false },
    ]);
  });

  test("links each version's own prefixed index from the canonical index", () => {
    expect(buildVersionSwitcher({ versions, namespacesByVersion, route: "/api" })).toEqual([
      { id: "cur", label: "cur", route: "/api/cur", isCurrent: false },
      { id: "old", label: "old", route: "/api/old", isCurrent: false },
    ]);
  });

  test("links each version's prefixed index from a non-API route", () => {
    expect(buildVersionSwitcher({ versions, namespacesByVersion, route: "/guide/x" })).toEqual([
      { id: "cur", label: "cur", route: "/api/cur", isCurrent: false },
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
    expect(entries.map((e) => e.route)).toEqual(["/api/defold-1.13.0/go", "/api/defold-1.12.4/go"]);
  });
});

describe("buildVersionSwitcher combined option", () => {
  const combinedNamespaces = ["camera", "shared", "wmath"];

  test("appends a Combined entry, current on an unprefixed page, routed to the canonical /api/<ns>", () => {
    expect(
      buildVersionSwitcher({
        versions,
        namespacesByVersion,
        combinedNamespaces,
        route: "/api/camera",
      }),
    ).toEqual([
      { id: "cur", label: "cur", route: "/api/cur/camera", isCurrent: false },
      { id: "old", label: "old", route: "/api/old", isCurrent: false },
      { id: "combined", label: "Combined", route: "/api/camera", isCurrent: true },
    ]);
  });

  test("preserves the namespace across versions while Combined stays canonical", () => {
    expect(
      buildVersionSwitcher({
        versions,
        namespacesByVersion,
        combinedNamespaces,
        route: "/api/shared",
      }),
    ).toEqual([
      { id: "cur", label: "cur", route: "/api/cur/shared", isCurrent: false },
      { id: "old", label: "old", route: "/api/old/shared", isCurrent: false },
      { id: "combined", label: "Combined", route: "/api/shared", isCurrent: true },
    ]);
  });

  test("drops to the /api index when the namespace is unknown to the combined surface", () => {
    const entries = buildVersionSwitcher({
      versions,
      namespacesByVersion,
      combinedNamespaces,
      route: "/api",
    });
    expect(entries.find((e) => e.id === "combined")).toEqual({
      id: "combined",
      label: "Combined",
      route: "/api",
      isCurrent: true,
    });
  });

  test("marks the concrete version current on its prefixed route, not Combined", () => {
    const entries = buildVersionSwitcher({
      versions,
      namespacesByVersion,
      combinedNamespaces,
      route: "/api/old/wmath",
    });
    expect(entries.find((e) => e.isCurrent)?.id).toBe("old");
    expect(entries.find((e) => e.id === "combined")?.isCurrent).toBe(false);
  });

  test("omits the Combined entry when no combinedNamespaces are given", () => {
    const entries = buildVersionSwitcher({ versions, namespacesByVersion, route: "/api/camera" });
    expect(entries.some((e) => e.id === "combined")).toBe(false);
  });
});

describe("versionLabel", () => {
  test("derives 'Defold <semver>' from a defold-<semver> id", () => {
    expect(versionLabel("defold-1.13.0")).toBe("Defold 1.13.0");
    expect(versionLabel("defold-1.12.4")).toBe("Defold 1.12.4");
  });

  test("labels the combined virtual id", () => {
    expect(versionLabel("combined")).toBe("Combined");
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
