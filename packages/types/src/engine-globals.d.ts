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
   * A nominal handle to an engine value you may hold and pass back to the API
   * but must never inspect or construct — a Defold `node`, `texture`,
   * `render_target`, `userdata`, etc. The `Name` parameter mints a distinct,
   * mutually-incompatible brand per kind (e.g. `Opaque<"node">`), so structural
   * typing can't silently swap one handle for another and a plain object can't
   * stand in for either. The brand is a phantom `unique symbol` property that
   * exists only in the type system and is erased at transpile; because the symbol
   * is not exported, consumer code cannot fabricate one — the engine API is the
   * only source. Contrast with a `LuaTable` alias, which says the opposite:
   * "inspect freely, the shape just isn't modeled." See {@link Core.Opaque} for
   * the canonical explanation.
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
