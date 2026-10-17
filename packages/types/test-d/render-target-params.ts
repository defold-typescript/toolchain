/// <reference path="../index.d.ts" />

// On the default target `render.RenderTargetParams` is the reference's
// `render.render_target_params`, not the bare record older pins get: each
// buffer key takes a `render.render_target_buffer_params`, so leaving out a
// required field is rejected.

const _depthOnly: render.RenderTargetParams = {
  [graphics.BUFFER_TYPE_DEPTH_BIT]: { format: graphics.TEXTURE_FORMAT_DEPTH, width: 1, height: 1 },
};
void _depthOnly;

// @ts-expect-error a buffer's `height` is required
const _missingHeight: render.RenderTargetParams = {
  [graphics.BUFFER_TYPE_DEPTH_BIT]: { format: graphics.TEXTURE_FORMAT_DEPTH, width: 1 },
};
void _missingHeight;

// The render-target creator raises on any texture type but 2D and cube map, so
// `type` takes only those two.
const _cubeMap: render.RenderTargetParams = {
  type: graphics.TEXTURE_TYPE_CUBE_MAP,
  [graphics.BUFFER_TYPE_DEPTH_BIT]: { format: graphics.TEXTURE_FORMAT_DEPTH, width: 1, height: 1 },
};
void _cubeMap;

const _arrayTarget: render.RenderTargetParams = {
  // @ts-expect-error the binding raises "Invalid render target texture type" on a 2D array
  type: graphics.TEXTURE_TYPE_2D_ARRAY,
  [graphics.BUFFER_TYPE_DEPTH_BIT]: { format: graphics.TEXTURE_FORMAT_DEPTH, width: 1, height: 1 },
};
void _arrayTarget;

const _targetType: render.RenderTargetTextureType = graphics.TEXTURE_TYPE_2D;
void _targetType;
