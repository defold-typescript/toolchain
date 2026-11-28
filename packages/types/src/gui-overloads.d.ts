/** @noSelfInFile */

import type {
  Hash,
  Matrix4,
  Opaque,
  Quaternion,
  Url,
  Vector,
  Vector3,
  Vector4,
} from "./core-types";

// The property name a `gui.PROP_*` constant equals: its brand suffix, lowercased.
type PropName<P> = P extends { readonly __brand: `gui.PROP_${infer S}` } ? Lowercase<S> : never;

// gui.cpp g_Properties: these four have no `.x`..`.w` sub-keys.
type ScalarName = "inner_radius" | "fill_angle" | "leading" | "tracking";

type VectorName = Exclude<PropName<gui.Prop>, ScalarName>;

// gui_script.cpp:LuaGet and LuaSet read the key with CheckHashOrString and
// resolve it through GetPropertyDesc, so `hash("position")` names the same
// descriptor `"position"` does. A bare `Hash` names nothing.
type NodePropertyName<K> = K extends keyof gui.NodeProperties
  ? K
  : K extends Hash<infer S>
    ? string extends S
      ? never
      : Extract<S, keyof gui.NodeProperties>
    : Extract<PropName<K>, keyof gui.NodeProperties>;

// A named overload's key: a property name, a `gui.PROP_*` constant, or a hash
// of a property name.
type NodePropertyKey = keyof gui.NodeProperties | gui.Prop | Hash<keyof gui.NodeProperties>;

// `unknown` when every member of key union `K` names a node property, and
// `never` when one does not. The key constraint admits a bare `Hash`, since
// `Hash` and `Hash<"position">` are assignable to each other, so intersected
// into `property` it sends such a key to the hash overloads.
type NamesNodeProperties<K> = [
  K extends unknown ? ([NodePropertyName<K>] extends [never] ? K : never) : never,
] extends [never]
  ? unknown
  : never;

// `never` when hash `H` names a node property, which the named overloads type,
// and `unknown` for any other hash, such as a material constant's or a bare
// `Hash`. Intersected into a hash overload's `property`, it keeps a refused
// call on a node property from falling through to the wide value.
type UnnamedHash<H> = [
  H extends Hash<infer S>
    ? string extends S
      ? never
      : Extract<S, keyof gui.NodeProperties>
    : never,
] extends [never]
  ? unknown
  : never;

// gui_script.cpp:LuaSet: `rotation` takes only a quat, every other vector a
// vector4 or a vector3, and a sub-key or scalar a number.
type NodePropertyWrite<N extends keyof gui.NodeProperties> = N extends "rotation"
  ? Quaternion
  : gui.NodeProperties[N] extends number
    ? number
    : Vector4 | Vector3;

// gui_script.cpp:LuaAnimate: a number fills every component, a vector3 keeps the
// node's current w, and a quaternion is read raw, so `rotation` takes only a
// quat, a sub-key or scalar a number, and every other vector a number, a vector3
// or a vector4.
type NodePropertyAnimateTo<N extends keyof gui.NodeProperties> = N extends "rotation"
  ? Quaternion
  : gui.NodeProperties[N] extends number
    ? number
    : number | Vector3 | Vector4;

// A value every property a union `K` names accepts. Inferring one parameter
// from the union of each name's setter intersects their value types, where
// distributing over `K` would accept a value any one of them takes. The
// `infer` constraint keeps the kinds a value may hold readable from the
// declaration.
type NodePropertyWriteEach<K> = (
  K extends unknown
    ? (value: NodePropertyWrite<NodePropertyName<K>>) => void
    : never
) extends (value: infer V extends number | Vector3 | Vector4 | Quaternion) => void
  ? V
  : never;

type NodePropertyAnimateToEach<K> = (
  K extends unknown
    ? (to: NodePropertyAnimateTo<NodePropertyName<K>>) => void
    : never
) extends (to: infer V extends number | Vector3 | Vector4 | Quaternion) => void
  ? V
  : never;

