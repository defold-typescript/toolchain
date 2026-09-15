/// <reference path="../index.d.ts" />

// The serialization/JSON passthrough functions take or return an opaque lua
// table whose shape is the caller's: `Record<string | number, unknown>` is the
// faithful "any lua table" type, not a fidelity loss. Reading a concrete field
// requires narrowing/casting; writing accepts any table literal.

// Decoded/loaded tables are arbitrary records — usable as a table.
const arbTableDecoded = json.decode('{"hp":3}');
const arbTableLoaded = sys.load("/save.dat");
const arbTableDeserialized = sys.deserialize("...");
void arbTableDecoded;
void arbTableLoaded;
void arbTableDeserialized;

// @ts-expect-error a decoded value is `unknown`, not directly usable as a number
const _arbTableBad: number = json.decode('{"hp":3}').hp;

// Narrow at the point of use, exactly as with any other `unknown`.
const arbTableOk: number = json.decode('{"hp":3}').hp as number;
void arbTableOk;

// The encode/save/serialize inputs accept an arbitrary table literal.
const arbTableEncoded: string = json.encode({ hp: 3, name: "hero" });
const arbTableSerialized: string = sys.serialize({ level: 2 });
sys.save("/save.dat", { score: 42 });
void arbTableEncoded;
void arbTableSerialized;

// Runtime-owned passthrough: the spawn-time `properties` overrides are keyed by
// the spawned object's own script-property names, so the table is an arbitrary
// literal accepted as-is, not a typed shape.
const arbTableSpawned: Hash = factory.create(
  "#factory",
  undefined,
  undefined,
  { hp: 3, name: "hero" },
  1,
);
const arbTableSpawnedSet: LuaMap<Hash, Hash> = collectionfactory.create(
  "#collectionfactory",
  undefined,
  undefined,
  { speed: 2 },
);
void arbTableSpawned;
void arbTableSpawnedSet;
