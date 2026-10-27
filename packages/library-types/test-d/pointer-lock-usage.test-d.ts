/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import type { InputAction } from "@defold-typescript/types";
import * as pointer from "pointer_lock.pointer";

// Compile-only proof for the pointer_lock fork, written as the `on_input` upstream's
// README drives it. No assertions execute; tsc --noEmit under tsconfig.dts-check.json
// is the gate.

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

export function onInput(action_id: Hash | undefined, action: InputAction): void {
  const [id, act] = pointer.transform_input(action_id, action);
  const _id: Equal<typeof id, Hash | undefined> = true;
  void _id;
  // The cursor overwrites `x` and `y`, and every other field of the action passes through.
  const _x: Equal<typeof act.x, number> = true;
  void _x;
  const _pressed: Equal<typeof act.pressed, boolean | undefined> = true;
  void _pressed;

  const _locked: Equal<typeof pointer.locked, boolean> = true;
  void _locked;
  const _width: Equal<typeof pointer.DISPLAY_WIDTH, number> = true;
  void _width;

  (pointer as { cursor_visible: boolean }).cursor_visible = true;
  pointer.update_lock_state();
  if (action.dx !== undefined && action.dy !== undefined) {
    pointer.update_cursor_position({ dx: action.dx, dy: action.dy });
  }

  // @ts-expect-error an input action's `dx` is absent for a key press, and the body adds it
  pointer.update_cursor_position(action);
  // @ts-expect-error transform_input overwrites fields on the action, so it is required
  pointer.transform_input(action_id);
}
