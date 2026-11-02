/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as glow from "glow-kit.glow";

export function renderInit(self: { predicates: Record<string, unknown> }): void {
  glow.setup(self);
}

glow.configure(2, vmath.vector4(1, 0, 0, 1), glow.mode.GLOW_SOFT);
glow.enable(true);
glow.set_predicate("glow");
// @ts-expect-error -- `enable` takes a boolean.
glow.enable("yes");