declare global {
  namespace gui {
    /**
     * The GUI node properties and the type each one reads as. A vector
     * property reads as a vmath.vector4 and `rotation` as a vmath.quat; their
     * `.x`..`.w` sub-keys and the four scalar properties read as a number.
     */
    type NodeProperties = {
      [K in
        | VectorName
        | `${VectorName}.${"x" | "y" | "z" | "w"}`
        | ScalarName]: K extends "rotation" ? Quaternion : K extends VectorName ? Vector4 : number;
    };

    // gameobject_script_util.cpp:LuaToPropertyOptions raises when more than one
    // of the three is non-nil, and reads a nil one as absent.
    type PropertyOptions =
      | {
          /** **⚠️ 1-based index into an array property; passed to Defold unchanged.** */
          index?: number;
          key?: undefined;
          keys?: undefined;
        }
      | { index?: undefined; key?: string | Hash; keys?: undefined }
      | { index?: undefined; key?: undefined; keys?: (Hash | string)[] };

    /**
     * Instead of using specific getters such as gui.get_position or gui.get_scale,
     * you can use gui.get instead and supply the property as a string, a
     * `gui.PROP_*` constant or a hash of the name. Only these node properties
     * are supported:
     *
     * - `"position"`
     * - `"rotation"`
     * - `"euler"`
     * - `"scale"`
     * - `"color"`
     * - `"outline"`
     * - `"shadow"`
     * - `"size"`
     * - `"fill_angle"` (pie)
     * - `"inner_radius"` (pie)
     * - `"leading"` (text)
     * - `"tracking"` (text)
     * - `"slice9"` (slice9)
     *
     * Each property but the four scalars (`fill_angle`, `inner_radius`, `leading`
     * and `tracking`) also exposes its components as `"<name>.x"` to `"<name>.w"`.
     * Getting `"rotation"` returns a vmath.quat, another vector property a
     * vmath.vector4, and a component or a scalar property a single number. To get
     * a material constant, pass its name as a hash.
     *
     * @param node - node to get the property for
     * @param property - the property to retrieve; each `gui.PROP_*` constant equals its corresponding property name string
     * @returns the property value
     * @example
     * ```ts
     * // Get properties on existing nodes:
     * const node = gui.get_node("my_box_node");
     * const node_position = gui.get(node, "position");
     * ```
     */
    function get<K extends NodePropertyKey>(
      node: Opaque<"node">,
      property: K & NamesNodeProperties<K>,
    ): gui.NodeProperties[NodePropertyName<K>];
    /**
     * Gets a material constant of a node, or a property named by a hash whose name
     * is not known at compile time, such as a bare `Hash`. Pass the constant's
     * name as a hash, such as `hash("tint")`. A hash of a node property name,
     * such as `hash("position")`, reads as that name does. Reading an array
     * constant without `index` returns every element in a table.
     *
     * @param node - node to get the property for
     * @param property - the property to retrieve, as a hash
     * @param options - optional options table (only applicable for material constants)
     * - `index` integer index into array property (1 based)
     *
     * **⚠️ `index` is 1-based; passed to Defold unchanged.**
     * @returns the property value
     * @example
     * ```ts
     * const node = gui.get_node("my_box_node");
     * const tint = gui.get(node, hash("tint"));
     * const second = gui.get(node, hash("tint_array"), { index: 2 });
     * ```
     */
    function get<H extends Hash>(
      node: Opaque<"node">,
      property: H & UnnamedHash<H>,
    ): number | Vector4 | Quaternion | Matrix4 | number[] | Vector4[] | Matrix4[];
    /**
     * Gets a material constant of a node, or a property named by a hash whose name
     * is not known at compile time, such as a bare `Hash`. Pass the constant's
     * name as a hash, such as `hash("tint")`. A hash of a node property name,
     * such as `hash("position")`, reads as that name does. Reading an array
     * constant without `index` returns every element in a table.
     *
     * @param node - node to get the property for
     * @param property - the property to retrieve, as a hash
     * @param options - optional options table (only applicable for material constants)
     * - `index` integer index into array property (1 based)
     *
     * **⚠️ `index` is 1-based; passed to Defold unchanged.**
     * @returns the property value
     * @example
     * ```ts
     * const node = gui.get_node("my_box_node");
     * const tint = gui.get(node, hash("tint"));
     * const second = gui.get(node, hash("tint_array"), { index: 2 });
     * ```
     */
    function get<H extends Hash>(
      node: Opaque<"node">,
      property: H & UnnamedHash<H>,
      options: gui.PropertyOptions,
    ): number | Vector4 | Quaternion | Matrix4 | number[] | Vector4[] | Matrix4[];
    /**
     * Gets a node property named by a value that may be either a property name
     * or a hash, such as one typed `"position" | Hash`. The result is any value
     * either form returns; narrow it before use.
     *
     * @param node - node to get the property for
     * @param property - the property to retrieve, as a name or a hash
     * @returns the property value
     */
    function get(
      node: Opaque<"node">,
      property: keyof gui.NodeProperties | gui.Prop | Hash,
    ):
      | gui.NodeProperties[keyof gui.NodeProperties]
      | number
      | Vector4
      | Quaternion
      | Matrix4
      | number[]
      | Vector4[]
      | Matrix4[];
    /**
     * Instead of using specific setters such as gui.set_position or gui.set_scale,
     * you can use gui.set instead and supply the property as a string, a
     * `gui.PROP_*` constant or a hash of the name. Only the node properties
     * gui.get lists are supported.
     *
     * The value depends on the property name. Setting `"rotation"` takes a
     * vmath.quat, which differs from gui.set_rotation; to set the rotation in
     * degrees, set `"euler"` instead. The rotation and euler properties are
     * linked, so changing one changes the other. Every other vector property
     * takes a vmath.vector4 or a vmath.vector3, and a component such as
     * `"position.x"` or one of the four scalar properties takes a single number.
     *
     * @param node - node to set the property for
     * @param property - the property to set; each `gui.PROP_*` constant equals its corresponding property name string
     * @param value - the value to set
     * @example
     * Updates the position property on an existing node:
     * ```ts
     * const node = gui.get_node("my_box_node");
     * const node_position = gui.get(node, "position");
     * gui.set(node, "position.x", node_position.x + 128);
     * ```
     * @example
     * Updates the rotation property on an existing node:
     * ```ts
     * const node = gui.get_node("my_box_node");
     * gui.set(node, "rotation", vmath.quat_rotation_z(math.rad(45)));
     * // this is equivalent to:
     * gui.set(node, "euler.z", 45);
     * // or using the entire vector:
     * gui.set(node, "euler", vmath.vector3(0, 0, 45));
     * // or using the set_rotation
     * gui.set_rotation(node, vmath.vector3(0, 0, 45));
     * ```
     */
    function set<K extends NodePropertyKey>(
      node: Opaque<"node">,
      property: K & NamesNodeProperties<K>,
      value: NodePropertyWriteEach<K>,
    ): void;
    /**
     * Sets a material constant of a node, or a property named by a hash whose name
     * is not known at compile time, such as a bare `Hash`; a hash of a node
     * property name, such as `hash("position")`, takes what that name takes. If a
     * material specifies a constant called `tint` in the .material file, set it
     * with `gui.set(node, hash("tint"), vmath.vector4(1, 0, 0, 1))`, or pass a
     * vmath.matrix4 if the constant is a matrix. To set one element of an array
     * constant, pass an options table with `index` set.
     *
     * @param node - node to set the property for
     * @param property - the property to set, as a hash
     * @param value - the value to set
     * @param options - optional material-constant options. **⚠️ `index` is 1-based; passed to Defold unchanged.**
     * @example
     * Sets various material constants for a node:
     * ```ts
     * const node = gui.get_node("my_box_node");
     * gui.set(node, hash("tint"), vmath.vector4(1, 0, 0, 1));
     * // matrix4 is also supported
     * gui.set(node, hash("light_matrix"), vmath.matrix4());
     * // update a constant in an array at position 4. the array is specified in the shader as:
     * // uniform vec4 tint_array[4]; // lua is 1 based, shader is 0 based
     * gui.set(node, hash("tint_array"), vmath.vector4(1, 0, 0, 1), { index: 4 });
     * // update a matrix constant in an array at position 4. the array is specified in the shader as:
     * // uniform mat4 light_matrix_array[4];
     * gui.set(node, hash("light_matrix_array"), vmath.matrix4(), { index: 4 });
     * // update a sub-element in a constant
     * gui.set(node, hash("tint.x"), 1);
     * // update a sub-element in an array constant at position 4
     * gui.set(node, hash("tint_array.x"), 1, { index: 4 });
     * ```
     */
    function set<H extends Hash>(
      node: Opaque<"node">,
      property: H & UnnamedHash<H>,
      value: number | Vector4 | Vector3 | Quaternion | Matrix4 | Hash,
    ): void;
    /**
     * Sets a material constant of a node, or a property named by a hash whose name
     * is not known at compile time, such as a bare `Hash`; a hash of a node
     * property name, such as `hash("position")`, takes what that name takes. If a
     * material specifies a constant called `tint` in the .material file, set it
     * with `gui.set(node, hash("tint"), vmath.vector4(1, 0, 0, 1))`, or pass a
     * vmath.matrix4 if the constant is a matrix. To set one element of an array
     * constant, pass an options table with `index` set.
     *
     * @param node - node to set the property for
     * @param property - the property to set, as a hash
     * @param value - the value to set
     * @param options - optional material-constant options. **⚠️ `index` is 1-based; passed to Defold unchanged.**
     * @example
     * Sets various material constants for a node:
     * ```ts
     * const node = gui.get_node("my_box_node");
     * gui.set(node, hash("tint"), vmath.vector4(1, 0, 0, 1));
     * // matrix4 is also supported
     * gui.set(node, hash("light_matrix"), vmath.matrix4());
     * // update a constant in an array at position 4. the array is specified in the shader as:
     * // uniform vec4 tint_array[4]; // lua is 1 based, shader is 0 based
     * gui.set(node, hash("tint_array"), vmath.vector4(1, 0, 0, 1), { index: 4 });
     * // update a matrix constant in an array at position 4. the array is specified in the shader as:
     * // uniform mat4 light_matrix_array[4];
     * gui.set(node, hash("light_matrix_array"), vmath.matrix4(), { index: 4 });
     * // update a sub-element in a constant
     * gui.set(node, hash("tint.x"), 1);
     * // update a sub-element in an array constant at position 4
     * gui.set(node, hash("tint_array.x"), 1, { index: 4 });
     * ```
     */
    function set<H extends Hash>(
      node: Opaque<"node">,
      property: H & UnnamedHash<H>,
      value: number | Vector4 | Vector3 | Quaternion | Matrix4 | Hash,
      options: gui.PropertyOptions,
    ): void;
    /**
     * Sets a resource property of the gui component itself, addressed with
     * `msg.url()`: `"material"`, or the `"materials"`, `"fonts"` or `"textures"`
     * entry named by the `key` option. A property a native extension registers is
     * named by a hash.
     *
     * @param url - msg.url() to the gui itself
     * @param property - the property to set
     * @param value - the resource to set
     * @param options - options table; `key` names the entry to set
     * @example
     * Set a named property
     * ```ts
     * export default defineGuiScript({
     *   on_message(self, message_id, message) {
     *     if (message_id === hash("set_font") && types.is_hash(message.font)) {
     *       gui.set(msg.url(), "fonts", message.font, { key: "my_font_name" });
     *       gui.set_font(gui.get_node("text"), "my_font_name");
     *     } else if (message_id === hash("set_texture") && types.is_hash(message.texture)) {
     *       gui.set(msg.url(), "textures", message.texture, { key: "my_texture" });
     *       gui.set_texture(gui.get_node("box"), "my_texture");
     *       gui.play_flipbook(gui.get_node("box"), "logo_256");
     *     }
     *   },
     * });
     * ```
     */
    function set(
      url: Url,
      property: "material" | "materials" | "fonts" | "textures" | Hash,
      value: Hash,
    ): void;
    /**
     * Sets a resource property of the gui component itself, addressed with
     * `msg.url()`: `"material"`, or the `"materials"`, `"fonts"` or `"textures"`
     * entry named by the `key` option. A property a native extension registers is
     * named by a hash.
     *
     * @param url - msg.url() to the gui itself
     * @param property - the property to set
     * @param value - the resource to set
     * @param options - options table; `key` names the entry to set
     * @example
     * Set a named property
     * ```ts
     * export default defineGuiScript({
     *   on_message(self, message_id, message) {
     *     if (message_id === hash("set_font") && types.is_hash(message.font)) {
     *       gui.set(msg.url(), "fonts", message.font, { key: "my_font_name" });
     *       gui.set_font(gui.get_node("text"), "my_font_name");
     *     } else if (message_id === hash("set_texture") && types.is_hash(message.texture)) {
     *       gui.set(msg.url(), "textures", message.texture, { key: "my_texture" });
     *       gui.set_texture(gui.get_node("box"), "my_texture");
     *       gui.play_flipbook(gui.get_node("box"), "logo_256");
     *     }
     *   },
     * });
     * ```
     */
    function set(
      url: Url,
      property: "material" | "materials" | "fonts" | "textures" | Hash,
      value: Hash,
      options: gui.PropertyOptions,
    ): void;
    /**
     * This starts an animation of a node property according to the specified parameters.
     * If the node property is already being animated, that animation will be canceled and
     * replaced by the new one. Note however that several different node properties
     * can be animated simultaneously. Use `gui.cancel_animations` to stop the animation
     * before it has completed.
     * Only the node properties gui.get lists can be animated; a material constant
     * cannot. Composite properties of type vector3, vector4 or quaternion
     * also expose their sub-components (x, y, z and w).
     * You can address the components individually by suffixing the name with a dot '.'
     * and the name of the component.
     * For instance, `"position.x"` (the position x coordinate) or `"color.w"`
     * (the color alpha value).
     * If a `complete_function` (Lua function) is specified, that function will be called
     * when the animation has completed.
     * By starting a new animation in that function, several animations can be sequenced
     * together. See the examples below for more information.
     *
     * @param node - node to animate
     * @param property - property to animate; each `gui.PROP_*` constant equals its corresponding property name string
     * @param to - target property value
     * @param easing - easing to use during animation.
     * Either specify one of the `gui.EASING_*` constants or provide a
     * vector with a custom curve. See the animation guide for more information.
     * @param duration - duration of the animation in seconds.
     * @param delay - delay before the animation starts in seconds.
     * @param complete_function - function to call when the
     * animation has completed
     * @param playback - playback mode
     * @example
     * How to start a simple color animation, where the node fades in to white during 0.5 seconds:
     * ```ts
     * // How to start a simple color animation, where the node fades in to white during 0.5 seconds:
     * const node = gui.get_node("my_node");
     * gui.set_color(node, vmath.vector4(0, 0, 0, 0)); // node is fully transparent
     * gui.animate(node, gui.PROP_COLOR, vmath.vector4(1, 1, 1, 1), gui.EASING_INOUTQUAD, 0.5); // start animation
     * ```
     * @example
     * How to start a sequenced animation where the node fades in to white during 0.5 seconds, stays visible for 2 seconds and then fades out:
     * ```ts
     * // How to start a sequenced animation where the node fades in to white during 0.5
     * // seconds, stays visible for 2 seconds and then fades out:
     * function on_animation_done(self: unknown, node: Opaque<"node">) {
     *   // fade out node, but wait 2 seconds before the animation starts
     *   gui.animate(node, gui.PROP_COLOR, vmath.vector4(0, 0, 0, 0), gui.EASING_OUTQUAD, 0.5, 2.0);
     * }
     *
     * export default defineGuiScript({
     *   init(self) {
     *     // fetch the node we want to animate
     *     const my_node = gui.get_node("my_node");
     *     // node is initially set to fully transparent
     *     gui.set_color(my_node, vmath.vector4(0, 0, 0, 0));
     *     // animate the node immediately and call on_animation_done when the animation has completed
     *     gui.animate(my_node, gui.PROP_COLOR, vmath.vector4(1, 1, 1, 1), gui.EASING_INOUTQUAD, 0.5, 0.0, on_animation_done);
     *   },
     * });
     * ```
     * @example
     * How to animate a node's y position using a crazy custom easing curve:
     * ```ts
     * // How to animate a node's y position using a crazy custom easing curve:
     * export default defineGuiScript({
     *   init(self) {
     *     const values = [
     *       0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     *       0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     *       0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     *       0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     *     ];
     *     const vec = vmath.vector(values);
     *     const node = gui.get_node("box");
     *     gui.animate(node, "position.y", 100, vec, 4.0, 0, undefined, gui.PLAYBACK_LOOP_PINGPONG);
     *   },
     * });
     * ```
     */
    function animate<K extends NodePropertyKey>(
      node: Opaque<"node">,
      property: K & NamesNodeProperties<K>,
      to: NodePropertyAnimateToEach<K>,
      easing: gui.Easing | Vector,
      duration: number,
    ): void;
    /**
     * This starts an animation of a node property according to the specified parameters.
     * If the node property is already being animated, that animation will be canceled and
     * replaced by the new one. Note however that several different node properties
     * can be animated simultaneously. Use `gui.cancel_animations` to stop the animation
     * before it has completed.
     * Only the node properties gui.get lists can be animated; a material constant
     * cannot. Composite properties of type vector3, vector4 or quaternion
     * also expose their sub-components (x, y, z and w).
     * You can address the components individually by suffixing the name with a dot '.'
     * and the name of the component.
     * For instance, `"position.x"` (the position x coordinate) or `"color.w"`
     * (the color alpha value).
     * If a `complete_function` (Lua function) is specified, that function will be called
     * when the animation has completed.
     * By starting a new animation in that function, several animations can be sequenced
     * together. See the examples below for more information.
     *
     * @param node - node to animate
     * @param property - property to animate; each `gui.PROP_*` constant equals its corresponding property name string
     * @param to - target property value
     * @param easing - easing to use during animation.
     * Either specify one of the `gui.EASING_*` constants or provide a
     * vector with a custom curve. See the animation guide for more information.
     * @param duration - duration of the animation in seconds.
     * @param delay - delay before the animation starts in seconds.
     * @param complete_function - function to call when the
     * animation has completed
     * @param playback - playback mode
     * @example
     * How to start a simple color animation, where the node fades in to white during 0.5 seconds:
     * ```ts
     * // How to start a simple color animation, where the node fades in to white during 0.5 seconds:
     * const node = gui.get_node("my_node");
     * gui.set_color(node, vmath.vector4(0, 0, 0, 0)); // node is fully transparent
     * gui.animate(node, gui.PROP_COLOR, vmath.vector4(1, 1, 1, 1), gui.EASING_INOUTQUAD, 0.5); // start animation
     * ```
     * @example
     * How to start a sequenced animation where the node fades in to white during 0.5 seconds, stays visible for 2 seconds and then fades out:
     * ```ts
     * // How to start a sequenced animation where the node fades in to white during 0.5
     * // seconds, stays visible for 2 seconds and then fades out:
     * function on_animation_done(self: unknown, node: Opaque<"node">) {
     *   // fade out node, but wait 2 seconds before the animation starts
     *   gui.animate(node, gui.PROP_COLOR, vmath.vector4(0, 0, 0, 0), gui.EASING_OUTQUAD, 0.5, 2.0);
     * }
     *
     * export default defineGuiScript({
     *   init(self) {
     *     // fetch the node we want to animate
     *     const my_node = gui.get_node("my_node");
     *     // node is initially set to fully transparent
     *     gui.set_color(my_node, vmath.vector4(0, 0, 0, 0));
     *     // animate the node immediately and call on_animation_done when the animation has completed
     *     gui.animate(my_node, gui.PROP_COLOR, vmath.vector4(1, 1, 1, 1), gui.EASING_INOUTQUAD, 0.5, 0.0, on_animation_done);
     *   },
     * });
     * ```
     * @example
     * How to animate a node's y position using a crazy custom easing curve:
     * ```ts
     * // How to animate a node's y position using a crazy custom easing curve:
     * export default defineGuiScript({
     *   init(self) {
     *     const values = [
     *       0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     *       0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     *       0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     *       0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     *     ];
     *     const vec = vmath.vector(values);
     *     const node = gui.get_node("box");
     *     gui.animate(node, "position.y", 100, vec, 4.0, 0, undefined, gui.PLAYBACK_LOOP_PINGPONG);
     *   },
     * });
     * ```
     */
    function animate<K extends NodePropertyKey>(
      node: Opaque<"node">,
      property: K & NamesNodeProperties<K>,
      to: NodePropertyAnimateToEach<K>,
      easing: gui.Easing | Vector,
      duration: number,
      delay: number,
      complete_function?: (self: unknown, node: Opaque<"node">) => void,
      playback?: gui.Playback,
    ): void;
    /**
     * Animates a node property named by a hash whose name is not known at compile
     * time, such as a bare `Hash`. The engine resolves the name at run time, so
     * the target value is not checked against the property: pass a number, a
     * vmath.vector3, a vmath.vector4 or a vmath.quat as the named property
     * expects. A hash of a node property name, such as `hash("position.y")`,
     * takes what that name takes.
     *
     * @param node - node to animate
     * @param property - property to animate, as a hash
     * @param to - target property value
     * @param easing - easing to use during animation
     * @param duration - duration of the animation in seconds.
     * @example
     * ```ts
     * const node = gui.get_node("my_node");
     * gui.animate(node, hash("position.y"), 100, gui.EASING_OUTQUAD, 0.5);
     * ```
     */
    function animate<H extends Hash>(
      node: Opaque<"node">,
      property: H & UnnamedHash<H>,
      to: number | Vector3 | Vector4 | Quaternion,
      easing: gui.Easing | Vector,
      duration: number,
    ): void;
    /**
     * Animates a node property named by a hash whose name is not known at compile
     * time, such as a bare `Hash`. The engine resolves the name at run time, so
     * the target value is not checked against the property: pass a number, a
     * vmath.vector3, a vmath.vector4 or a vmath.quat as the named property
     * expects. A hash of a node property name, such as `hash("position.y")`,
     * takes what that name takes.
     *
     * @param node - node to animate
     * @param property - property to animate, as a hash
     * @param to - target property value
     * @param easing - easing to use during animation
     * @param duration - duration of the animation in seconds.
     * @param delay - delay before the animation starts in seconds.
     * @param complete_function - function to call when the animation has completed
     * @param playback - playback mode
     * @example
     * ```ts
     * const node = gui.get_node("my_node");
     * gui.animate(node, hash("position.y"), 100, gui.EASING_OUTQUAD, 0.5, 0.2, undefined, gui.PLAYBACK_LOOP_PINGPONG);
     * ```
     */
    function animate<H extends Hash>(
      node: Opaque<"node">,
      property: H & UnnamedHash<H>,
      to: number | Vector3 | Vector4 | Quaternion,
      easing: gui.Easing | Vector,
      duration: number,
      delay: number,
      complete_function?: (self: unknown, node: Opaque<"node">) => void,
      playback?: gui.Playback,
    ): void;
  }
}
