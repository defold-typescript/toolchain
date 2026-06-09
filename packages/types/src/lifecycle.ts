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

/**
 * Phantom type carried by `go.property()` descriptors.
 *
 * @deprecated Declare properties with the value-keyed `properties` field inside
 * `defineScript({ properties })` — that form types them onto `self` directly and
 * needs no descriptor. The `go.property` escape hatch still returns this for
 * backward compatibility.
 */
export interface ScriptProperty<TValue> {
  readonly __defoldScriptProperty: TValue;
}

/**
 * @deprecated Use the value-keyed `properties` field of `defineScript`; the
 * descriptor-plus-`ScriptProperties` extraction is no longer needed.
 */
export type ScriptProperties<T extends Record<string, ScriptProperty<unknown>>> = {
  [K in keyof T]: T[K] extends ScriptProperty<infer TValue> ? TValue : never;
};

export interface ScriptHooks<TSelf, TInitState = TSelf> {
  // `init` returns the script's initial state; it is the sole site TypeScript
  // solves `TInitState` from. The engine owns `self` (a userdata-backed table),
  // so every other hook wraps it in `NoInfer<TSelf>` — otherwise their `self`
  // competes as a second inference site and `TSelf` collapses to `{}`.
  init?(): TInitState;
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
const _hookNamesPinnedToInterface: Equal<ScriptHookName, keyof ScriptHooks<unknown, unknown>> =
  true;
void _hookNamesPinnedToInterface;

export type GuiScriptHooks<TSelf, TInitState = TSelf> = ScriptHooks<TSelf, TInitState>;

export type RenderScriptHooks<TSelf, TInitState = TSelf> = Omit<
  ScriptHooks<TSelf, TInitState>,
  "on_input"
>;

// The factory hook table plus the value-keyed `properties` field. `TProps` is
// the property channel (raw default values), `TSelf` the merged `self` the
// callbacks see (`NoInfer`-wrapped inside the hook set), and `TInitState` what
// `init` returns. `ScriptHooks` itself stays callback-only so the
// `SCRIPT_HOOK_NAMES` drift pin remains valid.
export type ScriptHooksWithProperties<TProps, TSelf, TInitState> = ScriptHooks<
  TSelf,
  TInitState
> & {
  properties?: TProps;
};

export type GuiScriptHooksWithProperties<TProps, TSelf, TInitState> = GuiScriptHooks<
  TSelf,
  TInitState
> & {
  properties?: TProps;
};

export type RenderScriptHooksWithProperties<TProps, TSelf, TInitState> = RenderScriptHooks<
  TSelf,
  TInitState
> & {
  properties?: TProps;
};

/**
 * Type a `.script` component's hook table. At runtime this is an identity
 * function — it returns `hooks` unchanged; its only job is typing. It infers
 * `TSelf` from `init`'s return so every other hook's `self` is typed. Declare
 * editor properties with the value-keyed `properties` field — the key is the
 * property name and the value its default, so the value's type threads onto
 * `self` alongside `init`'s state. The transpiler's `lifecycle-erasure` pass
 * rewrites the top-level call into the flat `function init(self) … end` Defold
 * chunk shape and synthesizes the `go.property(...)` registrations — zero
 * runtime cost, nothing the engine sees changes.
 *
 * Accepts the full `ScriptHooks` set, all optional: `init`, `update`,
 * `fixed_update`, `late_update`, `on_message`, `on_input`, `final`,
 * `on_reload`.
 *
 * Scaffold it with the `defold-script` / `defold-script-typed` VSCode snippets
 * from `defold-typescript init`.
 *
 * @param hooks - the `.script` lifecycle hook table to type and return.
 * @returns the same `hooks` object, now typed (identity at runtime).
 * @example
 * ```ts
 * export default defineScript({
 *   init() {
 *     return { hits: 0 };
 *   },
 *   update(self, dt) {
 *     self.hits += 1;
 *   },
 * });
 * ```
 */
export function defineScript<TProps extends object = Record<never, never>, TInitState = TProps>(
  hooks: ScriptHooksWithProperties<TProps, TProps & TInitState, TInitState>,
): ScriptHooksWithProperties<TProps, TProps & TInitState, TInitState> {
  return hooks;
}

/**
 * Type a `.gui_script` component's hook table. Like {@link defineScript} it is
 * an identity function at runtime, infers `TSelf` from `init`'s return by
 * default, accepts the same value-keyed `properties` field as
 * {@link defineScript}, and is erased by the transpiler's `lifecycle-erasure`
 * pass into the flat Defold chunk shape.
 *
 * `GuiScriptHooks` is an alias of the `.script` hook set, so it accepts the same
 * full set, all optional: `init`, `update`, `fixed_update`, `late_update`,
 * `on_message`, `on_input`, `final`, `on_reload`.
 *
 * Scaffold it with the `defold-gui` / `defold-gui-typed` VSCode snippets from
 * `defold-typescript init`.
 *
 * @param hooks - the `.gui_script` lifecycle hook table to type and return.
 * @returns the same `hooks` object, now typed (identity at runtime).
 * @example
 * ```ts
 * export default defineGuiScript({
 *   init() {
 *     return { node: gui.get_node("score") };
 *   },
 *   on_input(self, action_id, action) {
 *     return false;
 *   },
 * });
 * ```
 */
export function defineGuiScript<TProps extends object = Record<never, never>, TInitState = TProps>(
  hooks: GuiScriptHooksWithProperties<TProps, TProps & TInitState, TInitState>,
): GuiScriptHooksWithProperties<TProps, TProps & TInitState, TInitState> {
  return hooks;
}

/**
 * Type a `.render_script` component's hook table. Like {@link defineScript} it
 * is an identity function at runtime, infers `TSelf` from `init`'s return by
 * default, accepts the same value-keyed `properties` field as
 * {@link defineScript}, and is erased by the transpiler's `lifecycle-erasure`
 * pass into the flat Defold chunk shape.
 *
 * `RenderScriptHooks` is `Omit<ScriptHooks, "on_input">` — render scripts do not
 * receive input. It accepts the rest of the set, all optional: `init`,
 * `update`, `fixed_update`, `late_update`, `on_message`, `final`, `on_reload`.
 *
 * Scaffold it with the `defold-render` / `defold-render-typed` VSCode snippets
 * from `defold-typescript init`.
 *
 * @param hooks - the `.render_script` lifecycle hook table to type and return.
 * @returns the same `hooks` object, now typed (identity at runtime).
 * @example
 * ```ts
 * export default defineRenderScript({
 *   init() {
 *     return { clear: vmath.vector4(0, 0, 0, 1) };
 *   },
 *   update(self, dt) {
 *     render.set_render_target(render.RENDER_TARGET_DEFAULT);
 *   },
 * });
 * ```
 */
export function defineRenderScript<
  TProps extends object = Record<never, never>,
  TInitState = TProps,
>(
  hooks: RenderScriptHooksWithProperties<TProps, TProps & TInitState, TInitState>,
): RenderScriptHooksWithProperties<TProps, TProps & TInitState, TInitState> {
  return hooks;
}
