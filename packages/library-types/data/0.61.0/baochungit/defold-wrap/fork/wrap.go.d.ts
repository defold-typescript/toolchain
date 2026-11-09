/** @noSelfInFile **/

/**
 * A chainable wrapper around a game object. `new` stores a url, and each method calls the
 * `go.*` function of the same name with that url: setters return the wrapper, so calls
 * chain, and getters return what the engine does.
 * @see {@link https://github.com/baochungit/defold-wrap|Github Source}
 * @noResolution
 */
declare module 'wrap.go' {
  /** A value `animate` moves a property to. */
  export type AnimatedValue = number | Vector3 | Vector4 | Quaternion;

  /** A value of a property `go.Properties` does not catalog, as `go.get` and `go.set` type it. */
  export type PropertyValue =
    | number
    | boolean
    | string
    | Hash
    | Url
    | Vector3
    | Vector4
    | Quaternion
    | Matrix4
    | Vector4[];

  /** A wrapped game object. Every method that sets something returns the wrapper, so calls chain. */
  export interface Go {
    /** The game object's url, passed to every `go.*` call. */
    readonly url: SceneGameObjectAddress | Hash | Url;

    /**
     * Returns a property of the game object, from `go.get`.
     * @param property The property.
     * @param options An `index`, `key` or `keys` into the property. Defaults to `{}`.
     */
    get<K extends keyof go.Properties>(
      property: K,
      options?: go.GoPropertyOptions,
    ): go.Properties[K];
    /**
     * Returns a property of the game object, from `go.get`.
     * @param property The property.
     * @param options An `index`, `key` or `keys` into the property. Defaults to `{}`.
     */
    get(property: string | Hash, options?: go.GoPropertyOptions): PropertyValue;

    /**
     * Sets a property of the game object with `go.set`.
     * @param property The property.
     * @param value The value.
     * @param options An `index`, `key` or `keys` into the property. Defaults to `{}`.
     */
    set<K extends keyof go.Properties>(
      property: K,
      value: go.Properties[K],
      options?: go.GoPropertyOptions,
    ): Go;
    /**
     * Sets a property of the game object with `go.set`.
     * @param property The property.
     * @param value The value.
     * @param options An `index`, `key` or `keys` into the property. Defaults to `{}`.
     */
    set(property: string | Hash, value: PropertyValue, options?: go.GoPropertyOptions): Go;

    /**
     * Posts a message to the game object with `msg.post`.
     * @param message_id The message id.
     * @param message The message payload. Defaults to an empty table.
     */
    post<K extends MessageId | Hash | (string & {})>(
      message_id: K,
      message?: MessagePayload<K>,
    ): Go;

    /**
     * Returns the game object's id, from `go.get_id`. `go.get_id` takes a path string, so
     * call it only on a wrapper built from one.
     */
    get_id(): Hash;

    /**
     * Deletes the game object with `go.delete`. At `1.1.0` the deletion is always
     * recursive: upstream reads `recursive or true`, so `false` still deletes the children.
     * @param recursive Whether to delete the children as well.
     */
    delete(recursive?: boolean): Go;

    /**
     * Animates one property with `go.animate`.
     * @param property The property to animate.
     * @param playback The playback mode.
     * @param to The value to animate it to.
     * @param easing An easing constant, or a vector of easing samples.
     * @param duration The duration in seconds.
     * @param delay The delay in seconds before the animation starts. Defaults to `0`.
     * @param complete_function Called once the animation completes.
     */
    animate(
      property: string | Hash,
      playback: go.Playback,
      to: AnimatedValue,
      easing: go.Easing | Vector,
      duration: number,
      delay?: number,
      complete_function?: (self: unknown, url: Url, property: Hash) => void,
    ): Go;
    /**
     * Animates several properties with `go.animate`, each to the value at the same index
     * of `to`, all with the same playback, easing, duration and delay.
     * @param property The properties to animate.
     * @param playback The playback mode.
     * @param to The value to animate each property to, by index.
     * @param easing An easing constant, or a vector of easing samples.
     * @param duration The duration in seconds.
     * @param delay The delay in seconds before the animations start. Defaults to `0`.
     * @param complete_function Called once the first property's animation completes.
     */
    animate(
      property: readonly (string | Hash)[],
      playback: go.Playback,
      to: readonly AnimatedValue[],
      easing: go.Easing | Vector,
      duration: number,
      delay?: number,
      complete_function?: (self: unknown, url: Url, property: Hash) => void,
    ): Go;

    /**
     * Cancels the game object's animations with `go.cancel_animations`.
     * @param property The property, or the properties, whose animations to cancel. When
     * omitted, every animation of the game object is canceled.
     */
    cancel_animations(property?: string | Hash | readonly (string | Hash)[]): Go;

    /**
     * Sets the game object's position with `go.set_position`.
     * @param position The position.
     */
    set_position(position: Vector3): Go;

    /** Returns the game object's position, from `go.get_position`. */
    get_position(): Vector3;

    /**
     * Meant to add to each component of the position. At `1.1.0` it adds to a copy of the
     * position and leaves the game object unchanged; `add_position_x`, `add_position_y`
     * and `add_position_z` write the result.
     * @param value The amount to add to each component.
     */
    add_position(value: Vector3): Go;

    /** Returns the x component of the game object's position. */
    get_position_x(): number;

    /** Returns the y component of the game object's position. */
    get_position_y(): number;

    /** Returns the z component of the game object's position. */
    get_position_z(): number;

