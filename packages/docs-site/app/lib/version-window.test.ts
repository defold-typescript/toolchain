import { describe, expect, test } from "bun:test";
import {
  type ApiFunction,
  type ApiModule,
  type ApiParameter,
  type ApiSymbolIdentity,
  normalizedFunctionSignature,
  symbolIdentityKey,
} from "@defold-typescript/types";
import { type AvailabilityLookup, availabilityLabels } from "./api-surface";
import {
  buildCombinedSurface,
  type CombinedSurface,
  type CombinedVersionSurface,
  combinedAuthoritativeSignatures,
  type SignaturesArtifact,
} from "./combined-surface";
import {
  resolveVersionWindow,
  windowCombinedSurface,
  windowHref,
  windowOptionHrefs,
} from "./version-window";

// Four synthetic versions, newest first — the axis `buildCombinedSurface` derives
// by descending semver. Presence per version is stated by the fixture; every span,
// label and transition below is derived by the production projection from it.
const NEWEST = "1.13.1";
const SECOND_NEWEST = "1.13.0";
const SECOND_OLDEST = "1.12.4";
const OLDEST = "1.9.8";
const AXIS = [NEWEST, SECOND_NEWEST, SECOND_OLDEST, OLDEST];

function param(name: string, types: string[]): ApiParameter {
  return { name, doc: "", types, isOptional: false };
}

function func(name: string, parameters: ApiParameter[] = []): ApiFunction {
  return { name, brief: "", description: "", parameters, returnValues: [] };
}

function mod(namespace: string, functions: ApiFunction[]): ApiModule {
  return {
    namespace,
    brief: "",
    description: "",
    functions,
    variables: [],
    constants: [],
    properties: [],
    typedefs: [],
  };
}

function funcId(namespace: string, fn: ApiFunction): ApiSymbolIdentity {
  return { namespace, kind: "FUNCTION", name: fn.name, signature: normalizedFunctionSignature(fn) };
}

const always = func("demo.always");
const endsAtSecondOldest = func("demo.ends_at_second_oldest");
const evolving = func("demo.evolving", [param("a", ["string"])]);
const newestOnly = func("demo.newest_only");
const oldestOnly = func("demo.oldest_only");
const sinceSecondOldest = func("demo.since_second_oldest");
const widened = func("demo.widened");
const widenedEvolving = func("demo.widened_evolving", [param("a", ["string"])]);
const soloNewest = func("solo.newest");

const presence: Record<string, ApiFunction[]> = {
  [NEWEST]: [always, evolving, newestOnly, sinceSecondOldest],
  [SECOND_NEWEST]: [always, evolving, sinceSecondOldest, widenedEvolving],
  [SECOND_OLDEST]: [always, endsAtSecondOldest, evolving, sinceSecondOldest, widened],
  [OLDEST]: [always, endsAtSecondOldest, oldestOnly, widenedEvolving],
};

const surfaces: CombinedVersionSurface[] = AXIS.map((version) => ({
  version,
  modules: [
    mod("demo", presence[version] as ApiFunction[]),
    ...(version === NEWEST ? [mod("solo", [soloNewest])] : []),
  ],
}));

// `demo.evolving` keeps one identity across the axis but declares a wider
// parameter list from the second-oldest version onward, so a window capped at
// `to` has a different authoritative declaration to resolve.
const EVOLVING_NEW = "function evolving(a: string, b: number): void;";
const EVOLVING_OLD = "function evolving(a: string): void;";

// `demo.widened_evolving` declares two different parameter lists at the two
// versions it is genuinely present in, and the curated widening below fills the
// gap between and above them. Distinct strings are what let a window prove which
// version its declaration was resolved from.
const WIDENED_EVOLVING_NEW = "function widened_evolving(a: string, b: number): void;";
const WIDENED_EVOLVING_OLD = "function widened_evolving(a: string): void;";

function declarationsFor(version: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const fn of presence[version] as ApiFunction[]) {
    const key = symbolIdentityKey(funcId("demo", fn));
    if (fn === evolving) {
      entries[key] = version === NEWEST || version === SECOND_NEWEST ? EVOLVING_NEW : EVOLVING_OLD;
    } else if (fn === widenedEvolving) {
      entries[key] = version === SECOND_NEWEST ? WIDENED_EVOLVING_NEW : WIDENED_EVOLVING_OLD;
    } else {
      entries[key] = `function ${fn.name.replace("demo.", "")}(): void;`;
    }
  }
  if (version === NEWEST) {
    entries[symbolIdentityKey(funcId("solo", soloNewest))] = "function newest(): void;";
  }
  return entries;
}

const signatures: SignaturesArtifact = {
  versions: Object.fromEntries(AXIS.map((version) => [version, declarationsFor(version)])),
};

