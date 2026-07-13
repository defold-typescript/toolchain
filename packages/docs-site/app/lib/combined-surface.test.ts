import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  type ApiFunction,
  type ApiModule,
  type ApiParameter,
  type ApiSymbolIdentity,
  normalizedFunctionSignature,
  symbolIdentityKey,
} from "@defold-typescript/types";
import type { AvailabilityLookup } from "./api-surface";
import { loadCombinedSurface, loadSignaturesArtifact } from "./api-surface-loader";
import {
  buildCombinedSurface,
  type CombinedVersionSurface,
  combinedAuthoritativeSignatures,
  combinedNamespaceToApiPage,
  compactAvailability,
  namespaceBadgeCounts,
  type SignaturesArtifact,
} from "./combined-surface";

const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");

function param(name: string, types: string[], isOptional = false): ApiParameter {
  return { name, doc: "", types, isOptional };
}

function func(
  name: string,
  parameters: ApiParameter[],
  returnValues: ApiParameter[] = [],
): ApiFunction {
  return { name, brief: "", description: "", parameters, returnValues };
}

function mod(
  namespace: string,
  functions: ApiFunction[],
  extra: Partial<ApiModule> = {},
): ApiModule {
  return {
    namespace,
    brief: "",
    description: "",
    functions,
    variables: [],
    constants: [],
    properties: [],
    typedefs: [],
    ...extra,
  };
}

function funcId(namespace: string, fn: ApiFunction): ApiSymbolIdentity {
  return { namespace, kind: "FUNCTION", name: fn.name, signature: normalizedFunctionSignature(fn) };
}

const getPos = func("go.get_position", [param("id", ["string"])], [param("", ["vector3"])]);
const material = func("model.material", [param("url", ["url"])]);
const dispatch = func("compute.dispatch", [param("x", ["number"])]);
const addMountOld = func("liveupdate.add_mount", [
  param("name", ["string"]),
  param("uri", ["string"]),
]);
const addMountNew = func("liveupdate.add_mount", [
  param("name", ["string"]),
  param("uri", ["string"]),
  param("priority", ["number"]),
]);

const v113: CombinedVersionSurface = {
  version: "1.13.0",
  modules: [mod("go", [getPos]), mod("compute", [dispatch]), mod("liveupdate", [addMountNew])],
};
const v112: CombinedVersionSurface = {
  version: "1.12.4",
  modules: [mod("go", [getPos]), mod("model", [material]), mod("liveupdate", [addMountOld])],
};

const signatures: SignaturesArtifact = {
  versions: {
    "1.13.0": {
      [symbolIdentityKey(funcId("go", getPos))]: "function get_position(id: string): vector3;",
      [symbolIdentityKey(funcId("compute", dispatch))]: "function dispatch(x: number): void;",
      [symbolIdentityKey(funcId("liveupdate", addMountNew))]:
        "function add_mount(name: string, uri: string, priority: number): void;",
    },
    "1.12.4": {
      [symbolIdentityKey(funcId("go", getPos))]: "function get_position(id: string): vector3;",
      [symbolIdentityKey(funcId("model", material))]: "function material(url: url): void;",
      [symbolIdentityKey(funcId("liveupdate", addMountOld))]:
        "function add_mount(name: string, uri: string): void;",
    },
  },
};

const overlay: AvailabilityLookup = {
  versions: ["1.13.0", "1.12.4"],
  records: new Map([
    [
      symbolIdentityKey(funcId("model", material)),
      {
        identity: funcId("model", material),
        availableIn: ["1.12.4"],
        deprecatedSince: "1.12.0",
        replacement: funcId("go", getPos),
      },
    ],
  ]),
};

const combined = buildCombinedSurface({ surfaces: [v113, v112], signatures, overlay });
const nsOf = (name: string) => {
  const ns = combined.namespaces.find((n) => n.namespace === name);
  if (!ns) throw new Error(`namespace ${name} missing from combined surface`);
  return ns;
};

