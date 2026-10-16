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

// `Matrix4_index` pushes a new vector4 for `c0`..`c3`, so a field write on it
// is lost; `Matrix4_newindex` sets the whole column through `setCol`.
// @ts-expect-error a column read is a copy, so writing its field changes nothing
m.c0.x = 5;
m.c0 = vmath.vector4(1, 0, 0, 0);
const column: Vector4 = m.c1;
column.x = 2;
const columnDot: number = vmath.dot(m.c0, m.c1);

// An array constant assigns from a table and reads back as the engine's
// 1-based array userdata, which has no `__len`.
const cb = render.constant_buffer();
cb.lights = [vmath.vector4(), vmath.vector4()];
cb.tint = vmath.vector4(1, 1, 1, 1);
const lights = cb.lights;
type ArrayMembers = Extract<typeof lights, readonly unknown[]>;
const lightsReadBackIsNotAnArray: [ArrayMembers] extends [never] ? true : false = true;

// `URL_index` pushes nil for any unset field, socket included: an engine
// message posted with no sender carries a URL with no socket, and
// `URL_newindex` clears any field set to nil.
const url = msg.url();
// @ts-expect-error `path` is nil for a socket-only address
const urlPath: Hash = url.path;
const urlSocket: Hash | undefined = url.socket;
// @ts-expect-error `socket` is nil on a sender with no socket
const urlSocketHash: Hash = url.socket;
const urlFragment: Hash | undefined = url.fragment;
url.path = "go";
url.path = hash("/go");
url.fragment = undefined;
url.socket = hash("main");
url.socket = "main";
url.socket = undefined;

// `Buffer_len` is the buffer's `__len`: `#buf` is its element count, and the
// buffer userdata has no `length` field.
const buf = buffer.create(4, [{ name: hash("rgb"), type: buffer.VALUE_TYPE_UINT8, count: 3 }]);
const bufCount: number = buf.length();
const bufStream = buffer.get_stream(buf, hash("rgb"));
// @ts-expect-error `length` is the `#buf` operator, not a field
const bufLengthField: number = buf.length;

export {
  bufCount,
  bufLengthField,
  bufStream,
  column,
  columnDot,
  lightsReadBackIsNotAnArray,
  product,
  scaled,
  transformed,
  urlFragment,
  urlPath,
  urlSocket,
  urlSocketHash,
  vectorElement,
  vectorLength,
  vectorLengthField,
};
