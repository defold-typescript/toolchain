/// <reference path="../index.d.ts" />
import type { Hash, Opaque, Quaternion, Url, Vector3, Vector4 } from "../src/core-types";

const _v: Vector3 = vmath.vector3(1, 2, 3);
const _v0: Vector3 = vmath.vector3();
const _n: number = vmath.dot(_v, _v);
const _v4: Vector4 = vmath.vector4(1, 2, 3, 4);
const _sum: Vector3 = vmath.vector3(1, 2, 3).add(vmath.vector3(1, 1, 1));
const _scaled: Vector3 = _v.mul(2);
void _sum;
void _scaled;

// @ts-expect-error vmath.vector3 does not accept strings
vmath.vector3("not a number");

// @ts-expect-error vmath.dot returns number, not string
const _bad: string = vmath.dot(_v, _v);

const _u: Url = msg.url();
const _u2: Url = msg.url("main:/go#script");
msg.post(_u, "increment_score");
msg.post(_u, "increment_score", { amount: 10 });
msg.post(_u, "set_parent", { keep_world_transform: 1 });

// @ts-expect-error msg.post receiver must be Url-shaped, not number
msg.post(123, "x");

// @ts-expect-error msg.url returns Url, not string
const _badUrl: string = msg.url();

const _id: Hash = go.get_id("/my_object");
const _p: Vector3 = go.get_position(_id);
const _r: Quaternion = go.get_rotation(_id);
go.set_position(vmath.vector3(1, 2, 3), _id);

// @ts-expect-error go.set_position requires a Vector3, not a string
go.set_position("not a vector", _id);

// @ts-expect-error go.get_position returns Vector3, not string
const _badPos: string = go.get_position(_id);

const _gp: Vector3 = gui.get_position(gui.get_node("foo"));
gui.set_position(gui.get_node("foo"), vmath.vector3(1, 2, 3));
const _gt: string = gui.get_text(gui.get_node("foo"));

// @ts-expect-error gui.set_position second arg is a Vector3, not a string
gui.set_position(gui.get_node("foo"), "not a vector");

// @ts-expect-error gui.get_position returns Vector3, not string
const _badGp: string = gui.get_position(gui.get_node("foo"));

render.set_view(vmath.matrix4());
render.set_projection(vmath.matrix4());
const _pred = render.predicate(["opaque", hash("smoke")]);
render.draw(_pred, {});

// @ts-expect-error render.set_view requires a Matrix4, not a string
render.set_view("not a matrix");

// @ts-expect-error render.set_view returns void, not string
const _badRv: string = render.set_view(vmath.matrix4());

const _rt: render.render_target = render.render_target("rt", {});

// @ts-expect-error the render_target alias is a nominal handle, not a plain number
const _badRt: render.render_target = 0;
void _rt;
void _badRt;

physics.set_gravity(vmath.vector3(0, -9.8, 0));
const _g: Vector3 = physics.get_gravity();
physics.wakeup(msg.url());

// @ts-expect-error physics.set_gravity requires a Vector3, not a string
physics.set_gravity("down");

// @ts-expect-error physics.get_gravity returns Vector3, not string
const _badG: string = physics.get_gravity();

const _f: Hash = factory.create(msg.url(), vmath.vector3(1, 2, 3), vmath.quat(), {}, 1);
factory.create(msg.url(), vmath.vector3(0, 0, 0), vmath.quat(), {}, vmath.vector3(1, 1, 1));

// @ts-expect-error factory.create rotation must be Quaternion, not a string
factory.create(msg.url(), vmath.vector3(0, 0, 0), "not a quat", {}, 1);

// @ts-expect-error factory.create returns Hash, not string
const _badF: string = factory.create(msg.url(), vmath.vector3(0, 0, 0), vmath.quat(), {}, 1);

void _f;
void _badF;

collectionfactory.create(msg.url(), vmath.vector3(0, 0, 0), vmath.quat(), {}, 1);
collectionfactory.create(
  msg.url(),
  vmath.vector3(0, 0, 0),
  vmath.quat(),
  {},
  vmath.vector3(1, 1, 1),
);

// @ts-expect-error collectionfactory.create rotation must be Quaternion, not a string
collectionfactory.create(msg.url(), vmath.vector3(0, 0, 0), "not a quat", {}, 1);

// @ts-expect-error collectionfactory.create position must be Vector3, not a string
collectionfactory.create(msg.url(), "not a vector", vmath.quat(), {}, 1);

// @ts-expect-error collectionfactory.create returns a table (Record), not a string
const _badCf: string = collectionfactory.create(
  msg.url(),
  vmath.vector3(0, 0, 0),
  vmath.quat(),
  {},
  1,
);
void _badCf;

const _cpRes: Hash[] = collectionproxy.get_resources(msg.url());
collectionproxy.set_collection(msg.url(), "/main.collectionc");
collectionproxy.set_collection(msg.url());

// @ts-expect-error collectionproxy.get_resources requires Url, not a bare string
collectionproxy.get_resources("not a url");

// @ts-expect-error collectionproxy.get_resources returns a table (Record), not a string
const _badCpRes: string = collectionproxy.get_resources(msg.url());

