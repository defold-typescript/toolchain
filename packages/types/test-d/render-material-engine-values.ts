/// <reference path="../index.d.ts" />

// The render and material calls take and return what the engine bindings check
// and push, which is narrower or differently shaped than the reference says.

// `RenderScript_EnableState` and `RenderScript_DisableState` raise on any state
// outside the six they list, so the two extra `graphics.STATE_*` are rejected.
render.enable_state(graphics.STATE_ALPHA_TEST);
render.disable_state(graphics.STATE_POLYGON_OFFSET_FILL);
// @ts-expect-error the binding raises "Invalid state" on the scissor test
render.enable_state(graphics.STATE_SCISSOR_TEST);
// @ts-expect-error the binding raises "Invalid state" on the support query constant
render.disable_state(graphics.STATE_ALPHA_TEST_SUPPORTED);

// `CheckBlendFactor` accepts only the fifteen blend-factor constants.
render.set_blend_func_separate(
  graphics.BLEND_FACTOR_SRC_ALPHA,
  graphics.BLEND_FACTOR_ONE_MINUS_SRC_ALPHA,
  graphics.BLEND_FACTOR_ONE,
  graphics.BLEND_FACTOR_ONE_MINUS_SRC_ALPHA,
);
// @ts-expect-error a bare number is not a blend-factor constant
render.set_blend_func_separate(1, 1, 1, 1);

const _factor: graphics.BlendFactor = graphics.BLEND_FACTOR_ZERO;
const _sameFactor: graphics.BLEND_FACTOR = _factor;
void _sameFactor;

// A predicate is the userdata `render.predicate` returns, never a number.
const pred: render.render_predicate = render.predicate(["opaque"]);
render.draw(pred);
// @ts-expect-error a predicate is not a number
const _asNumber: number = pred;
void _asNumber;
// @ts-expect-error a predicate takes no arithmetic
void (pred + 1);

// `Material_GetTextures` keys each texture by its sampler slot from 1 and leaves
// an empty slot out, so the result is a slot-keyed map, not a sequence.
declare const materialPath: Hash;
for (const [slot, info] of material.get_textures(materialPath)) {
  const _slot: number = slot;
  const _width: number = info.width;
  void _slot;
  void _width;
  // @ts-expect-error a slot is a number
  const _slotText: string = slot;
  void _slotText;
  // @ts-expect-error each value is the texture's info record
  const _widthText: string = info.width;
  void _widthText;
}
// @ts-expect-error a slot-keyed table has no length
void material.get_textures(materialPath).length;
// @ts-expect-error a slot-keyed table is not a sequence
const _asArray: material.texture_info[] = material.get_textures(materialPath);
void _asArray;
// `Compute_GetTextures` packs its textures, so it stays a sequence.
void compute.get_textures(materialPath).length;

// `PushSampler` pushes the raw texture type, which for a separate sampler or
// texture binding is one of five values with no Lua constant.
const _samplerType: material.sampler_info["type"] = 7;
void _samplerType;
// @ts-expect-error past the last texture type the engine defines
const _beyond: material.sampler_info["type"] = 11;
void _beyond;
