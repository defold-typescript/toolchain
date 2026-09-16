---
toc-title: Lua table constructs
---
# Writing Lua's keyed tables in TypeScript

Defold's reference is written in Lua, and several engine calls take a table whose *keys* are engine constants. `render.clear` is the worked example: its reference passes a table literal keyed by the three `graphics.BUFFER_TYPE_*` constants.

```lua
render.clear({ [graphics.BUFFER_TYPE_COLOR0_BIT] = vmath.vector4(0, 0, 0, 0),
               [graphics.BUFFER_TYPE_DEPTH_BIT] = 1 })
```

Translating that one line is not obvious, because the TypeScript object literal you would write first does not compile. This page shows the two spellings that do, which one to reach for, and one route that looks like the fix and is not.

For the general container map — which Lua `table` shape becomes which TypeScript type — see [Data structures](./data-structures.md). This page is about the narrower case: a table the engine reads by constant key.

## Why the slot is a `LuaMap`

An [enum constant is a branded number](./typescript-gotchas.md#enum-constants-are-branded-numbers--a-bare-number-wont-do), and a TypeScript index signature accepts only `string`, `number` or `symbol` — never a brand. A generated declaration therefore cannot describe "a table keyed by these three constants" as an index signature at all, so the slot is typed `LuaMap<render.ClearBufferKey, number | Vector4>`: a `LuaMap` key parameter *can* carry the brand.

`render.ClearBufferKey` is the exported union of the three constants, available on the default surface and on every pinned `defold-target`. `LuaMap`'s iterator makes its key parameter invariant, so `LuaMap<number, number | Vector4>` is rejected however its entries were set — declare the map with the alias. `packages/types/test-d/documented-constant-slots.ts` pins the accepted call and rejects a key from another family, and `packages/types/test-d/versions/clear-buffer-key-proof.ts` proves the alias on each committed surface.

### Why the object literal does not compile

`LuaMap` is an interface with members. An object literal has none of them, so the assignment fails before the keys are ever considered:

```ts
const buffers: LuaMap<render.ClearBufferKey, number | Vector4> = {
  [graphics.BUFFER_TYPE_COLOR0_BIT]: vmath.vector4(0, 0, 0, 0),
};
render.clear(buffers);
```

> Type `{ [x: number]: Vector4; }` is missing the following properties from type `LuaMap<ClearBufferKey, number | Vector4>`: `get`, `set`, `has`, `delete`, and 3 more. — TS2740

The error names the cause exactly: a literal is not a `LuaMap`. Everything below is a way around that one sentence.

## Two routes that work

### Route A — declare the map, then set each entry

```ts
const buffers = new LuaMap<render.ClearBufferKey, number | Vector4>();
buffers.set(graphics.BUFFER_TYPE_COLOR0_BIT, vmath.vector4(0, 0, 0, 0));
buffers.set(graphics.BUFFER_TYPE_DEPTH_BIT, 1);
render.clear(buffers);
```

Keys and values are fully checked: a constant from another family, or a value that is neither a number nor a `Vector4`, is a compile error at the `set` that introduced it. The emitted Lua is the same table the reference builds, assembled one entry at a time:

```lua
buffers = {}
buffers[graphics.BUFFER_TYPE_COLOR0_BIT] = vmath.vector4(0, 0, 0, 0)
buffers[graphics.BUFFER_TYPE_DEPTH_BIT] = 1
render.clear(buffers)
```

### Route B — the inline table, cast

```ts
const buffers = {
  [graphics.BUFFER_TYPE_COLOR0_BIT]: vmath.vector4(0, 0, 0, 0),
  [graphics.BUFFER_TYPE_DEPTH_BIT]: 1,
} as unknown as LuaMap<render.ClearBufferKey, number | Vector4>;
render.clear(buffers);
```

This emits the reference's constructor verbatim:

```lua
buffers = {
    [graphics.BUFFER_TYPE_COLOR0_BIT] = vmath.vector4(0, 0, 0, 0),
    [graphics.BUFFER_TYPE_DEPTH_BIT] = 1
}
render.clear(buffers)
```

The `as unknown as` pair is what the double cast costs you: it erases the type on the way through, so **neither the keys nor the values are checked**. `{ [graphics.STATE_BLEND]: "red" }` compiles just as happily.

### Which one to write

**Use Route A.** The two emit semantically identical Lua — a table with the same entries — and Route A is the one that catches a wrong key. Three statements instead of one constructor is not a runtime cost worth trading type-checking for.

Reach for Route B only when the one-expression shape actually matters: a table built inline as an argument, or a long constant table you are transcribing from the reference and want to keep diff-comparable against it. When you do, treat it like any other cast — the compiler has stopped helping.

## Rejected routes

### Rejected — a mapped type over the key union

A mapped type over `render.ClearBufferKey` looks like the missing piece: it names the exact keys, so surely it checks them.

```ts
type ClearTable = { [K in render.ClearBufferKey]?: number | Vector4 };

const stateKey: ClearTable = { [graphics.STATE_BLEND]: 1 };

// @ts-expect-error — a bare number is caught, which is what hides the line above.
const bareKey: ClearTable = { [0]: 1 };

// @ts-expect-error — and the shape is still not a `LuaMap`.
render.clear(stateKey);
```

It does not. `graphics.STATE_BLEND` is a render-state constant, not a buffer key, and the first assignment compiles with no error: a computed key whose type is a non-literal branded number defeats excess-property checking. The bare `[0]` *is* caught, which is exactly what makes the hole easy to miss — the type looks like it is working.

It also never reaches `render.clear`, because a mapped type is still an object type and still has none of `LuaMap`'s members. So the route buys no checking and no assignability, and is recorded here as rejected rather than left out — it is the first thing you would try.

`packages/docs/lua-table-constructs.test.ts` compiles every fence on this page against the shipped declarations, including this one: if TypeScript ever closes the excess-property hole, that test reds and this rejection is revisited rather than silently outliving its reason.
