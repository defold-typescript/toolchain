/// <reference path="../index.d.ts" />

declare const rt: render.RenderTarget;

// render's buffer-type params accept the real graphics constant — the brand
// graphics.d.ts emits is the same FQN-keyed brand render's token resolves to.
const _w: number = render.get_render_target_width(rt, graphics.BUFFER_TYPE_COLOR0_BIT);
const _h: number = render.get_render_target_height(rt, graphics.BUFFER_TYPE_DEPTH_BIT);
void _w;
void _h;

// @ts-expect-error a bare number is not a branded buffer-type constant
render.get_render_target_width(rt, 123);
