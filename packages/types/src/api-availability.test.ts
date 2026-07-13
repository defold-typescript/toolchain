import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ApiAvailability,
  type ApiMigrationCatalog,
  type ApiSymbolIdentity,
  applyMigrationOverlay,
  availabilityLabel,
  collectSymbolIdentities,
  deriveAvailabilityMatrix,
  groupByLogicalName,
  isSignatureTransition,
  symbolIdentityKey,
  type VersionSurface,
  validateAvailability,
} from "./api-availability";
import type { ApiFunction, ApiModule, ApiParameter } from "./api-doc";

function param(name: string, types: string[], isOptional = false): ApiParameter {
  return { name, doc: "", types, isOptional };
}

function fn(
  name: string,
  parameters: ApiParameter[],
  returnValues: ApiParameter[] = [],
): ApiFunction {
  return { name, brief: "", description: "", parameters, returnValues };
}

function moduleOf(namespace: string, overrides: Partial<ApiModule> = {}): ApiModule {
  return {
    namespace,
    brief: "",
    description: "",
    functions: [],
    variables: [],
    constants: [],
    properties: [],
    typedefs: [],
    ...overrides,
  };
}

function keys(ids: readonly ApiSymbolIdentity[]): Set<string> {
  return new Set(ids.map(symbolIdentityKey));
}

function surface(version: string, modules: ApiModule[]): VersionSurface {
  return { version, modules };
}

describe("symbol identity", () => {
  test("distinguishes overloads by normalized signature while sharing name", () => {
    const one = fn("go.animate", [param("url", ["string"])]);
    const two = fn("go.animate", [param("url", ["string"]), param("property", ["hash"])]);
    const ids = collectSymbolIdentities([moduleOf("go", { functions: [one, two] })]);
    expect(ids).toHaveLength(2);
    const [a, b] = ids;
    expect(a?.name).toBe("go.animate");
    expect(b?.name).toBe("go.animate");
    expect(a?.signature).not.toBe(b?.signature);
    expect(symbolIdentityKey(a as ApiSymbolIdentity)).not.toBe(
      symbolIdentityKey(b as ApiSymbolIdentity),
    );
  });

  test("signature is order-independent within a parameter's type union but position-sensitive", () => {
    const first = collectSymbolIdentities([
      moduleOf("m", { functions: [fn("m.f", [param("x", ["number", "string"])])] }),
    ]);
    const second = collectSymbolIdentities([
      moduleOf("m", { functions: [fn("m.f", [param("x", ["string", "number"])])] }),
    ]);
    expect(first[0]?.signature).toBe(second[0]?.signature);
  });

  test("adding an overload does not relabel the sibling's identity", () => {
    const before = collectSymbolIdentities([
      moduleOf("m", { functions: [fn("m.f", [param("x", ["number"])])] }),
    ]);
    const after = collectSymbolIdentities([
      moduleOf("m", {
        functions: [
          fn("m.f", [param("x", ["number"])]),
          fn("m.f", [param("x", ["number"]), param("y", ["number"])]),
        ],
      }),
    ]);
    expect(keys(after).has(symbolIdentityKey(before[0] as ApiSymbolIdentity))).toBe(true);
  });

  test("non-function kinds carry an empty signature", () => {
    const ids = collectSymbolIdentities([
      moduleOf("m", {
        constants: [{ name: "m.CONST", brief: "", description: "" }],
        properties: [{ name: "m.prop", types: ["number"], brief: "", description: "" }],
      }),
    ]);
    expect(ids.every((id) => id.signature === "")).toBe(true);
    expect(new Set(ids.map((id) => id.kind))).toEqual(new Set(["CONSTANT", "PROPERTY"]));
  });
});

