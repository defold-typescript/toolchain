import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  lowerNativeApiDoc,
  type NativeTarget,
  nativeApiDocPath,
  readNativeTargets,
} from "./sync-native-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

interface Element {
  type: string;
  name: string;
  global?: boolean;
  returnvalues?: { types: string[] }[];
  types?: string[];
  extends?: string[];
  properties?: { name: string; is_optional?: string; types?: string[] }[];
  functions?: { name: string }[];
}

function target(namespace: string): NativeTarget {
  const found = readNativeTargets(PACKAGE_ROOT).find((t) => t.namespace === namespace);
  if (!found) throw new Error(`native-targets.json has no ${namespace} entry`);
  return found;
}

function lowered(namespace: string): { info: { namespace: string }; elements: Element[] } {
  return JSON.parse(lowerNativeApiDoc(PACKAGE_ROOT, target(namespace)));
}

describe("lowerNativeApiDoc", () => {
  test("lowers daabbcc to bare member names under its namespace", () => {
    const doc = lowered("daabbcc");
    expect(doc.info.namespace).toBe("daabbcc");
    expect(doc.elements.filter((e) => e.type === "FUNCTION")).toHaveLength(18);
    expect(doc.elements.filter((e) => e.type === "VARIABLE")).toHaveLength(3);
    const names = doc.elements.map((e) => e.name);
    expect(names).toContain("new_group");
    expect(names).toContain("UPDATE_INCREMENTAL");
    expect(names.filter((n) => n.startsWith("global.") || n.includes("."))).toEqual([]);
  });

  // The page already says the namespace is a global called with no import, so a
  // per-member ambient-global badge would repeat it on every row.
  test("carries no per-member global marker", () => {
    for (const { namespace } of readNativeTargets(PACKAGE_ROOT)) {
      expect(lowered(namespace).elements.filter((e) => e.global)).toEqual([]);
    }
  });

  test("defines the options shape share.file names", () => {
    const options = lowered("share").elements.find((e) => e.name === "FileOptions");
    expect(options?.type).toBe("TYPEDEF");
    expect(options?.properties?.map((p) => [p.name, p.is_optional])).toEqual([
      ["type", "True"],
      ["text", "True"],
      ["title", "True"],
      ["url", "True"],
    ]);
  });

  test("defines daabbcc's query results and the hit shapes they name", () => {
    const byName = new Map(lowered("daabbcc").elements.map((e) => [e.name, e]));
    expect(byName.get("QueryResult")?.types).toEqual(["number[]", "BitsHit[]", "ManifoldHit[]"]);
    expect(byName.get("SortedQueryResult")?.types).toContain("SortedHit[]");
    expect(byName.get("ManifoldHit")?.extends).toEqual(["SortedHit"]);
    expect(byName.get("SortedHit")?.extends).toEqual(["BitsHit"]);
    expect(byName.get("BitsHit")?.properties?.map((p) => p.name)).toContain("id");
  });

  test("lowers daabbcc3d's registered functions and its rebuild constants", () => {
    const doc = lowered("daabbcc3d");
    expect(doc.info.namespace).toBe("daabbcc3d");
    expect(doc.elements.filter((e) => e.type === "FUNCTION")).toHaveLength(18);
    expect(doc.elements.filter((e) => e.type === "VARIABLE")).toHaveLength(3);
  });

  test("lowers wave's registered functions and none of the stubs its C++ never registers", () => {
    const functions = lowered("wave")
      .elements.filter((e) => e.type === "FUNCTION")
      .map((e) => e.name);
    expect(functions).toHaveLength(12);
    expect(functions).not.toContain("get_wave1_time_height");
    expect(functions).not.toContain("get_wave2_time_height");
  });

  test("keeps tile_raycast.cast's hit-or-miss return union", () => {
    const cast = lowered("tile_raycast").elements.find((e) => e.name === "cast");
    expect(cast?.returnvalues?.[0]?.types).toEqual([
      "LuaMultiReturn<[ false ] | [ true, number, number, number, number, number, number, number ]>",
    ]);
  });

  test("lowers box2d's shape-table unions and joint-def inheritance", () => {
    const byName = new Map(lowered("box2d").elements.map((e) => [e.name, e]));
    const chain = byName.get("ChainShapeTable");
    expect(chain?.type).toBe("TYPEDEF");
    expect(chain?.types).toEqual(["LoopChainShapeTable", "OpenChainShapeTable"]);
    expect(
      byName.get("OpenChainShapeTable")?.properties?.map((p) => [p.name, p.is_optional]),
    ).toEqual([
      ["shape", undefined],
      ["chain_vertices", undefined],
      ["chain_loop", "True"],
      ["chain_prev_vertex", undefined],
      ["chain_next_vertex", undefined],
    ]);
    expect(byName.get("RevoluteJointDef")?.extends).toEqual(["JointDefBase"]);
  });

  test("lowers def_windward_jps with its grid methods and the point and heuristic shapes", () => {
    const doc = lowered("def_windward_jps");
    expect(doc.elements.filter((e) => e.type === "FUNCTION").map((e) => e.name)).toEqual([
      "create_grid",
    ]);
    expect(doc.elements.filter((e) => e.type === "VARIABLE")).toHaveLength(0);
    const byName = new Map(doc.elements.map((e) => [e.name, e]));
    const grid = byName.get("Grid");
    expect(grid?.type).toBe("TYPEDEF");
    expect(grid?.functions?.map((f) => f.name)).toEqual(["find_path", "is_walkable"]);
    expect(grid?.properties).toBeUndefined();
    expect(byName.get("Point")?.type).toBe("TYPEDEF");
    expect(byName.get("Heuristic")?.type).toBe("TYPEDEF");
    expect(byName.get("Heuristic")?.types).toEqual(['"octile"', '"manhattan"', '"euclidean"']);
  });

  test("lowers taptic_engine to bare function and constant names", () => {
    const doc = lowered("taptic_engine");
    expect(doc.info.namespace).toBe("taptic_engine");
    expect(
      doc.elements
        .filter((e) => e.type === "FUNCTION")
        .map((e) => e.name)
        .sort(),
    ).toEqual(["impact", "isSupported", "notification", "selection"]);
    expect(
      doc.elements
        .filter((e) => e.type === "VARIABLE")
        .map((e) => e.name)
        .sort(),
    ).toEqual([
      "IMPACT_HEAVY",
      "IMPACT_LIGHT",
      "IMPACT_MEDIUM",
      "NOTIFICATION_ERROR",
      "NOTIFICATION_SUCCESS",
      "NOTIFICATION_WARNING",
    ]);
    expect(doc.elements.map((e) => e.name).filter((n) => n.startsWith("global."))).toEqual([]);
  });

  test("lowers png's codec functions and its LodePNG color-type constants, named bare", () => {
    const doc = lowered("png");
    expect(doc.info.namespace).toBe("png");
    expect(
      doc.elements
        .filter((e) => e.type === "FUNCTION")
        .map((e) => e.name)
        .sort(),
    ).toEqual(["decode_rgb", "decode_rgba", "encode_rgb", "encode_rgba", "info"]);
    expect(
      doc.elements
        .filter((e) => e.type === "VARIABLE")
        .map((e) => e.name)
        .sort(),
    ).toEqual(["GREY", "GREY_ALPHA", "PALETTE", "RGB", "RGBA"]);
    expect(doc.elements.map((e) => e.name).filter((n) => n.startsWith("global."))).toEqual([]);
  });

  test("lowers detour's init, its NavMesh and Crowd methods and the result shapes", () => {
    const doc = lowered("detour");
    expect(doc.elements.filter((e) => e.type === "FUNCTION").map((e) => e.name)).toEqual(["init"]);
    expect(doc.elements.filter((e) => e.type === "VARIABLE")).toHaveLength(0);
    const byName = new Map(doc.elements.map((e) => [e.name, e]));
    for (const name of ["NavMesh", "Crowd"]) {
      expect(byName.get(name)?.type).toBe("TYPEDEF");
      expect(byName.get(name)?.functions).toHaveLength(5);
      expect(byName.get(name)?.properties).toBeUndefined();
    }
    for (const name of ["PathPoint", "CrowdAgent"]) {
      expect(byName.get(name)?.properties?.length).toBeGreaterThan(0);
      expect(byName.get(name)?.functions).toBeUndefined();
    }
  });

  // A userdata method lowered as a property, or a callback lowered as a method, reads on
  // the page as a member the runtime does not have.
  test("lowers box2d methods as functions, callbacks as properties and constants by table", () => {
    const doc = lowered("box2d");
    expect(doc.elements.filter((e) => e.type === "FUNCTION")).toHaveLength(18);
    const variables = doc.elements.filter((e) => e.type === "VARIABLE").map((e) => e.name);
    expect(variables).toHaveLength(27);
    expect(variables).toContain("b2Shape.e_circle");
    expect(
      variables.filter(
        (name) =>
          !/^(b2Shape|b2BodyType|b2JointType|b2Draw|b2Manifold_Type)\.[A-Za-z0-9_]+$/.test(name),
      ),
    ).toEqual([]);

    const typedefs = new Map(
      doc.elements.filter((e) => e.type === "TYPEDEF").map((e) => [e.name, e]),
    );
    const isCallback = (p: { types?: string[] }) => (p.types ?? []).some((t) => t.includes("=>"));
    const methodBearing = [...new Set(Object.values(target("box2d").methodTables ?? {}).flat())];
    expect(methodBearing).toHaveLength(21);
    for (const name of methodBearing) {
      const typedef = typedefs.get(name);
      expect(typedef?.functions?.length ?? 0).toBeGreaterThan(0);
      expect((typedef?.properties ?? []).filter(isCallback)).toEqual([]);
    }
    expect(
      [...typedefs.values()]
        .filter((e) => (e.functions?.length ?? 0) > 0)
        .map((e) => e.name)
        .sort(),
    ).toEqual([...methodBearing].sort());

    const callbacks = (name: string) =>
      (typedefs.get(name)?.properties ?? []).filter(isCallback).map((p) => p.name);
    expect(callbacks("ContactListener")).toEqual([
      "BeginContact",
      "EndContact",
      "PreSolve",
      "PostSolve",
    ]);
    expect(callbacks("DestructionListener")).toEqual(["SayGoodbyeFixture", "SayGoodbyeJoint"]);
    expect(callbacks("DebugDrawCallbacks")).toEqual([
      "DrawPolygon",
      "DrawSolidPolygon",
      "DrawCircle",
      "DrawSolidCircle",
      "DrawSegment",
      "DrawTransform",
      "DrawPoint",
    ]);
  });
});

describe("committed native api-docs", () => {
  test("every native target has a committed api-doc equal to a fresh lowering", () => {
    const targets = readNativeTargets(PACKAGE_ROOT);
    expect(targets.length).toBeGreaterThan(0);
    for (const t of targets) {
      const path = join(PACKAGE_ROOT, nativeApiDocPath(t));
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path, "utf8")).toBe(lowerNativeApiDoc(PACKAGE_ROOT, t));
    }
  });
});
