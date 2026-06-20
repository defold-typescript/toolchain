/// <reference path="../index.d.ts" />
import type { Hash, Matrix4, Quaternion, Vector3, Vector4 } from "../src/core-types";
import { defineScript } from "../src/lifecycle";

declare const v3a: Vector3;
declare const v3b: Vector3;
declare const v4a: Vector4;
declare const v4b: Vector4;
declare const q: Quaternion;
declare const m: Matrix4;

// packages/docs/guide/vector-math.md positives — method-form arithmetic
const _v3add: Vector3 = v3a.add(v3b);
const _v3mul2: Vector3 = v3a.mul(2);
const _v3unm: Vector3 = v3a.unm();
const _v4add: Vector4 = v4a.add(v4b);
const _qmulq: Quaternion = q.mul(q);
const _mmulv4: Vector4 = m.mul(v4a);

// packages/docs/guide/vector-math.md "Why not v3 + v3?" negatives
// @ts-expect-error binary + on Vector3 is not type-checked away by the toolchain
const _v3plus = v3a + v3b;
// @ts-expect-error binary * on Vector3 with a scalar is not the method form
const _v3star = v3a * 2;
// @ts-expect-error Vector3.add requires a Vector3, not a number
const _v3addBadArg: Vector3 = v3a.add(2);

// packages/docs/guide/typescript-gotchas.md — unary-minus silently produces number
// Symmetric pin: the positive assignment must compile, the Vector3 assignment must not.
const _negIsNumber: number = -v3a;
// @ts-expect-error -v3a is not Vector3 — it silently produces number
const _negIsVector3: Vector3 = -v3a;

// packages/docs/guide/getting-started.md — vmath.vector3(...).add(vmath.vector3(...)) chain
const _gettingStartedChain: Vector3 = vmath.vector3(1, 2, 3).add(vmath.vector3(0, 1, 0));

// packages/docs/guide/typescript-gotchas.md — enum constants are branded numbers
// A branded constant stays assignable to plain number (backward compatible)
// and to its own brand, but a bare number lacks the brand.
const _pbIsNumber: number = go.PLAYBACK_ONCE_FORWARD;
const _pbBrand: number & { readonly __brand: "go.PLAYBACK_ONCE_FORWARD" } =
  go.PLAYBACK_ONCE_FORWARD;
// @ts-expect-error a plain number lacks the enum brand
const _pbBad: number & { readonly __brand: "go.PLAYBACK_ONCE_FORWARD" } = 0;

// packages/docs/guide/typescript-gotchas.md — component property catalog
// The per-namespace `interface properties` records each property's type.
declare const _labelProps: label.properties;
const _labelColor: Vector4 = _labelProps.color;
// @ts-expect-error a property member carries its catalogued type, not an arbitrary one
const _labelColorBad: string = _labelProps.color;

// packages/docs/guide/agent-runbooks.md "Combine components on a game object" —
// on_input hands action_id as a Hash, comparable to hash(...); a "#id" receiver
// reaches a sibling component on the same object.
defineScript({
  on_input(self, action_id) {
    void self;
    if (action_id === hash("jump")) {
      msg.post("#animator", "play_animation", { id: hash("jump") });
    }
  },
});

// packages/docs/guide/agent-runbooks.md "Spawn objects with a factory" —
// factory.create(...) returns the spawned object's id as a Hash.
const _spawned: Hash = factory.create("#enemyfactory", undefined, undefined, {
  health: 100,
});

// packages/docs/guide/agent-runbooks.md "Spawn a hierarchy with a collection factory" —
// collectionfactory.create(...) returns a LuaMap<Hash, Hash>; .get(id) may miss.
const _spawnedSet: LuaMap<Hash, Hash> = collectionfactory.create("#levelfactory");
const _onePlayer: Hash | undefined = _spawnedSet.get(hash("/player"));
// @ts-expect-error LuaMap.get returns Hash | undefined — a bare Hash ignores the miss
const _onePlayerBad: Hash = _spawnedSet.get(hash("/player"));

// packages/docs/guide/agent-runbooks.md "Pass messages between components" —
// msg.post addresses a "#sibling" or "/object#component"; the payload is optional.
msg.post("#health", "damage", { amount: 10 });
msg.post("/enemy#ai", "alert");

// packages/docs/guide/agent-runbooks.md "Where script state lives" —
// init's returned object is inferred onto self; a field init never returned is rejected.
defineScript({
  init() {
    return { health: 100 };
  },
  update(self) {
    const _health: number = self.health;
    void _health;
    // @ts-expect-error self carries only init's returned fields — `mana` is not one
    void self.mana;
  },
});

void _v3add;
void _v3mul2;
void _v3unm;
void _v4add;
void _qmulq;
void _mmulv4;
void _v3plus;
void _v3star;
void _v3addBadArg;
void _negIsNumber;
void _negIsVector3;
void _gettingStartedChain;
void _pbIsNumber;
void _pbBrand;
void _pbBad;
void _labelColor;
void _labelColorBad;
void _spawned;
void _spawnedSet;
void _onePlayer;
void _onePlayerBad;
