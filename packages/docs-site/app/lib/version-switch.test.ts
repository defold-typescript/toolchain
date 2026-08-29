import { describe, expect, test } from "bun:test";
import type { ApiVersion } from "./api-surface-loader";
import { buildRangeSelector, isApiRoute, versionLabel, versionShortLabel } from "./version-switch";

// Newest-first, in the route-id vocabulary every `/api/<id>/…` path and the
// persisted range preference use.
const NEWEST = "defold-1.13.0";
const MIDDLE = "defold-1.12.4";
const OLDEST = "defold-1.12.0";

const versions: ApiVersion[] = [
  { id: NEWEST, isDefault: true },
  { id: MIDDLE, isDefault: false },
  { id: OLDEST, isDefault: false },
];

// `camera` is newest-only and `wmath` oldest-only, so each column has a version
// that owns the current namespace and one that does not.
const namespacesByVersion = {
  [NEWEST]: ["camera", "go", "shared"],
  [MIDDLE]: ["go", "shared"],
  [OLDEST]: ["wmath", "shared"],
};

const build = (range: { from: string; to: string }, route: string) =>
  buildRangeSelector({ versions, namespacesByVersion, route, range });

describe("buildRangeSelector", () => {
  test("renders both columns over the full axis, labelled and marked at the active bounds", () => {
    const selector = build({ from: MIDDLE, to: NEWEST }, "/api/defold-1.13.0/shared");
    expect(selector.from.map((o) => o.id)).toEqual([NEWEST, MIDDLE, OLDEST]);
    expect(selector.to.map((o) => o.id)).toEqual([NEWEST, MIDDLE, OLDEST]);
    expect(selector.to.map((o) => o.label)).toEqual([
      "Defold 1.13.0",
      "Defold 1.12.4",
      "Defold 1.12.0",
    ]);
    expect(selector.from.filter((o) => o.isCurrent).map((o) => o.id)).toEqual([MIDDLE]);
    expect(selector.to.filter((o) => o.isCurrent).map((o) => o.id)).toEqual([NEWEST]);
  });

  test("every option carries both labels: bare for the chrome, prefixed for the popup", () => {
    const selector = build({ from: MIDDLE, to: NEWEST }, "/api/defold-1.13.0/shared");
    for (const column of [selector.from, selector.to]) {
      expect(column.map((o) => o.shortLabel)).toEqual(["1.13.0", "1.12.4", "1.12.0"]);
      expect(column.map((o) => o.label)).toEqual([
        "Defold 1.13.0",
        "Defold 1.12.4",
        "Defold 1.12.0",
      ]);
    }
  });

  test("every option is a plain pre-clamped link — the markup holds no logic", () => {
    const selector = build({ from: MIDDLE, to: NEWEST }, "/api/defold-1.13.0/shared");
    for (const option of [...selector.from, ...selector.to]) {
      expect(option.href.startsWith("/api/")).toBe(true);
    }
    // A wider `to` keeps the reader's `from`; the full range drops `?since=`.
    expect(selector.to.find((o) => o.id === NEWEST)?.href).toBe(
      "/api/defold-1.13.0/shared?since=defold-1.12.4",
    );
    expect(selector.from.find((o) => o.id === OLDEST)?.href).toBe("/api/defold-1.13.0/shared");
  });

  test("choosing an older `to` pulls `from` down to it; the chosen bound never shifts", () => {
    const selector = build({ from: NEWEST, to: NEWEST }, "/api/defold-1.13.0/shared");
    expect(selector.to.find((o) => o.id === MIDDLE)?.href).toBe(
      "/api/defold-1.12.4/shared?since=defold-1.12.4",
    );
    // Clamping to the oldest tracked version *is* the full range, so the
    // now-redundant `?since=` is dropped rather than spelled out.
    expect(selector.to.find((o) => o.id === OLDEST)?.href).toBe("/api/defold-1.12.0/shared");
  });

  test("choosing a newer `from` pushes `to` up to it; the chosen bound never shifts", () => {
    const selector = build({ from: OLDEST, to: OLDEST }, "/api/defold-1.12.0/shared");
    expect(selector.from.find((o) => o.id === NEWEST)?.href).toBe(
      "/api/defold-1.13.0/shared?since=defold-1.13.0",
    );
  });

  test("keeps the namespace on a version that owns a page for it and falls back to the index otherwise", () => {
    const selector = build({ from: OLDEST, to: NEWEST }, "/api/defold-1.13.0/camera");
    // `camera` exists only in the newest version.
    expect(selector.to.find((o) => o.id === NEWEST)?.href).toBe("/api/defold-1.13.0/camera");
    expect(selector.to.find((o) => o.id === MIDDLE)?.href).toBe("/api/defold-1.12.4");
    expect(selector.to.find((o) => o.id === OLDEST)?.href).toBe("/api/defold-1.12.0");
  });

  test("resolves the namespace fallback against the version the href ends at, not the option's own", () => {
    // In the `from` column the path version moves up whenever the chosen bound
    // would cross `to`, so `wmath` (oldest-only) must be dropped there too.
    const selector = build({ from: OLDEST, to: OLDEST }, "/api/defold-1.12.0/wmath");
    expect(selector.from.find((o) => o.id === OLDEST)?.href).toBe("/api/defold-1.12.0/wmath");
    expect(selector.from.find((o) => o.id === NEWEST)?.href).toBe(
      "/api/defold-1.13.0?since=defold-1.13.0",
    );
  });

  test("keeps a historical namespace on any option whose window still reaches it", () => {
    // `wmath` is oldest-only, so no bound newer than OLDEST owns it — yet every
    // window reaching back to OLDEST routes a page for it.
    const selector = build({ from: OLDEST, to: NEWEST }, "/api/defold-1.13.0/wmath");
    expect(selector.to.find((o) => o.id === NEWEST)?.href).toBe("/api/defold-1.13.0/wmath");
    expect(selector.to.find((o) => o.id === MIDDLE)?.href).toBe("/api/defold-1.12.4/wmath");
    expect(selector.from.find((o) => o.id === OLDEST)?.href).toBe("/api/defold-1.13.0/wmath");
  });

  test("drops it once the chosen bound pushes the window past it", () => {
    const selector = build({ from: OLDEST, to: NEWEST }, "/api/defold-1.13.0/wmath");
    expect(selector.from.find((o) => o.id === MIDDLE)?.href).toBe(
      "/api/defold-1.13.0?since=defold-1.12.4",
    );
    expect(selector.from.find((o) => o.id === NEWEST)?.href).toBe(
      "/api/defold-1.13.0?since=defold-1.13.0",
    );
  });

  test("an index route and a non-API route carry no namespace at all", () => {
    for (const route of ["/api", "/api/defold-1.13.0", "/guides/setup"]) {
      const selector = build({ from: OLDEST, to: NEWEST }, route);
      for (const option of [...selector.from, ...selector.to]) {
        expect(/^\/api\/defold-[\d.]+(\?|$)/.test(option.href)).toBe(true);
      }
    }
  });

  test("a bare canonical route still reads its namespace", () => {
    const selector = build({ from: OLDEST, to: NEWEST }, "/api/shared");
    expect(selector.to.find((o) => o.id === MIDDLE)?.href).toBe("/api/defold-1.12.4/shared");
  });

  test("a single tracked version still renders both columns, each with exactly one option", () => {
    const selector = buildRangeSelector({
      versions: [{ id: NEWEST, isDefault: true }],
      namespacesByVersion: { [NEWEST]: ["go"] },
      route: "/api/defold-1.13.0/go",
      range: { from: NEWEST, to: NEWEST },
    });
    expect(selector.from).toHaveLength(1);
    expect(selector.to).toHaveLength(1);
    expect(selector.from[0]?.isCurrent).toBe(true);
    expect(selector.to[0]?.href).toBe("/api/defold-1.13.0/go");
  });

  test("an id outside the `defold-<semver>` convention keeps its own route segment", () => {
    const selector = buildRangeSelector({
      versions: [{ id: "nightly", isDefault: true }],
      namespacesByVersion: { nightly: ["go"] },
      route: "/api/nightly/go",
      range: { from: "nightly", to: "nightly" },
    });
    expect(selector.to[0]?.href).toBe("/api/nightly/go");
  });
});

