/// <reference path="../index.d.ts" />
import { defineScript, type ScriptPropertiesOf } from "../src/lifecycle";

// Each instance of the spawned collection runs its own script. The spawner maps
// every instance id, as the collection addresses it, to that script's property
// shape with `ScriptPropertiesOf`, and the curried `collectionfactory.create<P>()`
// gates each instance's table to its declared names and value types.
const enemy = defineScript({
  properties: { speed: 100, target: vmath.vector3() },
});
const medic = defineScript({
  properties: { heal: 5 },
});
type SquadProps = {
  "/enemy_leader": ScriptPropertiesOf<typeof enemy>;
  "/enemy_1": ScriptPropertiesOf<typeof enemy>;
  "/medic": ScriptPropertiesOf<typeof medic>;
};

const squad = collectionfactory.create<SquadProps>()("#squad", undefined, undefined, {
  "/enemy_leader": { speed: 250 },
  "/medic": { heal: 9 },
});
const bare = collectionfactory.create("#squad");

// The typed form returns the same id table as the bare form.
const _typedAsBare: typeof bare = squad;
const _bareAsTyped: typeof squad = bare;
void _typedAsBare;
void _bareAsTyped;

// Any subset of the instances, each with any subset of its properties, or no table at all.
collectionfactory.create<SquadProps>()("#squad");
collectionfactory.create<SquadProps>()("#squad", undefined, undefined, undefined);
collectionfactory.create<SquadProps>()("#squad", undefined, undefined, {});
collectionfactory.create<SquadProps>()("#squad", undefined, undefined, { "/enemy_1": {} });
collectionfactory.create<SquadProps>()(
  "#squad",
  vmath.vector3(),
  vmath.quat(),
  { "/enemy_1": { speed: 1, target: vmath.vector3() } },
  2,
);

collectionfactory.create<SquadProps>()("#squad", undefined, undefined, {
  // @ts-expect-error "/nobody" is not an instance of the collection
  "/nobody": { speed: 1 },
});

collectionfactory.create<SquadProps>()("#squad", undefined, undefined, {
  // @ts-expect-error sped is not among the enemy script's declared properties
  "/enemy_1": { sped: 1 },
});

collectionfactory.create<SquadProps>()("#squad", undefined, undefined, {
  // @ts-expect-error speed is a number, not a string
  "/enemy_1": { speed: "fast" },
});

collectionfactory.create<SquadProps>()("#squad", undefined, undefined, {
  // @ts-expect-error target is a Vector3, not a Hash
  "/enemy_1": { target: hash("x") },
});
