/** @noSelfInFile */
import type * as Core from "./core-types";

declare global {
  type Hash = Core.Hash;
  function hash(s: string): Core.Hash;
  type Opaque<Name extends string> = Core.Opaque<Name>;
  type Url = Core.Url;
  type Vector = Core.Vector;
  type Vector3 = Core.Vector3;
  type Vector4 = Core.Vector4;
  type Quaternion = Core.Quaternion;
  type Matrix4 = Core.Matrix4;
}
