/** @noSelfInFile **/

/**
 * A chainable wrapper around a GUI node. `new` wraps a node or looks one up by id, and
 * each method calls the `gui.*` function of the same name with the wrapped node first:
 * setters return the wrapper, so calls chain, and getters return what the engine does.
 * @see {@link https://github.com/baochungit/defold-wrap|Github Source}
 * @noResolution
 */
declare module 'wrap.node' {
  /** The table `gui.clone_tree` and `gui.get_tree` return: each node of a tree, by id. */
  export type NodeTree = LuaTable<Hash, Opaque<'node'>> & {
    get: LuaTableGetMethod<string, Opaque<'node'>>;
  };

  /** One hex digit, in either case. */
  type HexDigit =
    | '0'
    | '1'
    | '2'
    | '3'
    | '4'
    | '5'
    | '6'
    | '7'
    | '8'
    | '9'
    | 'a'
    | 'b'
    | 'c'
    | 'd'
    | 'e'
    | 'f'
    | 'A'
    | 'B'
    | 'C'
    | 'D'
    | 'E'
    | 'F';

  /** The number of characters in `S` when each is a hex digit, else `-1`. */
  type HexDigitCount<S extends string, N extends 1[] = []> = S extends `${infer C}${infer R}`
    ? C extends HexDigit
      ? HexDigitCount<R, [...N, 1]>
      : -1
    : N['length'];

  /** `S` when it is `#` and six or eight hex digits, else `never`. */
  export type HexColorLiteral<S extends string> = S extends `#${infer D}`
    ? HexDigitCount<D> extends 6 | 8
      ? S
      : never
    : never;

  /**
   * A hex color string that is not a literal. Cast a string to it only after checking it
   * is `#` and six or eight hex digits, as `set_color` raises on any other string.
   */
  export type HexColor = string & { readonly __brand: 'wrap.node.HexColor' };

  /** A node property `animate` and `cancel_animations` take. */
  export type AnimatedProperty = keyof gui.NodeProperties | gui.Prop | Hash;

  /** A value `animate` moves a property to. */
  export type AnimatedValue = number | Vector3 | Vector4 | Quaternion;

  /** A wrapped GUI node. Every method that sets something returns the node, so calls chain. */
  export interface Node {
    /** The wrapped node, passed first to every `gui.*` call. */
    readonly node: Opaque<'node'>;

    /** Returns the node's id, from `gui.get_id`. */
    get_id(): Hash;

    /**
     * Sets the node's id with `gui.set_id`.
     * @param new_id The new id.
     */
    set_id(new_id: string | Hash): Node;

    /** Returns the node's index among its siblings, from `gui.get_index`. */
    get_index(): number;

    /** Deletes the node with `gui.delete_node`. The wrapper still holds the deleted node. */
    delete(): Node;

    /**
     * Animates one property with `gui.animate`.
     * @param property The property to animate.
     * @param to The value to animate it to.
     * @param easing An easing constant, or a vector of easing samples.
     * @param duration The duration in seconds.
     * @param delay The delay in seconds before the animation starts. Defaults to `0`.
     * @param complete_function Called once the animation completes.
     * @param playback The playback mode. Defaults to `gui.PLAYBACK_ONCE_FORWARD`.
     */
    animate(
      property: AnimatedProperty,
      to: AnimatedValue,
      easing: gui.Easing | Vector,
      duration: number,
      delay?: number,
      complete_function?: (self: unknown, node: Opaque<'node'>) => void,
      playback?: gui.Playback,
    ): Node;
    /**
     * Animates several properties with `gui.animate`, each to the value at the same index
     * of `to`, all with the same easing, duration, delay and playback.
     * @param property The properties to animate.
     * @param to The value to animate each property to, by index.
     * @param easing An easing constant, or a vector of easing samples.
     * @param duration The duration in seconds.
     * @param delay The delay in seconds before the animations start. Defaults to `0`.
     * @param complete_function Called once the first property's animation completes.
     * @param playback The playback mode. Defaults to `gui.PLAYBACK_ONCE_FORWARD`.
     */
    animate(
      property: readonly AnimatedProperty[],
      to: readonly AnimatedValue[],
      easing: gui.Easing | Vector,
      duration: number,
      delay?: number,
      complete_function?: (self: unknown, node: Opaque<'node'>) => void,
      playback?: gui.Playback,
    ): Node;

