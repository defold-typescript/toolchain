/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as node_repeat from "node_repeat.node_repeat";
import * as sprite_repeat from "sprite_repeat.sprite_repeat";

// Compile-only proof for the hand-authored defold-sprite-repeat surfaces. No
// assertions execute; `tsc --noEmit` under tsconfig.dts-check.json is the gate.

const sprite = sprite_repeat.create("#sprite");
sprite.animate(4, 4);
sprite.stop();

// A script `self` that already holds the atlas lookups is reused, so a second
// sprite on the same atlas skips `resource.get_atlas`.
const cache = {
  atlas_data: resource.get_atlas("/main/main.a.texturesc"),
  tex_info: resource.get_texture_info("/main/main.a.texturesc"),
};
const cached = sprite_repeat.create(msg.url("#other"), hash("tile"), cache);
const _handle: number | undefined = cached.handle;

const box = node_repeat.create("box", undefined, "/main/atlas.a.texturesc");
box.update(2);
box.update(undefined, 3);
const _node: Opaque<"node"> = box.node;

// `create` asserts the atlas path, so leaving it out does not compile.
// @ts-expect-error atlas_path is required.
node_repeat.create("box");

const [_xRatio, _yRatio] = node_repeat.get_screen_aspect_ratio();
const _x: number = _xRatio;
const _y: number = _yRatio;
const _field: number = node_repeat.x_ratio + node_repeat.y_ratio;

// The frames carry typed UV rectangles, not an untyped table.
const frame = sprite.frames[0];
if (frame !== undefined) {
  const _uv: Vector4 = frame.uv_coord;
  const _rotated: Vector4 = frame.uv_rotated;
  const _size: number = frame.w * frame.h;
  // @ts-expect-error uv_coord is a Vector4, not a string.
  const _notString: string = frame.uv_coord;
  void _uv;
  void _rotated;
  void _size;
  void _notString;
}

void _handle;
void _node;
void _x;
void _y;
void _field;
