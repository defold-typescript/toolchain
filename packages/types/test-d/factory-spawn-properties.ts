/// <reference path="../index.d.ts" />
import type { Hash } from "../src/core-types";
import { defineScript, type ScriptPropertiesOf } from "../src/lifecycle";

// The spawned object's script declares its properties; the spawner names that
// shape with `ScriptPropertiesOf` as the `P` of the curried `factory.create<P>()`,
// which gates the `properties` table to the declared names and value types.
const enemy = defineScript({
  properties: { speed: 100, target: vmath.vector3(), tag: hash("enemy") },
});
type EnemyProps = ScriptPropertiesOf<typeof enemy>;

const _spawned: Hash | undefined = factory.create<EnemyProps>()("#factory", undefined, undefined, {
  speed: 250,
});
void _spawned;

// @ts-expect-error the spawn can fail, so the result is not always a Hash
const _always: Hash = factory.create<EnemyProps>()("#factory", undefined, undefined, {
  speed: 250,
});
void _always;

// Any subset of the declared properties, none, or no table at all.
factory.create<EnemyProps>()("#factory", undefined, undefined, { target: vmath.vector3(1, 0, 0) });
factory.create<EnemyProps>()("#factory", undefined, undefined, {});
factory.create<EnemyProps>()("#factory");
factory.create<EnemyProps>()(
  "#factory",
  vmath.vector3(),
  vmath.quat(),
  { speed: 1, target: vmath.vector3() },
  2,
);

// @ts-expect-error key not among the declared script properties
factory.create<EnemyProps>()("#factory", undefined, undefined, { sped: 250 });

// @ts-expect-error speed is a number, not a string
factory.create<EnemyProps>()("#factory", undefined, undefined, { speed: "fast" });

// @ts-expect-error target is a Vector3, not a Hash
factory.create<EnemyProps>()("#factory", undefined, undefined, { target: hash("x") });

// A stored applier keeps the same gate.
const spawn = factory.create<EnemyProps>();
spawn("#factory", undefined, undefined, { speed: 1 });

// @ts-expect-error key not among the declared script properties
spawn("#factory", undefined, undefined, { sped: 1 });

// The bare form keeps its untyped properties table.
factory.create("#factory", undefined, undefined, { anything: 1 });
