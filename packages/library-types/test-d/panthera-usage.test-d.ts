/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as panthera from "panthera.panthera";

// Compile-only proof (mirroring narrator-usage.test-d.ts) that the panthera LuaLS
// golden is callable with the types upstream documents. The interfaces are not
// exported from the module, so the proof drives them by inference from the module
// functions rather than named imports. No assertions execute; tsc --noEmit under
// tsconfig.dts-check.json (skipLibCheck: false) is the gate.

const state = panthera.create_gui("/animations/hero.json", "hero");

// Reds if `create_gui`'s return degrades to `unknown` — neither the member access
// nor the number annotation survives that.
const speed: number = state.speed;
const currentTime: number = state.current_time;

// `options` is optional upstream, so a dropped parameter would still compile the
// two-argument form; passing the bag is what pins it.
panthera.play(state, "idle", {
  easing: "outsine",
  speed: 2,
  // Upstream annotates the callback `fun(animation_id: string):nil`, which emits
  // as an `undefined` return — a `void`-returning arrow would not satisfy it.
  callback: (animation_id: string) => {
    void animation_id;
    return undefined;
  },
});

// `play_tweener` takes the tween-endpoint bag, a distinct class from `panthera.options`.
panthera.play_tweener(state, "idle", { from: 0, to: 1, is_reverse: true });

// `panthera.adapter` and the `get_node` callback are declared in
// `panthera_internal.lua`, outside the module file: a `sourceGlobs` that stranded
// them would leave `create`'s parameters unresolved.
const cloned = panthera.create(state.animation_path, state.adapter, state.get_node);
const clonedDuration: number = panthera.get_duration(cloned, "idle");

void speed;
void currentTime;
void clonedDuration;
