/** @noSelfInFile **/

/**
 * The base class of a GUI object: a part of a scene with its own hidden root box node, its
 * own child objects, and the props and settings it is created with. A game subclasses it
 * with `extend`, assigns hooks to the subclass, and creates instances with a scene's or
 * another object's `new_object`.
 * @see {@link https://github.com/baochungit/defold-wrap|Github Source}
 * @noResolution
 */
declare module 'wrap.gui_object' {
  import type { GuiScene } from 'wrap.gui_scene';
  import type { Node } from 'wrap.node';

  /**
   * Any class `extend` returns, whatever its props, settings and fields.
   * @internal
   */
  export type AnyGuiObjectClass = GuiObjectClass<object, object, object>;

  /**
   * `unknown` when `{}`, the value `setup` puts in place of omitted props or settings,
   * fits `T`, else `never`.
   * @internal
   */
  export type Omittable<T> = {} extends T ? unknown : never;

  /**
   * The keys upstream reads to tell a class from a plain table, and copies over the `new`
   * and `__index` of the `extend()` a plain table is adapted onto.
   * @internal
   */
  export type NoClassKeys = { __name?: never; __index?: never; 'new'?: never };

  /**
   * `undefined` when `{}`, the value `setup` puts in place of omitted props or settings,
   * fits `T`, else `never`.
   * @internal
   */
  export type Defaulted<T> = {} extends T ? undefined : never;

  /**
   * A GUI object, created by `new_object` with props `P` and settings `S`. Its hooks are
   * no-ops a subclass replaces, and its `bg_*` drivers run them and its child objects'.
   */
  export interface GuiObject<P extends object = {}, S extends object = {}> {
    /** The scene the object was created in, set by `setup`. */
    scene: GuiScene;

    /**
     * The object's root, a box node `setup` creates hidden under its scene's root. Every
     * node the `new_*` methods create is its child.
     */
    root: Node;

    /** The props the object was created with, or `{}` when it was given none. */
    props: P;

    /** The settings the object was created with, or `{}` when it was given none. */
    settings: S;

    /**
     * Sets the object up in a scene and runs `init`. `new_object` calls it on each new
     * instance; a game does not.
     * @param scene The scene the object belongs to, under whose root `root` is created.
     * @param props The object's props. Defaults to `{}`.
     * @param settings The object's settings. Defaults to `{}`.
     */
    setup(scene: GuiScene, props?: P, settings?: S): void;

    /**
     * Returns whether the object is set up and not deleted: `nil` until `setup` has run
     * `init`, so also during `init`, then `true` until `delete` makes it `false`.
     */
    is_alive(): boolean | undefined;

    /**
     * Creates a box node under the object's root, from `wrap.node.Node.new_box`.
     * @param position The node's position.
     * @param size The node's size.
     */
    new_box(position?: Vector3 | Vector4, size?: Vector3): Node;

    /**
     * Creates a text node under the object's root, from `wrap.node.Node.new_text`.
     * @param position The node's position.
     * @param text The node's text.
     */
    new_text(position?: Vector3 | Vector4, text?: string): Node;

    /**
     * Creates a pie node under the object's root, from `wrap.node.Node.new_pie`.
     * @param position The node's position.
     * @param size The node's size.
     */
    new_pie(position?: Vector3 | Vector4, size?: Vector3): Node;

    /**
     * Creates a particle fx node under the object's root, from `wrap.node.Node.new_particlefx`.
     * @param position The node's position.
     * @param particlefx The particle fx resource name.
     */
    new_particlefx(position: Vector3 | Vector4 | undefined, particlefx: Hash | string): Node;

