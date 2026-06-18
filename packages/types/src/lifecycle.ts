import type { Hash, Url } from "./core-types";

// Field docs are hand-reconciled from the `on_input` description's "Touch input
// table:" prose (not structured ref-doc data); a future ref-doc re-pin is
// reconciled by hand, drift-guarded against that prose in lifecycle-member-docs.
export interface InputTouch {
  /**
   * A number identifying the touch input during its duration.
   */
  id?: number;
  /**
   * True if the finger was pressed this frame.
   */
  pressed?: boolean;
  /**
   * True if the finger was released this frame.
   */
  released?: boolean;
  /**
   * Number of taps, one for single, two for double-tap, etc
   */
  tap_count?: number;
  /**
   * The x touch location.
   */
  x?: number;
  /**
   * The y touch location.
   */
  y?: number;
  /**
   * The change in x value.
   */
  dx?: number;
  /**
   * The change in y value.
   */
  dy?: number;
  /**
   * Accelerometer x value (if present).
   */
  acc_x?: number;
  /**
   * Accelerometer y value (if present).
   */
  acc_y?: number;
  /**
   * Accelerometer z value (if present).
   */
  acc_z?: number;
}

// Field docs are hand-reconciled from the `on_input` description's main action
// and "Gamepad specific fields:" prose (not structured ref-doc data); a future
// ref-doc re-pin is reconciled by hand, drift-guarded against that prose in
// lifecycle-member-docs.
export interface InputAction {
  /**
   * The amount of input given by the user. This is usually 1 for buttons and 0-1 for analogue inputs. This is not present for mouse movement and text input.
   */
  value?: number;
  /**
   * If the input was pressed this frame. This is not present for mouse movement and text input.
   */
  pressed?: boolean;
  /**
   * If the input was released this frame. This is not present for mouse movement and text input.
   */
  released?: boolean;
  /**
   * If the input was repeated this frame. This is similar to how a key on a keyboard is repeated when you hold it down. This is not present for mouse movement and text input.
   */
  repeated?: boolean;
  /**
   * The x value of a pointer device, if present. This is not present for gamepad, key and text input.
   */
  x?: number;
  /**
   * The y value of a pointer device, if present. This is not present for gamepad, key and text input.
   */
  y?: number;
  /**
   * The screen space x value of a pointer device, if present. This is not present for gamepad, key and text input.
   */
  screen_x?: number;
  /**
   * The screen space y value of a pointer device, if present. This is not present for gamepad, key and text input.
   */
  screen_y?: number;
  /**
   * The change in x value of a pointer device, if present. This is not present for gamepad, key and text input.
   */
  dx?: number;
  /**
   * The change in y value of a pointer device, if present. This is not present for gamepad, key and text input.
   */
  dy?: number;
  /**
   * The change in screen space x value of a pointer device, if present. This is not present for gamepad, key and text input.
   */
  screen_dx?: number;
  /**
   * The change in screen space y value of a pointer device, if present. This is not present for gamepad, key and text input.
   */
  screen_dy?: number;
  /**
   * The index of the gamepad device that provided the input. See table below about gamepad input.
   */
  gamepad?: number;
  /**
   * Id of the user associated with the controller. Usually only relevant on consoles.
   */
  userid?: number;
  /**
   * True if the inout originated from an unknown/unmapped gamepad.
   */
  gamepad_unknown?: boolean;
  /**
   * Name of the gamepad
   */
  gamepad_name?: string;
  /**
   * List of gamepad axis values. For raw gamepad input only.
   */
  gamepad_axis?: number[];
  /**
   * List of gamepad hat values. For raw gamepad input only.
   */
  gamepadhats?: number[];
  /**
   * List of gamepad button values. For raw gamepad input only.
   */
  gamepad_buttons?: number[];
  /**
   * List of touch input, one element per finger, if present. See table below about touch input
   */
  touch?: InputTouch[];
  /**
   * Text input from a (virtual) keyboard or similar.
   */
  text?: string;
  /**
   * Sequence of entered symbols while entering a symbol combination, for example Japanese Kana.
   */
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
   * The `action` parameter is a table containing data about the input mapped to the
   * `action_id`.
   * For mapped actions it specifies the value of the input and if it was just pressed or released.
   * Actions are mapped to input in an input_binding-file.
   * Mouse movement is specifically handled and uses `nil` as its `action_id`.
   * The `action` only contains positional parameters in this case, such as x and y of the pointer.
   * Here is a brief description of the available table fields:
   *
   * Field
   * Description
   *
   * `value`
   * The amount of input given by the user. This is usually 1 for buttons and 0-1 for analogue inputs. This is not present for mouse movement and text input.
   *
   * `pressed`
   * If the input was pressed this frame. This is not present for mouse movement and text input.
   *
   * `released`
   * If the input was released this frame. This is not present for mouse movement and text input.
   *
   * `repeated`
   * If the input was repeated this frame. This is similar to how a key on a keyboard is repeated when you hold it down. This is not present for mouse movement and text input.
   *
   * `x`
   * The x value of a pointer device, if present. This is not present for gamepad, key and text input.
   *
   * `y`
   * The y value of a pointer device, if present. This is not present for gamepad, key and text input.
   *
   * `screen_x`
   * The screen space x value of a pointer device, if present. This is not present for gamepad, key and text input.
   *
   * `screen_y`
   * The screen space y value of a pointer device, if present. This is not present for gamepad, key and text input.
   *
   * `dx`
   * The change in x value of a pointer device, if present. This is not present for gamepad, key and text input.
   *
   * `dy`
   * The change in y value of a pointer device, if present. This is not present for gamepad, key and text input.
   *
   * `screen_dx`
   * The change in screen space x value of a pointer device, if present. This is not present for gamepad, key and text input.
   *
   * `screen_dy`
   * The change in screen space y value of a pointer device, if present. This is not present for gamepad, key and text input.
   *
   * `gamepad`
   * The index of the gamepad device that provided the input. See table below about gamepad input.
   *
   * `touch`
   * List of touch input, one element per finger, if present. See table below about touch input
   *
   * `text`
   * Text input from a (virtual) keyboard or similar.
   *
   * `marked_text`
   * Sequence of entered symbols while entering a symbol combination, for example Japanese Kana.
   *
   * Gamepad specific fields:
   *
   * Field
   * Description
   *
   * `gamepad`
   * The index of the gamepad device that provided the input.
   *
   * `userid`
   * Id of the user associated with the controller. Usually only relevant on consoles.
   *
   * `gamepad_unknown`
   * True if the inout originated from an unknown/unmapped gamepad.
   *
   * `gamepad_name`
   * Name of the gamepad
   *
   * `gamepad_axis`
   * List of gamepad axis values. For raw gamepad input only.
   *
   * `gamepadhats`
   * List of gamepad hat values. For raw gamepad input only.
   *
   * `gamepad_buttons`
   * List of gamepad button values. For raw gamepad input only.
   *
   * Touch input table:
   *
   * Field
   * Description
   *
   * `id`
   * A number identifying the touch input during its duration.
   *
   * `pressed`
   * True if the finger was pressed this frame.
   *
   * `released`
   * True if the finger was released this frame.
   *
   * `tap_count`
   * Number of taps, one for single, two for double-tap, etc
   *
   * `x`
   * The x touch location.
   *
   * `y`
   * The y touch location.
   *
   * `dx`
   * The change in x value.
   *
   * `dy`
   * The change in y value.
   *
   * `acc_x`
   * Accelerometer x value (if present).
   *
   * `acc_y`
   * Accelerometer y value (if present).
   *
   * `acc_z`
   * Accelerometer z value (if present).
   *
   * @param self - reference to the script state to be used for storing data
   * @param action_id - id of the received input action, as mapped in the input_binding-file
   * @param action - a table containing the input data, see above for a description
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