void _cpRes;
void _badCpRes;

sprite.play_flipbook(msg.url(), "run", undefined, {});
sprite.play_flipbook(msg.url(), go.get_id("/sprite"), undefined, {});
sprite.set_hflip(msg.url(), true);
sprite.set_vflip(msg.url(), false);

// @ts-expect-error sprite.set_hflip flip arg is boolean, not a string
sprite.set_hflip(msg.url(), "yes");

// @ts-expect-error sprite.set_hflip returns void, not string
const _badSprite: string = sprite.set_hflip(msg.url(), true);
void _badSprite;

sound.play(msg.url(), {}, undefined);
sound.stop(msg.url(), {});
sound.set_gain(msg.url(), 0.5);
const _musicPlaying: boolean = sound.is_music_playing();
const _groupGain: number = sound.get_group_gain(go.get_id("music"));

// @ts-expect-error sound.set_gain gain arg is a number, not a string
sound.set_gain(msg.url(), "loud");

// @ts-expect-error sound.is_music_playing returns boolean, not string
const _badSound: string = sound.is_music_playing();
void _badSound;
void _musicPlaying;
void _groupGain;

declare const _playback: Opaque<"constant">;
model.play_anim(msg.url(), "run", _playback, {}, undefined);
model.play_anim(msg.url(), go.get_id("run"), _playback, {}, undefined);

// @ts-expect-error play_anim playback is a nominal engine handle, not a plain number
model.play_anim(msg.url(), "run", 0, {}, undefined);
model.cancel(msg.url());
const _bone: Hash = model.get_go(msg.url(), go.get_id("root"));
model.set_mesh_enabled(msg.url(), "mesh", true);
const _meshOn: boolean = model.get_mesh_enabled(msg.url(), "mesh");
const _aabb: Record<string | number, unknown> = model.get_aabb(msg.url());

// @ts-expect-error model.set_mesh_enabled enabled arg is boolean, not a string
model.set_mesh_enabled(msg.url(), "mesh", "yes");

// @ts-expect-error model.get_go returns Hash, not string
const _badBone: string = model.get_go(msg.url(), go.get_id("root"));
void _bone;
void _meshOn;
void _aabb;
void _badBone;

tilemap.set_tile(msg.url(), "ground", 1, 1, 5, 0);
tilemap.set_tile(msg.url(), go.get_id("ground"), 1, 1, 5, 0);
const _tile: number = tilemap.get_tile(msg.url(), "ground", 1, 1);
tilemap.set_visible(msg.url(), "ground", true);
const [_boundsX, _boundsY, _boundsW, _boundsH] = tilemap.get_bounds(msg.url());

// @ts-expect-error tilemap.set_visible visible arg is boolean, not a string
tilemap.set_visible(msg.url(), "ground", "yes");
void _tile;
void _boundsX;
void _boundsY;
void _boundsW;
void _boundsH;

const _text: string = label.get_text(msg.url());
const _textHash: string = label.get_text(go.get_id("score"));
label.set_text(msg.url(), "score: 0");

// @ts-expect-error label.get_text returns string, not number
const _badText: number = label.get_text(msg.url());
void _text;
void _textHash;
void _badText;

particlefx.play(msg.url(), () => {});
particlefx.stop(msg.url(), {});
particlefx.set_constant(msg.url(), "emitter", "tint", vmath.vector4(1, 1, 1, 1));
particlefx.set_constant(
  msg.url(),
  go.get_id("emitter"),
  go.get_id("tint"),
  vmath.vector4(1, 1, 1, 1),
);
particlefx.reset_constant(msg.url(), "emitter", "tint");

// @ts-expect-error particlefx.set_constant value is Vector4, not number
particlefx.set_constant(msg.url(), "emitter", "tint", 1);

void _g;
void _badG;

void _pred;
void _badRv;
void _gp;
void _gt;
void _badGp;
void _v0;
void _n;
void _v4;
void _bad;
void _u;
void _u2;
void _badUrl;
void _p;
void _r;
void _id;
void _badPos;

const _timerHandle: number = timer.delay(1, false, () => {});
const _timerCancelled: boolean = timer.cancel(_timerHandle);

// @ts-expect-error timer.delay delay is number, not string
timer.delay("soon", false, () => {});

void _timerHandle;
void _timerCancelled;

const _html5Out: string = html5.run("1 + 1");
html5.set_interaction_listener(() => {});
html5.set_interaction_listener();

// @ts-expect-error html5.run takes a string, not a number
html5.run(42);

// @ts-expect-error html5.run returns string, not number
const _badHtml5: number = html5.run("1 + 1");

void _html5Out;
void _badHtml5;

const _isV3: boolean = types.is_vector3(vmath.vector3());
const _isHashV: boolean = types.is_hash(hash("x"));

// @ts-expect-error types.is_vector3 requires one argument
types.is_vector3();

// @ts-expect-error types.is_hash returns boolean, not string
const _badType: string = types.is_hash(hash("x"));

void _isV3;
void _isHashV;
void _badType;
