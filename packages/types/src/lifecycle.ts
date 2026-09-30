import type { Hash, Url } from "./core-types";

// Fields and docs follow the go ref-doc's `on_input.touch` STRUCT, whose keys are
// the ones comp_script.cpp pushes; lifecycle-member-docs drift-guards the docs
// against it, and a ref-doc re-pin is reconciled by hand.
export interface InputTouch {
  /**
   * Identifier for the touch during its lifetime.
   */
  id?: number;
  /**
   * Whether the finger was pressed this frame.
   */
  pressed?: boolean;
  /**
   * Whether the finger was released this frame.
   */
  released?: boolean;
  /**
   * Number of taps, such as one for a single tap and two for a double tap.
   */
  tap_count?: number;
  /**
   * Touch x-coordinate.
   */
  x?: number;
  /**
   * Touch y-coordinate.
   */
  y?: number;
  /**
   * Change in the touch x-coordinate.
   */
  dx?: number;
  /**
   * Change in the touch y-coordinate.
   */
  dy?: number;
  /**
   * Touch x-coordinate in screen space.
   */
  screen_x?: number;
  /**
   * Touch y-coordinate in screen space.
   */
  screen_y?: number;
  /**
   * Change in the touch x-coordinate in screen space.
   */
  screen_dx?: number;
  /**
   * Change in the touch y-coordinate in screen space.
   */
  screen_dy?: number;
}

