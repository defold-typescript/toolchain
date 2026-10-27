/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as outline from "outline-shader.outline";

// Compile-only proof that the outline shader LuaLS golden is callable the way the
// library's render script and game scripts call it. tsc --noEmit under
// tsconfig.dts-check.json (skipLibCheck: false) is the gate.

export function renderInit(self: { predicates: Record<string, unknown> }): void {
  outline.init(self);
}

export function renderUpdate(
  self: { predicates: Record<string, unknown> },
  clear: LuaMap<render.ClearBufferKey, number | Vector4>,
): void {
  outline.update(self, self.predicates, { frustum: vmath.matrix4() });
  outline.update(self, self.predicates, { frustum: vmath.matrix4() }, clear);
  // @ts-expect-error -- `predicates` and `frustum` are read on every outlined frame.
  outline.update(self);
}

outline.set(0.5, vmath.vector4(1, 0, 0, 1), outline.type.OUTLINE_STENCIL);
outline.draw(true);
outline.set_tag("outline");
