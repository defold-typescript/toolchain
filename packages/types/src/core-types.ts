/// <reference types="@typescript-to-lua/language-extensions" />

export interface Vector {
  readonly [index: number]: number;
  readonly length: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
  add: LuaAdditionMethod<Vector3, Vector3>;
  sub: LuaSubtractionMethod<Vector3, Vector3>;
  mul: LuaMultiplicationMethod<number, Vector3>;
  div: LuaDivisionMethod<number, Vector3>;
  /**
   * @remarks
   * Prefer `v.unm()` over `-v` — TypeScript does not flag unary `-` on object
   * types and silently produces `number`. See
   * `packages/docs/guide/typescript-gotchas.md` for the full story.
   */
  unm: LuaNegationMethod<Vector3>;
}

export interface Vector4 {
  x: number;
  y: number;
  z: number;
  w: number;
  add: LuaAdditionMethod<Vector4, Vector4>;
  sub: LuaSubtractionMethod<Vector4, Vector4>;
  mul: LuaMultiplicationMethod<number, Vector4>;
  div: LuaDivisionMethod<number, Vector4>;
  /**
   * @remarks
   * Prefer `v.unm()` over `-v` — TypeScript does not flag unary `-` on object
   * types and silently produces `number`. See
   * `packages/docs/guide/typescript-gotchas.md` for the full story.
   */
  unm: LuaNegationMethod<Vector4>;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
  mul: LuaMultiplicationMethod<Quaternion, Quaternion>;
}

export interface Matrix4 {
  m00: number;
  m01: number;
  m02: number;
  m03: number;
  m10: number;
  m11: number;
  m12: number;
  m13: number;
  m20: number;
  m21: number;
  m22: number;
  m23: number;
  m30: number;
  m31: number;
  m32: number;
  m33: number;
  c0: Vector4;
  c1: Vector4;
  c2: Vector4;
  c3: Vector4;
  mul: LuaMultiplicationMethod<Matrix4, Matrix4> & LuaMultiplicationMethod<Vector4, Vector4>;
}

declare const HashBrand: unique symbol;
export interface Hash {
  readonly [HashBrand]: "Hash";
}

declare const OpaqueBrand: unique symbol;
/**
 * A nominal handle to an engine value you may hold and pass back to the API but
 * must never inspect or construct — a Defold `node`, `texture`, `render_target`,
 * `userdata`, etc. The `Name` parameter mints a distinct, mutually-incompatible
 * brand per kind, so TypeScript's structural typing can't silently swap a
 * `render_target` for a `constant`, and a plain object can't stand in for either.
 *
 * @remarks
 * The brand is a phantom `unique symbol` property: it exists only in the type
 * system (erased at transpile, never present at runtime). Because the symbol is
 * not exported, consumer code cannot fabricate an `Opaque` — the engine API is
 * the only source. Contrast with a `LuaTable` alias, which says the opposite:
 * "inspect freely, the shape just isn't modeled."
 */
export interface Opaque<Name extends string> {
  readonly [OpaqueBrand]: Name;
}

export interface Url {
  readonly socket: Hash;
  readonly path: Hash;
  readonly fragment: Hash | undefined;
}

export const DEFOLD_TYPE_MAP: Readonly<Record<string, string>> = {
  number: "number",
  int: "number",
  integer: "number",
  string: "string",
  boolean: "boolean",
  table: "Record<string | number, unknown>",
  function: "(...args: unknown[]) => unknown",
  vector: "Vector",
  vector3: "Vector3",
  vector4: "Vector4",
  quaternion: "Quaternion",
  matrix4: "Matrix4",
  hash: "Hash",
  url: "Url",
  node: 'Opaque<"node">',
  texture: 'Opaque<"texture">',
  render_target: 'Opaque<"render_target">',
  constant: 'Opaque<"constant">',
  constant_buffer: 'Opaque<"constant_buffer">',
  buffer: 'Opaque<"buffer">',
  bufferstream: 'Opaque<"bufferstream">',
  userdata: 'Opaque<"userdata">',
  resource: 'Opaque<"resource">',
  b2World: 'Opaque<"b2World">',
  b2Body: 'Opaque<"b2Body">',
  b2BodyType:
    '(number & { readonly __brand: "b2d.body.B2_DYNAMIC_BODY" }) | (number & { readonly __brand: "b2d.body.B2_KINEMATIC_BODY" }) | (number & { readonly __brand: "b2d.body.B2_STATIC_BODY" })',
  client: 'Opaque<"client">',
  master: 'Opaque<"master">',
  unconnected: 'Opaque<"unconnected">',
  any: "unknown",
} as const;
