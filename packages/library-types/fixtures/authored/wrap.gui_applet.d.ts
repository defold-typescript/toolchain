/** @noSelfInFile **/

/**
 * A GUI applet: a node that shows one scene at a time, playing the old scene's transition
 * out while the new one transitions in. A GUI script creates it with `new`, and calls its
 * `update`, `final`, `on_message` and `on_input` from its own, which drive the scenes.
 * @see {@link https://github.com/baochungit/defold-wrap|Github Source}
 * @noResolution
 */
declare module 'wrap.gui_applet' {
  import type { GuiSceneClass, GuiSceneHooks } from 'wrap.gui_scene';
  import type { Node } from 'wrap.node';

  /** A GUI applet, created by `new`. */
  export interface GuiApplet {
    /** The wrapped node the applet was created on. Each scene's root is created under it. */
    root: Node;

    /**
     * Registers a scene class under a name, for `show_scene` to show.
     * @param name The name `show_scene` takes.
     * @param scene A class `wrap.gui_scene.extend` returns.
     */
    register_scene(name: string, scene: GuiSceneClass<object>): void;
    /**
     * Registers a scene built from a plain table of hooks and fields, whose keys are copied
     * onto a fresh `wrap.gui_scene.extend()` once, at registration.
     * @param name The name `show_scene` takes.
     * @param scene The hooks and fields, each hook seeing the scene as `this`.
     */
    register_scene<F extends object = {}>(name: string, scene: GuiSceneHooks<F>): void;

    /**
     * Removes the scene registered under a name.
     * @param name The name it was registered under.
     */
    unregister_scene(name: string): void;

    /**
     * Shows a new scene of a class, or of the class registered under a name: sets it up
     * with `setup`, which runs its `init`, starts its transition in, and starts the
     * transition out of the scene it replaces. Does nothing when no scene is registered
     * under the name.
     * @param name_or_scene The name the scene was registered under, or a class
     * `wrap.gui_scene.extend` returns.
     */
    show_scene(name_or_scene: string | GuiSceneClass<object>): void;
    /**
     * Shows a scene built from a plain table of hooks and fields, as the first form does.
     * The keys are copied onto a fresh `wrap.gui_scene.extend()`, which is the scene shown.
     * @param name_or_scene The hooks and fields, each hook seeing the scene as `this`.
     */
    show_scene<F extends object = {}>(name_or_scene: GuiSceneHooks<F>): void;

    /** Returns the size of the applet's root node, from `wrap.node.Node.get_size`. */
    get_size(): Vector3;

    /**
     * Runs `bg_update` on the scene transitioning out, if any, then on the current scene.
     * Call it from the GUI script's `update`.
     * @param dt The time since the last frame, in seconds.
     */
    update(dt: number): void;

    /**
     * Finalizes the current scene with `bg_final`. Call it from the GUI script's `final`.
     */
    final(): void;

    /**
     * Passes a message to the current scene's `bg_on_message`. Call it from the GUI
     * script's `on_message`.
     * @param message_id The message's id.
     * @param message The message's data.
     * @param sender The url of the message's sender.
     */
    on_message(message_id: Hash, message: Record<string | number, unknown>, sender: Url): void;

    /**
     * Passes input to the current scene's `bg_on_input`. Call it from the GUI script's
     * `on_input`, and return what it returns.
     * @param action_id The input action's id, or `nil` for mouse movement.
     * @param action The input data.
     * @returns Whether the scene consumed the input; `false` when no scene is shown.
     */
    on_input(action_id: Hash | undefined, action: go.on_input.Action): boolean;
  }

  /** The class name. */
  export const __name: 'GuiApplet';

  /**
   * Creates an applet on a node and, when given a scene class, shows a new scene of it.
   * @param root The node, or the id `gui.get_node` looks it up by.
   * @param scene A class `wrap.gui_scene.extend` returns.
   */
  function new_(root: string | Opaque<'node'>, scene?: GuiSceneClass<object>): GuiApplet;
  /**
   * Creates an applet on a node and shows a scene built from a plain table of hooks and
   * fields, copied onto a fresh `wrap.gui_scene.extend()`.
   * @param root The node, or the id `gui.get_node` looks it up by.
   * @param scene The hooks and fields, each hook seeing the scene as `this`.
   */
  function new_<F extends object = {}>(
    root: string | Opaque<'node'>,
    scene: GuiSceneHooks<F>,
  ): GuiApplet;
  export { new_ as new };
}
