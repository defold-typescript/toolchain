/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as platypus from "platypus.platypus";

// Compile-only proof for the severed platypus surface, replacing the platypus
// block retired from library-types.test-d.ts when the `./platypus.platypus`
// subpath went away. No assertions execute; `tsc --noEmit` under
// tsconfig.dts-check.json is the gate.

declare const _v3: Vector3;

declare const _groups: LuaMap<Hash, number>;

// The three assertions the retired block carried: a lifecycle constant is a
// `Hash`; a `PlatypusInstance`'s `velocity` is a `Vector3` and `move` accepts
// one (upstream `vmath.vector3`), proving both core-type renames land on the real
// exported surface.
const _pFalling: Hash = platypus.FALLING;
declare const _pInstance: ReturnType<typeof platypus.create>;
const _pVelocity: Vector3 = _pInstance.velocity;
_pInstance.move(_v3);

// `PlatypusConfig` and `PlatypusInstance` are unexported, so `create`'s signature
// is the only way a consumer reaches either — which is exactly why the severance
// forked rather than kept: no generation lane can express a returned-object
// interface. The required nested `collisions` shape is proven from both sides.
const _pConfig: Parameters<typeof platypus.create>[0] = {
  collisions: {
    groups: _groups,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
};

// @ts-expect-error `collisions` is the one required field; the other 11 are not.
const _pConfigMissingCollisions: Parameters<typeof platypus.create>[0] = { gravity: -100 };

// `PlatypusInstance extends PlatypusConfig`, so the returned object carries the
// optional config fields too, and a predicate method still narrows to `boolean`.
const _pGravity: number | undefined = _pInstance.gravity;
const _pIsFalling: boolean = _pInstance.is_falling();

void _pFalling;
void _pVelocity;
void _pConfig;
void _pConfigMissingCollisions;
void _pGravity;
void _pIsFalling;