    /**
     * Cancels the node's animations with `gui.cancel_animations`.
     * @param property The property, or the properties, whose animations to cancel. When
     * omitted, every animation of the node is canceled.
     */
    cancel_animations(property?: AnimatedProperty | readonly AnimatedProperty[]): Node;

    /**
     * Cancels the node's animations, the same as `cancel_animations`.
     * @param property The property, or the properties, whose animations to cancel. When
     * omitted, every animation of the node is canceled.
     */
    cancel_animation(property?: AnimatedProperty | readonly AnimatedProperty[]): Node;

    /**
     * Creates a box node with `gui.new_box_node` as a child of this node, inheriting its
     * alpha, and returns the new node.
     * @param position The position. Defaults to the origin.
     * @param size The size. Defaults to zero.
     */
    new_box_node(position?: Vector3 | Vector4, size?: Vector3): Opaque<'node'>;

    /**
     * Creates a box node as a child of this node, as `new_box_node` does, and returns it
     * wrapped.
     * @param position The position. Defaults to the origin.
     * @param size The size. Defaults to zero.
     */
    new_box(position?: Vector3 | Vector4, size?: Vector3): Node;

    /**
     * Creates a text node with `gui.new_text_node` as a child of this node, inheriting its
     * alpha, and returns the new node.
     * @param position The position. Defaults to the origin.
     * @param text The text. Defaults to an empty string.
     */
    new_text_node(position?: Vector3 | Vector4, text?: string): Opaque<'node'>;

    /**
     * Creates a text node as a child of this node, as `new_text_node` does, and returns it
     * wrapped.
     * @param position The position. Defaults to the origin.
     * @param text The text. Defaults to an empty string.
     */
    new_text(position?: Vector3 | Vector4, text?: string): Node;

    /**
     * Creates a pie node with `gui.new_pie_node` as a child of this node, inheriting its
     * alpha, and returns the new node.
     * @param position The position. Defaults to the origin.
     * @param size The size. Defaults to zero.
     */
    new_pie_node(position?: Vector3 | Vector4, size?: Vector3): Opaque<'node'>;

    /**
     * Creates a pie node as a child of this node, as `new_pie_node` does, and returns it
     * wrapped.
     * @param position The position. Defaults to the origin.
     * @param size The size. Defaults to zero.
     */
    new_pie(position?: Vector3 | Vector4, size?: Vector3): Node;

    /**
     * Creates a particle fx node with `gui.new_particlefx_node` as a child of this node,
     * inheriting its alpha, and returns the new node.
     * @param position The position, `undefined` for the origin.
     * @param particlefx The particle fx resource name.
     */
    new_particlefx_node(
      position: Vector3 | Vector4 | undefined,
      particlefx: Hash | string,
    ): Opaque<'node'>;

    /**
     * Creates a particle fx node as a child of this node, as `new_particlefx_node` does,
     * and returns it wrapped.
     * @param position The position, `undefined` for the origin.
     * @param particlefx The particle fx resource name.
     */
    new_particlefx(position: Vector3 | Vector4 | undefined, particlefx: Hash | string): Node;

    /** Returns the text of a text node, from `gui.get_text`. */
    get_text(): string;

    /**
     * Sets the text of a text node with `gui.set_text`.
     * @param text The text.
     */
    set_text(text: string | number): Node;

    /** Returns whether a text node breaks lines, from `gui.get_line_break`. */
    get_line_break(): boolean;

    /**
     * Sets whether a text node breaks lines with `gui.set_line_break`.
     * @param line_break Whether to break lines.
     */
    set_line_break(line_break: boolean): Node;

    /** Returns the node's blend mode, from `gui.get_blend_mode`. */
    get_blend_mode(): gui.Blend;

    /**
     * Sets the node's blend mode with `gui.set_blend_mode`.
     * @param blend_mode The blend mode.
     */
    set_blend_mode(blend_mode: gui.Blend): Node;

    /** Returns the node's texture, from `gui.get_texture`. */
    get_texture(): Hash;

