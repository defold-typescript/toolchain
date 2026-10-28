/** @noSelfInFile **/

/**
 * The base class of a GUI scene: one screen of an applet, with its own hidden root box
 * node, the GUI objects created in it, the modals registered on it, and the transitions it
 * plays when it is shown and replaced. A game subclasses it with `extend`, assigns hooks
 * to the subclass, and hands it to an applet's `register_scene` or `show_scene`.
 * @see {@link https://github.com/baochungit/defold-wrap|Github Source}
 * @noResolution
 */
declare module 'wrap.gui_scene' {
  import type { GuiApplet } from 'wrap.gui_applet';
  import type {
    AnyGuiObjectClass,
    Defaulted,
    GuiObject,
    GuiObjectHooks,
    Omittable,
  } from 'wrap.gui_object';
  import type { Node } from 'wrap.node';

  /**
   * A transition `set_transitions` takes, as the `fade_*` and `slide_*` methods return it:
   * it starts animating the scene's root and calls `on_done` once the animation completes.
   */
  export type Transition = (this: void, on_done: (this: void) => void) => void;

  /** The transitions a scene plays when it is shown and when it is replaced. */
  export interface Transitions {
    /** Played by `transition_in` before the scene is ready. */
    transition_in?: Transition;
    /** Played by `transition_out` before the scene is finalized. */
    transition_out?: Transition;
  }

  /**
   * A GUI scene, created by its applet's `show_scene`. Its hooks are no-ops a subclass
   * replaces, and its `bg_*` drivers, which the applet calls, run them and its objects'.
   */
  export interface GuiScene {
    /** The applet showing the scene, set by `setup`. */
    app: GuiApplet;

    /**
     * The scene's root, a box node `setup` creates hidden under the applet's root. Every
     * object created in the scene has its own root under it, and the built-in transitions
     * animate it.
     */
    root: Node;

    /**
     * Registers a modal under a name, for `open_modal` to create.
     * @param name The name `open_modal` takes.
     * @param object_class A class `wrap.gui_object.extend` returns.
     * @param props Props `open_modal` starts from, before its own are copied over them.
     * @param settings Settings `open_modal` starts from, before its own are copied over
     * them.
     */
    register_modal<C extends AnyGuiObjectClass>(
      name: string,
      object_class: C,
      props?: Partial<C['props']>,
      settings?: Partial<C['settings']>,
    ): void;
    /**
     * Registers a modal built from a plain table of hooks and fields, whose keys are copied
     * onto a fresh `wrap.gui_object.extend()` once, at registration.
     * @param name The name `open_modal` takes.
     * @param object_class The hooks and fields, each hook seeing the object as `this`.
     * @param props Props `open_modal` starts from, before its own are copied over them.
     * @param settings Settings `open_modal` starts from, before its own are copied over
     * them.
     */
    register_modal<F extends object = {}>(
      name: string,
      object_class: GuiObjectHooks<F>,
      props?: object,
      settings?: object,
    ): void;

    /**
     * Removes the modal registered under a name.
     * @param name The name it was registered under.
     */
    unregister_modal(name: string): void;

    /**
     * Creates the modal registered under a name with `new_object`. Its props are a copy of
     * the registered props with the given ones copied over them, and its settings the same.
     * @param name The name it was registered under.
     * @param props Props copied over the registered ones.
     * @param settings Settings copied over the registered ones.
     * @returns The modal, or `nil` when no modal is registered under the name.
     */
    open_modal(name: string, props?: object, settings?: object): GuiObject | undefined;

    /**
     * Creates an object in the scene: calls the class's `new`, sets the instance up with
     * `setup`, which runs its `init`, and adds it to the objects `bg_update`, `bg_final`
     * and `bg_on_input` fan out to.
     * @param object_class A class `wrap.gui_object.extend` returns, whose props and settings may
     * both be omitted.
     * @param props The object's props. Defaults to `{}`.
     * @param settings The object's settings. Defaults to `{}`.
     */
    new_object<C extends AnyGuiObjectClass>(
      object_class: C & Omittable<C['props']> & Omittable<C['settings']>,
      props?: C['props'],
      settings?: C['settings'],
    ): ReturnType<C['new']>;
    /**
     * Creates an object whose class needs props, as the first form does.
     * @param object_class A class `wrap.gui_object.extend` returns, whose settings may be
     * omitted.
     * @param props The object's props.
     * @param settings The object's settings. Defaults to `{}`.
     */
    new_object<C extends AnyGuiObjectClass>(
      object_class: C & Omittable<C['settings']>,
      props: C['props'],
      settings?: C['settings'],
    ): ReturnType<C['new']>;
    /**
     * Creates an object whose class needs settings, as the first form does.
     * @param object_class A class `wrap.gui_object.extend` returns.
     * @param props The object's props, or `undefined` for `{}` when the class allows it.
     * @param settings The object's settings.
     */
    new_object<C extends AnyGuiObjectClass>(
      object_class: C,
      props: C['props'] | Defaulted<C['props']>,
      settings: C['settings'],
    ): ReturnType<C['new']>;

