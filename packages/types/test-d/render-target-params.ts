/// <reference path="../index.d.ts" />

// On the default target `render.render_target_params` is the reference's own
// struct, not the bare record older pins get: each buffer key takes a
// `render.RenderTargetBufferParams`, so leaving out a required field is
// rejected.

const _depthOnly: render.render_target_params = {
  [graphics.BUFFER_TYPE_DEPTH_BIT]: { format: graphics.TEXTURE_FORMAT_DEPTH, width: 1, height: 1 },
};
void _depthOnly;

// @ts-expect-error a buffer's `height` is required
const _missingHeight: render.render_target_params = {
  [graphics.BUFFER_TYPE_DEPTH_BIT]: { format: graphics.TEXTURE_FORMAT_DEPTH, width: 1 },
};
void _missingHeight;

// The render-target creator raises on any texture type but 2D and cube map, so
// `type` takes only those two.
const _cubeMap: render.render_target_params = {
  type: graphics.TEXTURE_TYPE_CUBE_MAP,
  [graphics.BUFFER_TYPE_DEPTH_BIT]: { format: graphics.TEXTURE_FORMAT_DEPTH, width: 1, height: 1 },
};
void _cubeMap;

const _arrayTarget: render.render_target_params = {
  // @ts-expect-error the binding raises "Invalid render target texture type" on a 2D array
  type: graphics.TEXTURE_TYPE_2D_ARRAY,
  [graphics.BUFFER_TYPE_DEPTH_BIT]: { format: graphics.TEXTURE_FORMAT_DEPTH, width: 1, height: 1 },
};
void _arrayTarget;

const _targetType: render.RenderTargetTextureType = graphics.TEXTURE_TYPE_2D;
void _targetType;

render.render_target(_depthOnly);
render.render_target("rt", _depthOnly);

// The slot has one name: the curated spelling is not declared.
// @ts-expect-error render.RenderTargetParams is not a declared type
const _oldName: render.RenderTargetParams = {};
void _oldName;