describe("deriveAvailabilityMatrix", () => {
  const V = ["1.13.0", "1.12.4", "1.11.0"];
  const surfaces = [
    surface(V[0] as string, [
      moduleOf("m", {
        functions: [fn("m.everywhere", []), fn("m.new", [])],
      }),
    ]),
    surface(V[1] as string, [moduleOf("m", { functions: [fn("m.everywhere", [])] })]),
    surface(V[2] as string, [
      moduleOf("m", {
        functions: [fn("m.everywhere", []), fn("m.gap", [])],
        constants: [{ name: "m.OLD", brief: "", description: "" }],
      }),
    ]),
  ];

  test("omits an all-versions symbol and records a subset symbol with ordered availableIn", () => {
    const records = deriveAvailabilityMatrix({ surfaces });
    const byName = new Map(records.map((r) => [r.identity.name, r]));
    expect(byName.has("m.everywhere")).toBe(false);
    expect(byName.get("m.new")?.availableIn).toEqual(["1.13.0"]);
    expect(byName.get("m.OLD")?.availableIn).toEqual(["1.11.0"]);
  });

  test("a symbol present in the newest and oldest but absent in the middle is not collapsed to a range", () => {
    const gapSurfaces = [
      surface(V[0] as string, [moduleOf("m", { functions: [fn("m.gap", [])] })]),
      surface(V[1] as string, [moduleOf("m", {})]),
      surface(V[2] as string, [moduleOf("m", { functions: [fn("m.gap", [])] })]),
    ];
    const records = deriveAvailabilityMatrix({ surfaces: gapSurfaces });
    const gap = records.find((r) => r.identity.name === "m.gap");
    expect(gap?.availableIn).toEqual(["1.13.0", "1.11.0"]);
  });

  test("output is deterministic and sorted by identity key", () => {
    const records = deriveAvailabilityMatrix({ surfaces });
    const rendered = records.map((r) => symbolIdentityKey(r.identity));
    expect(rendered).toEqual([...rendered].sort());
  });
});

describe("availabilityLabel", () => {
  const versions = ["1.13.0", "1.12.4", "1.11.0", "1.10.0"];

  test("classifies an all-tracked span", () => {
    expect(availabilityLabel(versions, versions).kind).toBe("all");
  });

  test("classifies a since-newest block", () => {
    expect(availabilityLabel(["1.13.0"], versions)).toMatchObject({
      kind: "since",
      label: "Since Defold 1.13.0",
    });
    expect(availabilityLabel(["1.13.0", "1.12.4"], versions)).toMatchObject({
      kind: "since",
      label: "Since Defold 1.12.4",
    });
  });

  test("classifies a through-oldest block", () => {
    expect(availabilityLabel(["1.10.0"], versions)).toMatchObject({
      kind: "through",
      label: "Available through Defold 1.10.0",
    });
    expect(availabilityLabel(["1.11.0", "1.10.0"], versions)).toMatchObject({
      kind: "through",
      label: "Available through Defold 1.11.0",
    });
  });

  test("classifies an interior contiguous block as a range", () => {
    expect(availabilityLabel(["1.12.4", "1.11.0"], versions)).toMatchObject({
      kind: "range",
      label: "Available in Defold 1.11.0–1.12.4",
    });
  });

  test("classifies a non-contiguous span discretely with no false range", () => {
    const label = availabilityLabel(["1.13.0", "1.11.0"], versions);
    expect(label.kind).toBe("discrete");
    expect(label.label).toBe("Available in tracked versions: 1.13.0, 1.11.0");
  });
});

describe("groupByLogicalName / isSignatureTransition", () => {
  const versions = ["1.13.0", "1.12.4"];

  test("classifies disjoint-overload spans as a signature transition, oldest overload first", () => {
    const oldSig = fn("m.f", [param("name", ["string"])]);
    const newSig = fn("m.f", [param("name", ["string", "hash"])]);
    const [oldId] = collectSymbolIdentities([moduleOf("m", { functions: [oldSig] })]);
    const [newId] = collectSymbolIdentities([moduleOf("m", { functions: [newSig] })]);
    const records: ApiAvailability[] = [
      { identity: newId as ApiSymbolIdentity, availableIn: ["1.13.0"] },
      { identity: oldId as ApiSymbolIdentity, availableIn: ["1.12.4"] },
    ];
    const groups = groupByLogicalName(records, versions);
    expect(groups).toHaveLength(1);
    const group = groups[0] as (typeof groups)[number];
    expect(group.name).toBe("m.f");
    expect(group.overloads[0]?.availableIn).toEqual(["1.12.4"]);
    expect(isSignatureTransition(group, versions)).toBe(true);
  });

  test("classifies a single oldest-only overload as a removal, not a transition", () => {
    const [id] = collectSymbolIdentities([
      moduleOf("model", {
        properties: [{ name: "model.material", types: ["hash"], brief: "", description: "" }],
      }),
    ]);
    const records: ApiAvailability[] = [
      { identity: id as ApiSymbolIdentity, availableIn: ["1.12.4"] },
    ];
    const group = groupByLogicalName(records, versions)[0] as ReturnType<
      typeof groupByLogicalName
    >[number];
    expect(isSignatureTransition(group, versions)).toBe(false);
  });
});