describe("buildCombinedSurface", () => {
  test("unions identities: a symbol in every version appears once with no lifecycle badge", () => {
    const go = nsOf("go");
    expect(go.module.functions).toHaveLength(1);
    expect(go.availability.records.has(symbolIdentityKey(funcId("go", getPos)))).toBe(false);
    const entry = go.entries.find((e) => e.identity.name === "go.get_position");
    expect(entry?.label.kind).toBe("all");
  });

  test("keeps a symbol that exists in only some versions, carrying its availableIn + label", () => {
    const model = nsOf("model");
    const entry = model.entries.find((e) => e.identity.name === "model.material");
    expect(entry?.availableIn).toEqual(["1.12.4"]);
    expect(entry?.label.label).toBe("Available through Defold 1.12.4");
    expect(entry?.deprecatedSince).toBe("1.12.0");
    expect(entry?.replacement?.name).toBe("go.get_position");
  });

  test("a namespace new in the newest version still renders, its symbols marked Since Defold X", () => {
    const compute = nsOf("compute");
    const entry = compute.entries.find((e) => e.identity.name === "compute.dispatch");
    expect(entry?.availableIn).toEqual(["1.13.0"]);
    expect(entry?.label.label).toBe("Since Defold 1.13.0");
  });

  test("renders a signature transition's overloads adjacent, oldest-first, not as a removal", () => {
    const live = nsOf("liveupdate");
    const sigs = live.module.functions.map((fn) => normalizedFunctionSignature(fn));
    expect(sigs).toEqual([
      normalizedFunctionSignature(addMountOld),
      normalizedFunctionSignature(addMountNew),
    ]);
    const oldEntry = live.entries.find(
      (e) => e.identity.signature === normalizedFunctionSignature(addMountOld),
    );
    const newEntry = live.entries.find(
      (e) => e.identity.signature === normalizedFunctionSignature(addMountNew),
    );
    expect(oldEntry?.transition).toBe(true);
    expect(newEntry?.transition).toBe(true);
    expect(oldEntry?.label.label).toBe("Available through Defold 1.12.4");
    expect(newEntry?.label.label).toBe("Since Defold 1.13.0");
  });

  test("every combined signature equals the authoritative api-signatures value for its newest version", () => {
    for (const ns of combined.namespaces) {
      for (const entry of ns.entries) {
        const newest = combined.versions.find((v) => entry.availableIn.includes(v));
        expect(newest).toBeDefined();
        const key = symbolIdentityKey(entry.identity);
        const authoritative = signatures.versions[newest as string]?.[key];
        expect(entry.authoritativeSignature).toBe(authoritative as string);
      }
    }
  });

  test("is deterministic under shuffled surface and module input order", () => {
    const project = (surface: ReturnType<typeof buildCombinedSurface>) =>
      JSON.stringify(
        surface.namespaces.map((ns) => ({
          namespace: ns.namespace,
          symbols: ns.module.functions.map((fn) => symbolIdentityKey(funcId(ns.namespace, fn))),
          entries: ns.entries,
        })),
      );
    const shuffled = buildCombinedSurface({
      surfaces: [
        { version: "1.12.4", modules: [...v112.modules].reverse() },
        { version: "1.13.0", modules: [...v113.modules].reverse() },
      ],
      signatures,
      overlay,
    });
    expect(project(shuffled)).toBe(project(combined));
  });

  test("auto-expands the availability axis and surfaces unique identities when a version is added", () => {
    const thing = func("newns.thing", []);
    const v114: CombinedVersionSurface = { version: "1.14.0", modules: [mod("newns", [thing])] };
    const expanded = buildCombinedSurface({
      surfaces: [v114, v113, v112],
      signatures: {
        versions: {
          ...signatures.versions,
          "1.14.0": { [symbolIdentityKey(funcId("newns", thing))]: "function thing(): void;" },
        },
      },
      overlay,
    });
    expect(expanded.versions[0]).toBe("1.14.0");
    expect(expanded.versions).toEqual(["1.14.0", "1.13.0", "1.12.4"]);
    const entry = expanded.namespaces
      .find((n) => n.namespace === "newns")
      ?.entries.find((e) => e.identity.name === "newns.thing");
    expect(entry?.availableIn).toEqual(["1.14.0"]);
    expect(entry?.label.label).toBe("Since Defold 1.14.0");
  });
});

