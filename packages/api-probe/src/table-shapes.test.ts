import { describe, expect, test } from "bun:test";
import { type DeclaredField, type DeclaredShape, shapeMismatches } from "./table-shapes";
import { generateProbes } from "./witness";

const v2 = generateProbes(undefined, "v2");

function declaredShape(name: string): DeclaredShape {
  const call = v2.calls.find((c) => c.name === name && c.witness === undefined);
  const shape = call?.returns?.shapes?.[0];
  if (shape === undefined) throw new Error(`no declared table shape for ${name}`);
  return shape;
}

function required(field: DeclaredField): field is DeclaredField & { kinds: string[] } {
  return field.kinds !== "any" && !field.kinds.includes("nil");
}

function reportedKind(field: DeclaredField & { kinds: string[] }): string {
  if (field.shape !== undefined && field.kinds.includes("table")) return "table";
  return field.kinds[0] as string;
}

// What the engine would report for a table holding exactly the required fields
// of `shape`, each of its first declared kind, nested tables included.
function reportFrom(
  shape: DeclaredShape,
  path: string,
  out: Record<string, string[]> = {},
): Record<string, string[]> {
  for (const [name, field] of Object.entries(shape.fields)) {
    if (!required(field)) continue;
    const kind = reportedKind(field);
    out[`${path}.${name}`] = [kind];
    if (kind === "table" && field.shape !== undefined)
      reportFrom(field.shape, `${path}.${name}`, out);
  }
  return out;
}

describe("shapeMismatches", () => {
  test("a record is compared field by field", () => {
    const shape = declaredShape("sys.get_engine_info");
    expect(shape.fields.version).toEqual({ kinds: ["string"] });
    const report = reportFrom(shape, "1");
    expect(shapeMismatches(1, shape, report)).toEqual([]);

    const { "1.version": _, ...withoutVersion } = report;
    expect(shapeMismatches(1, shape, withoutVersion)).toEqual([
      "value 1 field version is absent, declared string",
    ]);
    expect(shapeMismatches(1, shape, { ...report, "1.version": ["number"] })).toEqual([
      "value 1 field version is number, declared string",
    ]);
    expect(shapeMismatches(1, shape, { ...report, "1.extra": ["string"] })).toEqual([
      "value 1 field extra is undeclared",
    ]);
  });

  test("an array is compared through its elements", () => {
    const shape = declaredShape("sys.get_ifaddrs");
    expect(shape.fields).toEqual({});
    expect(shape.index?.key).toEqual(["number"]);
    const element = shape.index?.value.shape;
    if (element === undefined) throw new Error("sys.get_ifaddrs elements declare no shape");
    const report: Record<string, string[]> = {
      "1[number]": ["table"],
      ...reportFrom(element, "1[number]"),
    };
    expect(shapeMismatches(1, shape, report)).toEqual([]);
    expect(shapeMismatches(1, shape, {})).toEqual([]);

    const first = Object.entries(element.fields).find(([, field]) => required(field));
    if (first === undefined) throw new Error("sys.get_ifaddrs elements declare no required field");
    const [name, field] = first as [string, DeclaredField & { kinds: string[] }];
    const { [`1[number].${name}`]: _, ...dropped } = report;
    expect(shapeMismatches(1, shape, dropped)).toEqual([
      `value 1 field [number].${name} is absent, declared ${field.kinds.join("|")}`,
    ]);
    expect(shapeMismatches(1, shape, { ...report, "1.name": ["string"] })).toEqual([
      "value 1 field name is undeclared",
    ]);
  });

  test("a Lua map is compared through its keys and values, never its methods", () => {
    const shape = declaredShape("gui.get_tree");
    expect(shape.fields).toEqual({});
    expect(shape.index?.key).toEqual(["hash"]);
    expect(shape.index?.value.kinds).toEqual(["userdata"]);
    expect(shapeMismatches(1, shape, { "1[hash]": ["userdata"] })).toEqual([]);
    expect(shapeMismatches(1, shape, { "1.get": ["function"] })).toEqual([
      "value 1 field get is undeclared",
    ]);
  });
});