    /**
     * Sets the node's texture with `gui.set_texture`.
     * @param texture The texture name.
     */
    set_texture(texture: string | Hash): Node;

    /** Returns the node's flipbook animation, from `gui.get_flipbook`. */
    get_flipbook(): Hash;

    /**
     * Plays a flipbook animation on the node with `gui.play_flipbook`.
     * @param animation The animation id.
     * @param complete_function Called once the animation completes.
     * @param play_properties The offset and playback rate. Defaults to an empty table.
     */
    play_flipbook(
      animation: string | Hash,
      complete_function?: (self: unknown, node: Opaque<'node'>) => void,
      play_properties?: gui.PlayProperties,
    ): Node;

    /** Cancels the node's flipbook animation with `gui.cancel_flipbook`. */
    cancel_flipbook(): Node;

    /** Returns the node's material, from `gui.get_material`. */
    get_material(): Hash;

    /**
     * Sets the node's material with `gui.set_material`.
     * @param material The material name.
     */
    set_material(material: string | Hash): Node;

    /** Resets the node's material to the scene's with `gui.reset_material`. */
    reset_material(): Node;

    /** Returns the font of a text node, from `gui.get_font`. */
    get_font(): Hash;

    /**
     * Sets the font of a text node with `gui.set_font`.
     * @param font The font name.
     */
    set_font(font: string | Hash): Node;

    /** Returns the node's layer, from `gui.get_layer`. */
    get_layer(): Hash;

    /**
     * Sets the node's layer with `gui.set_layer`.
     * @param layer The layer name.
     */
    set_layer(layer: string | Hash): Node;

    /** Returns the node's clipping mode, from `gui.get_clipping_mode`. */
    get_clipping_mode(): gui.ClippingMode;

    /**
     * Sets the node's clipping mode with `gui.set_clipping_mode`.
     * @param clipping_mode The clipping mode.
     */
    set_clipping_mode(clipping_mode: gui.ClippingMode): Node;

    /** Returns whether the node's clipping is visible, from `gui.get_clipping_visible`. */
    get_clipping_visible(): boolean;

    /**
     * Sets whether the node's clipping is visible with `gui.set_clipping_visible`.
     * @param visible Whether the clipping is visible.
     */
    set_clipping_visible(visible: boolean): Node;

    /** Returns whether the node's clipping is inverted, from `gui.get_clipping_inverted`. */
    get_clipping_inverted(): boolean;

    /**
     * Sets whether the node's clipping is inverted with `gui.set_clipping_inverted`.
     * @param inverted Whether the clipping is inverted.
     */
    set_clipping_inverted(inverted: boolean): Node;

    /** Returns the node's horizontal anchor, from `gui.get_xanchor`. */
    get_xanchor(): Exclude<gui.Anchor, typeof gui.ANCHOR_BOTTOM | typeof gui.ANCHOR_TOP>;

    /**
     * Sets the node's horizontal anchor with `gui.set_xanchor`.
     * @param anchor The horizontal anchor.
     */
    set_xanchor(anchor: Exclude<gui.Anchor, typeof gui.ANCHOR_BOTTOM | typeof gui.ANCHOR_TOP>): Node;

    /** Returns the node's vertical anchor, from `gui.get_yanchor`. */
    get_yanchor(): Exclude<gui.Anchor, typeof gui.ANCHOR_LEFT | typeof gui.ANCHOR_RIGHT>;

    /**
     * Sets the node's vertical anchor with `gui.set_yanchor`.
     * @param anchor The vertical anchor.
     */
    set_yanchor(anchor: Exclude<gui.Anchor, typeof gui.ANCHOR_LEFT | typeof gui.ANCHOR_RIGHT>): Node;

    /** Returns the node's pivot, from `gui.get_pivot`. */
    get_pivot(): gui.Pivot;

    /**
     * Sets the node's pivot with `gui.set_pivot`.
     * @param pivot The pivot.
     */
    set_pivot(pivot: gui.Pivot): Node;

    /** Returns the slice-9 margins of a box node, from `gui.get_slice9`. */
    get_slice9(): Vector4;

    /**
     * Sets the slice-9 margins of a box node with `gui.set_slice9`.
     * @param values The left, top, right and bottom margins.
     */
    set_slice9(values: Vector4): Node;

