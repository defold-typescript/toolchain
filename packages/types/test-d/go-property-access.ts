/// <reference path="../index.d.ts" />
import type { Hash, Vector3 } from "../src/core-types";

// Caller-named component: the explicit `P` generic keys go.get/go.set to that
// component's property catalogue, beyond the transform-only default. The caller
// (not a string argument) names the component, so no false URL-correctness is
// implied; `sprite.properties.animation: Hash` already exists in the generated
// typings, and the generic surfaces it without a cast. The empty call applies
// the type argument; the inner call infers the key (TS has no partial
// type-argument inference, so the key cannot be inferred in the same call that
// fixes `P` — hence the curried form).
const _anim: Hash = go.get<sprite.properties>()("#sprite", "animation");
const _cursor: number = go.get<sprite.properties>()("#sprite", "cursor");
void _anim;
void _cursor;

// @ts-expect-error key not in sprite.properties
go.get<sprite.properties>()("#sprite", "nope");

// Transform default (bare direct call, keyed to go.properties) stays intact.
const _pos: Vector3 = go.get("#go", "position");
void _pos;
go.set("#go", "position", vmath.vector3());

// set keyed to the component: a valid write checks, with the value gated to P[K].
go.set<sprite.properties>()("#sprite", "playback_rate", 2);

// @ts-expect-error key not in sprite.properties
go.set<sprite.properties>()("#sprite", "nope", 1);

// @ts-expect-error cursor is number, not a Hash — value type is gated to P[K]
go.set<sprite.properties>()("#sprite", "cursor", hash("x"));

// `animation` is READ ONLY in the ref-doc prose, but the generated interface
// field is plain-mutable (no readonly modifier), so set stays permissive
// (decision a) — this checks rather than erroring.
go.set<sprite.properties>()("#sprite", "animation", hash("x"));
