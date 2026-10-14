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