// `demo.widened` is present only in the second-oldest version's typings, but is
// curated as deprecated as of the newest one — so `availableIn` widens to the
// whole axis while the only declaration it owns stays on the second-oldest
// version. Any re-resolution keyed on the widened span alone loses that
// declaration.
const overlay: AvailabilityLookup = {
  versions: AXIS,
  transitions: new Set(),
  records: new Map([
    [
      symbolIdentityKey(funcId("demo", widened)),
      {
        identity: funcId("demo", widened),
        availableIn: [SECOND_OLDEST],
        deprecatedSince: NEWEST,
      },
    ],
    [
      symbolIdentityKey(funcId("demo", widenedEvolving)),
      {
        identity: funcId("demo", widenedEvolving),
        availableIn: [SECOND_NEWEST, OLDEST],
        deprecatedSince: NEWEST,
      },
    ],
  ]),
};

const combined = buildCombinedSurface({ surfaces, signatures, overlay });

function nsOf(surface: CombinedSurface, name: string) {
  const ns = surface.namespaces.find((candidate) => candidate.namespace === name);
  if (!ns) throw new Error(`namespace ${name} missing from surface`);
  return ns;
}

const entryNames = (surface: CombinedSurface, namespace: string): string[] =>
  nsOf(surface, namespace).entries.map((entry) => entry.identity.name);