describe("versionShortLabel", () => {
  test("strips the release prefix, leaving the bare semver the chrome shows", () => {
    expect(versionShortLabel("defold-1.13.0")).toBe("1.13.0");
    expect(versionShortLabel("defold-1.12.4")).toBe("1.12.4");
  });

  test("passes a non-defold id through unchanged, matching versionLabel's fallback", () => {
    expect(versionShortLabel("combined")).toBe("combined");
    expect(versionShortLabel("nightly")).toBe("nightly");
  });
});

describe("versionLabel", () => {
  test("derives 'Defold <semver>' from a defold-<semver> id", () => {
    expect(versionLabel("defold-1.13.0")).toBe("Defold 1.13.0");
    expect(versionLabel("defold-1.12.4")).toBe("Defold 1.12.4");
  });

  test("passes a non-defold id through unchanged", () => {
    expect(versionLabel("nightly")).toBe("nightly");
  });
});

describe("isApiRoute", () => {
  test("matches API routes", () => {
    expect(isApiRoute("/api/go")).toBe(true);
    expect(isApiRoute("/api/defold-1.12.4/wmath")).toBe(true);
  });

  test("rejects non-API routes", () => {
    expect(isApiRoute("/guide/x")).toBe(false);
    expect(isApiRoute("/")).toBe(false);
  });
});

describe("buildRangeSelector — the axis limit", () => {
  test("names the oldest tracked version, so the `From` column can say where the axis ends", () => {
    const selector = build({ from: MIDDLE, to: NEWEST }, "/api/defold-1.13.0/shared");
    expect(selector.oldest).toEqual({ id: OLDEST, label: "Defold 1.12.0" });
  });

  test("a single tracked version is its own limit", () => {
    const selector = buildRangeSelector({
      versions: [{ id: NEWEST, isDefault: true }],
      namespacesByVersion: { [NEWEST]: ["go"] },
      route: "/api/defold-1.13.0/go",
      range: { from: NEWEST, to: NEWEST },
    });
    expect(selector.oldest).toEqual({ id: NEWEST, label: "Defold 1.13.0" });
  });

  test("an empty axis has no limit to name", () => {
    const selector = buildRangeSelector({
      versions: [],
      namespacesByVersion: {},
      route: "/api",
      range: { from: "", to: "" },
    });
    expect(selector.oldest).toBeUndefined();
  });
});
