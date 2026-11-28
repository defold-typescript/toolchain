import { describe, expect, test } from "bun:test";
import { surfaceProgram } from "../../types/scripts/lua-kind";
import { checkCalls } from "./call-check";
import {
  type DeclaredField,
  type DeclaredShape,
  shapeArms,
  shapeMismatches,
  declaredShape as shapeOfType,
  type TableShape,
} from "./table-shapes";
import { generateProbes, probeTarget } from "./witness";

const v2 = generateProbes(undefined, "v2");
const program = surfaceProgram(probeTarget());

function table(shape: DeclaredShape | undefined, what: string): TableShape {
  if (shape === undefined || "arms" in shape) throw new Error(`${what} declares no single table`);
  return shape;
}

function declaredShape(name: string): TableShape {
  const call = v2.calls.find((c) => c.name === name && c.witness === undefined);
  return table(call?.returns?.shapes?.[0], name);
}

// The shape `declaredShape` reads from `type`, written against the engine surface.
function shapeOf(type: string): DeclaredShape {
  const { checker, calls } = checkCalls(program, [`__capture(undefined as unknown as ${type})`]);
  const captured = calls[0]?.captures?.[0];
  if (captured === undefined) throw new Error(`${type}: ${calls[0]?.errors.join("; ")}`);
  const shape = shapeOfType(captured, checker);
  if (shape === undefined) throw new Error(`${type} declares no table shape`);
  return shape;
}

const CIRCLE = "{ type: number; radius: number; center: Vector3 }";
const POLYGON = "{ type: number; vertices: Vector3[] }";

function required(field: DeclaredField): field is DeclaredField & { kinds: string[] } {
  return field.kinds !== "any" && !field.kinds.includes("nil");
}

function reportedKind(field: DeclaredField & { kinds: string[] }): string {
  if (field.shape !== undefined && field.kinds.includes("table")) return "table";
  return field.kinds[0] as string;
}

// What the engine would report for a table holding exactly the required fields
// of `shape`'s first arm, each of its first declared kind, nested tables included.
function reportFrom(
  shape: DeclaredShape,
  path: string,
  out: Record<string, string[]> = {},
): Record<string, string[]> {
  for (const [name, field] of Object.entries(shapeArms(shape)[0]?.fields ?? {})) {
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
    const element = table(shape.index?.value.shape, "sys.get_ifaddrs elements");
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

  test("a union of tables matches one arm in full, named by the closest arm", () => {
    const shape = shapeOf(`${CIRCLE} | ${POLYGON}`);
    expect(shapeMismatches(1, shape, { "1.type": ["number"] })).toEqual([
      "value 1 field vertices is absent, declared table",
    ]);
    const circle = { "1.type": ["number"], "1.radius": ["number"], "1.center": ["vector3"] };
    expect(shapeMismatches(1, shape, circle)).toEqual([]);
    const polygon = {
      "1.type": ["number"],
      "1.vertices": ["table"],
      "1.vertices[number]": ["vector3"],
    };
    expect(shapeMismatches(1, shape, polygon)).toEqual([]);
    const mixed = { "1.type": ["number"], "1.radius": ["number"], "1.vertices": ["table"] };
    expect(shapeMismatches(1, shape, mixed)).toEqual(["value 1 field radius is undeclared"]);
  });

  test("a nested union field matches one arm, and array elements stay merged", () => {
    const nested = shapeOf(`{ shape: ${CIRCLE} | ${POLYGON} }`);
    expect(
      shapeMismatches(1, nested, { "1.shape": ["table"], "1.shape.type": ["number"] }),
    ).toEqual(["value 1 field shape.vertices is absent, declared table"]);
    // Every element reports under one `[number]` path, so a list of circles and
    // polygons is judged against what any element may hold.
    const list = shapeOf(`(${CIRCLE} | ${POLYGON})[]`);
    const both = {
      "1[number]": ["table"],
      "1[number].type": ["number"],
      "1[number].radius": ["number"],
      "1[number].center": ["vector3"],
      "1[number].vertices": ["table"],
    };
    expect(shapeMismatches(1, list, both)).toEqual([]);
  });
});
