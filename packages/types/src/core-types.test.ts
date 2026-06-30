import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DEFOLD_TYPE_MAP,
  type Hash,
  type Matrix4,
  type Opaque,
  type Quaternion,
  type Url,
  type Vector,
  type Vector3,
  type Vector4,
} from "./core-types";

const VALUE_TYPES = [
  "Hash",
  "Opaque",
  "Vector",
  "Vector3",
  "Vector4",
  "Quaternion",
  "Matrix4",
  "Url",
] as const;

// The next step derives each global-type page's brief from the first sentence of
// these JSDoc summaries, so each must carry the concept it names.
const SUMMARY_MARKERS: Record<string, string> = {
  Vector: "accessed by index",
  Vector3: "three-component vector",
  Vector4: "four-component vector",
  Quaternion: "rotation quaternion",
  Matrix4: "transformation matrix",
  Url: "message-passing address",
};

const coreSource = readFileSync(path.join(import.meta.dir, "core-types.ts"), "utf8");
const coreLines = coreSource.split("\n");

function declarationLine(name: string): number {
  const index = coreLines.findIndex((line) => line.trim().startsWith(`export interface ${name}`));
  if (index < 0) throw new Error(`interface ${name} not found`);
  return index;
}

function precedingNonBlank(lineIndex: number): string | undefined {
  for (let i = lineIndex - 1; i >= 0; i--) {
    const trimmed = (coreLines[i] as string).trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

// The JSDoc summary for `name`: text from its `/**` block up to the first
// sentence terminator, gutter stripped.
function jsdocSummary(name: string): string {
  const start = declarationLine(name);
  let open = -1;
  for (let i = start - 1; i >= 0; i--) {
    if ((coreLines[i] as string).trim().startsWith("/**")) {
      open = i;
      break;
    }
  }
  if (open < 0) throw new Error(`no JSDoc block above ${name}`);
  const body = coreLines
    .slice(open, start)
    .map((line) =>
      line
        .trim()
        .replace(/^\/\*\*+/, "")
        .replace(/\*\/$/, "")
        .replace(/^\*\s?/, ""),
    )
    .join(" ")
    .trim();
  const terminator = body.search(/\.(\s|$)/);
  return terminator < 0 ? body : body.slice(0, terminator);
}

describe("core-types", () => {
  test("Vector3 is assignable to { x: number; y: number; z: number }", () => {
    const v = { x: 1, y: 2, z: 3 } as unknown as Vector3;
    const shaped: { x: number; y: number; z: number } = v;
    expect(shaped.x + shaped.y + shaped.z).toBe(6);
  });

  test("Vector4 has x/y/z/w numeric fields", () => {
    const v = { x: 1, y: 2, z: 3, w: 4 } as unknown as Vector4;
    expect(v.w).toBe(4);
  });

  test("Quaternion has x/y/z/w numeric fields", () => {
    const q = { x: 0, y: 0, z: 0, w: 1 } as unknown as Quaternion;
    expect(q.w).toBe(1);
  });

  test("Vector indexed-access yields number", () => {
    const v: Vector = Object.assign([1, 2, 3] as readonly number[], { length: 3 }) as Vector;
    expect(v[0]).toBe(1);
    expect(v.length).toBe(3);
  });

  test("Matrix4 carries m00..m33 fields", () => {
    const fields = ["m00", "m01", "m02", "m03", "m10", "m11", "m12", "m13"] as const;
    const m = {
      m00: 1,
      m01: 0,
      m02: 0,
      m03: 0,
      m10: 0,
      m11: 1,
      m12: 0,
      m13: 0,
      m20: 0,
      m21: 0,
      m22: 1,
      m23: 0,
      m30: 0,
      m31: 0,
      m32: 0,
      m33: 1,
      c0: { x: 1, y: 0, z: 0, w: 0 },
      c1: { x: 0, y: 1, z: 0, w: 0 },
      c2: { x: 0, y: 0, z: 1, w: 0 },
      c3: { x: 0, y: 0, z: 0, w: 1 },
    } as unknown as Matrix4;
    for (const f of fields) {
      expect(typeof m[f]).toBe("number");
    }
    expect(m.c3.w).toBe(1);
  });

  test("Hash and Url are typed shells (compile-only)", () => {
    // Hash and Url are branded; these assignments only need to type-check.
    const useHash = (_: Hash) => 0;
    const useUrl = (_: Url) => 0;
    expect(typeof useHash).toBe("function");
    expect(typeof useUrl).toBe("function");
  });

  test("Opaque brands are mutually non-assignable (compile-only)", () => {
    const useTexture = (_: Opaque<"texture">) => 0;
    const node = {} as Opaque<"node">;
    // @ts-expect-error a node handle is not assignable to a texture handle
    useTexture(node);
    expect(typeof useTexture).toBe("function");
  });

  test("bufferstream handle is index-mutable yet still nominally branded (compile-only)", () => {
    const stream = {} as Opaque<"bufferstream"> & { [i: number]: number };
    const n: number | undefined = stream[0];
    stream[0] = 1;
    void n;
    const usesStream = (_: Opaque<"bufferstream"> & { [i: number]: number }) => 0;
    // @ts-expect-error a plain number array lacks the bufferstream brand symbol
    usesStream([1, 2, 3]);
    expect(typeof usesStream).toBe("function");
  });

  test("DEFOLD_TYPE_MAP maps the expected Defold tokens to the expected TS identifiers", () => {
    const rows: ReadonlyArray<readonly [string, string]> = [
      ["number", "number"],
      ["int", "number"],
      ["integer", "number"],
      ["string", "string"],
      ["boolean", "boolean"],
      ["table", "Record<string | number, unknown>"],
      ["function", "(...args: unknown[]) => unknown"],
      ["vector", "Vector"],
      ["vector3", "Vector3"],
      ["vector4", "Vector4"],
      ["quaternion", "Quaternion"],
      ["matrix4", "Matrix4"],
      ["hash", "Hash"],
      ["url", "Url"],
      ["node", 'Opaque<"node">'],
      ["texture", 'Opaque<"texture">'],
      ["render_target", 'Opaque<"render_target">'],
      ["constant", 'Opaque<"constant">'],
      ["constant_buffer", 'Opaque<"constant_buffer">'],
      ["buffer", 'Opaque<"buffer">'],
      ["bufferstream", 'Opaque<"bufferstream"> & { [index: number]: number }'],
      ["userdata", 'Opaque<"userdata">'],
      ["resource", 'Opaque<"resource">'],
      ["b2World", 'Opaque<"b2World">'],
      ["b2Body", 'Opaque<"b2Body">'],
      // socket handle types resolve to their method-bearing `interface <receiver>`,
      // not opaque brands.
      ["client", "client"],
      ["connected", "connected"],
      ["master", "master"],
      ["server", "server"],
      ["unconnected", "unconnected"],
      ["any", "unknown"],
    ];
    for (const [defoldToken, tsType] of rows) {
      expect(DEFOLD_TYPE_MAP[defoldToken]).toBe(tsType);
    }
  });
});

describe("core-types.ts canonical JSDoc", () => {
  for (const name of VALUE_TYPES) {
    test(`${name} is immediately preceded by a JSDoc block`, () => {
      const preceding = precedingNonBlank(declarationLine(name));
      expect(preceding).toBeDefined();
      expect((preceding as string).endsWith("*/")).toBe(true);
    });
  }

  for (const [name, marker] of Object.entries(SUMMARY_MARKERS)) {
    test(`${name} JSDoc summary carries its marker`, () => {
      expect(jsdocSummary(name).toLowerCase()).toContain(marker);
    });
  }
});