    /** Returns the perimeter vertex count of a pie node, from `gui.get_perimeter_vertices`. */
    get_perimeter_vertices(): number;

    /**
     * Sets the perimeter vertex count of a pie node with `gui.set_perimeter_vertices`.
     * @param vertices The vertex count.
     */
    set_perimeter_vertices(vertices: number): Node;

    /** Returns the fill angle of a pie node in degrees, from `gui.get_fill_angle`. */
    get_fill_angle(): number;

    /**
     * Sets the fill angle of a pie node with `gui.set_fill_angle`.
     * @param angle The angle in degrees.
     */
    set_fill_angle(angle: number): Node;

    /** Returns the inner radius of a pie node, from `gui.get_inner_radius`. */
    get_inner_radius(): number;

    /**
     * Sets the inner radius of a pie node with `gui.set_inner_radius`.
     * @param radius The inner radius.
     */
    set_inner_radius(radius: number): Node;

    /** Returns the outer bounds mode of a pie node, from `gui.get_outer_bounds`. */
    get_outer_bounds(): gui.PieBounds;

    /**
     * Sets the outer bounds mode of a pie node with `gui.set_outer_bounds`.
     * @param bounds_mode The outer bounds mode.
     */
    set_outer_bounds(bounds_mode: gui.PieBounds): Node;

    /** Returns the line spacing of a text node, from `gui.get_leading`. */
    get_leading(): number;

    /**
     * Sets the line spacing of a text node with `gui.set_leading`.
     * @param leading The line spacing.
     */
    set_leading(leading: number): Node;

    /** Returns the letter spacing of a text node, from `gui.get_tracking`. */
    get_tracking(): number;

    /**
     * Sets the letter spacing of a text node with `gui.set_tracking`.
     * @param tracking The letter spacing.
     */
    set_tracking(tracking: number): Node;

    /**
     * Returns whether a screen point is inside the node, from `gui.pick_node`.
     * @param x The screen x coordinate.
     * @param y The screen y coordinate.
     */
    in_bound(x: number, y: number): boolean;

    /** Returns whether the node itself is enabled, from `gui.is_enabled`. */
    is_enabled(): boolean;

    /**
     * Enables or disables the node with `gui.set_enabled`.
     * @param enabled Whether the node is enabled.
     */
    set_enabled(enabled: boolean): Node;

    /** Returns whether the node is visible, from `gui.get_visible`. */
    get_visible(): boolean;

    /**
     * Sets whether the node is visible with `gui.set_visible`.
     * @param visible Whether the node is visible.
     */
    set_visible(visible: boolean): Node;

    /** Returns the node's adjust mode, from `gui.get_adjust_mode`. */
    get_adjust_mode(): gui.Adjust;

    /**
     * Sets the node's adjust mode with `gui.set_adjust_mode`.
     * @param adjust_mode The adjust mode.
     */
    set_adjust_mode(adjust_mode: gui.Adjust): Node;

    /** Returns the node's size mode, from `gui.get_size_mode`. */
    get_size_mode(): gui.SizeMode;

    /**
     * Sets the node's size mode with `gui.set_size_mode`.
     * @param size_mode The size mode.
     */
    set_size_mode(size_mode: gui.SizeMode): Node;

    /**
     * Moves the node above another in the draw order with `gui.move_above`.
     * @param reference The node to move above, wrapped or not, or `undefined` to move
     * this node to the top.
     */
    move_above(reference: Node | Opaque<'node'> | undefined): Node;

    /**
     * Moves the node below another in the draw order with `gui.move_below`.
     * @param reference The node to move below, wrapped or not, or `undefined` to move
     * this node to the bottom.
     */
    move_below(reference: Node | Opaque<'node'> | undefined): Node;

    /** Returns the node's parent, from `gui.get_parent`, or `undefined` for a root node. */
    get_parent(): Opaque<'node'> | undefined;

    /**
     * Sets the node's parent with `gui.set_parent`.
     * @param parent The new parent, wrapped or not, or `undefined` to make the node a root.
     * @param keep_scene_transform Whether to keep the node's scene transform. Defaults to
     * `false`.
     */
    set_parent(parent: Node | Opaque<'node'> | undefined, keep_scene_transform?: boolean): Node;

