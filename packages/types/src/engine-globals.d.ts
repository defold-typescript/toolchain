/** @noSelfInFile */
import type * as Core from "./core-types";

// Hand-maintained surface: Defold ships no machine-readable export for the
// prefixless globals, so add or remove entries here from the Defold API
// reference and mirror the change in fixtures/globals_doc.json — the
// engine-globals test fails if the two fall out of sync.
declare global {
  /** An opaque, branded handle to a hashed name; see {@link Core.Hash}. */
  type Hash = Core.Hash;
  /** Hash a string into the engine's `Hash` handle. */
  function hash(s: string): Core.Hash;
  /** Render a `Hash` handle as its hexadecimal string. */
  function hash_to_hex(h: Core.Hash): string;
  /** Pretty-print any value to the console for debugging. */
  function pprint(v: unknown): void;
  /**
   * A typed handle to a resource the engine owns — a GUI node, a texture, a
   * render target, a physics body, a socket, and so on. You get one back from an
   * engine function, keep it in a variable, and pass it to the functions that
   * act on that resource; you never inspect or construct one yourself.
   *
   * Each kind of handle is its own brand, so `Opaque<"node">` and
   * `Opaque<"texture">` are different types and the compiler rejects passing one
   * where the other is expected. The brand is a phantom `unique symbol` property
   * that lives only in the type system and is erased at transpile; because the
   * symbol is not exported, consumer code cannot fabricate one. The kinds
   * modeled: `node`, `texture`, `render_target`, `constant`, `constant_buffer`,
   * `resource`, `buffer`, `bufferstream`, `client`, `server`, `master`,
   * `connected`, `unconnected`, `b2Body`, `b2World`, `userdata`. You obtain them
   * from the engine, e.g. `gui.get_node("id")`, `render.render_target(...)`,
   * `render.constant_buffer()`, `resource.load_buffer(path)`, `b2d.get_world()`,
   * or `socket.tcp()`. See {@link Core.Opaque} for the full explanation, the per
   * -kind obtain examples, and the contrast with a `LuaTable` alias.
   */
  type Opaque<Name extends string> = Core.Opaque<Name>;
  /** A message-passing address with `socket`, `path`, and `fragment`; see {@link Core.Url}. */
  type Url = Core.Url;
  /** A read-only numeric vector accessed by index; see {@link Core.Vector}. */
  type Vector = Core.Vector;
  /** A three-component vector with `x`, `y`, `z`; see {@link Core.Vector3}. */
  type Vector3 = Core.Vector3;
  /** A four-component vector with `x`, `y`, `z`, `w`; see {@link Core.Vector4}. */
  type Vector4 = Core.Vector4;
  /** A rotation quaternion with `x`, `y`, `z`, `w`; see {@link Core.Quaternion}. */
  type Quaternion = Core.Quaternion;
  /** A 4x4 transformation matrix; see {@link Core.Matrix4}. */
  type Matrix4 = Core.Matrix4;
}
