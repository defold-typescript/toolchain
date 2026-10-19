/// <reference path="../index.d.ts" />
import type { Hash } from "../src/core-types";

// Returns typed from the engine bindings rather than the reference prose: each
// nullable slot needs a narrowing before use, and the ASTC header needs none.

// script_factory.cpp:FactoryComp_Create pushes nil when the spawn fails.
const spawned = factory.create("#f");
// @ts-expect-error factory.create returns nil when the spawn fails
const _spawnedEarly: Hash = spawned;
if (spawned !== undefined) {
  const spawnedId: Hash = spawned;
  void spawnedId;
}

// script_tilemap.cpp:TileMap_Get pushes nil for an unknown layer or a cell out of range.
const tile = tilemap.get_tile("#map", "ground", 1, 1);
// @ts-expect-error tilemap.get_tile returns nil for an unknown layer or a cell out of range
const _tileEarly: number = tile;
if (tile !== undefined) {
  const tileIndex: number = tile;
  void tileIndex;
}

const info = tilemap.get_tile_info("#map", "ground", 1, 1);
// @ts-expect-error tilemap.get_tile_info returns nil for an unknown layer or a cell out of range
const _infoEarly: { index: number } = info;
if (info !== undefined) {
  const infoIndex: number = info.index;
  void infoIndex;
}

// script_tilemap.cpp:TileMap_GetTiles pushes nil for an unknown layer.
const tiles = tilemap.get_tiles("#map", "ground");
// @ts-expect-error tilemap.get_tiles returns nil for an unknown layer
const _tilesEarly: LuaTable<number, LuaTable<number, number>> = tiles;
if (tiles !== undefined) {
  const row: LuaTable<number, LuaTable<number, number>> = tiles;
  void row;
}

// script_collectionproxy.cpp:CollectionProxy_SetCollection pushes `true, nil` on success.
const [changed, code] = collectionproxy.set_collection("#proxy", "/level.collectionc");
// @ts-expect-error the failure reason is nil when the change succeeds
const _codeEarly: collectionproxy.Result = code;
if (!changed && code !== undefined) {
  const reason: collectionproxy.Result = code;
  void reason;
}

// script_image.cpp:Image_GetAstcHeader raises on invalid data and never returns nil.
declare const astcData: string;
const header: image.AstcHeader = image.get_astc_header(astcData);
void header;

void _spawnedEarly;
void _tileEarly;
void _infoEarly;
void _tilesEarly;
void _codeEarly;