    /**
     * Makes a node a child of this node with `gui.set_parent`.
     * @param node The new child, wrapped or not.
     * @param keep_scene_transform Whether to keep the child's scene transform. Defaults to
     * `false`.
     */
    add_child(node: Node | Opaque<'node'>, keep_scene_transform?: boolean): Node;

    /** Clones the node with `gui.clone` and returns the clone. */
    clone(): Opaque<'node'>;

    /** Clones the node and its children with `gui.clone_tree` and returns the clones by id. */
    clone_tree(): NodeTree;

    /** Returns the node and its children by id, from `gui.get_tree`. */
    get_tree(): NodeTree;

    /** Returns the node's position, from `gui.get_position`. */
    get_position(): Vector3;

    /**
     * Sets the node's position with `gui.set_position`.
     * @param position The position. Defaults to the origin.
     */
    set_position(position?: Vector3 | Vector4): Node;

    /**
     * Adds to the node's position.
     * @param value The offset, or a number added to each of x, y and z.
     */
    add_position(value: number | Vector3): Node;

    /** Returns the x component of the node's position. */
    get_position_x(): number;

    /** Returns the y component of the node's position. */
    get_position_y(): number;

    /** Returns the z component of the node's position. */
    get_position_z(): number;

    /**
     * Sets the x component of the node's position.
     * @param x The x component.
     */
    set_position_x(x: number): Node;

    /**
     * Sets the y component of the node's position.
     * @param y The y component.
     */
    set_position_y(y: number): Node;

    /**
     * Sets the z component of the node's position.
     * @param z The z component.
     */
    set_position_z(z: number): Node;

    /**
     * Adds to the x component of the node's position.
     * @param x The amount to add.
     */
    add_position_x(x: number): Node;

    /**
     * Adds to the y component of the node's position.
     * @param y The amount to add.
     */
    add_position_y(y: number): Node;

    /**
     * Adds to the z component of the node's position.
     * @param z The amount to add.
     */
    add_position_z(z: number): Node;

    /** Returns the node's rotation as a quaternion, from `gui.get_rotation`. */
    get_rotation(): Quaternion;

    /**
     * Sets the node's rotation with `gui.set_rotation`.
     * @param rotation The rotation.
     */
    set_rotation(rotation: Quaternion | Vector4 | Vector3): Node;

    /**
     * Adds to the node's rotation.
     * @param value The offset, or a number added to each of x, y and z.
     * @deprecated Raises on every call: `gui.get_rotation` returns a quaternion, which
     * has no `+`. Use `add_euler`.
     */
    add_rotation(value: number | Vector3): Node;

    /** Returns the x component of the node's rotation quaternion, not an angle. */
    get_rotation_x(): number;

    /** Returns the y component of the node's rotation quaternion, not an angle. */
    get_rotation_y(): number;

    /** Returns the z component of the node's rotation quaternion, not an angle. */
    get_rotation_z(): number;

    /**
     * Sets the x component of the node's rotation quaternion, not an angle.
     * @param x The x component.
     */
    set_rotation_x(x: number): Node;

    /**
     * Sets the y component of the node's rotation quaternion, not an angle.
     * @param y The y component.
     */
    set_rotation_y(y: number): Node;

    /**
     * Sets the z component of the node's rotation quaternion, not an angle.
     * @param z The z component.
     */
    set_rotation_z(z: number): Node;

    /**
     * Adds to the x component of the node's rotation quaternion, not an angle.
     * @param x The amount to add.
     */
    add_rotation_x(x: number): Node;

    /**
     * Adds to the y component of the node's rotation quaternion, not an angle.
     * @param y The amount to add.
     */
    add_rotation_y(y: number): Node;

    /**
     * Adds to the z component of the node's rotation quaternion, not an angle.
     * @param z The amount to add.
     */
    add_rotation_z(z: number): Node;

    /** Returns the node's rotation as euler angles in degrees, from `gui.get_euler`. */
    get_euler(): Vector3;

    /**
     * Sets the node's rotation as euler angles in degrees with `gui.set_euler`.
     * @param euler The euler angles.
     */
    set_euler(euler: Vector3 | Vector4): Node;