// Fields and docs follow the go ref-doc's `on_input.action` STRUCT, whose keys are
// the ones comp_script.cpp pushes; lifecycle-member-docs drift-guards the docs
// against it, and a ref-doc re-pin is reconciled by hand.
export interface InputAction {
  /**
   * Amount of input, usually 1 for buttons or between 0 and 1 for analogue input; absent for pointer movement and text input.
   */
  value?: number;
  /**
   * Whether the input was pressed this frame; absent for pointer movement and text input.
   */
  pressed?: boolean;
  /**
   * Whether the input was released this frame; absent for pointer movement and text input.
   */
  released?: boolean;
  /**
   * Whether the input was repeated this frame; absent for pointer movement and text input.
   */
  repeated?: boolean;
  /**
   * Pointer x-coordinate; absent for gamepad, key, and text input.
   */
  x?: number;
  /**
   * Pointer y-coordinate; absent for gamepad, key, and text input.
   */
  y?: number;
  /**
   * Pointer x-coordinate in screen space; absent for gamepad, key, and text input.
   */
  screen_x?: number;
  /**
   * Pointer y-coordinate in screen space; absent for gamepad, key, and text input.
   */
  screen_y?: number;
  /**
   * Change in the pointer x-coordinate; absent for gamepad, key, and text input.
   */
  dx?: number;
  /**
   * Change in the pointer y-coordinate; absent for gamepad, key, and text input.
   */
  dy?: number;
  /**
   * Change in the pointer x-coordinate in screen space; absent for gamepad, key, and text input.
   */
  screen_dx?: number;
  /**
   * Change in the pointer y-coordinate in screen space; absent for gamepad, key, and text input.
   */
  screen_dy?: number;
  /**
   * Accelerometer x value, when present.
   */
  acc_x?: number;
  /**
   * Accelerometer y value, when present.
   */
  acc_y?: number;
  /**
   * Accelerometer z value, when present.
   */
  acc_z?: number;
  /**
   * Index of the gamepad that provided the input.
   */
  gamepad?: number;
  /**
   * Id of the user associated with the controller.
   */
  userid?: number;
  /**
   * SDL-compatible guid, supplied with a gamepad-connected action.
   */
  gamepad_guid?: string;
  /**
   * Parsed guid information, supplied with a gamepad-connected action.
   */
  gamepad_guid_info?: {
    vendor: number;
    product: number;
    bus: number;
    crc: number;
    version: number;
  };
  /**
   * Whether the input originated from an unknown or unmapped gamepad.
   */
  gamepad_unknown?: boolean;
  /**
   * Name of a connected gamepad.
   */
  gamepad_name?: string;
  /**
   * Axis values, supplied only for raw gamepad input.
   */
  gamepad_axis?: number[];
  /**
   * Hat values, supplied only for raw gamepad input.
   */
  gamepad_hats?: number[];
  /**
   * Button values, supplied only for raw gamepad input.
   */
  gamepad_buttons?: number[];
  /**
   * Touch inputs, one entry per finger.
   */
  touch?: InputTouch[];
  /**
   * Text entered by a text action, or the current sequence for marked-text composition such as Japanese Kana.
   */
  text?: string;
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
  /**
   * This is a callback-function, which is called by the engine when a script component is initialized. It can be used
   * to set the initial state of the script.
   *
   * @example
   * ```ts
   * init() {
   *   return { hits: 0 };
   * },
   * ```
   */
  init?(): TInitState;
  /**
   * This is a callback-function, which is called by the engine every frame to update the state of a script component.
   * It can be used to perform any kind of game related tasks, e.g. moving the game object instance.
   *
   * @param self - reference to the script state to be used for storing data
   * @param dt - the time-step of the frame update
   * @example
   * ```ts
   * update(self, dt) {
   *   self.hits += 1;
   * },
   * ```
   */
  update?(self: NoInfer<TSelf>, dt: number): void;
  /**
   * This is a callback-function, which is called by the engine at fixed intervals to update the state of a script
   * component. The function will be called if 'Fixed Update Frequency' is enabled in the Engine section of game.project.
   * It can for instance be used to update game logic with the physics simulation if using a fixed timestep for the
   * physics (enabled by ticking 'Use Fixed Timestep' in the Physics section of game.project).
   *
   * @param self - reference to the script state to be used for storing data
   * @param dt - the time-step of the frame update
   * @example
   * ```ts
   * fixed_update(self, dt) {
   *   self.vel.y -= 9.8 * dt;
   * },
   * ```
   */
  fixed_update?(self: NoInfer<TSelf>, dt: number): void;
  /**
   * This is a callback-function, which is called by the engine at the end of the frame to update the state of a script
   * component. Use it to make final adjustments to the game object instance.
   *
   * @param self - reference to the script state to be used for storing data
   * @param dt - the time-step of the frame update
   * @example
   * ```ts
   * late_update(self, dt) {
   *   self.camera = self.target;
   * },
   * ```
   */
  late_update?(self: NoInfer<TSelf>, dt: number): void;
  // Defold delivers message_id as a pre-hashed `hash`, so handlers must compare
  // it against `hash("...")` constants — a string literal never matches. Sender-
  // side payload narrowing by message id lives on `msg.post` (msg-overloads.d.ts).
  /**
   * This is a callback-function, which is called by the engine whenever a message has been sent to the script component.
   * It can be used to take action on the message, e.g. send a response back to the sender of the message.
   * The `message` parameter is a table containing the message data. If the message is sent from the engine, the
   * documentation of the message specifies which data is supplied.
   *
   * @param self - reference to the script state to be used for storing data
   * @param message_id - id of the received message
   * @param message - a table containing the message data
   * @param sender - address of the sender
   * @example
   * ```ts
   * on_message(self, message_id, message, sender) {
   *   if (message_id === hash("hit")) self.hits += 1;
   * },
   * ```
   */
  on_message?(
    self: NoInfer<TSelf>,
    message_id: Hash,
    message: Record<string | number, unknown>,
    sender: Url,
  ): void;
  /**
   * This is a callback-function, which is called by the engine when user input is sent to the game object instance of the script.
   * It can be used to take action on the input, e.g. move the instance according to the input.
   * For an instance to obtain user input, it must first acquire input focus
   * through the message `acquire_input_focus`.
   * Any instance that has obtained input will be put on top of an
   * input stack. Input is sent to all listeners on the stack until the
   * end of stack is reached, or a listener returns `true`
   * to signal that it wants input to be consumed.
   * See the documentation of acquire_input_focus for more
   * information.
   *
   * @param self - reference to the script state to be used for storing data
   * @param action_id - id of the received input action, as mapped in the input_binding-file
   * @param action - a table containing the input data; `InputAction` documents its fields
   * @example
   * ```ts
   * on_input(self, action_id, action) {
   *   if (action_id === hash("left") && action.pressed) self.dir = -1;
   *   return false;
   * },
   * ```
   */
  on_input?(
    self: NoInfer<TSelf>,
    action_id: Hash | undefined,
    action: InputAction,
    // biome-ignore lint/suspicious/noConfusingVoidType: Defold lets handlers omit the return; `void` is the right shape for "may return boolean or nothing".
  ): boolean | void;
  /**
   * This is a callback-function, which is called by the engine when a script component is finalized (destroyed). It can
   * be used to e.g. take some last action, report the finalization to other game object instances, delete spawned objects
   * or release user input focus (see release_input_focus).
   *
   * @param self - reference to the script state to be used for storing data
   * @example
   * ```ts
   * final(self) {
   *   msg.post("#", "done");
   * },
   * ```
   */
  final?(self: NoInfer<TSelf>): void;
  /**
   * This is a callback-function, which is called by the engine when the script component is reloaded, e.g. from the editor.
   * It can be used for live development, e.g. to tweak constants or set up the state properly for the instance.
   *
   * @param self - reference to the script state to be used for storing data
   * @example
   * ```ts
   * on_reload(self) {
   *   self.speed = 200;
   * },
   * ```
   */
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

export type GuiScriptHooks<TSelf, TInitState = TSelf> = Omit<
  ScriptHooks<TSelf, TInitState>,
  "fixed_update" | "late_update"
>;

export type RenderScriptHooks<TSelf, TInitState = TSelf> = Omit<
  ScriptHooks<TSelf, TInitState>,
  "on_input"
>;

// The factory hook table plus the value-keyed `properties` field. `TProps` is
// the property channel (raw default values), `TSelf` the merged `self` the
// callbacks see (`NoInfer`-wrapped inside the hook set), and `TInitState` what
// `init` returns. `ScriptHooks` itself stays callback-only so the
// `SCRIPT_HOOK_NAMES` drift pin remains valid.
//
// `init` is overridden to receive `self: NoInfer<TProps>` — Defold applies the
// declared property values to `self` before `init` runs, so init-time setup can
// read them. `self` is *only* the property channel (`TProps`), not the merged
// `TSelf`: the return is still the sole `TInitState` inference site, and
// `NoInfer<TProps>` keeps `self` from competing with `properties` as a second
// `TProps` inference site (the non-circularity the no-`self` `init` originally
// bought).
export type ScriptHooksWithProperties<TProps, TSelf, TInitState> = Omit<
  ScriptHooks<TSelf, TInitState>,
  "init"
> & {
  /**
   * Receives `self` pre-populated with the declared `properties` before the
   * engine runs init, so init-time setup can read those default values. The
   * returned object still seeds the inferred script state.
   */
  init?(self: NoInfer<TProps>): TInitState;
  /**
   * Value-keyed editor properties: each key is a property name and its value
   * the default, so the value's type threads onto `self` alongside init's
   * returned state.
   */
  properties?: TProps;
};

export type GuiScriptHooksWithProperties<TProps, TSelf, TInitState> = Omit<
  GuiScriptHooks<TSelf, TInitState>,
  "init"
> & {
  /**
   * Receives `self` pre-populated with the declared `properties` before the
   * engine runs init, so init-time setup can read those default values. The
   * returned object still seeds the inferred script state.
   */
  init?(self: NoInfer<TProps>): TInitState;
  /**
   * Value-keyed editor properties: each key is a property name and its value
   * the default, so the value's type threads onto `self` alongside init's
   * returned state.
   */
  properties?: TProps;
};

export type RenderScriptHooksWithProperties<TProps, TSelf, TInitState> = Omit<
  RenderScriptHooks<TSelf, TInitState>,
  "init"
> & {
  /**
   * Receives `self` pre-populated with the declared `properties` before the
   * engine runs init, so init-time setup can read those default values. The
   * returned object still seeds the inferred script state.
   */
  init?(self: NoInfer<TProps>): TInitState;
  /**
   * Value-keyed editor properties: each key is a property name and its value
   * the default, so the value's type threads onto `self` alongside init's
   * returned state.
   */
  properties?: TProps;
};

// The script-local message map an `onMessage` dispatcher carries, lifted onto
// the factory result so `ScriptMessages<typeof script>` can read it. Matched
// structurally so this module stays usable through its own `./lifecycle`
// subpath, where the ambient `MessageDispatcher` is not declared.
export type ScriptMessageChannel<TMessages> = {
  on_message?: { readonly __messages?: TMessages };
};

/**
 * Extract a script module's declared property channel (`TProps`) as a nameable
 * type. A script declares its editor properties with the value-keyed
 * `properties` field of `defineScript`; another module reads that shape with
 * `ScriptPropertiesOf<typeof script>` and names it as the `P` generic of
 * `go.get`/`go.set` to read or tune those properties cross-script by URL (e.g.
 * `go.get<ScriptPropertiesOf<typeof enemy>>()("/enemy#controller", "speed")`).
 *
 * It keeps one source of truth: the extracted shape is the same `TProps` the
 * owning script's `self` exposes, so there is no second hand-maintained
 * interface to drift.
 */
export type ScriptPropertiesOf<T extends { properties?: object }> = NonNullable<T["properties"]>;

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
 * Scaffold it with the `def-ts-defineScript-inferred-self` / `def-ts-defineScript-typed-self` VSCode snippets
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
export function defineScript<
  TProps extends object = Record<never, never>,
  TInitState = TProps,
  TMessages extends object = Record<never, never>,
>(
  hooks: ScriptHooksWithProperties<TProps, TProps & TInitState, TInitState> &
    ScriptMessageChannel<TMessages>,
): ScriptHooksWithProperties<TProps, TProps & TInitState, TInitState> &
  ScriptMessageChannel<TMessages> {
  return hooks;
}

/**
 * Type a `.gui_script` component's hook table. Like {@link defineScript} it is
 * an identity function at runtime, infers `TSelf` from `init`'s return by
 * default, accepts the same value-keyed `properties` field as
 * {@link defineScript}, and is erased by the transpiler's `lifecycle-erasure`
 * pass into the flat Defold chunk shape.
 *
 * `GuiScriptHooks` is `Omit<ScriptHooks, "fixed_update" | "late_update">` — gui
 * scripts are not driven by the fixed-timestep or late-update passes. It accepts
 * the rest, all optional: `init`, `update`, `on_message`, `on_input`, `final`,
 * `on_reload`.
 *
 * Scaffold it with the `def-ts-defineGuiScript-inferred-self` / `def-ts-defineGuiScript-typed-self` VSCode snippets from
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
export function defineGuiScript<
  TProps extends object = Record<never, never>,
  TInitState = TProps,
  TMessages extends object = Record<never, never>,
>(
  hooks: GuiScriptHooksWithProperties<TProps, TProps & TInitState, TInitState> &
    ScriptMessageChannel<TMessages>,
): GuiScriptHooksWithProperties<TProps, TProps & TInitState, TInitState> &
  ScriptMessageChannel<TMessages> {
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
 * Scaffold it with the `def-ts-defineRenderScript-inferred-self` / `def-ts-defineRenderScript-typed-self` VSCode snippets
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
  TMessages extends object = Record<never, never>,
>(
  hooks: RenderScriptHooksWithProperties<TProps, TProps & TInitState, TInitState> &
    ScriptMessageChannel<TMessages>,
): RenderScriptHooksWithProperties<TProps, TProps & TInitState, TInitState> &
  ScriptMessageChannel<TMessages> {
  return hooks;
}