describe("loadCombinedSurface (committed artifacts)", () => {
  const surface = loadCombinedSurface(REAL_TYPES_DIR);

  test("its axis is the tracked versions, newest-first", () => {
    expect(surface.versions).toEqual(["1.13.0", "1.12.4"]);
  });

  test("keeps a namespace new in the newest version (compute), marked Since Defold 1.13.0", () => {
    const compute = surface.namespaces.find((n) => n.namespace === "compute");
    expect(compute).toBeDefined();
    expect(compute?.entries.every((e) => e.availableIn.includes("1.13.0"))).toBe(true);
    expect(compute?.entries.some((e) => e.label.label === "Since Defold 1.13.0")).toBe(true);
  });

  test("renders liveupdate.add_mount as an adjacent, oldest-first signature transition", () => {
    const live = surface.namespaces.find((n) => n.namespace === "liveupdate");
    const indices = (live?.module.functions ?? [])
      .map((fn, i) => [fn.name, i] as const)
      .filter(([name]) => name === "liveupdate.add_mount")
      .map(([, i]) => i);
    expect(indices).toHaveLength(2);
    expect((indices[1] as number) - (indices[0] as number)).toBe(1);
    const entries = live?.entries.filter((e) => e.identity.name === "liveupdate.add_mount") ?? [];
    expect(entries.every((e) => e.transition)).toBe(true);
    expect(entries.map((e) => e.label.label)).toEqual([
      "Available through Defold 1.12.4",
      "Since Defold 1.13.0",
    ]);
  });

  test("every non-empty combined signature equals the authoritative api-signatures value", () => {
    const signatures = loadSignaturesArtifact(REAL_TYPES_DIR);
    for (const ns of surface.namespaces) {
      for (const entry of ns.entries) {
        if (!entry.authoritativeSignature) continue;
        const newest = surface.versions.find((v) => entry.availableIn.includes(v));
        const authoritative =
          signatures.versions[newest as string]?.[symbolIdentityKey(entry.identity)];
        expect(entry.authoritativeSignature).toBe(authoritative as string);
      }
    }
  });
});

describe("namespaceBadgeCounts", () => {
  test("tallies a namespace new in the newest version as new-only", () => {
    expect(namespaceBadgeCounts(nsOf("compute"))).toEqual({ new: 1, changed: 0, deprecated: 0 });
  });

  test("counts each category independently — a changed+deprecated symbol bumps both", () => {
    expect(namespaceBadgeCounts(nsOf("model"))).toEqual({ new: 0, changed: 1, deprecated: 1 });
  });

  test("a fully-stable namespace carries no badges", () => {
    expect(namespaceBadgeCounts(nsOf("go"))).toEqual({ new: 0, changed: 0, deprecated: 0 });
  });
});

describe("compactAvailability", () => {
  const entryOf = (namespace: string, name: string) => {
    const entry = nsOf(namespace).entries.find((e) => e.identity.name === name);
    if (!entry) throw new Error(`entry ${name} missing from ${namespace}`);
    return entry;
  };

  test("a universal symbol with no curated facts carries no tag", () => {
    expect(compactAvailability(entryOf("go", "go.get_position"))).toBe("");
  });

  test("both signature-transition arms carry [signature transition] after their span", () => {
    const live = nsOf("liveupdate");
    const arms = live.entries.filter((e) => e.identity.name === "liveupdate.add_mount");
    const tags = arms.map(compactAvailability).sort();
    expect(tags).toEqual([
      "[since 1.13.0] [signature transition]",
      "[through 1.12.4] [signature transition]",
    ]);
  });

  test("a removed+deprecated symbol renders span, deprecation, and replacement, no transition", () => {
    expect(compactAvailability(entryOf("model", "model.material"))).toBe(
      "[through 1.12.4] [deprecated since 1.12.0] [replaced by go.get_position]",
    );
  });

  test("a Box2D-specific symbol renders [Box2D: …]", () => {
    const b2 = func("b2d.get_gravity", [], [param("", ["vector3"])]);
    const surface = buildCombinedSurface({
      surfaces: [
        { version: "1.13.0", modules: [mod("b2d", [b2])] },
        { version: "1.12.4", modules: [mod("b2d", [b2])] },
      ],
      signatures: {
        versions: {
          "1.13.0": { [symbolIdentityKey(funcId("b2d", b2))]: "function get_gravity(): vector3;" },
          "1.12.4": { [symbolIdentityKey(funcId("b2d", b2))]: "function get_gravity(): vector3;" },
        },
      },
      overlay: {
        versions: ["1.13.0", "1.12.4"],
        records: new Map([
          [
            symbolIdentityKey(funcId("b2d", b2)),
            { identity: funcId("b2d", b2), availableIn: ["1.13.0", "1.12.4"], box2d: ["v3"] },
          ],
        ]),
      },
    });
    const entry = surface.namespaces
      .find((n) => n.namespace === "b2d")
      ?.entries.find((e) => e.identity.name === "b2d.get_gravity");
    expect(entry).toBeDefined();
    expect(compactAvailability(entry as NonNullable<typeof entry>)).toBe("[Box2D: v3]");
  });
});

