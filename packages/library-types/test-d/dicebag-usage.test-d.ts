/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as dicebag from "dicebag.dicebag";

// Compile-only proof for the severed dicebag surface, replacing the dicebag
// block retired from library-types.test-d.ts when the `./dicebag.dicebag`
// subpath went away. No assertions execute; `tsc --noEmit` under
// tsconfig.dts-check.json is the gate.

declare const _hash: Hash;

// The two assertions the retired block carried: `flip_coin` returns a boolean,
// and `bag_draw` accepts a `Hash`, proving the upstream `hash` reference was
// renamed on the real exported surface.
const _dbFlip: boolean = dicebag.flip_coin();
const _dbDraw: boolean = dicebag.bag_draw(_hash);

// The `id` union upstream documents as `(string, number, hash)`, proven on each
// arm and refuted on one it does not accept.
const _dbDrawString: boolean = dicebag.bag_draw("bag");
const _dbDrawNumber: boolean = dicebag.bag_draw(1);
// @ts-expect-error `id` is `string | number | Hash`; a boolean is not an arm.
const _dbDrawBoolean: boolean = dicebag.bag_draw(true);

// The two structured parameters the markdown lane could only publish as
// `unknown`, and the optionality the lane could not read out of prose — the
// three types this severance forked to keep.
const _dbCustom: number = dicebag.roll_custom_dice(2, [
  [1, 5],
  [2, 10],
]);
dicebag.table_create("loot", [
  [1, "sword", true],
  [2, "shield"],
]);
const _dbSeedDefault: number = dicebag.set_up_rng();
const _dbSeeded: number = dicebag.set_up_rng(42);

void _dbFlip;
void _dbDraw;
void _dbDrawString;
void _dbDrawNumber;
void _dbDrawBoolean;
void _dbCustom;
void _dbSeedDefault;
void _dbSeeded;
