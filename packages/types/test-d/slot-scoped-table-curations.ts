/// <reference path="../index.d.ts" />

import type { Hash } from "../src/core-types";

declare const from: Vector3;
declare const to: Vector3;
declare const groups: Hash[];

const ids: LuaMap<Hash, Hash> = collectionfactory.create("#factory");
void ids;

physics.raycast(from, to, groups);
physics.raycast_async(from, to, groups);

// @ts-expect-error raycast groups are hashed collision groups, not strings
physics.raycast(from, to, ["world"]);

// @ts-expect-error async raycast groups are hashed collision groups, not strings
physics.raycast_async(from, to, ["world"]);
