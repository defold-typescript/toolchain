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

  test("keeps tile_raycast.cast's hit-or-miss return union", () => {
    const cast = lowered("tile_raycast").elements.find((e) => e.name === "cast");
    expect(cast?.returnvalues?.[0]?.types).toEqual([
      "LuaMultiReturn<[ false ] | [ true, number, number, number, number, number, number, number ]>",
    ]);
  });

  test("lowers pixels with its buffer, color and polyline option shapes", () => {
    const doc = lowered("pixels");
    expect(doc.elements.filter((e) => e.type === "FUNCTION")).toHaveLength(18);
    expect(doc.elements.filter((e) => e.type === "VARIABLE")).toHaveLength(0);
    const byName = new Map(doc.elements.map((e) => [e.name, e]));
    const bufferInfo = byName.get("BufferInfo");
    expect(bufferInfo?.type).toBe("TYPEDEF");
    expect(bufferInfo?.properties?.map((p) => [p.name, p.is_optional])).toEqual([
      ["buffer", undefined],
      ["width", undefined],
      ["height", undefined],
      ["channels", undefined],
      ["premultiply_alpha", "True"],
    ]);
    expect(byName.get("Color")?.types).toEqual([
      "[ number, number, number ]",
      "[ number, number, number, number ]",
    ]);
    expect(byName.get("PolylineOptions")?.types).toEqual(["PolylineWidth", "PolylinePointWidths"]);
    expect(byName.get("PolylineWidth")?.extends).toEqual(["PolylineStyle"]);
    expect(byName.get("PolylinePointWidths")?.extends).toEqual(["PolylineStyle"]);
    expect(byName.get("color")?.returnvalues?.[0]?.types).toEqual([
      "LuaMultiReturn<[ undefined? ] | [ number, number, number ] | [ number, number, number, number ]>",
    ]);
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
