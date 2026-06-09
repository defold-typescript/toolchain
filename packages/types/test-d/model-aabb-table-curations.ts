/// <reference path="../index.d.ts" />

import type { Hash, Vector3 } from "../src/core-types";

// model.get_aabb returns a prose-only `{ min, max }` object the field parser
// cannot read; it is hand-curated as an object curation. model.get_mesh_aabb
// returns the same shape keyed by mesh-id hash — an object-valued mapping
// curation emitted as `LuaMap<Hash, { min; max }>`.

const aabb = model.get_aabb("#model");
const _min: Vector3 = aabb.min;
const _max: Vector3 = aabb.max;
void _min;
void _max;

declare const meshId: Hash;
const meshAabb = model.get_mesh_aabb("#model").get(meshId);
if (meshAabb !== undefined) {
  const _meshMin: Vector3 = meshAabb.min;
  const _meshMax: Vector3 = meshAabb.max;
  void _meshMin;
  void _meshMax;
}

// @ts-expect-error min is a Vector3, not a string
const _badMin: string = aabb.min;
void _badMin;