describe("combinedAuthoritativeSignatures", () => {
  test("maps each function identity to its authoritative inner render form", () => {
    const map = combinedAuthoritativeSignatures(nsOf("go"));
    expect(map.get(symbolIdentityKey(funcId("go", getPos)))).toBe(
      "go.get_position(id: string): vector3",
    );
  });

  test("keys by exact overload so both add_mount arms resolve distinctly", () => {
    const map = combinedAuthoritativeSignatures(nsOf("liveupdate"));
    const oldSig = map.get(symbolIdentityKey(funcId("liveupdate", addMountOld)));
    const newSig = map.get(symbolIdentityKey(funcId("liveupdate", addMountNew)));
    expect(oldSig).toBe("liveupdate.add_mount(name: string, uri: string): void");
    expect(newSig).toBe("liveupdate.add_mount(name: string, uri: string, priority: number): void");
    expect(oldSig).not.toBe(newSig);
  });

  test("combinedNamespaceToApiPage attaches the identity-keyed signature map", () => {
    const page = combinedNamespaceToApiPage(nsOf("go"));
    expect(page.authoritativeSignatures?.get(symbolIdentityKey(funcId("go", getPos)))).toBe(
      "go.get_position(id: string): vector3",
    );
  });
});

describe("combinedAuthoritativeSignatures (members)", () => {
  const constId: ApiSymbolIdentity = {
    namespace: "b2d.body",
    kind: "CONSTANT",
    name: "B2_DYNAMIC_BODY",
    signature: "",
  };
  const varId: ApiSymbolIdentity = {
    namespace: "demo",
    kind: "VARIABLE",
    name: "spin",
    signature: "",
  };
  const typedefId: ApiSymbolIdentity = {
    namespace: "demo",
    kind: "TYPEDEF",
    name: "Handle",
    signature: "",
  };
  const constDecl =
    'const B2_DYNAMIC_BODY: number & { readonly __brand: "b2d.body.B2_DYNAMIC_BODY" };';
  const bodyModule = (): ApiModule =>
    mod("b2d.body", [], { constants: [{ name: "B2_DYNAMIC_BODY", brief: "", description: "" }] });
  const demoModule = (): ApiModule =>
    mod("demo", [], {
      variables: [{ name: "spin", brief: "", description: "", types: ["number"] }],
      typedefs: [{ name: "Handle" }],
    });
  const memberSignatures = (): Record<string, string> => ({
    [symbolIdentityKey(constId)]: constDecl,
    [symbolIdentityKey(varId)]: "spin: number;",
    [symbolIdentityKey(typedefId)]: 'type Handle = Opaque<number, "Handle">;',
  });
  const memberSurface = buildCombinedSurface({
    surfaces: [
      { version: "1.13.0", modules: [bodyModule(), demoModule()] },
      { version: "1.12.4", modules: [bodyModule(), demoModule()] },
    ],
    signatures: { versions: { "1.13.0": memberSignatures(), "1.12.4": memberSignatures() } },
  });
  const memberNs = (name: string) => {
    const ns = memberSurface.namespaces.find((n) => n.namespace === name);
    if (!ns) throw new Error(`namespace ${name} missing from member surface`);
    return ns;
  };

  test("a branded Box2D constant maps to its bare-name authoritative inner form", () => {
    const map = combinedAuthoritativeSignatures(memberNs("b2d.body"));
    expect(map.get(symbolIdentityKey(constId))).toBe(
      'B2_DYNAMIC_BODY: number & { readonly __brand: "b2d.body.B2_DYNAMIC_BODY" }',
    );
  });

  test("variable (name: T) and typedef (type Name = T) forms both resolve through the map builder", () => {
    const map = combinedAuthoritativeSignatures(memberNs("demo"));
    expect(map.get(symbolIdentityKey(varId))).toBe("spin: number");
    expect(map.get(symbolIdentityKey(typedefId))).toBe('type Handle = Opaque<number, "Handle">');
  });

  test("function entries keep their qualified inner form after the member extension", () => {
    const map = combinedAuthoritativeSignatures(nsOf("liveupdate"));
    expect(map.get(symbolIdentityKey(funcId("liveupdate", addMountOld)))).toBe(
      "liveupdate.add_mount(name: string, uri: string): void",
    );
    expect(map.get(symbolIdentityKey(funcId("liveupdate", addMountNew)))).toBe(
      "liveupdate.add_mount(name: string, uri: string, priority: number): void",
    );
  });
});

