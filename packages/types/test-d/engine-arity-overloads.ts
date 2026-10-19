/// <reference path="../index.d.ts" />
import type { Opaque, Quaternion } from "../src/core-types";

// Both call shapes the upstream ref-doc's own examples make must compile on the
// shipped default surface, and neither authored overload may widen arity.

// `render.render_target({...})` — the single-table form every upstream example
// uses; the table sits in slot 0 with no name.
const _rtTableOnly: Opaque<"render_target"> = render.render_target({});

// The two-argument form a project already on the shipped signature keeps using.
const _rtNamed: Opaque<"render_target"> = render.render_target("rt", {});

void _rtTableOnly;
void _rtNamed;

// @ts-expect-error a lone name is neither form — the narrow arm takes the
// parameter table, not a string.
const _rtNameOnly: Opaque<"render_target"> = render.render_target("rt");
void _rtNameOnly;

// Both arities check the table against the reference's
// `render.render_target_params`: each buffer key takes a
// `render.RenderTargetBufferParams`.
const COLOR0 = graphics.BUFFER_TYPE_COLOR0_BIT;
const DEPTH = graphics.BUFFER_TYPE_DEPTH_BIT;
const depth = { format: graphics.TEXTURE_FORMAT_DEPTH, width: 1, height: 1 };

const _rtDepthOnly: Opaque<"render_target"> = render.render_target({ [DEPTH]: depth });
const _rtNamedDepthOnly: Opaque<"render_target"> = render.render_target("rt", { [DEPTH]: depth });
void _rtDepthOnly;
void _rtNamedDepthOnly;

// A texture format the driver may not support is `undefined` until guarded.
const rgba = graphics.TEXTURE_FORMAT_RGBA;
if (rgba !== undefined) {
  render.render_target({ [COLOR0]: { format: rgba, width: 1, height: 1 } });
}

// @ts-expect-error an unguarded format constant may be `undefined`
render.render_target({ [COLOR0]: { format: graphics.TEXTURE_FORMAT_RGBA, width: 1, height: 1 } });

// @ts-expect-error a buffer's `width` is required
render.render_target({ [DEPTH]: { format: graphics.TEXTURE_FORMAT_DEPTH, height: 1 } });

// @ts-expect-error a buffer's `width` is required in the named arity too
render.render_target("rt", { [DEPTH]: { format: graphics.TEXTURE_FORMAT_DEPTH, height: 1 } });

// @ts-expect-error a wrap mode takes a `graphics.TEXTURE_WRAP_*` constant, not a filter
render.render_target({ [DEPTH]: { ...depth, u_wrap: graphics.TEXTURE_FILTER_LINEAR } });

declare const looseParams: Record<string | number, unknown>;
// @ts-expect-error an open record carries no buffer fields to check
render.render_target(looseParams);

// `vmath.euler_to_quat(v)` — the vector3 arm the ref-doc example calls.
const _quatFromVector: Quaternion = vmath.euler_to_quat(vmath.vector3(0, 0, 90));

// The three-number arm, from the same example block.
const _quatFromAngles: Quaternion = vmath.euler_to_quat(0, 45, 90);

void _quatFromVector;
void _quatFromAngles;

// @ts-expect-error the two-number form is neither arm — the overloads recover
// arity, they do not widen it.
const _quatTwoNumbers: Quaternion = vmath.euler_to_quat(0, 45);
void _quatTwoNumbers;
