/**
 * ts-defold/library core-type references -> the @defold-typescript/types surface.
 * Dotted `vmath.*` names collapse to a single core-type name; bare handle tokens
 * become `Opaque<…>` brands, resolving against the globals in
 * `@defold-typescript/types` `engine-globals.d.ts`. `table` is intentionally
 * absent: ts-defold modules declare their own local `type table = {}` alias, so
 * renaming it would rewrite an unrelated local type.
 */
export const CORE_TYPE_RENAMES: Readonly<Record<string, string>> = {
  "vmath.vector": "Vector",
  "vmath.vector3": "Vector3",
  "vmath.vector4": "Vector4",
  "vmath.matrix4": "Matrix4",
  "vmath.quat": "Quaternion",
  "vmath.quaternion": "Quaternion",
  hash: "Hash",
  url: "Url",
  node: 'Opaque<"node">',
  texture: 'Opaque<"texture">',
  render_target: 'Opaque<"render_target">',
  constant: 'Opaque<"constant">',
  constant_buffer: 'Opaque<"constant_buffer">',
  buffer: 'Opaque<"buffer">',
  bufferstream: 'Opaque<"bufferstream">',
  resource: 'Opaque<"resource">',
  userdata: 'Opaque<"userdata">',
  b2World: 'Opaque<"b2World">',
  b2Body: 'Opaque<"b2Body">',
};
