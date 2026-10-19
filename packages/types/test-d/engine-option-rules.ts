/// <reference path="../index.d.ts" />
import type { Hash, Url } from "../src/core-types";

// Each rejected call passes arguments of the types the ref-doc names, in a shape
// the engine binding raises on. The accepted calls are the shapes it takes.

declare const id: Hash;
declare const ids: Hash[];
declare const path: string;
declare const data: string;
declare const url: Url;
declare const partial: boolean;

// go.delete (gameobject_script.cpp:Script_Delete)
go.delete();
go.delete(true);
go.delete(id);
go.delete(id, true);
go.delete(ids, false);
// @ts-expect-error a boolean id takes no second argument
go.delete(true, true);
// @ts-expect-error a nil id raises once recursive is popped
go.delete(undefined, true);

// resource.create_sound_data `partial` (script_resource.cpp:CreateSoundData)
resource.create_sound_data(path, { data });
resource.create_sound_data(path, { data, partial: false });
resource.create_sound_data(path, { data, partial: true, filesize: 1 });
// @ts-expect-error a partial chunk reads filesize with no default
resource.create_sound_data(path, { data, partial: true });
resource.create_sound_data(path, { data, partial, filesize: 1 });
// @ts-expect-error a partial that may be true reads filesize with no default
resource.create_sound_data(path, { data, partial });

// buffer.create (script_buffer.cpp:Create)
const decl = { name: hash("position"), type: buffer.VALUE_TYPE_FLOAT32, count: 3 };
const buf = buffer.create(1, [decl]);
// @ts-expect-error the binding raises on an empty declaration list
buffer.create(1, []);
declare const decls: { name: Hash; type: buffer.ValueType; count: number }[];
// @ts-expect-error a list of unknown length may be empty
buffer.create(1, decls);

// buffer.set_metadata (script_buffer.cpp:SetMetadata)
buffer.set_metadata(buf, id, [1], buffer.VALUE_TYPE_FLOAT32);
// @ts-expect-error the binding raises on empty values
buffer.set_metadata(buf, id, [], buffer.VALUE_TYPE_FLOAT32);
// @ts-expect-error 64-bit metadata raises
buffer.set_metadata(buf, id, [1], buffer.VALUE_TYPE_INT64);
// @ts-expect-error 64-bit metadata raises
buffer.set_metadata(buf, id, [1], buffer.VALUE_TYPE_UINT64);

// go.get and go.set options (gameobject_script_util.cpp:LuaToPropertyOptions)
go.get(url, "p", {});
go.get(url, "p", { index: 1 });
go.get(url, "p", { key: "k" });
go.get(url, "p", { keys: ["e"] });
go.get(url, "p", { index: 1, key: undefined });
go.set(url, "p", 1, { index: 1 });
// @ts-expect-error the options table names at most one of index, key and keys
go.get(url, "p", { index: 1, key: "k" });
// @ts-expect-error the options table names at most one of index, key and keys
go.get(url, "p", { key: "k", keys: ["e"] });
// @ts-expect-error the options table names at most one of index, key and keys
go.set(url, "p", 1, { index: 1, key: "k" });
// @ts-expect-error the options table names at most one of index, key and keys
go.set(url, "p", 1, { key: "k", keys: ["e"] });
