/** @noSelfInFile */
import type * as Core from "./core-types";

// Hand-maintained surface: Defold ships no machine-readable export for the
// prefixless globals, so add or remove entries here from the Defold API
// reference and mirror the change in fixtures/globals_doc.json — the
// engine-globals test fails if the two fall out of sync.
declare global {
  type Hash = Core.Hash;
  function hash(s: string): Core.Hash;
  function hash_to_hex(h: Core.Hash): string;
  function pprint(v: unknown): void;
  type Opaque<Name extends string> = Core.Opaque<Name>;
  type Url = Core.Url;
  type Vector = Core.Vector;
  type Vector3 = Core.Vector3;
  type Vector4 = Core.Vector4;
  type Quaternion = Core.Quaternion;
  type Matrix4 = Core.Matrix4;
}
