/// <reference path="../index.d.ts" />

// go.delete's prose-only "table of id's" slot is an `array` TABLE_SLOT_CURATIONS
// entry with `pairs`: an id array, or any table whose values are ids, because
// gameobject_script.cpp:DeleteGOTable walks the table with lua_next and resolves
// each value. The extension slot curated as a plain array (iap.list) is proven
// in extensions/id-array-slots.ts.

// go.delete accepts a Hash[] — a hash is one member of the id union (group ids
// returned by sound.get_groups are Hash, the engine's id type).
const ids = sound.get_groups();
go.delete(ids);

// The scalar id form still type-checks (the union's non-array members).
go.delete(ids[0]);

// The id table a collection factory returns deletes every object it spawned.
go.delete(collectionfactory.create("#levelfactory"));
go.delete(collectionfactory.create("#levelfactory"), true);

// @ts-expect-error go.delete's array element is an id union, not a number.
go.delete([1, 2]);

declare const counts: LuaTable<Hash, number>;
// @ts-expect-error a table's values must be ids, not numbers.
go.delete(counts);
