import type { Hash, Url } from "./core-types";

export interface InputTouch {
  id?: number;
  pressed?: boolean;
  released?: boolean;
  tap_count?: number;
  x?: number;
  y?: number;
  dx?: number;
  dy?: number;
  acc_x?: number;
  acc_y?: number;
  acc_z?: number;
}

export interface InputAction {
  value?: number;
  pressed?: boolean;
  released?: boolean;
  repeated?: boolean;
  x?: number;
  y?: number;
  screen_x?: number;
  screen_y?: number;
  dx?: number;
  dy?: number;
  screen_dx?: number;
  screen_dy?: number;
  gamepad?: number;
  userid?: number;
  gamepad_unknown?: boolean;
  gamepad_name?: string;
  gamepad_axis?: number[];
  gamepadhats?: number[];
  gamepad_buttons?: number[];
  touch?: InputTouch[];
  text?: string;
  marked_text?: string;
}

export interface ScriptHooks<TSelf> {
  // `init` returns the script's initial state; it is the sole site TypeScript
  // solves `TSelf` from. The engine owns `self` (a userdata-backed table), so
  // every other hook wraps it in `NoInfer<TSelf>` — otherwise their `self`
  // competes as a second inference site and `TSelf` collapses to `{}`.
  init?(): TSelf;
  update?(self: NoInfer<TSelf>, dt: number): void;
  fixed_update?(self: NoInfer<TSelf>, dt: number): void;
  late_update?(self: NoInfer<TSelf>, dt: number): void;
  // Defold delivers message_id as a pre-hashed `hash`, so handlers must compare
  // it against `hash("...")` constants — a string literal never matches. Sender-
  // side payload narrowing by message id lives on `msg.post` (msg-overloads.d.ts).
  on_message?(
    self: NoInfer<TSelf>,
    message_id: Hash,
    message: Record<string | number, unknown>,
    sender: Url,
  ): void;
  on_input?(
    self: NoInfer<TSelf>,
    action_id: Hash | undefined,
    action: InputAction,
    // biome-ignore lint/suspicious/noConfusingVoidType: Defold lets handlers omit the return; `void` is the right shape for "may return boolean or nothing".
  ): boolean | void;
  final?(self: NoInfer<TSelf>): void;
  on_reload?(self: NoInfer<TSelf>): void;
}

export const SCRIPT_HOOK_NAMES = [
  "init",
  "update",
  "fixed_update",
  "late_update",
  "on_message",
  "on_input",
  "final",
  "on_reload",
] as const;

export type ScriptHookName = (typeof SCRIPT_HOOK_NAMES)[number];

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// drift-pin: SCRIPT_HOOK_NAMES must list exactly the ScriptHooks members
const _hookNamesPinnedToInterface: Equal<ScriptHookName, keyof ScriptHooks<unknown>> = true;
void _hookNamesPinnedToInterface;

export type GuiScriptHooks<TSelf> = ScriptHooks<TSelf>;

export type RenderScriptHooks<TSelf> = Omit<ScriptHooks<TSelf>, "on_input">;

export function defineScript<TSelf = Record<never, never>>(
  hooks: ScriptHooks<TSelf>,
): ScriptHooks<TSelf> {
  return hooks;
}

export function defineGuiScript<TSelf = Record<never, never>>(
  hooks: GuiScriptHooks<TSelf>,
): GuiScriptHooks<TSelf> {
  return hooks;
}

export function defineRenderScript<TSelf = Record<never, never>>(
  hooks: RenderScriptHooks<TSelf>,
): RenderScriptHooks<TSelf> {
  return hooks;
}