describe("windowCombinedSurface", () => {
  test("both bounds cap membership and surviving entries keep their order", () => {
    const windowed = windowCombinedSurface(combined, signatures, {
      from: SECOND_OLDEST,
      to: SECOND_NEWEST,
    });
    const names = entryNames(windowed, "demo");
    expect(names).not.toContain("demo.newest_only");
    expect(names).not.toContain("demo.oldest_only");
    expect(names).toContain("demo.always");
    expect(names).toEqual(
      entryNames(combined, "demo").filter(
        (name) => name !== "demo.newest_only" && name !== "demo.oldest_only",
      ),
    );
    expect(windowed.namespaces.some((ns) => ns.namespace === "solo")).toBe(false);
    expect(windowed.window).toEqual({ from: SECOND_OLDEST, to: SECOND_NEWEST });
  });

  test("both bounds are inclusive", () => {
    const atTo = windowCombinedSurface(combined, signatures, { from: SECOND_NEWEST, to: NEWEST });
    expect(entryNames(atTo, "demo")).toContain("demo.newest_only");
    const atFrom = windowCombinedSurface(combined, signatures, {
      from: OLDEST,
      to: SECOND_OLDEST,
    });
    expect(entryNames(atFrom, "demo")).toContain("demo.oldest_only");
  });

  test("`from` drops a symbol whose newest tracked version is older than it", () => {
    const wide = windowCombinedSurface(combined, signatures, { from: OLDEST, to: NEWEST });
    expect(entryNames(wide, "demo")).toContain("demo.ends_at_second_oldest");
    const narrow = windowCombinedSurface(combined, signatures, {
      from: SECOND_NEWEST,
      to: NEWEST,
    });
    expect(entryNames(narrow, "demo")).not.toContain("demo.ends_at_second_oldest");
  });

  test("a narrowed window keeps availability labels absolute", () => {
    const windowed = windowCombinedSurface(combined, signatures, {
      from: SECOND_NEWEST,
      to: NEWEST,
    });
    const demo = nsOf(windowed, "demo");
    expect(demo.availability.versions).toEqual(AXIS);
    const key = symbolIdentityKey(funcId("demo", sinceSecondOldest));
    const record = demo.availability.records.get(key);
    expect(record).toBeDefined();
    // The label names a version the window excludes — only possible because the
    // axis stayed absolute. A window-relative axis would make this span cover
    // every version in view, collapsing the label to `all` and rendering no
    // badge at all.
    expect(availabilityLabels(record as NonNullable<typeof record>, demo.availability)).toContain(
      `Since Defold ${SECOND_OLDEST}`,
    );
  });

  test("the authoritative signature re-resolves at the window's `to`", () => {
    const key = symbolIdentityKey(funcId("demo", evolving));
    const full = nsOf(combined, "demo").entries.find(
      (entry) => symbolIdentityKey(entry.identity) === key,
    );
    expect(full?.authoritativeSignature).toBe(EVOLVING_NEW);

    const windowed = windowCombinedSurface(combined, signatures, {
      from: OLDEST,
      to: SECOND_OLDEST,
    });
    const demo = nsOf(windowed, "demo");
    const entry = demo.entries.find((candidate) => symbolIdentityKey(candidate.identity) === key);
    expect(entry?.authoritativeSignature).toBe(EVOLVING_OLD);
    expect(combinedAuthoritativeSignatures(demo).get(key)).toBe("demo.evolving(a: string): void");
  });

  test("a capped window steps over a declaration-free in-window version", () => {
    const key = symbolIdentityKey(funcId("demo", widenedEvolving));
    const built = nsOf(combined, "demo").entries.find(
      (entry) => symbolIdentityKey(entry.identity) === key,
    );
    expect(built?.availableIn).toEqual(AXIS);
    expect(built?.authoritativeSignature).toBe(WIDENED_EVOLVING_NEW);

    // `SECOND_OLDEST` is the newest version this window makes available, and the
    // widening is the only reason it is available there at all — it declares
    // nothing, so the answer has to come from `OLDEST`.
    const windowed = windowCombinedSurface(combined, signatures, {
      from: OLDEST,
      to: SECOND_OLDEST,
    });
    const entry = nsOf(windowed, "demo").entries.find(
      (candidate) => symbolIdentityKey(candidate.identity) === key,
    );
    expect(signatures.versions[SECOND_OLDEST]?.[key]).toBeUndefined();
    expect(entry?.authoritativeSignature).toBe(WIDENED_EVOLVING_OLD);
  });

  test("a window that declares the entry nowhere keeps the built signature", () => {
    const key = symbolIdentityKey(funcId("demo", widenedEvolving));
    const windowed = windowCombinedSurface(combined, signatures, {
      from: SECOND_OLDEST,
      to: SECOND_OLDEST,
    });
    const demo = nsOf(windowed, "demo");
    const entry = demo.entries.find((candidate) => symbolIdentityKey(candidate.identity) === key);
    expect(entry).toBeDefined();
    expect(entry?.authoritativeSignature).toBe(WIDENED_EVOLVING_NEW);
    // An empty declaration drops the key here, which is how the render layer
    // silently downgrades the symbol to its token-derived signature.
    expect(combinedAuthoritativeSignatures(demo).get(key)).toBe(
      "demo.widened_evolving(a: string, b: number): void",
    );
  });

  test("the newest in-window declaration wins over an older one", () => {
    const key = symbolIdentityKey(funcId("demo", widenedEvolving));
    const windowed = windowCombinedSurface(combined, signatures, {
      from: OLDEST,
      to: SECOND_NEWEST,
    });
    const entry = nsOf(windowed, "demo").entries.find(
      (candidate) => symbolIdentityKey(candidate.identity) === key,
    );
    expect(entry?.authoritativeSignature).toBe(WIDENED_EVOLVING_NEW);
  });

  test("an uncapped window keeps the built signature though its newest version declares nothing", () => {
    const key = symbolIdentityKey(funcId("demo", widenedEvolving));
    const windowed = windowCombinedSurface(combined, signatures, { from: OLDEST, to: NEWEST });
    const entry = nsOf(windowed, "demo").entries.find(
      (candidate) => symbolIdentityKey(candidate.identity) === key,
    );
    expect(signatures.versions[NEWEST]?.[key]).toBeUndefined();
    expect(entry?.authoritativeSignature).toBe(WIDENED_EVOLVING_NEW);
  });

  test("the full window is the identity", () => {
    const windowed = windowCombinedSurface(combined, signatures, { from: OLDEST, to: NEWEST });
    expect(windowed.versions).toEqual(combined.versions);
    expect(windowed.namespaces.map((ns) => ns.namespace)).toEqual(
      combined.namespaces.map((ns) => ns.namespace),
    );
    for (const ns of combined.namespaces) {
      const mirrored = nsOf(windowed, ns.namespace);
      expect(mirrored.entries).toEqual(ns.entries);
      expect(mirrored.availability.versions).toEqual(ns.availability.versions);
      expect([...mirrored.availability.records.keys()]).toEqual([
        ...ns.availability.records.keys(),
      ]);
      expect([...combinedAuthoritativeSignatures(mirrored)]).toEqual([
        ...combinedAuthoritativeSignatures(ns),
      ]);
    }
  });

  test("does not mutate the input surface", () => {
    const demo = nsOf(combined, "demo");
    const entryCount = demo.entries.length;
    const functionCount = demo.module.functions.length;
    const recordCount = demo.availability.records.size;
    const namespaceCount = combined.namespaces.length;
    windowCombinedSurface(combined, signatures, { from: SECOND_NEWEST, to: SECOND_NEWEST });
    expect(demo.entries).toHaveLength(entryCount);
    expect(demo.module.functions).toHaveLength(functionCount);
    expect(demo.availability.records.size).toBe(recordCount);
    expect(combined.namespaces).toHaveLength(namespaceCount);
    expect(combined.window).toBeUndefined();
  });
});