describe("applyMigrationOverlay", () => {
  const versions = ["1.13.0", "1.12.4"];
  const universe = collectSymbolIdentities([
    moduleOf("m", {
      functions: [fn("m.stable", [param("x", ["number"])]), fn("m.repl", [])],
      constants: [{ name: "m.OLD", brief: "", description: "" }],
    }),
    moduleOf("b2d.world", { functions: [fn("b2d.world.step", [])] }),
  ]);

  test("overlays deprecatedSince, replacement, and box2d, defaulting availableIn to all versions", () => {
    const stableId = universe.find((id) => id.name === "m.stable") as ApiSymbolIdentity;
    const replId = universe.find((id) => id.name === "m.repl") as ApiSymbolIdentity;
    const b2dId = universe.find((id) => id.name === "b2d.world.step") as ApiSymbolIdentity;
    const catalog: ApiMigrationCatalog = {
      migrations: [
        { identity: stableId, deprecatedSince: "1.13.0", replacement: replId },
        { identity: b2dId, box2d: ["v3"] },
      ],
    };
    const merged = applyMigrationOverlay({ derived: [], catalog, universe, versions });
    const stable = merged.find(
      (r) => symbolIdentityKey(r.identity) === symbolIdentityKey(stableId),
    );
    expect(stable?.deprecatedSince).toBe("1.13.0");
    expect(stable?.availableIn).toEqual(versions);
    expect(stable?.replacement && symbolIdentityKey(stable.replacement)).toBe(
      symbolIdentityKey(replId),
    );
    const b2d = merged.find((r) => symbolIdentityKey(r.identity) === symbolIdentityKey(b2dId));
    expect(b2d?.box2d).toEqual(["v3"]);
  });

  test("merges curated fields onto an already-derived record without dropping availableIn", () => {
    const constId = universe.find((id) => id.name === "m.OLD") as ApiSymbolIdentity;
    const derived: ApiAvailability[] = [{ identity: constId, availableIn: ["1.12.4"] }];
    const catalog: ApiMigrationCatalog = {
      migrations: [{ identity: constId, deprecatedSince: "1.13.0" }],
    };
    const merged = applyMigrationOverlay({ derived, catalog, universe, versions });
    const record = merged.find((r) => symbolIdentityKey(r.identity) === symbolIdentityKey(constId));
    expect(record?.availableIn).toEqual(["1.12.4"]);
    expect(record?.deprecatedSince).toBe("1.13.0");
  });

  test("rejects a catalog identity that matches no known symbol", () => {
    const catalog: ApiMigrationCatalog = {
      migrations: [
        {
          identity: { namespace: "m", kind: "FUNCTION", name: "m.ghost", signature: "()" },
          box2d: ["v2"],
        },
      ],
    };
    expect(() => applyMigrationOverlay({ derived: [], catalog, universe, versions })).toThrow(
      /unknown/i,
    );
  });

  test("rejects a catalog identity that is ambiguous across overloads", () => {
    const overloaded = collectSymbolIdentities([
      moduleOf("m", {
        functions: [fn("m.f", [param("x", ["number"])]), fn("m.f", [param("x", ["hash"])])],
      }),
    ]);
    const catalog: ApiMigrationCatalog = {
      migrations: [
        {
          identity: { namespace: "m", kind: "FUNCTION", name: "m.f", signature: "" },
          box2d: ["v2"],
        },
      ],
    };
    expect(() =>
      applyMigrationOverlay({ derived: [], catalog, universe: overloaded, versions }),
    ).toThrow(/ambiguous/i);
  });
});

