/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as pixelart_render from "pixelart.scripts.pixelart_render";

// Compile-only proof that the pixel-art render module LuaLS golden is callable the
// way the library's render script calls it. the `dts-declaration-validity`
// compile (skipLibCheck: false) is the gate.

export function renderInit(self: { predicates: Record<string, unknown> }): void {
  pixelart_render.init(self);
}

export function renderUpdate(
  self: { predicates: Record<string, unknown> },
  frustum: Matrix4,
  view: Matrix4,
  proj: Matrix4,
  clear: LuaMap<render.ClearBufferKey, number | Vector4>,
): void {
  pixelart_render.update(self, frustum, view, proj, 960, 640, clear);
  // @ts-expect-error -- every argument is read on each frame.
  pixelart_render.update(self);
}
