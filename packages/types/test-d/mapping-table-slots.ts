/// <reference path="../index.d.ts" />

import type { Hash, Opaque, Vector3 } from "../src/core-types";

// The three gui mapping-table returns key by a branded `Hash`, which a TS index
// signature cannot hold, so each emits a Lua table type (curated in
// MAPPING_TABLE_SLOTS where the reference says only `table`). `.get(id)` yields
// the recovered value type.

declare const nodeId: Hash;

const tree = gui.get_tree(gui.get_node("root"));
const treeNode: Opaque<"node"> | undefined = tree.get(nodeId);
void treeNode;

const clones = gui.clone_tree(gui.get_node("button"));
const clonedNode: Opaque<"node"> | undefined = clones.get(nodeId);
void clonedNode;

const layouts = gui.get_layouts();
const size: Vector3 | undefined = layouts.get(nodeId);
void size;

// @ts-expect-error a layout value is a Vector3, not directly assignable to number
const _badSize: number = gui.get_layouts().get(nodeId);

// A lookup of an id the table does not hold reads `nil`, so every id table's
// `get` includes `undefined`, whichever key form it takes.
type Identical<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Squad = { "/leader": { speed: number } };

const spawned = collectionfactory.create("#f");
const _byHash: Identical<ReturnType<typeof spawned.get>, Hash | undefined> = true;
void _byHash;
const curried = collectionfactory.create<Squad>()("#f");
const _byPath: Identical<ReturnType<typeof curried.get>, Hash | undefined> = true;
void _byPath;
// @ts-expect-error a missing id reads nil
const _spawnedHash: Hash = spawned.get(hash("/x"));
// @ts-expect-error a missing path reads nil
const _curriedHash: Hash = curried.get("/x");
void _spawnedHash;
void _curriedHash;

declare const n: Opaque<"node">;
const cloned = gui.clone_tree(n).get("a");
const _cloned: Identical<typeof cloned, Opaque<"node"> | undefined> = true;
void _cloned;
const inTree = gui.get_tree(n).get(hash("a"));
const _inTree: Identical<typeof inTree, Opaque<"node"> | undefined> = true;
void _inTree;
const layout = gui.get_layouts().get(hash("l"));
const _layout: Identical<typeof layout, Vector3 | undefined> = true;
void _layout;
const meshAabb = model.get_mesh_aabb("#m").get(hash("m"));
const _meshAabb: undefined extends typeof meshAabb ? true : false = true;
void _meshAabb;
const row = tilemap.get_tiles("#map", "layer")?.get(1);
const tile = row?.get(1);
const _rowLookup: undefined extends ReturnType<NonNullable<typeof row>["get"]> ? true : false =
  true;
void _rowLookup;
void tile;

// The tables still iterate and pass to go.delete.
go.delete(collectionfactory.create("#f"));
for (const [id, node] of gui.clone_tree(n)) {
  const _id: Hash = id;
  const _node: Opaque<"node"> = node;
  void _id;
  void _node;
}
