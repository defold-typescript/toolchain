import { describe, expect, test } from "bun:test";
import {
  type ApiSurfaceConfig,
  activeSurfaceForPath,
  currentSurfaceForRoute,
  resolveApiSurfaceRedirect,
  rewriteApiNavForSurface,
  surfacePathForNamespace,
} from "./api-surface-pref";
import type { NavCategory } from "./nav";

const CONFIG: ApiSurfaceConfig = {
  base: "",
  defaultVersionId: "defold-1.13.0",
  versionIds: ["defold-1.12.4"],
  combinedNamespaces: ["go", "vmath", "compute"],
  // 1.12.4 owns these namespaces; global types (`Hash`, `Vector3`) and
  // default-only libraries are intentionally absent, so they never gain a
  // version prefix.
  namespacesByVersion: { "defold-1.12.4": ["go", "model", "base"] },
};

const BASED: ApiSurfaceConfig = { ...CONFIG, base: "/toolchain" };

describe("resolveApiSurfaceRedirect — new users default to Combined", () => {
  test("an un-prefixed namespace page redirects to its Combined page", () => {
    expect(resolveApiSurfaceRedirect("/api/go", null, CONFIG)).toBe("/api/combined/go");
  });

  test("the bare /api index redirects to the Combined index", () => {
    expect(resolveApiSurfaceRedirect("/api", null, CONFIG)).toBe("/api/combined");
  });

  test("a namespace with no Combined page (e.g. base) stays on the default surface", () => {
    expect(resolveApiSurfaceRedirect("/api/base", null, CONFIG)).toBeNull();
  });

  test("an empty stored preference is treated as a new user", () => {
    expect(resolveApiSurfaceRedirect("/api/go", "", CONFIG)).toBe("/api/combined/go");
  });
});

describe("resolveApiSurfaceRedirect — explicit surfaces are honored", () => {
  test("an explicit Combined route is never redirected", () => {
    expect(resolveApiSurfaceRedirect("/api/combined/go", null, CONFIG)).toBeNull();
    expect(resolveApiSurfaceRedirect("/api/combined", "defold-1.12.4", CONFIG)).toBeNull();
  });

  test("an explicit versioned route is never redirected", () => {
    expect(resolveApiSurfaceRedirect("/api/defold-1.12.4/go", null, CONFIG)).toBeNull();
  });

  test("a non-API path is ignored", () => {
    expect(resolveApiSurfaceRedirect("/guides", null, CONFIG)).toBeNull();
    expect(resolveApiSurfaceRedirect("/", "combined", CONFIG)).toBeNull();
  });
});

describe("resolveApiSurfaceRedirect — stored preference", () => {
  test("a default-version preference leaves the un-prefixed page alone", () => {
    expect(resolveApiSurfaceRedirect("/api/go", "defold-1.13.0", CONFIG)).toBeNull();
    expect(resolveApiSurfaceRedirect("/api", "defold-1.13.0", CONFIG)).toBeNull();
  });

  test("a non-default-version preference prefixes the page", () => {
    expect(resolveApiSurfaceRedirect("/api/go", "defold-1.12.4", CONFIG)).toBe(
      "/api/defold-1.12.4/go",
    );
  });

  test("a combined preference redirects an un-prefixed page", () => {
    expect(resolveApiSurfaceRedirect("/api", "combined", CONFIG)).toBe("/api/combined");
  });

  test("an unknown preference is ignored", () => {
    expect(resolveApiSurfaceRedirect("/api/go", "bogus-surface", CONFIG)).toBeNull();
  });
});

describe("resolveApiSurfaceRedirect — version-ownership guard (bug-48)", () => {
  test("a global type the target version does not own stays put (no version-prefixed 404)", () => {
    expect(resolveApiSurfaceRedirect("/api/Hash", "defold-1.12.4", CONFIG)).toBeNull();
    expect(resolveApiSurfaceRedirect("/api/Vector3", "defold-1.12.4", CONFIG)).toBeNull();
  });

  test("a default-only slug (unowned by the version) is not prefixed", () => {
    expect(
      resolveApiSurfaceRedirect("/api/orthographic.camera", "defold-1.12.4", CONFIG),
    ).toBeNull();
  });

  test("an owned engine namespace still redirects to its version route", () => {
    expect(resolveApiSurfaceRedirect("/api/model", "defold-1.12.4", CONFIG)).toBe(
      "/api/defold-1.12.4/model",
    );
  });

  test("the combined branch is unaffected by the ownership guard", () => {
    expect(resolveApiSurfaceRedirect("/api/base", "combined", CONFIG)).toBeNull();
    expect(resolveApiSurfaceRedirect("/api/go", "combined", CONFIG)).toBe("/api/combined/go");
  });
});

