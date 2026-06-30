/// <reference types="@typescript-to-lua/language-extensions" />

/**
 * A read-only numeric vector accessed by index; `length` is its component count.
 */
export interface Vector {
  readonly [index: number]: number;
  readonly length: number;
}

/**
 * A three-component vector with `x`, `y`, and `z` components.
 */
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

/**
 * A four-component vector with `x`, `y`, `z`, and `w` components.
 */
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

/**
 * A rotation quaternion with `x`, `y`, `z`, and `w` components.
 */
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
  mul: LuaMultiplicationMethod<Quaternion, Quaternion>;
}

/**
 * A 4x4 transformation matrix.
 */
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
/**
 * An opaque, branded handle to a *hashed name*: hold it and pass it back to the
 * engine API, but never inspect or construct it. Defold uses it in place of a
 * string for game-object and component ids, resource paths, input-action names,
 * material/animation/constant names, and the `socket`, `path`, and `fragment` of
 * every {@link Url}; you obtain one from the global `hash(name)` function (or
 * receive it back from the engine) and pass it straight to the API, never
 * assembling its bits by hand.
 *
 * @remarks
 * The brand is a phantom `unique symbol` property (`[HashBrand]: "Hash"`) that
 * exists only in the type system and is erased at transpile — at runtime a
 * `Hash` is the engine's opaque hash value, not an object carrying that key.
 * Because the symbol is not exported, consumer code cannot fabricate a `Hash`;
 * the only sources are `hash()` and the engine. That nominal branding is what
 * stops a bare `string` or `number` from standing in where the API expects an
 * already-hashed name. Many engine functions also accept a plain `string` and
 * hash it for you, but a value already typed `Hash` is passed through as-is.
 *
 * Hashing is one-way: the original string cannot be recovered from a `Hash`.
 * `hash_to_hex(h)` renders it as a hexadecimal string for logging, and `pprint`
 * shows it as `hash: [0x…]`. Two hashes are equal exactly when they name the
 * same thing, so a `Hash` is safe to compare, store, and use as a table key.
 */
export interface Hash {
  readonly [HashBrand]: "Hash";
}

declare const OpaqueBrand: unique symbol;
/**
 * A nominal, branded handle to a value the engine owns and manages — a GUI node,
 * a texture, a render target, a physics body, a socket, and so on: hold it and
 * pass it back to the API, but never inspect or construct it. You get one back
 * from an engine function, keep it in a variable, and pass it to the other
 * functions that act on that resource; treat it as an opaque ticket, meaningful
 * to the engine, not a value you read or assemble yourself.
 *
 * @remarks
 * Why a dedicated type? Each kind of handle is its own brand, so the compiler
 * keeps them apart: `Opaque<"node">` and `Opaque<"texture">` are different
 * types, and passing a texture where a node is expected is a compile error,
 * exactly as a wrong primitive would be. The brand is a phantom `unique symbol`
 * property that lives only in the type system and is erased at transpile — at
 * runtime the value is just the engine's userdata. Because the symbol is never
 * exported, your code cannot fabricate a handle or inspect or construct one; the
 * engine API is the only source.
 *
 * The handle kinds modeled today:
 * - GUI & rendering: `Opaque<"node">`, `Opaque<"texture">`,
 *   `Opaque<"render_target">`, `Opaque<"constant">`, `Opaque<"constant_buffer">`
 * - Resources & buffers: `Opaque<"resource">`, `Opaque<"buffer">`,
 *   `Opaque<"bufferstream">`
 * - Sockets: `Opaque<"client">`, `Opaque<"server">`, `Opaque<"master">`,
 *   `Opaque<"connected">`, `Opaque<"unconnected">`
 * - Box2D physics: `Opaque<"b2Body">`, `Opaque<"b2World">`
 * - Generic: `Opaque<"userdata">`
 *
 * @example
 * Handles always come back from the engine — for instance:
 * ```ts
 * const node = gui.get_node("button");        // Opaque<"node">
 * const rt = render.render_target("rt", opts); // Opaque<"render_target">
 * const cb = render.constant_buffer();         // Opaque<"constant_buffer">
 * const buf = resource.load_buffer(path);      // Opaque<"buffer">
 * const stream = buffer.get_stream(buf, "rgb"); // Opaque<"bufferstream">
 * const world = b2d.get_world();               // Opaque<"b2World">
 * const [conn] = socket.tcp();                 // a "master" socket handle
 * function update(self: ...) {}                // self is Opaque<"userdata">
 * ```
 *
 * Contrast with a `LuaTable` alias, which says the opposite — "inspect freely,
 * the shape just isn't modeled." An `Opaque` says "do not look inside; this
 * value is meaningful only to the engine."
 */
export interface Opaque<Name extends string> {
  readonly [OpaqueBrand]: Name;
}

/**
 * A message-passing address with `socket`, `path`, and `fragment` components.
 */
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
  bufferstream: 'Opaque<"bufferstream"> & { [index: number]: number }',
  userdata: 'Opaque<"userdata">',
  resource: 'Opaque<"resource">',
  b2World: 'Opaque<"b2World">',
  b2Body: 'Opaque<"b2Body">',
  b2BodyType:
    '(number & { readonly __brand: "b2d.body.B2_DYNAMIC_BODY" }) | (number & { readonly __brand: "b2d.body.B2_KINEMATIC_BODY" }) | (number & { readonly __brand: "b2d.body.B2_STATIC_BODY" })',
  // socket handle types resolve to the method-bearing `interface <receiver>`
  // emitted inside `namespace socket`, not opaque brands — the documented
  // colon methods (`client:send`, …) make each handle structurally distinct.
  client: "client",
  connected: "connected",
  master: "master",
  server: "server",
  unconnected: "unconnected",
  any: "unknown",
} as const;
