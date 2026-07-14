/** @noSelfInFile */
import type { Hash, Opaque, Quaternion, Url, Vector, Vector3, Vector4 } from "../src/core-types";

declare global {
  /**
   * GUI API documentation
   */
  namespace gui {
    /**
     * Adjust mode is used when the screen resolution differs from the project settings.
     * The fit mode ensures that the entire node is visible in the adjusted gui scene.
     */
    const ADJUST_FIT: number & { readonly __brand: "gui.ADJUST_FIT" };
    /**
     * Adjust mode is used when the screen resolution differs from the project settings.
     * The stretch mode ensures that the node is displayed as is in the adjusted gui scene, which might scale it non-uniformally.
     */
    const ADJUST_STRETCH: number & { readonly __brand: "gui.ADJUST_STRETCH" };
    /**
     * Adjust mode is used when the screen resolution differs from the project settings.
     * The zoom mode ensures that the node fills its entire area and might make the node exceed it.
     */
    const ADJUST_ZOOM: number & { readonly __brand: "gui.ADJUST_ZOOM" };
    /**
     * bottom y-anchor
     */
    const ANCHOR_BOTTOM: number & { readonly __brand: "gui.ANCHOR_BOTTOM" };
    /**
     * left x-anchor
     */
    const ANCHOR_LEFT: number & { readonly __brand: "gui.ANCHOR_LEFT" };
    /**
     * no anchor
     */
    const ANCHOR_NONE: number & { readonly __brand: "gui.ANCHOR_NONE" };
    /**
     * right x-anchor
     */
    const ANCHOR_RIGHT: number & { readonly __brand: "gui.ANCHOR_RIGHT" };
    /**
     * top y-anchor
     */
    const ANCHOR_TOP: number & { readonly __brand: "gui.ANCHOR_TOP" };
    /**
     * additive blending
     */
    const BLEND_ADD: number & { readonly __brand: "gui.BLEND_ADD" };
    /**
     * additive alpha blending
     */
    const BLEND_ADD_ALPHA: number & { readonly __brand: "gui.BLEND_ADD_ALPHA" };
    /**
     * alpha blending
     */
    const BLEND_ALPHA: number & { readonly __brand: "gui.BLEND_ALPHA" };
    /**
     * multiply blending
     */
    const BLEND_MULT: number & { readonly __brand: "gui.BLEND_MULT" };
    /**
     * screen blending
     */
    const BLEND_SCREEN: number & { readonly __brand: "gui.BLEND_SCREEN" };
    /**
     * clipping mode none
     */
    const CLIPPING_MODE_NONE: number & { readonly __brand: "gui.CLIPPING_MODE_NONE" };
    /**
     * clipping mode stencil
     */
    const CLIPPING_MODE_STENCIL: number & { readonly __brand: "gui.CLIPPING_MODE_STENCIL" };
    /**
     * in-back
     */
    const EASING_INBACK: number & { readonly __brand: "gui.EASING_INBACK" };
    /**
     * in-bounce
     */
    const EASING_INBOUNCE: number & { readonly __brand: "gui.EASING_INBOUNCE" };
    /**
     * in-circlic
     */
    const EASING_INCIRC: number & { readonly __brand: "gui.EASING_INCIRC" };
    /**
     * in-cubic
     */
    const EASING_INCUBIC: number & { readonly __brand: "gui.EASING_INCUBIC" };
    /**
     * in-elastic
     */
    const EASING_INELASTIC: number & { readonly __brand: "gui.EASING_INELASTIC" };
    /**
     * in-exponential
     */
    const EASING_INEXPO: number & { readonly __brand: "gui.EASING_INEXPO" };
    /**
     * in-out-back
     */
    const EASING_INOUTBACK: number & { readonly __brand: "gui.EASING_INOUTBACK" };
    /**
     * in-out-bounce
     */
    const EASING_INOUTBOUNCE: number & { readonly __brand: "gui.EASING_INOUTBOUNCE" };
    /**
     * in-out-circlic
     */
    const EASING_INOUTCIRC: number & { readonly __brand: "gui.EASING_INOUTCIRC" };
    /**
     * in-out-cubic
     */
    const EASING_INOUTCUBIC: number & { readonly __brand: "gui.EASING_INOUTCUBIC" };
    /**
     * in-out-elastic
     */
    const EASING_INOUTELASTIC: number & { readonly __brand: "gui.EASING_INOUTELASTIC" };
    /**
     * in-out-exponential
     */
    const EASING_INOUTEXPO: number & { readonly __brand: "gui.EASING_INOUTEXPO" };
    /**
     * in-out-quadratic
     */
    const EASING_INOUTQUAD: number & { readonly __brand: "gui.EASING_INOUTQUAD" };
    /**
     * in-out-quartic
     */
    const EASING_INOUTQUART: number & { readonly __brand: "gui.EASING_INOUTQUART" };
    /**
     * in-out-quintic
     */
    const EASING_INOUTQUINT: number & { readonly __brand: "gui.EASING_INOUTQUINT" };
    /**
     * in-out-sine
     */
    const EASING_INOUTSINE: number & { readonly __brand: "gui.EASING_INOUTSINE" };
    /**
     * in-quadratic
     */
    const EASING_INQUAD: number & { readonly __brand: "gui.EASING_INQUAD" };
    /**
     * in-quartic
     */
    const EASING_INQUART: number & { readonly __brand: "gui.EASING_INQUART" };
    /**
     * in-quintic
     */
    const EASING_INQUINT: number & { readonly __brand: "gui.EASING_INQUINT" };
    /**
     * in-sine
     */
    const EASING_INSINE: number & { readonly __brand: "gui.EASING_INSINE" };
    /**
     * linear interpolation
     */
    const EASING_LINEAR: number & { readonly __brand: "gui.EASING_LINEAR" };
    /**
     * out-back
     */
    const EASING_OUTBACK: number & { readonly __brand: "gui.EASING_OUTBACK" };
    /**
     * out-bounce
     */
    const EASING_OUTBOUNCE: number & { readonly __brand: "gui.EASING_OUTBOUNCE" };
    /**
     * out-circlic
     */
    const EASING_OUTCIRC: number & { readonly __brand: "gui.EASING_OUTCIRC" };
    /**
     * out-cubic
     */
    const EASING_OUTCUBIC: number & { readonly __brand: "gui.EASING_OUTCUBIC" };
    /**
     * out-elastic
     */
    const EASING_OUTELASTIC: number & { readonly __brand: "gui.EASING_OUTELASTIC" };
    /**
     * out-exponential
     */
    const EASING_OUTEXPO: number & { readonly __brand: "gui.EASING_OUTEXPO" };
    /**
     * out-in-back
     */
    const EASING_OUTINBACK: number & { readonly __brand: "gui.EASING_OUTINBACK" };
    /**
     * out-in-bounce
     */
    const EASING_OUTINBOUNCE: number & { readonly __brand: "gui.EASING_OUTINBOUNCE" };
    /**
     * out-in-circlic
     */
    const EASING_OUTINCIRC: number & { readonly __brand: "gui.EASING_OUTINCIRC" };
    /**
     * out-in-cubic
     */
    const EASING_OUTINCUBIC: number & { readonly __brand: "gui.EASING_OUTINCUBIC" };
    /**
     * out-in-elastic
     */
    const EASING_OUTINELASTIC: number & { readonly __brand: "gui.EASING_OUTINELASTIC" };
    /**
     * out-in-exponential
     */
    const EASING_OUTINEXPO: number & { readonly __brand: "gui.EASING_OUTINEXPO" };
    /**
     * out-in-quadratic
     */
    const EASING_OUTINQUAD: number & { readonly __brand: "gui.EASING_OUTINQUAD" };
    /**
     * out-in-quartic
     */
    const EASING_OUTINQUART: number & { readonly __brand: "gui.EASING_OUTINQUART" };
    /**
     * out-in-quintic
     */
    const EASING_OUTINQUINT: number & { readonly __brand: "gui.EASING_OUTINQUINT" };
    /**
     * out-in-sine
     */
    const EASING_OUTINSINE: number & { readonly __brand: "gui.EASING_OUTINSINE" };
    /**
     * out-quadratic
     */
    const EASING_OUTQUAD: number & { readonly __brand: "gui.EASING_OUTQUAD" };
    /**
     * out-quartic
     */
    const EASING_OUTQUART: number & { readonly __brand: "gui.EASING_OUTQUART" };
    /**
     * out-quintic
     */
    const EASING_OUTQUINT: number & { readonly __brand: "gui.EASING_OUTQUINT" };
    /**
     * out-sine
     */
    const EASING_OUTSINE: number & { readonly __brand: "gui.EASING_OUTSINE" };
    /**
     * default keyboard
     */
    const KEYBOARD_TYPE_DEFAULT: number & { readonly __brand: "gui.KEYBOARD_TYPE_DEFAULT" };
    /**
     * email keyboard
     */
    const KEYBOARD_TYPE_EMAIL: number & { readonly __brand: "gui.KEYBOARD_TYPE_EMAIL" };
    /**
     * number input keyboard
     */
    const KEYBOARD_TYPE_NUMBER_PAD: number & { readonly __brand: "gui.KEYBOARD_TYPE_NUMBER_PAD" };
    /**
     * password keyboard
     */
    const KEYBOARD_TYPE_PASSWORD: number & { readonly __brand: "gui.KEYBOARD_TYPE_PASSWORD" };
    /**
     * elliptical pie node bounds
     */
    const PIEBOUNDS_ELLIPSE: number & { readonly __brand: "gui.PIEBOUNDS_ELLIPSE" };
    /**
     * rectangular pie node bounds
     */
    const PIEBOUNDS_RECTANGLE: number & { readonly __brand: "gui.PIEBOUNDS_RECTANGLE" };
    /**
     * center pivot
     */
    const PIVOT_CENTER: number & { readonly __brand: "gui.PIVOT_CENTER" };
    /**
     * east pivot
     */
    const PIVOT_E: number & { readonly __brand: "gui.PIVOT_E" };
    /**
     * north pivot
     */
    const PIVOT_N: number & { readonly __brand: "gui.PIVOT_N" };
    /**
     * north-east pivot
     */
    const PIVOT_NE: number & { readonly __brand: "gui.PIVOT_NE" };
    /**
     * north-west pivot
     */
    const PIVOT_NW: number & { readonly __brand: "gui.PIVOT_NW" };
    /**
     * south pivot
     */
    const PIVOT_S: number & { readonly __brand: "gui.PIVOT_S" };
    /**
     * south-east pivot
     */
    const PIVOT_SE: number & { readonly __brand: "gui.PIVOT_SE" };
    /**
     * south-west pivot
     */
    const PIVOT_SW: number & { readonly __brand: "gui.PIVOT_SW" };
    /**
     * west pivot
     */
    const PIVOT_W: number & { readonly __brand: "gui.PIVOT_W" };
    /**
     * loop backward
     */
    const PLAYBACK_LOOP_BACKWARD: number & { readonly __brand: "gui.PLAYBACK_LOOP_BACKWARD" };
    /**
     * loop forward
     */
    const PLAYBACK_LOOP_FORWARD: number & { readonly __brand: "gui.PLAYBACK_LOOP_FORWARD" };
    /**
     * ping pong loop
     */
    const PLAYBACK_LOOP_PINGPONG: number & { readonly __brand: "gui.PLAYBACK_LOOP_PINGPONG" };
    /**
     * once backward
     */
    const PLAYBACK_ONCE_BACKWARD: number & { readonly __brand: "gui.PLAYBACK_ONCE_BACKWARD" };
    /**
     * once forward
     */
    const PLAYBACK_ONCE_FORWARD: number & { readonly __brand: "gui.PLAYBACK_ONCE_FORWARD" };
    /**
     * once forward and then backward
     */
    const PLAYBACK_ONCE_PINGPONG: number & { readonly __brand: "gui.PLAYBACK_ONCE_PINGPONG" };
    /**
     * color property
     */
    const PROP_COLOR: number & { readonly __brand: "gui.PROP_COLOR" };
    /**
     * euler property
     */
    const PROP_EULER: number & { readonly __brand: "gui.PROP_EULER" };
    /**
     * fill_angle property
     */
    const PROP_FILL_ANGLE: number & { readonly __brand: "gui.PROP_FILL_ANGLE" };
    /**
     * inner_radius property
     */
    const PROP_INNER_RADIUS: number & { readonly __brand: "gui.PROP_INNER_RADIUS" };
    /**
     * leading property
     */
    const PROP_LEADING: number & { readonly __brand: "gui.PROP_LEADING" };
    /**
     * outline color property
     */
    const PROP_OUTLINE: number & { readonly __brand: "gui.PROP_OUTLINE" };
    /**
     * position property
     */
    const PROP_POSITION: number & { readonly __brand: "gui.PROP_POSITION" };
    /**
     * rotation property
     */
    const PROP_ROTATION: number & { readonly __brand: "gui.PROP_ROTATION" };
    /**
     * scale property
     */
    const PROP_SCALE: number & { readonly __brand: "gui.PROP_SCALE" };
    /**
     * shadow color property
     */
    const PROP_SHADOW: number & { readonly __brand: "gui.PROP_SHADOW" };
    /**
     * size property
     */
    const PROP_SIZE: number & { readonly __brand: "gui.PROP_SIZE" };
    /**
     * slice9 property
     */
    const PROP_SLICE9: number & { readonly __brand: "gui.PROP_SLICE9" };
    /**
     * tracking property
     */
    const PROP_TRACKING: number & { readonly __brand: "gui.PROP_TRACKING" };
    /**
     * The provided data is not in the expected format or is in some other way
     * incorrect, for instance the image data provided to gui.new_texture().
     */
    const RESULT_DATA_ERROR: number & { readonly __brand: "gui.RESULT_DATA_ERROR" };
    /**
     * The system is out of resources, for instance when trying to create a new
     * texture using gui.new_texture().
     */
    const RESULT_OUT_OF_RESOURCES: number & { readonly __brand: "gui.RESULT_OUT_OF_RESOURCES" };
    /**
     * The texture id already exists when trying to use gui.new_texture().
     */
    const RESULT_TEXTURE_ALREADY_EXISTS: number & { readonly __brand: "gui.RESULT_TEXTURE_ALREADY_EXISTS" };
    /**
     * Safe area mode that applies insets on all edges.
     */
    const SAFE_AREA_BOTH: number & { readonly __brand: "gui.SAFE_AREA_BOTH" };
    /**
     * Safe area mode that applies insets only on the long edges.
     */
    const SAFE_AREA_LONG: number & { readonly __brand: "gui.SAFE_AREA_LONG" };
    /**
     * Safe area mode that ignores safe area insets.
     */
    const SAFE_AREA_NONE: number & { readonly __brand: "gui.SAFE_AREA_NONE" };
    /**
     * Safe area mode that applies insets only on the short edges.
     */
    const SAFE_AREA_SHORT: number & { readonly __brand: "gui.SAFE_AREA_SHORT" };
    /**
     * The size of the node is determined by the currently assigned texture.
     */
    const SIZE_MODE_AUTO: number & { readonly __brand: "gui.SIZE_MODE_AUTO" };
    /**
     * The size of the node is determined by the size set in the editor, the constructor or by gui.set_size()
     */
    const SIZE_MODE_MANUAL: number & { readonly __brand: "gui.SIZE_MODE_MANUAL" };
    /**
     * box type
     */
    const TYPE_BOX: number & { readonly __brand: "gui.TYPE_BOX" };
    /**
     * custom type
     */
    const TYPE_CUSTOM: number & { readonly __brand: "gui.TYPE_CUSTOM" };
    /**
     * particlefx type
     */
    const TYPE_PARTICLEFX: number & { readonly __brand: "gui.TYPE_PARTICLEFX" };
    /**
     * pie type
     */
    const TYPE_PIE: number & { readonly __brand: "gui.TYPE_PIE" };
    /**
     * text type
     */
    const TYPE_TEXT: number & { readonly __brand: "gui.TYPE_TEXT" };
    /**
     * This starts an animation of a node property according to the specified parameters.
     * If the node property is already being animated, that animation will be canceled and
     * replaced by the new one. Note however that several different node properties
     * can be animated simultaneously. Use `gui.cancel_animations` to stop the animation
     * before it has completed.
     * Composite properties of type vector3, vector4 or quaternion
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
     * @param property - property to animate
     *
     * - `"position"`
     *
     * - `"rotation"`
     *
     * - `"euler"`
     *
     * - `"scale"`
     *
     * - `"color"`
     *
     * - `"outline"`
     *
     * - `"shadow"`
     *
     * - `"size"`
     *
     * - `"fill_angle"` (pie)
     *
     * - `"inner_radius"` (pie)
     *
     * - `"leading"` (text)
     *
     * - `"tracking"` (text)
     *
     * - `"slice9"` (slice9)
     *
     * The following property constants are defined equaling the corresponding property string names.
     *
     * - `gui.PROP_POSITION`
     *
     * - `gui.PROP_ROTATION`
     *
     * - `gui.PROP_EULER`
     *
     * - `gui.PROP_SCALE`
     *
     * - `gui.PROP_COLOR`
     *
     * - `gui.PROP_OUTLINE`
     *
     * - `gui.PROP_SHADOW`
     *
     * - `gui.PROP_SIZE`
     *
     * - `gui.PROP_FILL_ANGLE`
     *
     * - `gui.PROP_INNER_RADIUS`
     *
     * - `gui.PROP_LEADING`
     *
     * - `gui.PROP_TRACKING`
     *
     * - `gui.PROP_SLICE9`
     * @param to - target property value
     * @param easing - easing to use during animation.
     * Either specify one of the `gui.EASING_*` constants or provide a
     * vector with a custom curve. See the animation guide for more information.
     * @param duration - duration of the animation in seconds.
     * @param delay - delay before the animation starts in seconds.
     * @param complete_function - function to call when the
     * animation has completed
     * @param playback - playback mode
     *
     * - `gui.PLAYBACK_ONCE_FORWARD`
     *
     * - `gui.PLAYBACK_ONCE_BACKWARD`
     *
     * - `gui.PLAYBACK_ONCE_PINGPONG`
     *
     * - `gui.PLAYBACK_LOOP_FORWARD`
     *
     * - `gui.PLAYBACK_LOOP_BACKWARD`
     *
     * - `gui.PLAYBACK_LOOP_PINGPONG`
     * @example
     * ```ts
     * // How to start a simple color animation, where the node fades in to white during 0.5 seconds:
     * gui.set_color(node, vmath.vector4(0, 0, 0, 0)); // node is fully transparent
     * gui.animate(node, gui.PROP_COLOR, vmath.vector4(1, 1, 1, 1), gui.EASING_INOUTQUAD, 0.5); // start animation
     *
     * // How to start a sequenced animation where the node fades in to white during 0.5
     * // seconds, stays visible for 2 seconds and then fades out:
     * function on_animation_done(self, node) {
     *   // fade out node, but wait 2 seconds before the animation starts
     *   gui.animate(node, gui.PROP_COLOR, vmath.vector4(0, 0, 0, 0), gui.EASING_OUTQUAD, 0.5, 2.0);
     * }
     *
     * export default defineScript({
     *   init(self) {
     *     // fetch the node we want to animate
     *     const my_node = gui.get_node("my_node");
     *     // node is initially set to fully transparent
     *     gui.set_color(my_node, vmath.vector4(0, 0, 0, 0));
     *     // animate the node immediately and call on_animation_done when the animation has completed
     *     gui.animate(my_node, gui.PROP_COLOR, vmath.vector4(1, 1, 1, 1), gui.EASING_INOUTQUAD, 0.5, 0.0, on_animation_done);
     *   },
     * });
     *
     * // How to animate a node's y position using a crazy custom easing curve:
     * export default defineScript({
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
    function animate(node: Opaque<"node">, property: string | Opaque<"constant">, to: number | Vector3 | Vector4 | Quaternion, easing: Opaque<"constant"> | Vector, duration: number, delay?: number, complete_function?: (self: unknown, node: unknown) => void, playback?: Opaque<"constant">): void;
    /**
     * If one or more animations of the specified node is currently running (started by `gui.animate`), they will immediately be canceled.
     *
     * @param node - node that should have its animation canceled
     * @param property - optional property for which the animation should be canceled
     *
     * - `"position"`
     *
     * - `"rotation"`
     *
     * - `"euler"`
     *
     * - `"scale"`
     *
     * - `"color"`
     *
     * - `"outline"`
     *
     * - `"shadow"`
     *
     * - `"size"`
     *
     * - `"fill_angle"` (pie)
     *
     * - `"inner_radius"` (pie)
     *
     * - `"leading"` (text)
     *
     * - `"tracking"` (text)
     *
     * - `"slice9"` (slice9)
     * @example
     * ```ts
     * // Start an animation of the position property of a node, then cancel parts of
     * // the animation:
     * const node = gui.get_node("my_node");
     * // animate to new position
     * const pos = vmath.vector3(100, 100, 0);
     * gui.animate(node, "position", pos, go.EASING_LINEAR, 2);
     * // ...
     * // cancel animation of the x component.
     * gui.cancel_animations(node, "position.x");
     *
     * // Cancels all property animations on a node in a single call:
     * // animate to new position and scale
     * gui.animate(node, "position", vmath.vector3(100, 100, 0), go.EASING_LINEAR, 5);
     * gui.animate(node, "scale", vmath.vector3(0.5), go.EASING_LINEAR, 5);
     * // ...
     * // cancel positioning and scaling at once
     * gui.cancel_animations(node);
     * ```
     */
    function cancel_animations(node: Opaque<"node">, property?: string | Opaque<"constant">): void;
    /**
     * Cancels any running flipbook animation on the specified node.
     *
     * @param node - node cancel flipbook animation for
     * @example
     * ```ts
     * const node = gui.get_node("anim_node");
     * gui.cancel_flipbook(node);
     * ```
     */
    function cancel_flipbook(node: Opaque<"node">): void;
    /**
     * Make a clone instance of a node. The cloned node will be identical to the
     * original node, except the id which is generated as the string "node" plus
     * a sequential unsigned integer value.
     * This function does not clone the supplied node's children nodes.
     * Use gui.clone_tree for that purpose.
     *
     * @param node - node to clone
     * @returns the cloned node
     */
    function clone(node: Opaque<"node">): Opaque<"node">;
    /**
     * Make a clone instance of a node and all its children.
     * Use gui.clone to clone a node excluding its children.
     *
     * @param node - root node to clone
     * @returns a table mapping node ids to the corresponding cloned nodes
     */
    function clone_tree(node: Opaque<"node">): LuaMap<Hash, Opaque<"node">>;
    /**
     * Deletes the specified node. Any child nodes of the specified node will be
     * recursively deleted.
     *
     * @param node - node to delete
     * @example
     * ```ts
     * // Delete a particular node and any child nodes it might have:
     * const node = gui.get_node("my_node");
     * gui.delete_node(node);
     * ```
     */
    function delete_node(node: Opaque<"node">): void;
    /**
     * Delete a dynamically created texture.
     *
     * @param texture - texture id
     * @example
     * ```ts
     * export default defineScript({
     *   init(self) {
     *     // Create a texture.
     *     if (gui.new_texture("temp_tx", 10, 10, "rgb", "\0".repeat(10 * 10 * 3))) {
     *       // Do something with the texture.
     *       // ...
     *
     *       // Delete the texture
     *       gui.delete_texture("temp_tx");
     *     }
     *   },
     * });
     * ```
     */
    function delete_texture(texture: string | Hash): void;
    /**
     * This is a callback-function, which is called by the engine when a gui component is finalized (destroyed). It can
     * be used to e.g. take some last action, report the finalization to other game object instances
     * or release user input focus (see `release_input_focus`). There is no use in starting any animations or similar
     * from this function since the gui component is about to be destroyed.
     *
     * @param self - reference to the script state to be used for storing data
     * @example
     * ```ts
     * export default defineScript({
     *   final(self) {
     *     // report finalization
     *     msg.post("my_friend_instance", "im_dead", { my_stats: self.some_value });
     *   },
     * });
     * ```
     */
    function final(self: Opaque<"userdata">): void;
    /**
     * Instead of using specific getters such as gui.get_position or gui.get_scale,
     * you can use gui.get instead and supply the property as a string or a hash.
     * While this function is similar to go.get, there are a few more restrictions
     * when operating in the gui namespace. Most notably, only these explicitly named properties are supported:
     *
     * - `"position"`
     *
     * - `"rotation"`
     *
     * - `"euler"`
     *
     * - `"scale"`
     *
     * - `"color"`
     *
     * - `"outline"`
     *
     * - `"shadow"`
     *
     * - `"size"`
     *
     * - `"fill_angle"` (pie)
     *
     * - `"inner_radius"` (pie)
     *
     * - `"leading"` (text)
     *
     * - `"tracking"` (text)
     *
     * - `"slice9"` (slice9)
     *
     * The value returned will either be a vmath.vector4 or a single number, i.e getting the "position"
     * property will return a vec4 while getting the "position.x" property will return a single value.
     * You can also use this function to get material constants.
     *
     * @param node - node to get the property for
     * @param property - the property to retrieve
     * @param options - optional options table (only applicable for material constants)
     * - `index` number index into array property (1 based)
     * @example
     * ```ts
     * // Get properties on existing nodes:
     * const node = gui.get_node("my_box_node");
     * const node_position = gui.get(node, "position");
     * ```
     */
    function get(node: Opaque<"node">, property: string | Hash | Opaque<"constant">, options?: { index?: number }): unknown;
    /**
     * Returns the adjust mode of a node.
     * The adjust mode defines how the node will adjust itself to screen
     * resolutions that differs from the one in the project settings.
     *
     * @param node - node from which to get the adjust mode (node)
     * @returns the current adjust mode
     *
     * - `gui.ADJUST_FIT`
     *
     * - `gui.ADJUST_ZOOM`
     *
     * - `gui.ADJUST_STRETCH`
     */
    function get_adjust_mode(node: Opaque<"node">): Opaque<"constant">;
    /**
     * gets the node alpha
     *
     * @param node - node from which to get alpha
     * @returns alpha
     */
    function get_alpha(node: Opaque<"node">): number;
    /**
     * Returns the blend mode of a node.
     * Blend mode defines how the node will be blended with the background.
     *
     * @param node - node from which to get the blend mode
     * @returns blend mode
     *
     * - `gui.BLEND_ALPHA`
     *
     * - `gui.BLEND_ADD`
     *
     * - `gui.BLEND_ADD_ALPHA`
     *
     * - `gui.BLEND_MULT`
     *
     * - `gui.BLEND_SCREEN`
     */
    function get_blend_mode(node: Opaque<"node">): Opaque<"constant">;
    /**
     * If node is set as an inverted clipping node, it will clip anything inside as opposed to outside.
     *
     * @param node - node from which to get the clipping inverted state
     * @returns `true` or `false`
     */
    function get_clipping_inverted(node: Opaque<"node">): boolean;
    /**
     * Clipping mode defines how the node will clip it's children nodes
     *
     * @param node - node from which to get the clipping mode
     * @returns clipping mode
     *
     * - `gui.CLIPPING_MODE_NONE`
     *
     * - `gui.CLIPPING_MODE_STENCIL`
     */
    function get_clipping_mode(node: Opaque<"node">): Opaque<"constant">;
    /**
     * If node is set as visible clipping node, it will be shown as well as clipping. Otherwise, it will only clip but not show visually.
     *
     * @param node - node from which to get the clipping visibility state
     * @returns `true` or `false`
     */
    function get_clipping_visible(node: Opaque<"node">): boolean;
    /**
     * Returns the color of the supplied node. The components
     * of the returned vector4 contains the color channel values:
     *
     * Component
     * Color value
     *
     * x
     * Red value
     *
     * y
     * Green value
     *
     * z
     * Blue value
     *
     * w
     * Alpha value
     *
     * @param node - node to get the color from
     * @returns node color
     */
    function get_color(node: Opaque<"node">): Vector4;
    /**
     * Returns the rotation of the supplied node.
     * The rotation is expressed in degree Euler angles.
     *
     * @param node - node to get the rotation from
     * @returns node rotation
     */
    function get_euler(node: Opaque<"node">): Vector3;
    /**
     * Returns the sector angle of a pie node.
     *
     * @param node - node from which to get the fill angle
     * @returns sector angle
     */
    function get_fill_angle(node: Opaque<"node">): number;
    /**
     * Get node flipbook animation.
     *
     * @param node - node to get flipbook animation from
     * @returns animation id
     */
    function get_flipbook(node: Opaque<"node">): Hash;
    /**
     * This is only useful nodes with flipbook animations. Gets the normalized cursor of the flipbook animation on a node.
     *
     * @param node - node to get the cursor for (node)
     * @returns cursor value
     */
    function get_flipbook_cursor(node: Opaque<"node">): number;
    /**
     * This is only useful nodes with flipbook animations. Gets the playback rate of the flipbook animation on a node.
     *
     * @param node - node to set the cursor for
     * @returns playback rate
     */
    function get_flipbook_playback_rate(node: Opaque<"node">): number;
    /**
     * This is only useful for text nodes. The font must be mapped to the gui scene in the gui editor.
     *
     * @param node - node from which to get the font
     * @returns font id
     */
    function get_font(node: Opaque<"node">): Hash;
    /**
     * This is only useful for text nodes. The font must be mapped to the gui scene in the gui editor.
     *
     * @param font_name - font of which to get the path hash
     * @returns path hash to resource
     * @example
     * ```ts
     * // Get the text metrics for a text
     * export default defineScript({
     *   init(self) {
     *     const node = gui.get_node("name");
     *     const font_name = gui.get_font(node);
     *     const font = gui.get_font_resource(font_name);
     *     const metrics = resource.get_text_metrics(font, "The quick brown fox\n jumps over the lazy dog");
     *   },
     * });
     * ```
     */
    function get_font_resource(font_name: Hash | string): Hash;
    /**
     * Returns the scene height.
     *
     * @returns scene height
     */
    function get_height(): number;
    /**
     * Retrieves the id of the specified node.
     *
     * @param node - the node to retrieve the id from
     * @returns the id of the node
     * @example
     * ```ts
     * // Gets the id of a node:
     * const node = gui.get_node("my_node");
     *
     * const id = gui.get_id(node);
     * print(id); // => hash: [my_node]
     * ```
     */
    function get_id(node: Opaque<"node">): Hash;
    /**
     * Retrieve the index of the specified node among its siblings.
     * The index defines the order in which a node appear in a GUI scene.
     * Higher index means the node is drawn on top of lower indexed nodes.
     *
     * @param node - the node to retrieve the id from
     * @returns the index of the node
     * @example
     * ```ts
     * // Compare the index order of two sibling nodes:
     * const node1 = gui.get_node("my_node_1");
     * const node2 = gui.get_node("my_node_2");
     *
     * if (gui.get_index(node1) < gui.get_index(node2)) {
     *   // node1 is drawn below node2
     * } else {
     *   // node2 is drawn below node1
     * }
     * ```
     */
    function get_index(node: Opaque<"node">): number;
    /**
     * gets the node inherit alpha state
     *
     * @param node - node from which to get the inherit alpha state
     * @returns `true` or `false`
     */
    function get_inherit_alpha(node: Opaque<"node">): boolean;
    /**
     * Returns the inner radius of a pie node.
     * The radius is defined along the x-axis.
     *
     * @param node - node from where to get the inner radius
     * @returns inner radius
     */
    function get_inner_radius(node: Opaque<"node">): number;
    /**
     * The layer must be mapped to the gui scene in the gui editor.
     *
     * @param node - node from which to get the layer
     * @returns layer id
     */
    function get_layer(node: Opaque<"node">): Hash;
    /**
     * gets the scene current layout
     *
     * @returns layout id
     */
    function get_layout(): Hash;
    /**
     * Returns a table mapping each layout id hash to a vector3(width, height, 0). For the default layout,
     * the current scene resolution is returned. If a layout name is not present in the Display Profiles (or when
     * no display profiles are assigned), the width/height pair is 0.
     *
     * @returns layout_id_hash -> vmath.vector3(width, height, 0)
     */
    function get_layouts(): LuaMap<Hash, Vector3>;
    /**
     * Returns the leading value for a text node.
     *
     * @param node - node from where to get the leading
     * @returns leading scaling value (default=1)
     */
    function get_leading(node: Opaque<"node">): number;
    /**
     * Returns whether a text node is in line-break mode or not.
     * This is only useful for text nodes.
     *
     * @param node - node from which to get the line-break for
     * @returns `true` or `false`
     */
    function get_line_break(node: Opaque<"node">): boolean;
    /**
     * Returns the material of a node.
     * The material must be mapped to the gui scene in the gui editor.
     *
     * @param node - node to get the material for
     * @returns material id
     * @example
     * ```ts
     * // Getting the material for a node, and assign it to another node:
     * const node1 = gui.get_node("my_node");
     * const node2 = gui.get_node("other_node");
     * const node1_material = gui.get_material(node1);
     * gui.set_material(node2, node1_material);
     * ```
     */
    function get_material(node: Opaque<"node">): Hash;
    /**
     * Retrieves the node with the specified id.
     *
     * @param id - id of the node to retrieve
     * @returns a new node instance
     * @example
     * ```ts
     * // Gets a node by id and change its color:
     * const node = gui.get_node("my_node");
     * const red = vmath.vector4(1.0, 0.0, 0.0, 1.0);
     * gui.set_color(node, red);
     * ```
     */
    function get_node(id: string | Hash): Opaque<"node">;
    /**
     * Returns the outer bounds mode for a pie node.
     *
     * @param node - node from where to get the outer bounds mode
     * @returns the outer bounds mode of the pie node:
     *
     * - `gui.PIEBOUNDS_RECTANGLE`
     *
     * - `gui.PIEBOUNDS_ELLIPSE`
     */
    function get_outer_bounds(node: Opaque<"node">): Opaque<"constant">;
    /**
     * Returns the outline color of the supplied node.
     * See gui.get_color for info how vectors encode color values.
     *
     * @param node - node to get the outline color from
     * @returns outline color
     */
    function get_outline(node: Opaque<"node">): Vector4;
    /**
     * Returns the parent node of the specified node.
     * If the supplied node does not have a parent, `nil` is returned.
     *
     * @param node - the node from which to retrieve its parent
     * @returns parent instance or `nil`
     */
    function get_parent(node: Opaque<"node">): Opaque<"node"> | undefined;
    /**
     * Get the paricle fx for a gui node
     *
     * @param node - node to get particle fx for
     * @returns particle fx id
     */
    function get_particlefx(node: Opaque<"node">): Hash;
    /**
     * Returns the number of generated vertices around the perimeter
     * of a pie node.
     *
     * @param node - pie node
     * @returns vertex count
     */
    function get_perimeter_vertices(node: Opaque<"node">): number;
    /**
     * The pivot specifies how the node is drawn and rotated from its position.
     *
     * @param node - node to get pivot from
     * @returns pivot constant
     *
     * - `gui.PIVOT_CENTER`
     *
     * - `gui.PIVOT_N`
     *
     * - `gui.PIVOT_NE`
     *
     * - `gui.PIVOT_E`
     *
     * - `gui.PIVOT_SE`
     *
     * - `gui.PIVOT_S`
     *
     * - `gui.PIVOT_SW`
     *
     * - `gui.PIVOT_W`
     *
     * - `gui.PIVOT_NW`
     */
    function get_pivot(node: Opaque<"node">): Opaque<"constant">;
    /**
     * Returns the position of the supplied node.
     *
     * @param node - node to get the position from
     * @returns node position
     */
    function get_position(node: Opaque<"node">): Vector3;
    /**
     * Returns the rotation of the supplied node.
     * The rotation is expressed as a quaternion
     *
     * @param node - node to get the rotation from
     * @returns node rotation
     */
    function get_rotation(node: Opaque<"node">): Quaternion;
    /**
     * Returns the scale of the supplied node.
     *
     * @param node - node to get the scale from
     * @returns node scale
     */
    function get_scale(node: Opaque<"node">): Vector3;
    /**
     * Returns the screen position of the supplied node. This function returns the
     * calculated transformed position of the node, taking into account any parent node
     * transforms.
     *
     * @param node - node to get the screen position from
     * @returns node screen position
     */
    function get_screen_position(node: Opaque<"node">): Vector3;
    /**
     * Returns the shadow color of the supplied node.
     * See gui.get_color for info how vectors encode color values.
     *
     * @param node - node to get the shadow color from
     * @returns node shadow color
     */
    function get_shadow(node: Opaque<"node">): Vector4;
    /**
     * Returns the size of the supplied node.
     *
     * @param node - node to get the size from
     * @returns node size
     */
    function get_size(node: Opaque<"node">): Vector3;
    /**
     * Returns the size of a node.
     * The size mode defines how the node will adjust itself in size. Automatic
     * size mode alters the node size based on the node's content. Automatic size
     * mode works for Box nodes and Pie nodes which will both adjust their size
     * to match the assigned image. Particle fx and Text nodes will ignore
     * any size mode setting.
     *
     * @param node - node from which to get the size mode (node)
     * @returns the current size mode
     *
     * - `gui.SIZE_MODE_MANUAL`
     *
     * - `gui.SIZE_MODE_AUTO`
     */
    function get_size_mode(node: Opaque<"node">): Opaque<"constant">;
    /**
     * Returns the slice9 configuration values for the node.
     *
     * @param node - node to manipulate
     * @returns configuration values
     */
    function get_slice9(node: Opaque<"node">): Vector4;
    /**
     * Returns the text value of a text node. This is only useful for text nodes.
     *
     * @param node - node from which to get the text
     * @returns text value
     */
    function get_text(node: Opaque<"node">): string;
    /**
     * Returns the texture of a node.
     * This is currently only useful for box or pie nodes.
     * The texture must be mapped to the gui scene in the gui editor.
     *
     * @param node - node to get texture from
     * @returns texture id
     */
    function get_texture(node: Opaque<"node">): Hash;
    /**
     * Returns the tracking value of a text node.
     *
     * @param node - node from where to get the tracking
     * @returns tracking scaling number (default=0)
     */
    function get_tracking(node: Opaque<"node">): number;
    /**
     * Get a node and all its children as a Lua table.
     *
     * @param node - root node to get node tree from
     * @returns a table mapping node ids to the corresponding nodes
     */
    function get_tree(node: Opaque<"node">): LuaMap<Hash, Opaque<"node">>;
    /**
     * gets the node type
     *
     * @param node - node from which to get the type
     */
    function get_type(node: Opaque<"node">): LuaMultiReturn<[Opaque<"constant">, number | undefined]>;
    /**
     * Returns `true` if a node is visible and `false` if it's not.
     * Invisible nodes are not rendered.
     *
     * @param node - node to query
     * @returns whether the node is visible or not
     */
    function get_visible(node: Opaque<"node">): boolean;
    /**
     * Returns the scene width.
     *
     * @returns scene width
     */
    function get_width(): number;
    /**
     * The x-anchor specifies how the node is moved when the game is run in a different resolution.
     *
     * @param node - node to get x-anchor from
     * @returns anchor constant
     *
     * - `gui.ANCHOR_NONE`
     *
     * - `gui.ANCHOR_LEFT`
     *
     * - `gui.ANCHOR_RIGHT`
     */
    function get_xanchor(node: Opaque<"node">): Opaque<"constant">;
    /**
     * The y-anchor specifies how the node is moved when the game is run in a different resolution.
     *
     * @param node - node to get y-anchor from
     * @returns anchor constant
     *
     * - `gui.ANCHOR_NONE`
     *
     * - `gui.ANCHOR_TOP`
     *
     * - `gui.ANCHOR_BOTTOM`
     */
    function get_yanchor(node: Opaque<"node">): Opaque<"constant">;
    /**
     * Hides the on-display touch keyboard on the device.
     */
    function hide_keyboard(): void;
    /**
     * This is a callback-function, which is called by the engine when a gui component is initialized. It can be used
     * to set the initial state of the script and gui scene.
     *
     * @param self - reference to the script state to be used for storing data
     * @example
     * ```ts
     * export default defineScript({
     *   init() {
     *     // set up useful data
     *     return { my_value: 1 };
     *   },
     * });
     * ```
     */
    function init(self: Opaque<"userdata">): void;
    /**
     * Returns `true` if a node is enabled and `false` if it's not.
     * Disabled nodes are not rendered and animations acting on them are not evaluated.
     *
     * @param node - node to query
     * @param recursive - check hierarchy recursively
     * @returns whether the node is enabled or not
     */
    function is_enabled(node: Opaque<"node">, recursive?: boolean): boolean;
    /**
     * Alters the ordering of the two supplied nodes by moving the first node
     * above the second.
     * If the second argument is `nil` the first node is moved to the top.
     *
     * @param node - to move
     * @param reference - reference node above which the first node should be moved
     */
    function move_above(node: Opaque<"node">, reference?: Opaque<"node">): void;
    /**
     * Alters the ordering of the two supplied nodes by moving the first node
     * below the second.
     * If the second argument is `nil` the first node is moved to the bottom.
     *
     * @param node - to move
     * @param reference - reference node below which the first node should be moved
     */
    function move_below(node: Opaque<"node">, reference?: Opaque<"node">): void;
    /**
     * Dynamically create a new box node.
     *
     * @param pos - node position
     * @param size - node size
     * @returns new box node
     */
    function new_box_node(pos: Vector3 | Vector4, size: Vector3): Opaque<"node">;
    /**
     * Dynamically create a particle fx node.
     *
     * @param pos - node position
     * @param particlefx - particle fx resource name
     * @returns new particle fx node
     */
    function new_particlefx_node(pos: Vector3 | Vector4, particlefx: Hash | string): Opaque<"node">;
    /**
     * Dynamically create a new pie node.
     *
     * @param pos - node position
     * @param size - node size
     * @returns new pie node
     */
    function new_pie_node(pos: Vector3 | Vector4, size: Vector3): Opaque<"node">;
    /**
     * Dynamically create a new text node.
     *
     * @param pos - node position
     * @param text - node text
     * @returns new text node
     */
    function new_text_node(pos: Vector3 | Vector4, text: string): Opaque<"node">;
    /**
     * Dynamically create a new texture.
     *
     * @param texture_id - texture id
     * @param width - texture width
     * @param height - texture height
     * @param type - texture type
     *
     * - `"rgb"` - RGB
     *
     * - `"rgba"` - RGBA
     *
     * - `"l"` - LUMINANCE
     *
     * - `"astc"` - ASTC compressed format
     * @param buffer - texture data
     * @param flip - flip texture vertically
     * @example
     * ```ts
     * // How to create a texture and apply it to a new box node:
     * export default defineScript({
     *   init(self) {
     *     const w = 200;
     *     const h = 300;
     *
     *     // A nice orange. String with the RGB values.
     *     const orange = String.fromCharCode(0xff, 0x80, 0x10);
     *
     *     // Create the texture. Repeat the color string for each pixel.
     *     const [ok, reason] = gui.new_texture("orange_tx", w, h, "rgb", orange.repeat(w * h));
     *     if (ok) {
     *       // Create a box node and apply the texture to it.
     *       const n = gui.new_box_node(vmath.vector3(200, 200, 0), vmath.vector3(w, h, 0));
     *       gui.set_texture(n, "orange_tx");
     *     } else {
     *       // Could not create texture for some reason...
     *       if (reason === gui.RESULT_TEXTURE_ALREADY_EXISTS) {
     *         // ...
     *       } else {
     *         // ...
     *       }
     *     }
     *   },
     * });
     *
     * // How to create a texture using .astc format
     * const path = "/assets/images/logo_4x4.astc";
     * const buffer = sys.load_resource(path);
     * const n = gui.new_box_node(pos, vmath.vector3(size, size, 0));
     * // size is read from the .astc buffer
     * // flip is not supported
     * gui.new_texture(path, 0, 0, "astc", buffer, false);
     * gui.set_texture(n, path);
     * ```
     */
    function new_texture(texture_id: string | Hash, width: number, height: number, type: string | Opaque<"constant">, buffer: string, flip: boolean): LuaMultiReturn<[boolean, number]>;
    /**
     * This is a callback-function, which is called by the engine when user input is sent to the instance of the gui component.
     * It can be used to take action on the input, e.g. modify the gui according to the input.
     * For an instance to obtain user input, it must first acquire input
     * focus through the message `acquire_input_focus`.
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
     * @returns optional boolean to signal if the input should be consumed (not passed on to others) or not, default is false
     * @example
     * ```ts
     * export default defineScript({
     *   on_input(self, action_id, action) {
     *     // check for input
     *     if (action_id === hash("my_action")) {
     *       // take appropriate action
     *       self.my_value = action.value;
     *     }
     *     // consume input
     *     return true;
     *   },
     * });
     * ```
     */
    function on_input(self: Opaque<"userdata">, action_id: Hash, action: { value?: number; pressed?: boolean; released?: boolean; repeated?: boolean; x?: number; y?: number; screen_x?: number; screen_y?: number; dx?: number; dy?: number; screen_dx?: number; screen_dy?: number; gamepad?: number; gamepad_axis?: Vector3; touch?: { id?: number; pressed?: boolean; released?: boolean; tap_count?: number; x?: number; y?: number; dx?: number; dy?: number; acc_x?: number; acc_y?: number; acc_z?: number }[]; text?: string }): boolean | undefined;
    /**
     * This is a callback-function, which is called by the engine whenever a message has been sent to the gui component.
     * It can be used to take action on the message, e.g. update the gui or send a response back to the sender of the message.
     * The `message` parameter is a table containing the message data. If the message is sent from the engine, the
     * documentation of the message specifies which data is supplied.
     * See the update function for examples on how to use this callback-function.
     *
     * @param self - reference to the script state to be used for storing data
     * @param message_id - id of the received message
     * @param message - a table containing the message data
     */
    function on_message(self: Opaque<"userdata">, message_id: Hash, message: Record<string | number, unknown>): void;
    /**
     * This is a callback-function, which is called by the engine when the gui script is reloaded, e.g. from the editor.
     * It can be used for live development, e.g. to tweak constants or set up the state properly for the script.
     *
     * @param self - reference to the script state to be used for storing data
     * @example
     * ```ts
     * export default defineGuiScript({
     *   on_reload(self) {
     *     // restore some color (or similar)
     *     gui.set_color(gui.get_node("my_node"), self.my_original_color);
     *   },
     * });
     * ```
     */
    function on_reload(self: Opaque<"userdata">): void;
    /**
     * Tests whether a coordinate is within the bounding box of a
     * node.
     *
     * @param node - node to be tested for picking
     * @param x - x-coordinate (see on_input )
     * @param y - y-coordinate (see on_input )
     * @returns pick result
     */
    function pick_node(node: Opaque<"node">, x: number, y: number): boolean;
    /**
     * Play flipbook animation on a box or pie node.
     * The current node texture must contain the animation.
     * Use this function to set one-frame still images on the node.
     *
     * @param node - node to set animation for
     * @param animation - animation id
     * @param complete_function - optional function to call when the animation has completed
     *
     * `self`
     *
     * object The current object.
     *
     * `node`
     *
     * node The node that is animated.
     * @param play_properties - optional table with properties
     *
     * `offset`
     * number The normalized initial value of the animation cursor when the animation starts playing
     * `playback_rate`
     * number The rate with which the animation will be played. Must be positive
     * @example
     * ```ts
     * // Set the texture of a node to a flipbook animation from an atlas:
     * function anim_callback(self, node) {
     *   // Take action after animation has played.
     * }
     *
     * export default defineScript({
     *   init(self) {
     *     // Create a new node and set the texture to a flipbook animation
     *     const node = gui.get_node("button_node");
     *     gui.set_texture(node, "gui_sprites");
     *     gui.play_flipbook(node, "animated_button");
     *   },
     * });
     *
     * // Set the texture of a node to an image from an atlas:
     * // Create a new node and set the texture to a "button.png" from atlas
     * const node = gui.get_node("button_node");
     * gui.set_texture(node, "gui_sprites");
     * gui.play_flipbook(node, "button");
     * ```
     */
    function play_flipbook(node: Opaque<"node">, animation: string | Hash, complete_function?: (self: unknown, node: unknown) => void, play_properties?: { offset?: number; playback_rate?: number }): void;
    /**
     * Plays the paricle fx for a gui node
     *
     * @param node - node to play particle fx for
     * @param emitter_state_function - optional callback function that will be called when an emitter attached to this particlefx changes state.
     *
     * `self`
     * object The current object
     * `node`
     * hash The particle fx node, or `nil` if the node was deleted
     * `emitter`
     * hash The id of the emitter
     * `state`
     * constant the new state of the emitter:
     *
     * - `particlefx.EMITTER_STATE_SLEEPING`
     *
     * - `particlefx.EMITTER_STATE_PRESPAWN`
     *
     * - `particlefx.EMITTER_STATE_SPAWNING`
     *
     * - `particlefx.EMITTER_STATE_POSTSPAWN`
     * @example
     * ```ts
     * // How to play a particle fx when a gui node is created.
     * // The callback receives the gui node, the hash of the id
     * // of the emitter, and the new state of the emitter as particlefx.EMITTER_STATE_.
     * function emitter_state_change(self, node, emitter, state) {
     *   if (emitter === hash("exhaust") && state === particlefx.EMITTER_STATE_POSTSPAWN) {
     *     // exhaust is done spawning particles...
     *   }
     * }
     *
     * export default defineScript({
     *   init(self) {
     *     gui.play_particlefx(gui.get_node("particlefx"), emitter_state_change);
     *   },
     * });
     * ```
     */
    function play_particlefx(node: Opaque<"node">, emitter_state_function?: (self: unknown, node: unknown, emitter: unknown, state: unknown) => void): void;
    /**
     * Resets the input context of keyboard. This will clear marked text.
     */
    function reset_keyboard(): void;
    /**
     * Resets the node material to the material assigned in the gui scene.
     *
     * @param node - node to reset the material for
     * @example
     * ```ts
     * // Resetting the material for a node:
     * const node = gui.get_node("my_node");
     * gui.reset_material(node);
     * ```
     */
    function reset_material(node: Opaque<"node">): void;
    /**
     * Resets all nodes in the current GUI scene to their initial state.
     * The reset only applies to static node loaded from the scene.
     * Nodes that are created dynamically from script are not affected.
     */
    function reset_nodes(): void;
    /**
     * Convert the screen position to the local position of supplied node
     *
     * @param node - node used for getting local transformation matrix
     * @param screen_position - screen position
     * @returns local position
     */
    function screen_to_local(node: Opaque<"node">, screen_position: Vector3): Vector3;
    /**
     * Instead of using specific setteres such as gui.set_position or gui.set_scale,
     * you can use gui.set instead and supply the property as a string or a hash.
     * While this function is similar to go.get and go.set, there are a few more restrictions
     * when operating in the gui namespace. Most notably, only these named properties identifiers are supported:
     *
     * - `"position"`
     *
     * - `"rotation"`
     *
     * - `"euler"`
     *
     * - `"scale"`
     *
     * - `"color"`
     *
     * - `"outline"`
     *
     * - `"shadow"`
     *
     * - `"size"`
     *
     * - `"fill_angle"` (pie)
     *
     * - `"inner_radius"` (pie)
     *
     * - `"leading"` (text)
     *
     * - `"tracking"` (text)
     *
     * - `"slice9"` (slice9)
     *
     * The value to set must either be a vmath.vector4, vmath.vector3, vmath.quat or a single number and depends on the property name you want to set.
     * I.e when setting the "position" property, you need to use a vmath.vector4 and when setting a single component of the property,
     * such as "position.x", you need to use a single value.
     * Note: When setting the rotation using the "rotation" property, you need to pass in a vmath.quat. This behaviour is different than from the gui.set_rotation function,
     * the intention is to move new functionality closer to go namespace so that migrating between gui and go is easier. To set the rotation using degrees instead,
     * use the "euler" property instead. The rotation and euler properties are linked, changing one of them will change the backing data of the other.
     * Similar to go.set, you can also use gui.set for setting material constant values on a node. E.g if a material has specified a constant called `tint` in
     * the .material file, you can use gui.set to set the value of that constant by calling `gui.set(node, "tint", vmath.vec4(1,0,0,1))`, or `gui.set(node, "matrix", vmath.matrix4())`
     * if the constant is a matrix. Arrays are also supported by gui.set - to set an array constant, you need to pass in an options table with the 'index' key set.
     * If the material has a constant array called 'tint_array' specified in the material, you can use `gui.set(node, "tint_array", vmath.vec4(1,0,0,1), { index = 4})` to set the fourth array element to a different value.
     *
     * @param node - node to set the property for, or msg.url() to the gui itself
     * @param property - the property to set
     * @param value - the property to set
     * @param options - optional options table (only applicable for material constants)
     * - `index` number index into array property (1 based)
     * - `key` hash name of internal property
     * @example
     * ```ts
     * // Updates the position property on an existing node:
     * const node = gui.get_node("my_box_node");
     * const node_position = gui.get(node, "position");
     * gui.set(node, "position.x", node_position.x + 128);
     *
     * // Updates the rotation property on an existing node:
     * gui.set(node, "rotation", vmath.quat_rotation_z(math.rad(45)));
     * // this is equivalent to:
     * gui.set(node, "euler.z", 45);
     * // or using the entire vector:
     * gui.set(node, "euler", vmath.vector3(0, 0, 45));
     * // or using the set_rotation
     * gui.set_rotation(node, vmath.vector3(0, 0, 45));
     *
     * // Sets various material constants for a node:
     * gui.set(node, "tint", vmath.vector4(1, 0, 0, 1));
     * // matrix4 is also supported
     * gui.set(node, "light_matrix", vmath.matrix4());
     * // update a constant in an array at position 4. the array is specified in the shader as:
     * // uniform vec4 tint_array[4]; // lua is 1 based, shader is 0 based
     * gui.set(node, "tint_array", vmath.vector4(1, 0, 0, 1), { index: 4 });
     * // update a matrix constant in an array at position 4. the array is specified in the shader as:
     * // uniform mat4 light_matrix_array[4];
     * gui.set(node, "light_matrix_array", vmath.matrix4(), { index: 4 });
     * // update a sub-element in a constant
     * gui.set(node, "tint.x", 1);
     * // update a sub-element in an array constant at position 4
     * gui.set(node, "tint_array.x", 1, { index: 4 });
     *
     * // Set a named property
     * export default defineScript({
     *   on_message(self, message_id, message) {
     *     if (message_id === hash("set_font")) {
     *       gui.set(msg.url(), "fonts", message.font, { key: "my_font_name" });
     *       gui.set_font(gui.get_node("text"), "my_font_name");
     *     } else if (message_id === hash("set_texture")) {
     *       gui.set(msg.url(), "textures", message.texture, { key: "my_texture" });
     *       gui.set_texture(gui.get_node("box"), "my_texture");
     *       gui.play_flipbook(gui.get_node("box"), "logo_256");
     *     }
     *   },
     * });
     * ```
     */
    function set(node: Opaque<"node"> | Url, property: string | Hash | Opaque<"constant">, value: number | Vector4 | Vector3 | Quaternion, options?: { index?: number; key?: Hash }): void;
    /**
     * Sets the adjust mode on a node.
     * The adjust mode defines how the node will adjust itself to screen
     * resolutions that differs from the one in the project settings.
     *
     * @param node - node to set adjust mode for
     * @param adjust_mode - adjust mode to set
     *
     * - `gui.ADJUST_FIT`
     *
     * - `gui.ADJUST_ZOOM`
     *
     * - `gui.ADJUST_STRETCH`
     */
    function set_adjust_mode(node: Opaque<"node">, adjust_mode: Opaque<"constant">): void;
    /**
     * sets the node alpha
     *
     * @param node - node for which to set alpha
     * @param alpha - 0..1 alpha color
     */
    function set_alpha(node: Opaque<"node">, alpha: number): void;
    /**
     * Set the blend mode of a node.
     * Blend mode defines how the node will be blended with the background.
     *
     * @param node - node to set blend mode for
     * @param blend_mode - blend mode to set
     *
     * - `gui.BLEND_ALPHA`
     *
     * - `gui.BLEND_ADD`
     *
     * - `gui.BLEND_ADD_ALPHA`
     *
     * - `gui.BLEND_MULT`
     *
     * - `gui.BLEND_SCREEN`
     */
    function set_blend_mode(node: Opaque<"node">, blend_mode: Opaque<"constant">): void;
    /**
     * If node is set as an inverted clipping node, it will clip anything inside as opposed to outside.
     *
     * @param node - node to set clipping inverted state for
     * @param inverted - `true` or `false`
     */
    function set_clipping_inverted(node: Opaque<"node">, inverted: boolean): void;
    /**
     * Clipping mode defines how the node will clip it's children nodes
     *
     * @param node - node to set clipping mode for
     * @param clipping_mode - clipping mode to set
     *
     * - `gui.CLIPPING_MODE_NONE`
     *
     * - `gui.CLIPPING_MODE_STENCIL`
     */
    function set_clipping_mode(node: Opaque<"node">, clipping_mode: Opaque<"constant">): void;
    /**
     * If node is set as an visible clipping node, it will be shown as well as clipping. Otherwise, it will only clip but not show visually.
     *
     * @param node - node to set clipping visibility for
     * @param visible - `true` or `false`
     */
    function set_clipping_visible(node: Opaque<"node">, visible: boolean): void;
    /**
     * Sets the color of the supplied node. The components
     * of the supplied vector3 or vector4 should contain the color channel values:
     *
     * Component
     * Color value
     *
     * x
     * Red value
     *
     * y
     * Green value
     *
     * z
     * Blue value
     *
     * w vector4
     * Alpha value
     *
     * @param node - node to set the color for
     * @param color - new color
     */
    function set_color(node: Opaque<"node">, color: Vector3 | Vector4): void;
    /**
     * Sets a node to the disabled or enabled state.
     * Disabled nodes are not rendered and animations acting on them are not evaluated.
     *
     * @param node - node to be enabled/disabled
     * @param enabled - whether the node should be enabled or not
     */
    function set_enabled(node: Opaque<"node">, enabled: boolean): void;
    /**
     * Sets the rotation of the supplied node.
     * The rotation is expressed in degree Euler angles.
     *
     * @param node - node to set the rotation for
     * @param rotation - new rotation
     */
    function set_euler(node: Opaque<"node">, rotation: Vector3 | Vector4): void;
    /**
     * Set the sector angle of a pie node.
     *
     * @param node - node to set the fill angle for
     * @param angle - sector angle
     */
    function set_fill_angle(node: Opaque<"node">, angle: number): void;
    /**
     * This is only useful nodes with flipbook animations. The cursor is normalized.
     *
     * @param node - node to set the cursor for
     * @param cursor - cursor value
     */
    function set_flipbook_cursor(node: Opaque<"node">, cursor: number): void;
    /**
     * This is only useful nodes with flipbook animations. Sets the playback rate of the flipbook animation on a node. Must be positive.
     *
     * @param node - node to set the cursor for
     * @param playback_rate - playback rate
     */
    function set_flipbook_playback_rate(node: Opaque<"node">, playback_rate: number): void;
    /**
     * This is only useful for text nodes.
     * The font must be mapped to the gui scene in the gui editor.
     *
     * @param node - node for which to set the font
     * @param font - font id
     */
    function set_font(node: Opaque<"node">, font: string | Hash): void;
    /**
     * Set the id of the specicied node to a new value.
     * Nodes created with the gui.new_*_node() functions get
     * an empty id. This function allows you to give dynamically
     * created nodes an id.
     * No checking is done on the uniqueness of supplied ids.
     * It is up to you to make sure you use unique ids.
     *
     * @param node - node to set the id for
     * @param id - id to set
     * @example
     * ```ts
     * // Create a new node and set its id:
     * const pos = vmath.vector3(100, 100, 0);
     * const size = vmath.vector3(100, 100, 0);
     * const node = gui.new_box_node(pos, size);
     * gui.set_id(node, "my_new_node");
     * ```
     */
    function set_id(node: Opaque<"node">, id: string | Hash): void;
    /**
     * sets the node inherit alpha state
     *
     * @param node - node from which to set the inherit alpha state
     * @param inherit_alpha - `true` or `false`
     */
    function set_inherit_alpha(node: Opaque<"node">, inherit_alpha: boolean): void;
    /**
     * Sets the inner radius of a pie node.
     * The radius is defined along the x-axis.
     *
     * @param node - node to set the inner radius for
     * @param radius - inner radius
     */
    function set_inner_radius(node: Opaque<"node">, radius: number): void;
    /**
     * The layer must be mapped to the gui scene in the gui editor.
     *
     * @param node - node for which to set the layer
     * @param layer - layer id
     */
    function set_layer(node: Opaque<"node">, layer: string | Hash): void;
    /**
     * Applies a named layout on the GUI scene. This re-applies per-layout node descriptors
     * and, if a matching Display Profile exists, updates the scene resolution. Emits
     * the "layout_changed" message to the scene script when the layout actually changes.
     *
     * @param layout - the layout id to apply
     * @returns true if the layout exists in the scene and was applied, false otherwise
     */
    function set_layout(layout: string | Hash): boolean;
    /**
     * Sets the leading value for a text node. This value is used to
     * scale the line spacing of text.
     *
     * @param node - node for which to set the leading
     * @param leading - a scaling value for the line spacing (default=1)
     */
    function set_leading(node: Opaque<"node">, leading: number): void;
    /**
     * Sets the line-break mode on a text node.
     * This is only useful for text nodes.
     *
     * @param node - node to set line-break for
     * @param line_break - `true` or `false`
     */
    function set_line_break(node: Opaque<"node">, line_break: boolean): void;
    /**
     * Set the material on a node. The material must be mapped to the gui scene in the gui editor,
     * and assigning a material is supported for all node types. To set the default material that
     * is assigned to the gui scene node, use `gui.reset_material(node_id)` instead.
     *
     * @param node - node to set material for
     * @param material - material id
     * @example
     * ```ts
     * // Assign an existing material to a node:
     * const node = gui.get_node("my_node");
     * gui.set_material(node, "my_material");
     * ```
     */
    function set_material(node: Opaque<"node">, material: string | Hash): void;
    /**
     * Sets the outer bounds mode for a pie node.
     *
     * @param node - node for which to set the outer bounds mode
     * @param bounds_mode - the outer bounds mode of the pie node:
     *
     * - `gui.PIEBOUNDS_RECTANGLE`
     *
     * - `gui.PIEBOUNDS_ELLIPSE`
     */
    function set_outer_bounds(node: Opaque<"node">, bounds_mode: Opaque<"constant">): void;
    /**
     * Sets the outline color of the supplied node.
     * See gui.set_color for info how vectors encode color values.
     *
     * @param node - node to set the outline color for
     * @param color - new outline color
     */
    function set_outline(node: Opaque<"node">, color: Vector3 | Vector4): void;
    /**
     * Sets the parent node of the specified node.
     *
     * @param node - node for which to set its parent
     * @param parent - parent node to set, pass `nil` to remove parent
     * @param keep_scene_transform - optional flag to make the scene position being perserved
     */
    function set_parent(node: Opaque<"node">, parent?: Opaque<"node">, keep_scene_transform?: boolean): void;
    /**
     * Set the paricle fx for a gui node
     *
     * @param node - node to set particle fx for
     * @param particlefx - particle fx id
     */
    function set_particlefx(node: Opaque<"node">, particlefx: Hash | string): void;
    /**
     * Sets the number of generated vertices around the perimeter of a pie node.
     *
     * @param node - pie node
     * @param vertices - vertex count
     */
    function set_perimeter_vertices(node: Opaque<"node">, vertices: number): void;
    /**
     * The pivot specifies how the node is drawn and rotated from its position.
     *
     * @param node - node to set pivot for
     * @param pivot - pivot constant
     *
     * - `gui.PIVOT_CENTER`
     *
     * - `gui.PIVOT_N`
     *
     * - `gui.PIVOT_NE`
     *
     * - `gui.PIVOT_E`
     *
     * - `gui.PIVOT_SE`
     *
     * - `gui.PIVOT_S`
     *
     * - `gui.PIVOT_SW`
     *
     * - `gui.PIVOT_W`
     *
     * - `gui.PIVOT_NW`
     */
    function set_pivot(node: Opaque<"node">, pivot: Opaque<"constant">): void;
    /**
     * Sets the position of the supplied node.
     *
     * @param node - node to set the position for
     * @param position - new position
     */
    function set_position(node: Opaque<"node">, position: Vector3 | Vector4): void;
    /**
     * Set the order number for the current GUI scene.
     * The number dictates the sorting of the "gui" render predicate,
     * in other words in which order the scene will be rendered in relation
     * to other currently rendered GUI scenes.
     * The number must be in the range 0 to 15.
     *
     * @param order - rendering order (0-15)
     */
    function set_render_order(order: number): void;
    /**
     * Sets the rotation of the supplied node.
     * The rotation is expressed as a quaternion
     *
     * @param node - node to set the rotation for
     * @param rotation - new rotation
     */
    function set_rotation(node: Opaque<"node">, rotation: Quaternion | Vector4): void;
    /**
     * Sets how the safe area is applied to this gui scene.
     *
     * @param mode - safe area mode
     *
     * - `gui.SAFE_AREA_NONE`
     *
     * - `gui.SAFE_AREA_LONG`
     *
     * - `gui.SAFE_AREA_SHORT`
     *
     * - `gui.SAFE_AREA_BOTH`
     */
    function set_safe_area_mode(mode: Opaque<"constant">): void;
    /**
     * Sets the scaling of the supplied node.
     *
     * @param node - node to set the scale for
     * @param scale - new scale
     */
    function set_scale(node: Opaque<"node">, scale: Vector3 | Vector4): void;
    /**
     * Set the screen position to the supplied node
     *
     * @param node - node to set the screen position to
     * @param screen_position - screen position
     */
    function set_screen_position(node: Opaque<"node">, screen_position: Vector3): void;
    /**
     * Sets the shadow color of the supplied node.
     * See gui.set_color for info how vectors encode color values.
     *
     * @param node - node to set the shadow color for
     * @param color - new shadow color
     */
    function set_shadow(node: Opaque<"node">, color: Vector3 | Vector4): void;
    /**
     * Sets the size of the supplied node.
     * You can only set size on nodes with size mode set to SIZE_MODE_MANUAL
     *
     * @param node - node to set the size for
     * @param size - new size
     */
    function set_size(node: Opaque<"node">, size: Vector3 | Vector4): void;
    /**
     * Sets the size mode of a node.
     * The size mode defines how the node will adjust itself in size. Automatic
     * size mode alters the node size based on the node's content. Automatic size
     * mode works for Box nodes and Pie nodes which will both adjust their size
     * to match the assigned image. Particle fx and Text nodes will ignore
     * any size mode setting.
     *
     * @param node - node to set size mode for
     * @param size_mode - size mode to set
     *
     * - `gui.SIZE_MODE_MANUAL`
     *
     * - `gui.SIZE_MODE_AUTO`
     */
    function set_size_mode(node: Opaque<"node">, size_mode: Opaque<"constant">): void;
    /**
     * Set the slice9 configuration values for the node.
     *
     * @param node - node to manipulate
     * @param values - new values
     */
    function set_slice9(node: Opaque<"node">, values: Vector4): void;
    /**
     * Set the text value of a text node. This is only useful for text nodes.
     *
     * @param node - node to set text for
     * @param text - text to set
     */
    function set_text(node: Opaque<"node">, text: string | number): void;
    /**
     * Set the texture on a box or pie node. The texture must be mapped to
     * the gui scene in the gui editor. The function points out which texture
     * the node should render from. If the texture is an atlas, further
     * information is needed to select which image/animation in the atlas
     * to render. In such cases, use `gui.play_flipbook()` in
     * addition to this function.
     *
     * @param node - node to set texture for
     * @param texture - texture id
     * @example
     * ```ts
     * // To set a texture (or animation) from an atlas:
     * const node = gui.get_node("box_node");
     * gui.set_texture(node, "my_atlas");
     * gui.play_flipbook(node, "image");
     *
     * // Set a dynamically created texture to a node. Note that there is only
     * // one texture image in this case so gui.set_texture() is sufficient.
     * const w = 200;
     * const h = 300;
     * // A nice orange. String with the RGB values.
     * const orange = String.fromCharCode(0xff, 0x80, 0x10);
     * // Create the texture. Repeat the color string for each pixel.
     * if (gui.new_texture("orange_tx", w, h, "rgb", orange.repeat(w * h))) {
     *   gui.set_texture(node, "orange_tx");
     * }
     * ```
     */
    function set_texture(node: Opaque<"node">, texture: string | Hash): void;
    /**
     * Set the texture buffer data for a dynamically created texture.
     *
     * @param texture - texture id
     * @param width - texture width
     * @param height - texture height
     * @param type - texture type
     *
     * - `"rgb"` - RGB
     *
     * - `"rgba"` - RGBA
     *
     * - `"l"` - LUMINANCE
     *
     * - `"astc"` - ASTC compressed format
     * @param buffer - texture data
     * @param flip - flip texture vertically
     * @returns setting the data was successful
     * @example
     * ```ts
     * export default defineScript({
     *   init(self) {
     *     const w = 200;
     *     const h = 300;
     *
     *     // Create a dynamic texture, all white.
     *     if (gui.new_texture("dynamic_tx", w, h, "rgb", String.fromCharCode(0xff).repeat(w * h * 3))) {
     *       // Create a box node and apply the texture to it.
     *       const n = gui.new_box_node(vmath.vector3(200, 200, 0), vmath.vector3(w, h, 0));
     *       gui.set_texture(n, "dynamic_tx");
     *
     *       // ...
     *
     *       // Change the data in the texture to a nice orange.
     *       const orange = String.fromCharCode(0xff, 0x80, 0x10);
     *       if (gui.set_texture_data("dynamic_tx", w, h, "rgb", orange.repeat(w * h))) {
     *         // Go on and to more stuff
     *         // ...
     *       }
     *     } else {
     *       // Something went wrong
     *       // ...
     *     }
     *   },
     * });
     * ```
     */
    function set_texture_data(texture: string | Hash, width: number, height: number, type: string | Opaque<"constant">, buffer: string, flip: boolean): boolean;
    /**
     * Sets the tracking value of a text node. This value is used to
     * adjust the vertical spacing of characters in the text.
     *
     * @param node - node for which to set the tracking
     * @param tracking - a scaling number for the letter spacing (default=0)
     */
    function set_tracking(node: Opaque<"node">, tracking: number): void;
    /**
     * Set if a node should be visible or not. Only visible nodes are rendered.
     *
     * @param node - node to be visible or not
     * @param visible - whether the node should be visible or not
     */
    function set_visible(node: Opaque<"node">, visible: boolean): void;
    /**
     * The x-anchor specifies how the node is moved when the game is run in a different resolution.
     *
     * @param node - node to set x-anchor for
     * @param anchor - anchor constant
     *
     * - `gui.ANCHOR_NONE`
     *
     * - `gui.ANCHOR_LEFT`
     *
     * - `gui.ANCHOR_RIGHT`
     */
    function set_xanchor(node: Opaque<"node">, anchor: Opaque<"constant">): void;
    /**
     * The y-anchor specifies how the node is moved when the game is run in a different resolution.
     *
     * @param node - node to set y-anchor for
     * @param anchor - anchor constant
     *
     * - `gui.ANCHOR_NONE`
     *
     * - `gui.ANCHOR_TOP`
     *
     * - `gui.ANCHOR_BOTTOM`
     */
    function set_yanchor(node: Opaque<"node">, anchor: Opaque<"constant">): void;
    /**
     * Shows the on-display touch keyboard.
     * The specified type of keyboard is displayed if it is available on
     * the device.
     * This function is only available on iOS and Android. .
     *
     * @param type - keyboard type
     *
     * - `gui.KEYBOARD_TYPE_DEFAULT`
     *
     * - `gui.KEYBOARD_TYPE_EMAIL`
     *
     * - `gui.KEYBOARD_TYPE_NUMBER_PAD`
     *
     * - `gui.KEYBOARD_TYPE_PASSWORD`
     * @param autoclose - if the keyboard should automatically close when clicking outside
     */
    function show_keyboard(type: Opaque<"constant">, autoclose: boolean): void;
    /**
     * Stops the particle fx for a gui node
     *
     * @param node - node to stop particle fx for
     * @param options - options when stopping the particle fx. Supported options:
     *
     * - boolean `clear`: instantly clear spawned particles
     */
    function stop_particlefx(node: Opaque<"node">, options?: { clear?: boolean }): void;
    /**
     * This is a callback-function, which is called by the engine every frame to update the state of a gui component.
     * It can be used to perform any kind of gui related tasks, e.g. animating nodes.
     *
     * @param self - reference to the script state to be used for storing data
     * @param dt - the time-step of the frame update
     * @example
     * ```ts
     * // This example demonstrates how to update a text node that displays game score
     * // in a counting fashion. It is assumed that the gui component receives messages
     * // from the game when a new score is to be shown.
     * export default defineGuiScript({
     *   init(self) {
     *     // fetch the score text node for later use (assumes it is called "score")
     *     self.score_node = gui.get_node("score");
     *     // keep track of the current score counted up so far
     *     self.current_score = 0;
     *     // keep track of the target score we should count up to
     *     self.target_score = 0;
     *     // how fast we will update the score, in score/second
     *     self.score_update_speed = 1;
     *   },
     *
     *   update(self, dt) {
     *     // check if target score is more than current score
     *     if (self.current_score < self.target_score) {
     *       // increment current score according to the speed
     *       self.current_score = self.current_score + dt * self.score_update_speed;
     *       // check if we went past the target score, clamp current score in that case
     *       if (self.current_score > self.target_score) {
     *         self.current_score = self.target_score;
     *       }
     *       // update the score text node
     *       gui.set_text(self.score_node, "" + math.floor(self.current_score));
     *     }
     *   },
     *
     *   on_message(self, message_id, message) {
     *     // check the message
     *     if (message_id === hash("set_score")) {
     *       self.target_score = message.score;
     *     }
     *   },
     * });
     * ```
     */
    function update(self: Opaque<"userdata">, dt: number): void;
    interface properties {
      /**
       * The fonts used in the gui. The type of the property is hash.
       * Key must be specified in options table.
       */
      fonts: Hash;
      /**
       * The main material (the default material assigned to a GUI) used when rendering the gui. The type of the property is hash.
       */
      material: Hash;
      /**
       * The materials used when rendering the gui. The type of the property is hash.
       * Key must be specified in options table.
       */
      materials: Hash;
      /**
       * The textures used in the gui. The type of the property is hash.
       * Key must be specified in options table.
       */
      textures: Hash;
    }
  }
}

export {};