describe("currentSurfaceForRoute (bug-48 — selector preservation)", () => {
  test("an explicit prefix wins over the stored preference", () => {
    expect(currentSurfaceForRoute("/api/combined/go", "defold-1.12.4", CONFIG)).toBe("combined");
    expect(currentSurfaceForRoute("/api/defold-1.12.4/model", "combined", CONFIG)).toBe(
      "defold-1.12.4",
    );
  });

  test("an un-prefixed page keeps the stored surface (no flip to default)", () => {
    expect(currentSurfaceForRoute("/api/base", "combined", CONFIG)).toBe("combined");
    expect(currentSurfaceForRoute("/api/base", "defold-1.12.4", CONFIG)).toBe("defold-1.12.4");
  });

  test("a new user (no stored pref) and non-API routes fall back to the default surface id", () => {
    expect(currentSurfaceForRoute("/api/model", null, CONFIG)).toBe("defold-1.13.0");
    expect(currentSurfaceForRoute("/guides/intro", "combined", CONFIG)).toBe("defold-1.13.0");
  });

  test("honors the deploy base prefix", () => {
    expect(currentSurfaceForRoute("/toolchain/api/base", "combined", BASED)).toBe("combined");
  });

  test("is serializable — references no module-scope identifiers", () => {
    const source = currentSurfaceForRoute.toString();
    expect(source).not.toContain("COMBINED_VERSION_ID");
    expect(source).toContain('"combined"');
  });
});

describe("resolveApiSurfaceRedirect — base prefix", () => {
  test("strips and re-applies the deploy base", () => {
    expect(resolveApiSurfaceRedirect("/toolchain/api/go", null, BASED)).toBe(
      "/toolchain/api/combined/go",
    );
  });

  test("no-op when the based target equals the current path", () => {
    expect(resolveApiSurfaceRedirect("/toolchain/api/combined/go", null, BASED)).toBeNull();
  });
});

describe("activeSurfaceForPath", () => {
  test("reads combined, versioned, and default surfaces from the path", () => {
    expect(activeSurfaceForPath("/api/combined/go", CONFIG)).toBe("combined");
    expect(activeSurfaceForPath("/api/defold-1.12.4/go", CONFIG)).toBe("defold-1.12.4");
    expect(activeSurfaceForPath("/api/go", CONFIG)).toBe("defold-1.13.0");
    expect(activeSurfaceForPath("/api", CONFIG)).toBe("defold-1.13.0");
    expect(activeSurfaceForPath("/guides", CONFIG)).toBe("defold-1.13.0");
  });

  test("honors the deploy base", () => {
    expect(activeSurfaceForPath("/toolchain/api/combined/go", BASED)).toBe("combined");
  });
});

describe("surfacePathForNamespace", () => {
  test("builds default, combined, and versioned routes", () => {
    expect(surfacePathForNamespace("defold-1.13.0", "go", CONFIG)).toBe("/api/go");
    expect(surfacePathForNamespace("defold-1.13.0", undefined, CONFIG)).toBe("/api");
    expect(surfacePathForNamespace("combined", "go", CONFIG)).toBe("/api/combined/go");
    expect(surfacePathForNamespace("combined", undefined, CONFIG)).toBe("/api/combined");
    expect(surfacePathForNamespace("defold-1.12.4", "go", CONFIG)).toBe("/api/defold-1.12.4/go");
  });
});

describe("rewriteApiNavForSurface", () => {
  const nav = (): NavCategory[] => [
    { id: "guides", label: "Guides", route: "/guides", links: [] },
    {
      id: "api",
      label: "API",
      route: "/api",
      links: [
        {
          label: "Defold",
          labelHtml: "Defold",
          children: [
            { label: "go", labelHtml: "go", route: "/api/go" },
            { label: "base", labelHtml: "base", route: "/api/base" },
          ],
        },
      ],
    },
  ];

  test("remaps only the surface's engine leaves and the api root", () => {
    const out = rewriteApiNavForSurface(nav(), "combined", ["go", "vmath"], CONFIG);
    const api = out.find((c) => c.id === "api");
    expect(api?.route).toBe("/api/combined");
    const leaves = api?.links[0]?.children ?? [];
    expect(leaves.find((l) => l.label === "go")?.route).toBe("/api/combined/go");
    // `base` is not a combined namespace, so its route is left untouched.
    expect(leaves.find((l) => l.label === "base")?.route).toBe("/api/base");
  });

  test("leaves non-api categories untouched", () => {
    const out = rewriteApiNavForSurface(nav(), "combined", ["go"], CONFIG);
    expect(out.find((c) => c.id === "guides")?.route).toBe("/guides");
  });

  test("is a no-op on the default surface", () => {
    const input = nav();
    expect(rewriteApiNavForSurface(input, "defold-1.13.0", ["go"], CONFIG)).toBe(input);
  });
});
