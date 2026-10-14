/// <reference path="../index.d.ts" />

import type { Hash } from "../src/core-types";

// tilemap.get_tiles returns the layer's tiles as a sparse table of rows: the
// outer key is a row index, the inner key a column index, the value the tile id
// (a number). The positions are sparse (offset by tilemap.get_bounds, not a
// dense 0..n run), so the curated shape is the nested LuaMap idiom
// `LuaMap<number, LuaMap<number, number>>`, not a Record. `.get(row)?.get(col)`
// yields the recovered tile id. An unknown layer returns nil, so the table is
// narrowed first.

declare const url: Hash;

const tiles = tilemap.get_tiles(url, "layer1");
if (tiles !== undefined) {
  const row = tiles.get(0);
  const tileId: number | undefined = row?.get(0);
  void tileId;
}

// @ts-expect-error a tile id is a number, not assignable to string
const _badTile: string = tilemap.get_tiles(url, "layer1")?.get(0)?.get(0);
