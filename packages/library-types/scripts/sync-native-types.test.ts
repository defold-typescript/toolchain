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
  properties?: { name: string; is_optional?: string }[];
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
