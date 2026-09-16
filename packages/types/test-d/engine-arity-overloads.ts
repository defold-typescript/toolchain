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