    /**
     * Adds to the node's euler angles.
     * @param value The angles in degrees, or a number added to each of x, y and z.
     */
    add_euler(value: number | Vector3): Node;

    /** Returns the node's euler angle around x, in degrees. */
    get_euler_x(): number;

    /** Returns the node's euler angle around y, in degrees. */
    get_euler_y(): number;

    /** Returns the node's euler angle around z, in degrees. */
    get_euler_z(): number;

    /**
     * Sets the node's euler angle around x.
     * @param x The angle in degrees.
     */
    set_euler_x(x: number): Node;

    /**
     * Sets the node's euler angle around y.
     * @param y The angle in degrees.
     */
    set_euler_y(y: number): Node;

    /**
     * Sets the node's euler angle around z.
     * @param z The angle in degrees.
     */
    set_euler_z(z: number): Node;

    /**
     * Adds to the node's euler angle around x.
     * @param x The angle in degrees.
     */
    add_euler_x(x: number): Node;

    /**
     * Adds to the node's euler angle around y.
     * @param y The angle in degrees.
     */
    add_euler_y(y: number): Node;

    /**
     * Adds to the node's euler angle around z.
     * @param z The angle in degrees.
     */
    add_euler_z(z: number): Node;

    /** Returns the node's scale, from `gui.get_scale`. */
    get_scale(): Vector3;

    /**
     * Sets the node's scale with `gui.set_scale`.
     * @param scale The scale, or a number used for each of x, y and z.
     */
    set_scale(scale: number | Vector3 | Vector4): Node;

    /**
     * Adds to the node's scale.
     * @param value The offset, or a number added to each of x, y and z.
     */
    add_scale(value: number | Vector3): Node;

    /** Returns the x component of the node's scale. */
    get_scale_x(): number;

    /** Returns the y component of the node's scale. */
    get_scale_y(): number;

    /** Returns the z component of the node's scale. */
    get_scale_z(): number;

    /**
     * Sets the x component of the node's scale.
     * @param x The x component.
     */
    set_scale_x(x: number): Node;

    /**
     * Sets the y component of the node's scale.
     * @param y The y component.
     */
    set_scale_y(y: number): Node;

    /**
     * Sets the z component of the node's scale.
     * @param z The z component.
     */
    set_scale_z(z: number): Node;

    /**
     * Adds to the x component of the node's scale.
     * @param x The amount to add.
     */
    add_scale_x(x: number): Node;

    /**
     * Adds to the y component of the node's scale.
     * @param y The amount to add.
     */
    add_scale_y(y: number): Node;

    /**
     * Adds to the z component of the node's scale.
     * @param z The amount to add.
     */
    add_scale_z(z: number): Node;

    /** Returns the node's color, from `gui.get_color`. */
    get_color(): Vector4;

    /**
     * Sets the node's color with `gui.set_color`.
     * @param color The color, a `#rrggbb` or `#rrggbbaa` hex literal in either case, or a
     * checked `HexColor`. A string without an alpha pair is opaque.
     */
    set_color<S extends string>(color: Vector3 | Vector4 | HexColor | HexColorLiteral<S>): Node;

    /** Returns the outline color of a text node, from `gui.get_outline`. */
    get_outline(): Vector4;

    /**
     * Sets the outline color of a text node with `gui.set_outline`.
     * @param color The outline color.
     */
    set_outline(color: Vector3 | Vector4): Node;

    /** Returns the shadow color of a text node, from `gui.get_shadow`. */
    get_shadow(): Vector4;

    /**
     * Sets the shadow color of a text node with `gui.set_shadow`.
     * @param color The shadow color.
     */
    set_shadow(color: Vector3 | Vector4): Node;

    /** Returns the node's size, from `gui.get_size`. */
    get_size(): Vector3;

    /**
     * Sets the node's size with `gui.set_size`.
     * @param size The size.
     */
    set_size(size: Vector3 | Vector4): Node;

    /**
     * Adds to the node's size.
     * @param value The offset, or a number added to each of x, y and z.
     */
    add_size(value: number | Vector3): Node;

    /** Returns the node's width. */
    get_size_x(): number;

    /** Returns the node's height. */
    get_size_y(): number;

