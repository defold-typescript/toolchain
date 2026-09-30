/// <reference path="../index.d.ts" />
import type { Hash } from "../src/core-types";

for (const _mount of liveupdate.get_mounts()) {
  const _mountName: Hash = _mount.name;
  const _mountUri: string = _mount.uri;
  const _mountPriority: number = _mount.priority;
  void _mountName;
  void _mountUri;
  void _mountPriority;
}

const _tile = tilemap.get_tile_info("/level.tilemap", "layer1", 0, 0);
const _tileIndex: number = _tile.index;
const _tileHFlip: boolean = _tile.h_flip;
const _tileVFlip: boolean = _tile.v_flip;
const _tileRotate90: boolean = _tile.rotate_90;
void _tileIndex;
void _tileHFlip;
void _tileVFlip;
void _tileRotate90;

// @ts-expect-error tile index is a number, not a string
const _badTileIndex: string = _tile.index;
void _badTileIndex;
