/// <reference path="../index.d.ts" />

import type { Opaque } from "../src/core-types";

// The slots OPTIONAL_SLOT_CORRECTIONS promotes: each is documented as omissible
// by the engine's own prose or examples while the ref-doc metadata still marks
// it required. What matters here is that the omitted call a user would copy out
// of the Defold docs actually compiles against the shipped declarations.

declare const buf: Opaque<"buffer">;
declare const body: Opaque<"b2Body">;
declare const shapeId: Opaque<"b2Shape">;
declare const jointA: Opaque<"b2Joint">;
declare const jointB: Opaque<"b2Joint">;

const tparams = {
  type: graphics.TEXTURE_TYPE_2D,
  width: 128,
  height: 128,
  format: graphics.TEXTURE_FORMAT_RGBA,
};

// resource.create_texture — "optional buffer of precreated pixel data".
const created: Hash = resource.create_texture("/my_custom_texture.texturec", tparams);
void created;

// resource.create_texture_async — the buffer is omissible, and so is the
// callback. Both the trailing form and the interior form (an explicit
// `undefined` buffer with a callback after it) are calls the engine accepts.
const [asyncHash, requestId] = resource.create_texture_async("/my_texture.texturec", tparams, buf);
void asyncHash;
void requestId;
resource.create_texture_async("/my_texture.texturec", tparams);
resource.create_texture_async("/my_texture.texturec", tparams, undefined, (...args: unknown[]) => {
  void args;
});

// gui.new_texture / gui.set_texture_data — `flip` is absent from every example.
const orange = string.rep("ÿ", 3);
const [ok, reason] = gui.new_texture("orange_tx", 1, 1, "rgb", orange);
void ok;
void reason;
const updated: boolean = gui.set_texture_data("dynamic_tx", 1, 1, "rgb", orange);
void updated;

// sys.set_engine_throttle — "sys.set_engine_throttle(false)" is the doc's own call.
sys.set_engine_throttle(false);

// b2d.fixture.set_shape — "The body mass is not updated unless update_mass is true".
b2d.fixture.set_shape(body, 2, { type: 0, radius: 1 });

// b2d.shape.ray_cast — "optional maximum translation fraction, defaults to 1".
const hit = b2d.shape.ray_cast(shapeId, vmath.vector3(0), vmath.vector3(1, 0, 0));
void hit.fraction;

// iap.buy — "optional parameters as properties".
iap.buy("sword");

// Every b2d.joint constructor opens its definition doc with "optional
// definition"; the two-argument form is the shape all twelve share.
const gear = b2d.joint.create_gear(jointA, jointB);
void gear;
const weld = b2d.joint.create_weld(body, body);
void weld;

// Polarity: a genuinely required slot in front of a corrected one stays
// required, so the correction is a slot promotion and not a slide to
// all-optional parameters.

// @ts-expect-error resource.create_texture still requires its table argument.
resource.create_texture("/my_custom_texture.texturec");

// @ts-expect-error b2d.fixture.set_shape still requires the shape itself.
b2d.fixture.set_shape(body, 2);