    /** Returns the z component of the node's size. */
    get_size_z(): number;

    /**
     * Sets the node's width.
     * @param x The width.
     */
    set_size_x(x: number): Node;

    /**
     * Sets the node's height.
     * @param y The height.
     */
    set_size_y(y: number): Node;

    /**
     * Sets the z component of the node's size.
     * @param z The z component.
     */
    set_size_z(z: number): Node;

    /**
     * Adds to the node's width.
     * @param x The amount to add.
     */
    add_size_x(x: number): Node;

    /**
     * Adds to the node's height.
     * @param y The amount to add.
     */
    add_size_y(y: number): Node;

    /**
     * Adds to the z component of the node's size.
     * @param z The amount to add.
     */
    add_size_z(z: number): Node;

    /**
     * Measures a text node's text in its font with `resource.get_text_metrics`.
     * @param apply_scale Whether to multiply the width and height by the node's own x and
     * y scale.
     */
    get_text_metrics(apply_scale?: boolean): resource.TextMetrics;

    /** Returns the node's scale multiplied by the scale of each of its ancestors. */
    get_total_scale(): Vector3;

    /** Returns the node's screen position, from `gui.get_screen_position`. */
    get_screen_position(): Vector3;

    /**
     * Sets the node's screen position with `gui.set_screen_position`.
     * @param screen_position The screen position.
     */
    set_screen_position(screen_position: Vector3 | Vector4): Node;

    /**
     * Converts a screen position to the node's local space with `gui.screen_to_local`.
     * @param screen_position The screen position.
     * @param ignore_scale Whether to divide the result by `get_total_scale`.
     */
    screen_to_local(screen_position: Vector3 | Vector4, ignore_scale?: boolean): Vector3;

    /** Returns the node's flipbook cursor, from `gui.get_flipbook_cursor`. */
    get_flipbook_cursor(): number;

    /**
     * Sets the node's flipbook cursor with `gui.set_flipbook_cursor`.
     * @param cursor The cursor, from `0` to `1`.
     */
    set_flipbook_cursor(cursor: number): Node;

    /** Returns the node's flipbook playback rate, from `gui.get_flipbook_playback_rate`. */
    get_flipbook_playback_rate(): number;

    /**
     * Sets the node's flipbook playback rate with `gui.set_flipbook_playback_rate`.
     * @param playback_rate The playback rate.
     */
    set_flipbook_playback_rate(playback_rate: number): Node;

    /**
     * Plays the particle fx of a particle fx node with `gui.play_particlefx`.
     * @param emitter_state_function Called when an emitter changes state.
     */
    play_particlefx(
      emitter_state_function?: (
        self: unknown,
        node: Opaque<'node'> | undefined,
        emitter: Hash,
        state: particlefx.EmitterState,
      ) => void,
    ): Node;

    /**
     * Stops the particle fx of a particle fx node with `gui.stop_particlefx`.
     * @param options `clear` removes the live particles at once.
     */
    stop_particlefx(options?: particlefx.StopOptions): Node;

    /** Returns the particle fx of a particle fx node, from `gui.get_particlefx`. */
    get_particlefx(): Hash;

    /**
     * Sets the particle fx of a particle fx node with `gui.set_particlefx`.
     * @param particlefx The particle fx resource name.
     */
    set_particlefx(particlefx: Hash | string): Node;

    /** Returns whether the node inherits its parent's alpha, from `gui.get_inherit_alpha`. */
    get_inherit_alpha(): boolean;

    /**
     * Sets whether the node inherits its parent's alpha with `gui.set_inherit_alpha`.
     * @param inherit_alpha Whether to inherit the parent's alpha.
     */
    set_inherit_alpha(inherit_alpha: boolean): Node;

    /** Returns the node's alpha, from `gui.get_alpha`. */
    get_alpha(): number;

    /**
     * Sets the node's alpha with `gui.set_alpha`.
     * @param alpha The alpha, from `0` to `1`.
     */
    set_alpha(alpha: number): Node;
  }

  /**
   * Wraps a GUI node.
   * @param node The node, or the id `gui.get_node` looks it up by.
   */
  function new_(node: string | Opaque<'node'>): Node;
  export { new_ as new };
}
