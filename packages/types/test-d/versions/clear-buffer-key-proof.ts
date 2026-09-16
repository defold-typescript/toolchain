export {};

// `render.clear`'s buffer key narrowed to the three documented
// `graphics.BUFFER_TYPE_*` constants, which is a breaking change for anyone who
// wrote `LuaMap<number, ...>` — `LuaMap`'s iterator makes `K` invariant. The
// changelog's migration path is the exported `render.ClearBufferKey` alias, and
// this proof is what makes that promise hold on every surface a consumer can
// select: a versioned index that ships the narrowed key without the alias fails
// here rather than stranding the project that pinned it.

declare const clearValue: number;

const buffers = new LuaMap<render.ClearBufferKey, number | Vector4>();
buffers.set(graphics.BUFFER_TYPE_COLOR0_BIT, vmath.vector4(0, 0, 0, 0));
buffers.set(graphics.BUFFER_TYPE_DEPTH_BIT, clearValue);
buffers.set(graphics.BUFFER_TYPE_STENCIL_BIT, clearValue);
render.clear(buffers);

declare const looseBuffers: LuaMap<number, number | Vector4>;

// @ts-expect-error the narrowing is real on this surface: a plain number key is
// no longer accepted, which is exactly what the alias above exists to replace.
render.clear(looseBuffers);