describe("validateAvailability", () => {
  const versions = ["1.13.0", "1.12.4"];
  const stableId: ApiSymbolIdentity = {
    namespace: "m",
    kind: "FUNCTION",
    name: "m.stable",
    signature: "()",
  };
  const removedId: ApiSymbolIdentity = {
    namespace: "m",
    kind: "FUNCTION",
    name: "m.gone",
    signature: "()",
  };
  const replId: ApiSymbolIdentity = {
    namespace: "m",
    kind: "FUNCTION",
    name: "m.repl",
    signature: "()",
  };
  const known = new Set([stableId, removedId, replId].map(symbolIdentityKey));

  test("accepts a well-formed record set", () => {
    const errors = validateAvailability({
      records: [
        { identity: removedId, availableIn: ["1.12.4"] },
        {
          identity: stableId,
          availableIn: versions,
          deprecatedSince: "1.13.0",
          replacement: replId,
        },
      ],
      versions,
      currentSurface: new Set([stableId, replId].map(symbolIdentityKey)),
      knownIdentities: known,
    });
    expect(errors).toEqual([]);
  });

  test("rejects a symbol absent from the newest version that is still callable", () => {
    const errors = validateAvailability({
      records: [{ identity: removedId, availableIn: ["1.12.4"] }],
      versions,
      currentSurface: new Set([removedId].map(symbolIdentityKey)),
      knownIdentities: known,
    });
    expect(errors.some((e) => /callable/i.test(e))).toBe(true);
  });

  test("rejects an empty, out-of-set, or duplicated availableIn", () => {
    const empty = validateAvailability({
      records: [{ identity: stableId, availableIn: [] }],
      versions,
      currentSurface: new Set([stableId].map(symbolIdentityKey)),
      knownIdentities: known,
    });
    expect(empty.some((e) => /empty availableIn/i.test(e))).toBe(true);
    const outside = validateAvailability({
      records: [{ identity: stableId, availableIn: ["9.9.9"] }],
      versions,
      currentSurface: new Set<string>(),
      knownIdentities: known,
    });
    expect(outside.some((e) => /outside the tracked set/i.test(e))).toBe(true);
    const dup = validateAvailability({
      records: [{ identity: stableId, availableIn: ["1.12.4", "1.12.4"] }],
      versions,
      currentSurface: new Set<string>(),
      knownIdentities: known,
    });
    expect(dup.some((e) => /duplicated availableIn/i.test(e))).toBe(true);
  });

  test("rejects a replacement that resolves to no known symbol", () => {
    const errors = validateAvailability({
      records: [
        {
          identity: stableId,
          availableIn: versions,
          replacement: { namespace: "m", kind: "FUNCTION", name: "m.nowhere", signature: "()" },
        },
      ],
      versions,
      currentSurface: new Set([stableId].map(symbolIdentityKey)),
      knownIdentities: known,
    });
    expect(errors.some((e) => /replacement/i.test(e))).toBe(true);
  });

  test("rejects empty and overlapping (duplicated) backend availability", () => {
    const empty = validateAvailability({
      records: [{ identity: stableId, availableIn: versions, box2d: [] }],
      versions,
      currentSurface: new Set([stableId].map(symbolIdentityKey)),
      knownIdentities: known,
    });
    expect(empty.some((e) => /backend/i.test(e))).toBe(true);
    const dup = validateAvailability({
      records: [{ identity: stableId, availableIn: versions, box2d: ["v2", "v2"] }],
      versions,
      currentSurface: new Set([stableId].map(symbolIdentityKey)),
      knownIdentities: known,
    });
    expect(dup.some((e) => /backend/i.test(e))).toBe(true);
  });
});

describe("committed deprecation catalog (1.12.4 / 1.13.0 audit outcome)", () => {
  const catalog = JSON.parse(
    readFileSync(join(import.meta.dir, "..", "api-migrations.json"), "utf8"),
  ) as ApiMigrationCatalog;

  test("holds only the verified reset_constant deprecations (deprecatedSince 1.13.0, no replacement)", () => {
    const names = catalog.migrations.map((m) => m.identity.name).sort();
    expect(names).toEqual([
      "model.reset_constant",
      "sprite.reset_constant",
      "tilemap.reset_constant",
    ]);
    for (const migration of catalog.migrations) {
      expect(migration.identity.kind).toBe("FUNCTION");
      expect(migration.deprecatedSince).toBe("1.13.0");
      // The 1.13.0 ref-doc marks these DEPRECATED! but names no replacement API,
      // so the catalog carries deprecatedSince only (no fabricated `replacement`).
      expect(migration.replacement).toBeUndefined();
    }
  });

  test("a catalog entry joins only its exact identity through applyMigrationOverlay", () => {
    const target = fn("model.reset_constant", [
      param("url", ["string"]),
      param("constant", ["hash"]),
    ]);
    const sibling = fn("model.set_mesh_enabled", [param("url", ["string"])]);
    const universe = collectSymbolIdentities([moduleOf("model", { functions: [target, sibling] })]);
    const merged = applyMigrationOverlay({
      derived: [],
      catalog: {
        migrations: [
          {
            identity: {
              namespace: "model",
              kind: "FUNCTION",
              name: "model.reset_constant",
              signature: "",
            },
            deprecatedSince: "1.13.0",
          },
        ],
      },
      universe,
      versions: ["1.13.0", "1.12.4"],
    });
    const deprecated = merged.filter((record) => record.deprecatedSince !== undefined);
    expect(deprecated).toHaveLength(1);
    expect(deprecated[0]?.identity.name).toBe("model.reset_constant");
    expect(deprecated[0]?.deprecatedSince).toBe("1.13.0");
  });
});
