import { describe, expect, test } from "bun:test";
import {
  type ApiMigrationCatalog,
  type ApiSymbolIdentity,
  applyMigrationOverlay,
  collectSymbolIdentities,
  deriveAvailability,
  symbolIdentityKey,
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

describe("deriveAvailability", () => {
  test("derives since for new symbols and removedIn for dropped symbols", () => {
    const baseline = [
      moduleOf("m", {
        functions: [fn("m.stable", [param("x", ["number"])]), fn("m.gone", [])],
      }),
    ];
    const current = [
      moduleOf("m", {
        functions: [fn("m.stable", [param("x", ["number"])]), fn("m.fresh", [])],
      }),
    ];
    const records = deriveAvailability({ baseline, current, version: "1.13.0" });
    const byName = new Map(records.map((r) => [r.identity.name, r]));
    expect(byName.get("m.fresh")?.since).toBe("1.13.0");
    expect(byName.get("m.fresh")?.removedIn).toBeUndefined();
    expect(byName.get("m.gone")?.removedIn).toBe("1.13.0");
    expect(byName.get("m.gone")?.since).toBeUndefined();
    expect(byName.has("m.stable")).toBe(false);
  });

  test("a changed overload signature yields both a removedIn and a since record for the same name", () => {
    const baseline = [moduleOf("m", { functions: [fn("m.f", [param("x", ["number"])])] })];
    const current = [moduleOf("m", { functions: [fn("m.f", [param("x", ["hash"])])] })];
    const records = deriveAvailability({ baseline, current, version: "1.13.0" });
    expect(
      records.filter((r) => r.identity.name === "m.f" && r.removedIn === "1.13.0"),
    ).toHaveLength(1);
    expect(records.filter((r) => r.identity.name === "m.f" && r.since === "1.13.0")).toHaveLength(
      1,
    );
  });

  test("output is deterministic and sorted by identity key", () => {
    const baseline = [moduleOf("m", {})];
    const current = [
      moduleOf("m", {
        functions: [fn("m.b", []), fn("m.a", [])],
        constants: [{ name: "m.Z", brief: "", description: "" }],
      }),
    ];
    const records = deriveAvailability({ baseline, current, version: "1.13.0" });
    const rendered = records.map((r) => symbolIdentityKey(r.identity));
    expect(rendered).toEqual([...rendered].sort());
  });
});

describe("applyMigrationOverlay", () => {
  const universe = collectSymbolIdentities([
    moduleOf("m", {
      functions: [fn("m.stable", [param("x", ["number"])]), fn("m.repl", [])],
      constants: [{ name: "m.OLD", brief: "", description: "" }],
    }),
    moduleOf("b2d.world", { functions: [fn("b2d.world.step", [])] }),
  ]);

  test("overlays deprecatedSince, replacement, and box2d onto matched records", () => {
    const stableId = universe.find((id) => id.name === "m.stable") as ApiSymbolIdentity;
    const replId = universe.find((id) => id.name === "m.repl") as ApiSymbolIdentity;
    const b2dId = universe.find((id) => id.name === "b2d.world.step") as ApiSymbolIdentity;
    const catalog: ApiMigrationCatalog = {
      migrations: [
        { identity: stableId, deprecatedSince: "1.13.0", replacement: replId },
        { identity: b2dId, box2d: ["v3"] },
      ],
    };
    const merged = applyMigrationOverlay({ derived: [], catalog, universe });
    const stable = merged.find(
      (r) => symbolIdentityKey(r.identity) === symbolIdentityKey(stableId),
    );
    expect(stable?.deprecatedSince).toBe("1.13.0");
    expect(stable?.replacement && symbolIdentityKey(stable.replacement)).toBe(
      symbolIdentityKey(replId),
    );
    const b2d = merged.find((r) => symbolIdentityKey(r.identity) === symbolIdentityKey(b2dId));
    expect(b2d?.box2d).toEqual(["v3"]);
  });

  test("merges curated fields onto an already-derived record without dropping since", () => {
    const constId = universe.find((id) => id.name === "m.OLD") as ApiSymbolIdentity;
    const derived = [{ identity: constId, since: "1.13.0" as const }];
    const catalog: ApiMigrationCatalog = {
      migrations: [{ identity: constId, deprecatedSince: "1.13.0" }],
    };
    const merged = applyMigrationOverlay({ derived, catalog, universe });
    const record = merged.find((r) => symbolIdentityKey(r.identity) === symbolIdentityKey(constId));
    expect(record?.since).toBe("1.13.0");
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
    expect(() => applyMigrationOverlay({ derived: [], catalog, universe })).toThrow(/unknown/i);
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
    expect(() => applyMigrationOverlay({ derived: [], catalog, universe: overloaded })).toThrow(
      /ambiguous/i,
    );
  });
});

describe("validateAvailability", () => {
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
        { identity: removedId, removedIn: "1.13.0" },
        { identity: stableId, deprecatedSince: "1.13.0", replacement: replId },
      ],
      currentSurface: new Set([stableId, replId].map(symbolIdentityKey)),
      knownIdentities: known,
    });
    expect(errors).toEqual([]);
  });

  test("rejects a removed symbol that is still callable in the current surface", () => {
    const errors = validateAvailability({
      records: [{ identity: removedId, removedIn: "1.13.0" }],
      currentSurface: new Set([removedId].map(symbolIdentityKey)),
      knownIdentities: known,
    });
    expect(errors.some((e) => /callable/i.test(e))).toBe(true);
  });

  test("rejects a replacement that resolves to no known symbol", () => {
    const errors = validateAvailability({
      records: [
        {
          identity: stableId,
          replacement: { namespace: "m", kind: "FUNCTION", name: "m.nowhere", signature: "()" },
        },
      ],
      currentSurface: new Set([stableId].map(symbolIdentityKey)),
      knownIdentities: known,
    });
    expect(errors.some((e) => /replacement/i.test(e))).toBe(true);
  });

  test("rejects empty and overlapping (duplicated) backend availability", () => {
    const empty = validateAvailability({
      records: [{ identity: stableId, box2d: [] }],
      currentSurface: new Set([stableId].map(symbolIdentityKey)),
      knownIdentities: known,
    });
    expect(empty.some((e) => /backend/i.test(e))).toBe(true);
    const dup = validateAvailability({
      records: [{ identity: stableId, box2d: ["v2", "v2"] }],
      currentSurface: new Set([stableId].map(symbolIdentityKey)),
      knownIdentities: known,
    });
    expect(dup.some((e) => /backend/i.test(e))).toBe(true);
  });
});