    /**
     * Sets the scene up in an applet and runs `init`. `show_scene` calls it on each scene
     * it shows; a game does not.
     * @param app The applet showing the scene, under whose root `root` is created.
     */
    setup(app: GuiApplet): void;

    /**
     * Returns whether the scene is set up and not finalized: `nil` until `setup` has run
     * `init`, so also during `init`, then `true` until `bg_final` makes it `false`.
     */
    is_alive(): boolean | undefined;

    /**
     * Returns whether the scene's transition in has finished and it is not yet
     * transitioning out, the only state in which it receives messages and input.
     */
    is_ready(): boolean;

    /**
     * Sets the transitions the scene plays, replacing any set before.
     * @param transitions The transitions. When omitted, the scene plays none.
     */
    set_transitions(transitions?: Transitions): void;

    /**
     * Plays the transition in, if one is set, then makes the scene ready and runs
     * `on_ready`. Does nothing unless the scene is newly set up. `show_scene` calls it.
     * @param callback Called once the scene is ready.
     */
    transition_in(callback?: () => void): void;

    /**
     * Resumes the transition in where it waits for its animation. The transition in calls
     * it when done; at this tag it resumes whatever state the scene is in.
     */
    set_transition_in_done(): void;

    /**
     * Plays the transition out, if one is set, then finalizes the scene with `bg_final`.
     * Does nothing unless the scene is ready. `show_scene` calls it on the scene it
     * replaces.
     * @param callback Called once the scene is finalized.
     */
    transition_out(callback?: () => void): void;

    /**
     * Resumes the transition out where it waits for its animation. The transition out
     * calls it when done; at this tag it resumes whatever state the scene is in.
     */
    set_transition_out_done(): void;

    /** Runs once the transition in has finished, from `transition_in`. A no-op to replace. */
    on_ready(): void;

    /** Runs once `setup` has created `root`, from `show_scene`. A no-op to replace. */
    init(): void;

    /**
     * Runs each frame from `bg_update` while the scene is alive. A no-op to replace.
     * @param dt The time since the last frame, in seconds.
     */
    update(dt: number): void;

    /** Runs once from `bg_final`, before the objects and `root` are deleted. A no-op to replace. */
    final(): void;

    /**
     * Runs from `bg_on_message` while the scene is ready. A no-op to replace.
     * @param message_id The message's id.
     * @param message The message's data.
     * @param sender The url of the message's sender.
     */
    on_message(message_id: Hash, message: Record<string | number, unknown>, sender: Url): void;

    /**
     * Runs from `bg_on_input` when no object consumed the input. A no-op to replace.
     * @param action_id The input action's id, or `nil` for mouse movement.
     * @param action The input data.
     * @returns `true` to consume the input. The no-op returns `false`.
     */
    on_input(action_id: Hash | undefined, action: go.on_input.Action): boolean;

    /**
     * Runs `update`, then each object's `bg_update`, unless the scene is not alive. The
     * applet's `update` calls it each frame, for the scene transitioning out too.
     * @param dt The time since the last frame, in seconds.
     */
    bg_update(dt: number): void;

    /**
     * Finalizes the scene, unless it is not alive: marks it finalized, runs `final`,
     * deletes each object, then deletes `root` and the nodes under it. The transition out
     * and the applet's `final` call it.
     */
    bg_final(): void;

    /**
     * Passes a message to `on_message` while the scene is ready. The applet's `on_message`
     * calls it.
     * @param message_id The message's id.
     * @param message The message's data.
     * @param sender The url of the message's sender.
     */
    bg_on_message(message_id: Hash, message: Record<string | number, unknown>, sender: Url): void;

    /**
     * Offers input to each object's `bg_on_input`, the newest first, then to `on_input` if
     * none consumed it. Returns `false` unless the scene is ready. The applet's `on_input`
     * calls it.
     * @param action_id The input action's id, or `nil` for mouse movement.
     * @param action The input data.
     * @returns Whether an object or `on_input` consumed the input.
     */
    bg_on_input(action_id: Hash | undefined, action: go.on_input.Action): boolean;

    /**
     * Returns a transition that sets the root's alpha to `0` and animates it to `1`.
     * @param time The duration in seconds. Defaults to `0.5`.
     * @param wait The delay in seconds before it starts. Defaults to `0`.
     * @param easing The easing. Defaults to `gui.EASING_LINEAR`.
     */
    fade_in(time?: number, wait?: number, easing?: gui.Easing | Vector): Transition;