describe("combinedAuthoritativeSignatures (committed artifacts)", () => {
  const surface = loadCombinedSurface(REAL_TYPES_DIR);
  const real = (name: string) => {
    const found = surface.namespaces.find((n) => n.namespace === name);
    if (!found) throw new Error(`namespace ${name} missing from combined surface`);
    return found;
  };

  test("compute.get_constants maps to the authoritative structured record-array return", () => {
    const compute = real("compute");
    const map = combinedNamespaceToApiPage(compute).authoritativeSignatures;
    const entry = compute.entries.find((e) => e.identity.name === "compute.get_constants");
    expect(entry).toBeDefined();
    const inner = map?.get(symbolIdentityKey((entry as NonNullable<typeof entry>).identity));
    expect(inner).toBe(
      "compute.get_constants(path: Hash | string): { name: Hash; type: number; value: Vector4 | Matrix4 }[]",
    );
    expect(inner).not.toContain("Record<string | number, unknown>");
  });
});

describe("verified deprecations on the committed Combined surface", () => {
  const surface = loadCombinedSurface(REAL_TYPES_DIR);
  const real = (name: string) => {
    const found = surface.namespaces.find((n) => n.namespace === name);
    if (!found) throw new Error(`namespace ${name} missing from combined surface`);
    return found;
  };

  test("a reset_constant carries deprecatedSince and the [deprecated since 1.13.0] tag", () => {
    const entry = real("model").entries.find((e) => e.identity.name === "model.reset_constant");
    expect(entry).toBeDefined();
    expect((entry as NonNullable<typeof entry>).deprecatedSince).toBe("1.13.0");
    expect(compactAvailability(entry as NonNullable<typeof entry>)).toContain(
      "[deprecated since 1.13.0]",
    );
  });

  test("a changed symbol (add_mount) and a removed symbol (model.material) are never deprecated", () => {
    const arms = real("liveupdate").entries.filter(
      (e) => e.identity.name === "liveupdate.add_mount",
    );
    expect(arms.length).toBeGreaterThan(0);
    for (const arm of arms) {
      expect(arm.transition).toBe(true);
      expect(arm.deprecatedSince).toBeUndefined();
    }
    const material = real("model").entries.find((e) => e.identity.name === "model.material");
    expect(material?.deprecatedSince).toBeUndefined();
  });
});

describe("namespaceBadgeCounts (committed artifacts)", () => {
  const surface = loadCombinedSurface(REAL_TYPES_DIR);
  const real = (name: string) => {
    const found = surface.namespaces.find((n) => n.namespace === name);
    if (!found) throw new Error(`namespace ${name} missing from combined surface`);
    return found;
  };

  test("compute (all-new) has new > 0 and changed 0", () => {
    const counts = namespaceBadgeCounts(real("compute"));
    expect(counts.new).toBeGreaterThan(0);
    expect(counts.changed).toBe(0);
  });

  test("a stable namespace (vmath) is {0,0,0}", () => {
    expect(namespaceBadgeCounts(real("vmath"))).toEqual({ new: 0, changed: 0, deprecated: 0 });
  });

  test("a namespace with a transitioned symbol (liveupdate) has changed > 0", () => {
    expect(namespaceBadgeCounts(real("liveupdate")).changed).toBeGreaterThan(0);
  });
});