describe("resolveVersionWindow", () => {
  test("defaults `from` to the oldest tracked version", () => {
    expect(resolveVersionWindow(AXIS, NEWEST, null)).toEqual({ from: OLDEST, to: NEWEST });
    expect(resolveVersionWindow(AXIS, NEWEST, undefined)).toEqual({ from: OLDEST, to: NEWEST });
  });

  test("clamps a `since` newer than `to` down to `to`", () => {
    expect(resolveVersionWindow(AXIS, SECOND_OLDEST, NEWEST)).toEqual({
      from: SECOND_OLDEST,
      to: SECOND_OLDEST,
    });
  });

  test("falls back to the oldest tracked version for an untracked or malformed `since`", () => {
    expect(resolveVersionWindow(AXIS, NEWEST, "1.11.0")).toEqual({ from: OLDEST, to: NEWEST });
    expect(resolveVersionWindow(AXIS, NEWEST, "not-a-version")).toEqual({
      from: OLDEST,
      to: NEWEST,
    });
    expect(resolveVersionWindow(AXIS, NEWEST, "")).toEqual({ from: OLDEST, to: NEWEST });
  });

  test("returns null for an untracked `to`", () => {
    expect(resolveVersionWindow(AXIS, "1.11.0", null)).toBeNull();
    expect(resolveVersionWindow(AXIS, "defold-1.11.0", OLDEST)).toBeNull();
  });

  test("accepts `defold-`-prefixed and bare-semver inputs alike", () => {
    expect(resolveVersionWindow(AXIS, `defold-${NEWEST}`, `defold-${SECOND_OLDEST}`)).toEqual(
      resolveVersionWindow(AXIS, NEWEST, SECOND_OLDEST),
    );
    expect(resolveVersionWindow(AXIS, `defold-${NEWEST}`, `defold-${SECOND_OLDEST}`)).toEqual({
      from: SECOND_OLDEST,
      to: NEWEST,
    });
  });
});

describe("windowHref", () => {
  test("omits `?since=` exactly when `from` is the oldest tracked version", () => {
    expect(windowHref("demo", { from: OLDEST, to: NEWEST }, AXIS)).toBe(
      `/api/defold-${NEWEST}/demo`,
    );
    expect(windowHref("demo", { from: SECOND_OLDEST, to: NEWEST }, AXIS)).toBe(
      `/api/defold-${NEWEST}/demo?since=defold-${SECOND_OLDEST}`,
    );
  });

  test("drops the namespace segment for the index route", () => {
    expect(windowHref(undefined, { from: OLDEST, to: SECOND_NEWEST }, AXIS)).toBe(
      `/api/defold-${SECOND_NEWEST}`,
    );
    expect(windowHref(undefined, { from: SECOND_NEWEST, to: SECOND_NEWEST }, AXIS)).toBe(
      `/api/defold-${SECOND_NEWEST}?since=defold-${SECOND_NEWEST}`,
    );
  });
});

describe("windowOptionHrefs", () => {
  const current = { from: SECOND_NEWEST, to: NEWEST };

  test("picking a `to` older than the current `from` pulls `from` down to it", () => {
    const options = windowOptionHrefs("demo", current, AXIS);
    const chosen = options.to.find((option) => option.version === SECOND_OLDEST);
    expect(chosen?.href).toBe(`/api/defold-${SECOND_OLDEST}/demo?since=defold-${SECOND_OLDEST}`);
    const stillWider = options.to.find((option) => option.version === NEWEST);
    expect(stillWider?.href).toBe(`/api/defold-${NEWEST}/demo?since=defold-${SECOND_NEWEST}`);
  });

  test("picking a `from` newer than the current `to` pushes the path version up to it", () => {
    const narrow = { from: SECOND_OLDEST, to: SECOND_OLDEST };
    const options = windowOptionHrefs("demo", narrow, AXIS);
    const chosen = options.from.find((option) => option.version === NEWEST);
    expect(chosen?.href).toBe(`/api/defold-${NEWEST}/demo?since=defold-${NEWEST}`);
    const widest = options.from.find((option) => option.version === OLDEST);
    expect(widest?.href).toBe(`/api/defold-${SECOND_OLDEST}/demo`);
  });

  test("lists every tracked version in axis order and marks the current bounds", () => {
    const options = windowOptionHrefs("demo", current, AXIS);
    expect(options.from.map((option) => option.version)).toEqual(AXIS);
    expect(options.to.map((option) => option.version)).toEqual(AXIS);
    expect(options.from.filter((option) => option.isCurrent).map((o) => o.version)).toEqual([
      SECOND_NEWEST,
    ]);
    expect(options.to.filter((option) => option.isCurrent).map((o) => o.version)).toEqual([NEWEST]);
  });
});