    /**
     * Returns a transition that animates the root's alpha to `0`.
     * @param time The duration in seconds. Defaults to `0.5`.
     * @param wait The delay in seconds before it starts. Defaults to `0`.
     * @param easing The easing. Defaults to `gui.EASING_LINEAR`.
     */
    fade_out(time?: number, wait?: number, easing?: gui.Easing | Vector): Transition;

    /**
     * Returns a transition that moves the root up by the applet's height and animates it
     * down to `0`.
     * @param time The duration in seconds. Defaults to `0.5`.
     * @param wait The delay in seconds before it starts. Defaults to `0`.
     * @param easing The easing. Defaults to `gui.EASING_LINEAR`.
     */
    slide_in_top(time?: number, wait?: number, easing?: gui.Easing | Vector): Transition;

    /**
     * Returns a transition that moves the root down by the applet's height and animates it
     * up to `0`.
     * @param time The duration in seconds. Defaults to `0.5`.
     * @param wait The delay in seconds before it starts. Defaults to `0`.
     * @param easing The easing. Defaults to `gui.EASING_LINEAR`.
     */
    slide_in_bottom(time?: number, wait?: number, easing?: gui.Easing | Vector): Transition;

    /**
     * Returns a transition that moves the root right by the applet's width and animates it
     * left to `0`.
     * @param time The duration in seconds. Defaults to `0.5`.
     * @param wait The delay in seconds before it starts. Defaults to `0`.
     * @param easing The easing. Defaults to `gui.EASING_LINEAR`.
     */
    slide_in_right(time?: number, wait?: number, easing?: gui.Easing | Vector): Transition;

    /**
     * Returns a transition that moves the root left by the applet's width and animates it
     * right to `0`.
     * @param time The duration in seconds. Defaults to `0.5`.
     * @param wait The delay in seconds before it starts. Defaults to `0`.
     * @param easing The easing. Defaults to `gui.EASING_LINEAR`.
     */
    slide_in_left(time?: number, wait?: number, easing?: gui.Easing | Vector): Transition;

    /**
     * Returns a transition that animates the root up by the applet's height.
     * @param time The duration in seconds. Defaults to `0.5`.
     * @param wait The delay in seconds before it starts. Defaults to `0`.
     * @param easing The easing. Defaults to `gui.EASING_LINEAR`.
     */
    slide_out_top(time?: number, wait?: number, easing?: gui.Easing | Vector): Transition;

    /**
     * Returns a transition that animates the root down by the applet's height.
     * @param time The duration in seconds. Defaults to `0.5`.
     * @param wait The delay in seconds before it starts. Defaults to `0`.
     * @param easing The easing. Defaults to `gui.EASING_LINEAR`.
     */
    slide_out_bottom(time?: number, wait?: number, easing?: gui.Easing | Vector): Transition;

    /**
     * Returns a transition that animates the root right by the applet's width.
     * @param time The duration in seconds. Defaults to `0.5`.
     * @param wait The delay in seconds before it starts. Defaults to `0`.
     * @param easing The easing. Defaults to `gui.EASING_LINEAR`.
     */
    slide_out_right(time?: number, wait?: number, easing?: gui.Easing | Vector): Transition;

    /**
     * Returns a transition that animates the root left by the applet's width.
     * @param time The duration in seconds. Defaults to `0.5`.
     * @param wait The delay in seconds before it starts. Defaults to `0`.
     * @param easing The easing. Defaults to `gui.EASING_LINEAR`.
     */
    slide_out_left(time?: number, wait?: number, easing?: gui.Easing | Vector): Transition;
  }

  /**
   * A subclass `extend` returns. The class table is itself a `GuiScene` indexing the base
   * class, so a hook assigned to it, `Lobby.init = function () { ... }`, sees the scene as
   * `this`, and `show_scene` calls its `new` each time it shows it.
   */
  export type GuiSceneClass<F extends object = {}> = GuiScene &
    F & {
      /** Returns a new, not yet set up scene of the class. */
      'new'(this: void): GuiScene & F;
    };

  /**
   * A plain table of scene hooks and fields, which `register_scene` and `show_scene` copy
   * onto a fresh `extend()`. Each hook sees the scene, with the table's own fields, as
   * `this`.
   */
  export type GuiSceneHooks<F extends object = {}> = Partial<GuiScene> &
    F &
    ThisType<GuiScene & F>;

  /**
   * The class name, the value `register_scene` and `show_scene` read to tell a class from
   * a plain table.
   */
  export const __name: 'GuiScene';

  /** Returns a new, not yet set up scene of the base class. */
  function new_(): GuiScene;
  export { new_ as new };

  /**
   * Returns a new subclass: a table indexing the base class, with its own `new`. Assign
   * hooks such as `init` and `on_ready` to it, and pass it to an applet. `F` types the
   * fields and methods a game adds to it.
   */
  export function extend<F extends object = {}>(): GuiSceneClass<F>;
}
