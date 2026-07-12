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
