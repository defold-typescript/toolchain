/// <reference path="../index.d.ts" />
import type { Hash, Vector3 } from "../src/core-types";
import { defineScript, type ScriptPropertiesOf } from "../src/lifecycle";

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

// Cross-script script properties: a script declares its editor properties via
// `defineScript({ properties })`; that module exports its declared shape with
// `ScriptPropertiesOf<typeof script>`, and another script names it as the `P`
// generic to read or tune those properties across the object boundary by URL.
// It is the same caller-named curried mechanism as component properties, with
// `P` being the script's declared property channel (`TProps`) rather than a
// component catalogue — so a cross-script read is typed and a write is gated to
// the declared property type, both with no cast.
const enemyScript = defineScript({
  properties: { speed: 100, target: vmath.vector3() },
});
type EnemyProps = ScriptPropertiesOf<typeof enemyScript>;

const _speed: number = go.get<EnemyProps>()("/enemy#controller", "speed");
const _target: Vector3 = go.get<EnemyProps>()("/enemy#controller", "target");
void _speed;
void _target;

// @ts-expect-error key not among the declared script properties
go.get<EnemyProps>()("/enemy#controller", "missing");

// cross-script write: a valid value checks, gated to the declared property type.
go.set<EnemyProps>()("/enemy#controller", "speed", 250);

// @ts-expect-error speed is number, not a Hash — value is gated to the property type
go.set<EnemyProps>()("/enemy#controller", "speed", hash("x"));

// @ts-expect-error key not among the declared script properties
go.set<EnemyProps>()("/enemy#controller", "missing", 1);
