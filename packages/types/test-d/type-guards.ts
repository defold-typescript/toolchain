/// <reference path="../index.d.ts" />

import type { Hash, Vector3 } from "../src/core-types";

// Engine values are Lua userdata, which `typeof` cannot narrow. The `types.is_*`
// checks are emitted as user-defined type guards (`var_ is Vector3`/`Hash`/…),
// the supported way to narrow one — a plain `boolean` return would throw that away.

declare const v: unknown;

if (types.is_vector3(v)) {
  const _x: number = v.x;
  void _x;
}

if (types.is_hash(v)) {
  const _h: Hash = v;
  void _h;
}

// @ts-expect-error outside any guard the value stays `unknown`, not Vector3
const _bad: Vector3 = v;
void _bad;