    /**
     * Sets the x component of the game object's position.
     * @param x The x component.
     */
    set_position_x(x: number): Go;

    /**
     * Sets the y component of the game object's position.
     * @param y The y component.
     */
    set_position_y(y: number): Go;

    /**
     * Sets the z component of the game object's position.
     * @param z The z component.
     */
    set_position_z(z: number): Go;

    /**
     * Adds to the x component of the game object's position.
     * @param x The amount to add.
     */
    add_position_x(x: number): Go;

    /**
     * Adds to the y component of the game object's position.
     * @param y The amount to add.
     */
    add_position_y(y: number): Go;

    /**
     * Adds to the z component of the game object's position.
     * @param z The amount to add.
     */
    add_position_z(z: number): Go;

    /** Returns the game object's rotation, from `go.get_rotation`. */
    get_rotation(): Quaternion;

    /**
     * Sets the game object's rotation with `go.set_rotation`.
     * @param rotation The rotation.
     */
    set_rotation(rotation: Quaternion): Go;

    /**
     * Meant to add to the x, y and z components of the rotation quaternion. At `1.1.0` it
     * adds to a copy of the rotation and leaves the game object unchanged.
     * @param value The amount to add to the x, y and z components.
     */
    add_rotation(value: Quaternion): Go;

    /** Returns the x component of the rotation quaternion, not an Euler angle. */
    get_rotation_x(): number;

    /** Returns the y component of the rotation quaternion, not an Euler angle. */
    get_rotation_y(): number;

    /** Returns the z component of the rotation quaternion, not an Euler angle. */
    get_rotation_z(): number;

    /**
     * Sets the x component of the rotation quaternion, not an Euler angle, and leaves the
     * other components as they are.
     * @param x The quaternion's x component.
     */
    set_rotation_x(x: number): Go;

    /**
     * Sets the y component of the rotation quaternion, not an Euler angle, and leaves the
     * other components as they are.
     * @param y The quaternion's y component.
     */
    set_rotation_y(y: number): Go;

    /**
     * Sets the z component of the rotation quaternion, not an Euler angle, and leaves the
     * other components as they are.
     * @param z The quaternion's z component.
     */
    set_rotation_z(z: number): Go;

    /**
     * Adds to the x component of the rotation quaternion, not an Euler angle.
     * @param x The amount to add.
     */
    add_rotation_x(x: number): Go;

    /**
     * Adds to the y component of the rotation quaternion, not an Euler angle.
     * @param y The amount to add.
     */
    add_rotation_y(y: number): Go;

    /**
     * Adds to the z component of the rotation quaternion, not an Euler angle.
     * @param z The amount to add.
     */
    add_rotation_z(z: number): Go;

    /** Returns the game object's scale, from `go.get_scale`. */
    get_scale(): Vector3;

    /**
     * Sets the game object's scale with `go.set_scale`.
     * @param scale The scale, or one number for all three axes.
     */
    set_scale(scale: number | Vector3): Go;

    /**
     * Meant to add to each component of the scale. At `1.1.0` it adds to a copy of the
     * scale and leaves the game object unchanged; `add_scale_x`, `add_scale_y` and
     * `add_scale_z` write the result.
     * @param value The amount to add to each component.
     */
    add_scale(value: Vector3): Go;

    /** Returns the x component of the game object's scale. */
    get_scale_x(): number;

    /** Returns the y component of the game object's scale. */
    get_scale_y(): number;

    /** Returns the z component of the game object's scale. */
    get_scale_z(): number;

    /**
     * Sets the x component of the game object's scale.
     * @param x The x component.
     */
    set_scale_x(x: number): Go;

    /**
     * Sets the y component of the game object's scale.
     * @param y The y component.
     */
    set_scale_y(y: number): Go;

    /**
     * Sets the z component of the game object's scale.
     * @param z The z component.
     */
    set_scale_z(z: number): Go;

    /**
     * Adds to the x component of the game object's scale.
     * @param x The amount to add.
     */
    add_scale_x(x: number): Go;

    /**
     * Adds to the y component of the game object's scale.
     * @param y The amount to add.
     */
    add_scale_y(y: number): Go;

    /**
     * Adds to the z component of the game object's scale.
     * @param z The amount to add.
     */
    add_scale_z(z: number): Go;

    /** Returns the id of the game object's parent, from `go.get_parent`. */
    get_parent(): Hash | undefined;

    /**
     * Sets the game object's parent with `go.set_parent`.
     * @param parent The parent's url. When omitted, the game object is detached from its
     * parent.
     * @param keep_world_transform Whether to keep the world transform.
     */
    set_parent(parent?: SceneGameObjectAddress | Hash | Url, keep_world_transform?: boolean): Go;

    /** Returns the game object's uniform scale, from `go.get_scale_uniform`. */
    get_scale_uniform(): number;

    /** Returns the game object's world position, from `go.get_world_position`. */
    get_world_position(): Vector3;

    /** Returns the game object's world rotation, from `go.get_world_rotation`. */
    get_world_rotation(): Quaternion;

    /** Returns the game object's world scale, from `go.get_world_scale`. */
    get_world_scale(): Vector3;

    /** Returns the game object's uniform world scale, from `go.get_world_scale_uniform`. */
    get_world_scale_uniform(): number;

    /** Returns the game object's world transform, from `go.get_world_transform`. */
    get_world_transform(): Matrix4;
  }

  /**
   * Wraps a game object.
   * @param url The game object's url.
   */
  function new_(url: SceneGameObjectAddress | Hash | Url): Go;
  export { new_ as new };
}
