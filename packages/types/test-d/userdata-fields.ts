/// <reference path="../index.d.ts" />

// `vmath.vector` registers `__len` for `#v` and reads and writes elements through
// `__index`/`__newindex` keyed by a 1-based integer, so `v.length` raises.
const v = vmath.vector([1, 2, 3]);
// @ts-expect-error `length` is the `#v` operator, not a field
const vectorLengthField: number = v.length;
const vectorLength: number = v.length();
const vectorElement: number | undefined = v[1];
v[1] = 2;

// `Matrix4.__mul` takes a number on either side, a matrix, or a vector4.
const m = vmath.matrix4();
const scaled: Matrix4 = m.mul(2);
const product: Matrix4 = m.mul(m);
const transformed: Vector4 = m.mul(vmath.vector4(1, 2, 3, 4));

// An array constant assigns from a table and reads back as the engine's
// 1-based array userdata, which has no `__len`.
const cb = render.constant_buffer();
cb.lights = [vmath.vector4(), vmath.vector4()];
cb.tint = vmath.vector4(1, 1, 1, 1);
const lights = cb.lights;
type ArrayMembers = Extract<typeof lights, readonly unknown[]>;
const lightsReadBackIsNotAnArray: [ArrayMembers] extends [never] ? true : false = true;

// `URL_index` pushes nil for an unset field; every `msg.url` form resolves the
// socket, while `path` stays unset for `"main:"` and a nil path.
const url = msg.url();
// @ts-expect-error `path` is nil for a socket-only address
const urlPath: Hash = url.path;
const urlSocket: Hash = url.socket;
const urlFragment: Hash | undefined = url.fragment;
url.path = "go";
url.path = hash("/go");
url.fragment = undefined;
url.socket = hash("main");
url.socket = "main";
// @ts-expect-error clearing the socket would make every read of it nil
url.socket = undefined;

export {
  lightsReadBackIsNotAnArray,
  product,
  scaled,
  transformed,
  urlFragment,
  urlPath,
  urlSocket,
  vectorElement,
  vectorLength,
  vectorLengthField,
};
