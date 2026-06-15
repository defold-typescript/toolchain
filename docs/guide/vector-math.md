---
toc-title: Vector math
---
# Vector math

Defold exposes vector arithmetic through Lua metamethods on `vector3`, `vector4`, `quaternion`, and `matrix4`. In TypeScript the same operations are typed as **methods**, not operators: `a.add(b)` instead of `a + b`. The TypeScript-to-Lua transpiler turns these calls into the underlying metamethod invocations at build time, so the runtime cost is identical.

## Vector3

```ts
const a: Vector3 = vmath.vector3(1, 2, 3);
const b: Vector3 = vmath.vector3(4, 5, 6);

const sum: Vector3 = a.add(b);       // a + b
const diff: Vector3 = a.sub(b);      // a - b
const scaled: Vector3 = a.mul(2);    // a * 2 (scalar)
const halved: Vector3 = a.div(2);    // a / 2 (scalar)
const negated: Vector3 = a.unm();    // unary minus — see the gotchas page
```

`mul` and `div` take a scalar `number`, not another `Vector3`. Component-wise multiplication is not built in; do it explicitly with `vmath.vector3(a.x * b.x, a.y * b.y, a.z * b.z)`.

## Vector4

The same shape as `Vector3`, with an extra `w` component:

```ts
const v: Vector4 = vmath.vector4(0, 0, 0, 1);
const w: Vector4 = vmath.vector4(1, 0, 0, 0);
const sum: Vector4 = v.add(w);
```

## Quaternion

`Quaternion.mul` composes two quaternions:

```ts
const q1: Quaternion = vmath.quat_axis_angle(vmath.vector3(0, 1, 0), Math.PI / 2);
const q2: Quaternion = vmath.quat_axis_angle(vmath.vector3(1, 0, 0), Math.PI / 4);
const composed: Quaternion = q1.mul(q2);
```

## Matrix4

`Matrix4.mul` is overloaded: matrix × matrix returns `Matrix4`, matrix × `Vector4` returns `Vector4`. Matrix × `Vector3` is intentionally a type error — promote the vector to `Vector4` first.

```ts
const m: Matrix4 = vmath.matrix4_translation(vmath.vector3(1, 0, 0));
const m2: Matrix4 = m.mul(m);
const transformed: Vector4 = m.mul(vmath.vector4(0, 0, 0, 1));
```

## A worked example: the platformer

The eight engine types (`Vector3`, `Hash`, `Url`, `Quaternion`, `Matrix4`, `Vector`, `Vector4`, `Opaque<…>`) are **ambient globals — no import needed**, mirroring the namespace ergonomics (`vmath`, `go`, `sprite`, …). The committed [`docs/examples/platformer/src/player.ts`](../../examples/platformer/src/player.ts) puts the whole pattern on one screen: the `fixed_update` body uses the chained method form for whole-vector arithmetic, plain `+`/`*` on `number` fields for component access, and a `vmath.project` namespace function that returns a scalar with a method-form argument. The last line comes from the `handle_obstacle_contact` collision helper, not the per-frame loop, so the three snippets do not all share one function body.

```ts
// docs/examples/platformer/src/player.ts — `fixed_update(self, dt)`
self.velocity.x = self.velocity.x + accel * self.input_direction * dt; // component access: plain TS arithmetic on number
self.velocity.y = self.velocity.y + gravity * dt;

const pos = go.get_position().add(self.velocity.mul(dt)).add(self.adj);
go.set_position(pos);

const proj = vmath.project(self.correction, normal.mul(distance));
```

Whole-vector operations read left-to-right as a chain of `Vector3` methods (`go.get_position().add(self.velocity.mul(dt))`); per-component reads and writes (`self.velocity.x = self.velocity.x + accel * …`) stay plain TS because each component is a `number`.

## Why not `v3 + v3`?

TypeScript's binary `+`, `-`, `*`, `/` operators require both operands to be `number` (or `+` accepts `string`). The type-checker rejects `v3a + v3b` with TS2362/TS2365 because `Vector3` is not assignable to either, so writing the operator form fails to compile and you cannot ship code that would crash at runtime.

There is **one** exception: **unary minus**. TypeScript does not flag `-v3a`; it silently produces `number`. This is a TS-level gap the toolchain cannot close with types alone. The typed alternative is `v.unm()`. See [unary minus on Vector3 silently produces number](./typescript-gotchas.md#unary-minus-on-vector3--vector4-silently-produces-number) on the gotchas page for the full story.
