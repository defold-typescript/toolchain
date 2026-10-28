/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as defarmy from "defarmy.defarmy";

// Compile-only proof for the defarmy fork, written as upstream's examples drive it. No
// assertions execute; tsc --noEmit under tsconfig.dts-check.json is the gate.

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const army = defarmy.army_create(vmath.vector3(), vmath.quat(), 32, true, defarmy.PATTERN.TRIANGLE);
const _army: Equal<typeof army, number> = true;
void _army;

// A customized pattern gets the member count and returns soldiers per row, bottom first.
defarmy.army_create(
  vmath.vector3(),
  vmath.quat(),
  32,
  false,
  defarmy.PATTERN.CUSTOMIZED,
  (count) => [count],
);
defarmy.army_update_pattern(army, defarmy.PATTERN.CUSTOMIZED, (count) => [1, count - 1]);
defarmy.army_update_pattern(army, defarmy.PATTERN.RHOMBUS_TALL);

const members = defarmy.army_members(army);
const _members: Equal<typeof members, number[]> = true;
void _members;

const soldier = defarmy.soldier_create(vmath.vector3(), vmath.vector3(1, 0, 0), army);
const loner = defarmy.soldier_create(vmath.vector3(), vmath.vector3(0, 1, 0));
defarmy.soldier_join_army(loner, army);
defarmy.soldier_debug_on(soldier, vmath.vector4(1, 0, 0, 1));
defarmy.army_debug_draw(army, vmath.vector4(0, 1, 0, 1));

// A removed soldier returns `nil, nil`, so both values may be absent.
const [position, rotation] = defarmy.soldier_move(soldier, go.get_position(), 100);
const _position: Equal<typeof position, Vector3 | undefined> = true;
void _position;
const _rotation: Equal<typeof rotation, Quaternion | undefined> = true;
void _rotation;
defarmy.soldier_move(soldier, go.get_position(), 100, 2);

// @ts-expect-error soldier_create asserts its initial direction
defarmy.soldier_create(vmath.vector3());
// @ts-expect-error a pattern function returns soldier counts per row
defarmy.army_update_pattern(army, defarmy.PATTERN.CUSTOMIZED, (count) => [`${count}`]);