    /**
     * Creates a child object in the object's scene: calls the class's `new`, sets the
     * instance up with `setup`, which runs its `init`, and adds it to the objects
     * `bg_update`, `delete` and `bg_on_input` fan out to.
     * @param object_class A class `extend` returns, whose props and settings may both be
     * omitted.
     * @param props The child's props. Defaults to `{}`.
     * @param settings The child's settings. Defaults to `{}`.
     */
    new_object<C extends AnyGuiObjectClass>(
      object_class: C & Omittable<C['props']> & Omittable<C['settings']>,
      props?: C['props'],
      settings?: C['settings'],
    ): ReturnType<C['new']>;
    /**
     * Creates a child object whose class needs props, as the first form does.
     * @param object_class A class `extend` returns, whose settings may be omitted.
     * @param props The child's props.
     * @param settings The child's settings. Defaults to `{}`.
     */
    new_object<C extends AnyGuiObjectClass>(
      object_class: C & Omittable<C['settings']>,
      props: C['props'],
      settings?: C['settings'],
    ): ReturnType<C['new']>;
    /**
     * Creates a child object whose class needs settings, as the first form does.
     * @param object_class A class `extend` returns.
     * @param props The child's props, or `undefined` for `{}` when the class allows it.
     * @param settings The child's settings.
     */
    new_object<C extends AnyGuiObjectClass>(
      object_class: C,
      props: C['props'] | Defaulted<C['props']>,
      settings: C['settings'],
    ): ReturnType<C['new']>;

    /** Runs once `setup` has created `root`, from `new_object`. A no-op to replace. */
    init(): void;

    /**
     * Runs each frame from `bg_update` while the object is alive. A no-op to replace.
     * @param dt The time since the last frame, in seconds.
     */
    update(dt: number): void;

    /**
     * Runs once from `delete`, before the child objects and `root` are deleted. A no-op to
     * replace.
     */
    final(): void;

    /**
     * Runs from `bg_on_input` when no child object consumed the input. A no-op to replace.
     * @param action_id The input action's id, or `nil` for mouse movement.
     * @param action The input data.
     * @returns `true` to consume the input. The no-op returns `false`.
     */
    on_input(action_id: Hash | undefined, action: go.on_input.Action): boolean;

    /**
     * Runs `update`, then each child object's `update`, unless the object is not alive.
     * The scene calls it each frame. At this tag it calls a child's `update` rather than
     * its `bg_update`, so a child's own children are not updated.
     * @param dt The time since the last frame, in seconds.
     */
    bg_update(dt: number): void;

    /**
     * Deletes the object, unless it is not alive: marks it deleted, runs `final`, deletes
     * each child object, then deletes `root` and the nodes under it.
     */
    delete(): void;

    /**
     * Offers input to each child object's `bg_on_input`, the newest first, then to
     * `on_input` if none consumed it. Returns `false` when the object is not alive.
     * @param action_id The input action's id, or `nil` for mouse movement.
     * @param action The input data.
     * @returns Whether a child object or `on_input` consumed the input.
     */
    bg_on_input(action_id: Hash | undefined, action: go.on_input.Action): boolean;
  }

  /**
   * A subclass `extend` returns. The class table is itself a `GuiObject` indexing the base
   * class, so a hook assigned to it, `Button.init = function () { ... }`, sees an instance
   * as `this`, and `new_object` calls its `new` for each instance.
   */
  export type GuiObjectClass<
    P extends object = {},
    S extends object = {},
    F extends object = {},
  > = GuiObject<P, S> &
    F & {
      /** Returns a new, not yet set up instance of the class. */
      'new'(this: void): GuiObject<P, S> & F;
    };

  /**
   * A plain table of GUI object hooks and fields, which `register_modal` copies onto a
   * fresh `extend()`. Each hook sees the object, with the table's own fields, as `this`.
   * The table may not set `__name`, `new` or `__index`.
   */
  export type GuiObjectHooks<F extends object = {}> = Partial<GuiObject> &
    F &
    NoClassKeys &
    ThisType<GuiObject & F>;

  /** The class name, the value `register_modal` reads to tell a class from a plain table. */
  export const __name: 'GuiObject';

  /** Returns a new, not yet set up instance of the base class. */
  function new_(): GuiObject;
  export { new_ as new };

  /**
   * Returns a new subclass: a table indexing the base class, with its own `new`. Assign
   * hooks such as `init` and `update` to it, and pass it to `new_object`. `P` and `S` type
   * the props and settings its instances are created with, and `F` the fields and methods
   * a game adds to it.
   */
  export function extend<
    P extends object = {},
    S extends object = {},
    F extends object = {},
  >(): GuiObjectClass<P, S, F>;
}
