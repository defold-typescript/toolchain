/** @noSelfInFile */
import type { Hash, Matrix4, Opaque, Quaternion, Url, Vector, Vector3, Vector4 } from "../src/core-types";

declare global {
  /**
   * Functions, core hooks, messages and constants for manipulation of
   * game objects. The "go" namespace is accessible from game object script
   * files.
   */
  namespace go {
    /**
     * in-back
     */
    export const EASING_INBACK: number & { readonly __brand: "go.EASING_INBACK" };
    /**
     * in-bounce
     */
    export const EASING_INBOUNCE: number & { readonly __brand: "go.EASING_INBOUNCE" };
    /**
     * in-circlic
     */
    export const EASING_INCIRC: number & { readonly __brand: "go.EASING_INCIRC" };
    /**
     * in-cubic
     */
    export const EASING_INCUBIC: number & { readonly __brand: "go.EASING_INCUBIC" };
    /**
     * in-elastic
     */
    export const EASING_INELASTIC: number & { readonly __brand: "go.EASING_INELASTIC" };
    /**
     * in-exponential
     */
    export const EASING_INEXPO: number & { readonly __brand: "go.EASING_INEXPO" };
    /**
     * in-out-back
     */
    export const EASING_INOUTBACK: number & { readonly __brand: "go.EASING_INOUTBACK" };
    /**
     * in-out-bounce
     */
    export const EASING_INOUTBOUNCE: number & { readonly __brand: "go.EASING_INOUTBOUNCE" };
    /**
     * in-out-circlic
     */
    export const EASING_INOUTCIRC: number & { readonly __brand: "go.EASING_INOUTCIRC" };
    /**
     * in-out-cubic
     */
    export const EASING_INOUTCUBIC: number & { readonly __brand: "go.EASING_INOUTCUBIC" };
    /**
     * in-out-elastic
     */
    export const EASING_INOUTELASTIC: number & { readonly __brand: "go.EASING_INOUTELASTIC" };
    /**
     * in-out-exponential
     */
    export const EASING_INOUTEXPO: number & { readonly __brand: "go.EASING_INOUTEXPO" };
    /**
     * in-out-quadratic
     */
    export const EASING_INOUTQUAD: number & { readonly __brand: "go.EASING_INOUTQUAD" };
    /**
     * in-out-quartic
     */
    export const EASING_INOUTQUART: number & { readonly __brand: "go.EASING_INOUTQUART" };
    /**
     * in-out-quintic
     */
    export const EASING_INOUTQUINT: number & { readonly __brand: "go.EASING_INOUTQUINT" };
    /**
     * in-out-sine
     */
    export const EASING_INOUTSINE: number & { readonly __brand: "go.EASING_INOUTSINE" };
    /**
     * in-quadratic
     */
    export const EASING_INQUAD: number & { readonly __brand: "go.EASING_INQUAD" };
    /**
     * in-quartic
     */
    export const EASING_INQUART: number & { readonly __brand: "go.EASING_INQUART" };
    /**
     * in-quintic
     */
    export const EASING_INQUINT: number & { readonly __brand: "go.EASING_INQUINT" };
    /**
     * in-sine
     */
    export const EASING_INSINE: number & { readonly __brand: "go.EASING_INSINE" };
    /**
     * linear interpolation
     */
    export const EASING_LINEAR: number & { readonly __brand: "go.EASING_LINEAR" };
    /**
     * out-back
     */
    export const EASING_OUTBACK: number & { readonly __brand: "go.EASING_OUTBACK" };
    /**
     * out-bounce
     */
    export const EASING_OUTBOUNCE: number & { readonly __brand: "go.EASING_OUTBOUNCE" };
    /**
     * out-circlic
     */
    export const EASING_OUTCIRC: number & { readonly __brand: "go.EASING_OUTCIRC" };
    /**
     * out-cubic
     */
    export const EASING_OUTCUBIC: number & { readonly __brand: "go.EASING_OUTCUBIC" };
    /**
     * out-elastic
     */
    export const EASING_OUTELASTIC: number & { readonly __brand: "go.EASING_OUTELASTIC" };
    /**
     * out-exponential
     */
    export const EASING_OUTEXPO: number & { readonly __brand: "go.EASING_OUTEXPO" };
    /**
     * out-in-back
     */
    export const EASING_OUTINBACK: number & { readonly __brand: "go.EASING_OUTINBACK" };
    /**
     * out-in-bounce
     */
    export const EASING_OUTINBOUNCE: number & { readonly __brand: "go.EASING_OUTINBOUNCE" };
    /**
     * out-in-circlic
     */
    export const EASING_OUTINCIRC: number & { readonly __brand: "go.EASING_OUTINCIRC" };
    /**
     * out-in-cubic
     */
    export const EASING_OUTINCUBIC: number & { readonly __brand: "go.EASING_OUTINCUBIC" };
    /**
     * out-in-elastic
     */
    export const EASING_OUTINELASTIC: number & { readonly __brand: "go.EASING_OUTINELASTIC" };
    /**
     * out-in-exponential
     */
    export const EASING_OUTINEXPO: number & { readonly __brand: "go.EASING_OUTINEXPO" };
    /**
     * out-in-quadratic
     */
    export const EASING_OUTINQUAD: number & { readonly __brand: "go.EASING_OUTINQUAD" };
    /**
     * out-in-quartic
     */
    export const EASING_OUTINQUART: number & { readonly __brand: "go.EASING_OUTINQUART" };
    /**
     * out-in-quintic
     */
    export const EASING_OUTINQUINT: number & { readonly __brand: "go.EASING_OUTINQUINT" };
    /**
     * out-in-sine
     */
    export const EASING_OUTINSINE: number & { readonly __brand: "go.EASING_OUTINSINE" };
    /**
     * out-quadratic
     */
    export const EASING_OUTQUAD: number & { readonly __brand: "go.EASING_OUTQUAD" };
    /**
     * out-quartic
     */
    export const EASING_OUTQUART: number & { readonly __brand: "go.EASING_OUTQUART" };
    /**
     * out-quintic
     */
    export const EASING_OUTQUINT: number & { readonly __brand: "go.EASING_OUTQUINT" };
    /**
     * out-sine
     */
    export const EASING_OUTSINE: number & { readonly __brand: "go.EASING_OUTSINE" };
    /**
     * loop backward
     */
    export const PLAYBACK_LOOP_BACKWARD: number & { readonly __brand: "go.PLAYBACK_LOOP_BACKWARD" };
    /**
     * loop forward
     */
    export const PLAYBACK_LOOP_FORWARD: number & { readonly __brand: "go.PLAYBACK_LOOP_FORWARD" };
    /**
     * ping pong loop
     */
    export const PLAYBACK_LOOP_PINGPONG: number & { readonly __brand: "go.PLAYBACK_LOOP_PINGPONG" };
    /**
     * no playback
     */
    export const PLAYBACK_NONE: number & { readonly __brand: "go.PLAYBACK_NONE" };
    /**
     * once backward
     */
    export const PLAYBACK_ONCE_BACKWARD: number & { readonly __brand: "go.PLAYBACK_ONCE_BACKWARD" };
    /**
     * once forward
     */
    export const PLAYBACK_ONCE_FORWARD: number & { readonly __brand: "go.PLAYBACK_ONCE_FORWARD" };
    /**
     * once ping pong
     */
    export const PLAYBACK_ONCE_PINGPONG: number & { readonly __brand: "go.PLAYBACK_ONCE_PINGPONG" };
    /**
     * This is only supported for numerical properties. If the node property is already being
     * animated, that animation will be canceled and replaced by the new one.
     * If a `complete_function` (lua function) is specified, that function will be called when the animation has completed.
     * By starting a new animation in that function, several animations can be sequenced together. See the examples for more information.
     * If you call `go.animate()` from a game object's `final()` function,
     * any passed `complete_function` will be ignored and never called upon animation completion.
     * See the properties guide for which properties can be animated and the animation guide for how
     * them.
     *
     * @param url - url of the game object or component having the property
     * @param property - id of the property to animate
     * @param playback - playback mode of the animation
     *
     * - `go.PLAYBACK_ONCE_FORWARD`
     *
     * - `go.PLAYBACK_ONCE_BACKWARD`
     *
     * - `go.PLAYBACK_ONCE_PINGPONG`
     *
     * - `go.PLAYBACK_LOOP_FORWARD`
     *
     * - `go.PLAYBACK_LOOP_BACKWARD`
     *
     * - `go.PLAYBACK_LOOP_PINGPONG`
     * @param to - target property value
     * @param easing - easing to use during animation. Either specify a constant, see the animation guide for a complete list, or a vmath.vector with a curve
     * @param duration - duration of the animation in seconds
     * @param delay - delay before the animation starts in seconds
     * @param complete_function - optional function to call when the animation has completed
     *
     * `self`
     *
     * object The current object.
     *
     * `url`
     *
     * url The game object or component instance for which the property is animated.
     *
     * `property`
     *
     * hash The id of the animated property.
     * @example
     * ```ts
     * // Animate the position of a game object to x = 10 during 1 second, then
     * // y = 20 during 1 second:
     * go.animate(go.get_id(), "position.x", go.PLAYBACK_ONCE_FORWARD, 10, go.EASING_LINEAR, 1, 0, () => {
     *   go.animate(go.get_id(), "position.y", go.PLAYBACK_ONCE_FORWARD, 20, go.EASING_LINEAR, 1);
     * });
     *
     * // Animate the y position of a game object using a crazy custom easing curve:
     * const values = [
     *   0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     *   0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     *   0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     *   0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
     * ];
     * const vec = vmath.vector(values);
     * go.animate("go", "position.y", go.PLAYBACK_LOOP_PINGPONG, 100, vec, 2.0);
     * ```
     */
    export function animate(url: string | Hash | Url, property: string | Hash, playback: number & { readonly __brand: "go.PLAYBACK_ONCE_FORWARD" } | number & { readonly __brand: "go.PLAYBACK_ONCE_BACKWARD" } | number & { readonly __brand: "go.PLAYBACK_ONCE_PINGPONG" } | number & { readonly __brand: "go.PLAYBACK_LOOP_FORWARD" } | number & { readonly __brand: "go.PLAYBACK_LOOP_BACKWARD" } | number & { readonly __brand: "go.PLAYBACK_LOOP_PINGPONG" }, to: number | Vector3 | Vector4 | Quaternion, easing: Vector | number & { readonly __brand: "go.EASING_INBACK" } | number & { readonly __brand: "go.EASING_INBOUNCE" } | number & { readonly __brand: "go.EASING_INCIRC" } | number & { readonly __brand: "go.EASING_INCUBIC" } | number & { readonly __brand: "go.EASING_INELASTIC" } | number & { readonly __brand: "go.EASING_INEXPO" } | number & { readonly __brand: "go.EASING_INOUTBACK" } | number & { readonly __brand: "go.EASING_INOUTBOUNCE" } | number & { readonly __brand: "go.EASING_INOUTCIRC" } | number & { readonly __brand: "go.EASING_INOUTCUBIC" } | number & { readonly __brand: "go.EASING_INOUTELASTIC" } | number & { readonly __brand: "go.EASING_INOUTEXPO" } | number & { readonly __brand: "go.EASING_INOUTQUAD" } | number & { readonly __brand: "go.EASING_INOUTQUART" } | number & { readonly __brand: "go.EASING_INOUTQUINT" } | number & { readonly __brand: "go.EASING_INOUTSINE" } | number & { readonly __brand: "go.EASING_INQUAD" } | number & { readonly __brand: "go.EASING_INQUART" } | number & { readonly __brand: "go.EASING_INQUINT" } | number & { readonly __brand: "go.EASING_INSINE" } | number & { readonly __brand: "go.EASING_LINEAR" } | number & { readonly __brand: "go.EASING_OUTBACK" } | number & { readonly __brand: "go.EASING_OUTBOUNCE" } | number & { readonly __brand: "go.EASING_OUTCIRC" } | number & { readonly __brand: "go.EASING_OUTCUBIC" } | number & { readonly __brand: "go.EASING_OUTELASTIC" } | number & { readonly __brand: "go.EASING_OUTEXPO" } | number & { readonly __brand: "go.EASING_OUTINBACK" } | number & { readonly __brand: "go.EASING_OUTINBOUNCE" } | number & { readonly __brand: "go.EASING_OUTINCIRC" } | number & { readonly __brand: "go.EASING_OUTINCUBIC" } | number & { readonly __brand: "go.EASING_OUTINELASTIC" } | number & { readonly __brand: "go.EASING_OUTINEXPO" } | number & { readonly __brand: "go.EASING_OUTINQUAD" } | number & { readonly __brand: "go.EASING_OUTINQUART" } | number & { readonly __brand: "go.EASING_OUTINQUINT" } | number & { readonly __brand: "go.EASING_OUTINSINE" } | number & { readonly __brand: "go.EASING_OUTQUAD" } | number & { readonly __brand: "go.EASING_OUTQUART" } | number & { readonly __brand: "go.EASING_OUTQUINT" } | number & { readonly __brand: "go.EASING_OUTSINE" }, duration: number, delay?: number, complete_function?: (self: unknown, url: unknown, property: unknown) => void): void;
    /**
     * By calling this function, all or specified stored property animations of the game object or component will be canceled.
     * See the properties guide for which properties can be animated and the animation guide for how to animate them.
     *
     * @param url - url of the game object or component
     * @param property - optional id of the property to cancel
     * @example
     * ```ts
     * // Cancel the animation of the position of a game object:
     * go.cancel_animations(go.get_id(), "position");
     *
     * // Cancel all property animations of the current game object:
     * go.cancel_animations(".");
     *
     * // Cancel all property animations of the sprite component of the current game object:
     * go.cancel_animations("#sprite");
     * ```
     */
    export function cancel_animations(url: string | Hash | Url, property?: string | Hash): void;
    /**
     * Delete one or more game objects identified by id. Deletion is asynchronous meaning that
     * the game object(s) are scheduled for deletion which will happen at the end of the current
     * frame. Note that game objects scheduled for deletion will be counted against
     * `max_instances` in "game.project" until they are actually removed.
     * Deleting a game object containing a particle FX component emitting particles will not immediately stop the particle FX from emitting particles. You need to manually stop the particle FX using `particlefx.stop()`.
     * Deleting a game object containing a sound component that is playing will not immediately stop the sound from playing. You need to manually stop the sound using `sound.stop()`.
     *
     * @param id - optional id or table of id's of the instance(s) to delete, the instance of the calling script is deleted by default
     * @param recursive - optional boolean, set to true to recursively delete child hiearchy in child to parent order
     * @example
     * ```ts
     * // This example demonstrates how to delete game objects:
     * // Delete the script's own game object.
     * go.delete();
     * // Delete a game object with the id "my_game_object".
     * const id = go.get_id("my_game_object");
     * go.delete(id);
     * // Delete a list of game objects.
     * const ids = [hash("/my_object_1"), hash("/my_object_2"), hash("/my_object_3")];
     * go.delete(ids);
     *
     * // This example demonstrates how to delete game objects and their children
     * // (child-to-parent order):
     * // Delete the script's own game object and its children.
     * go.delete(true);
     * // Delete a game object with the id "my_game_object" and its children.
     * const id2 = go.get_id("my_game_object");
     * go.delete(id2, true);
     * // Delete a list of game objects and their children.
     * const ids2 = [hash("/my_object_1"), hash("/my_object_2"), hash("/my_object_3")];
     * go.delete(ids2, true);
     * ```
     */
    function _delete(id?: string | Hash | Url | (string | Hash | Url)[], recursive?: boolean): void;
    /**
     * This function can check for game objects in any collection by specifying
     * the collection name in the URL.
     *
     * @param url - url of the game object to check
     * @returns true if the game object exists
     * @example
     * ```ts
     * // Check if game object "my_game_object" exists in the current collection:
     * go.exists("/my_game_object");
     *
     * // Check if game object exists in another collection:
     * go.exists("other_collection:/my_game_object");
     * ```
     */
    export function exists(url: string | Hash | Url): boolean;
    /**
     * This is a callback-function, which is called by the engine when a script component is finalized (destroyed). It can
     * be used to e.g. take some last action, report the finalization to other game object instances, delete spawned objects
     * or release user input focus (see release_input_focus).
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
    export function final(self: Opaque<"userdata">): void;
    /**
     * This is a callback-function, which is called by the engine at fixed intervals to update the state of a script
     * component. The function will be called if 'Fixed Update Frequency' is enabled in the Engine section of game.project.
     * It can for instance be used to update game logic with the physics simulation if using a fixed timestep for the
     * physics (enabled by ticking 'Use Fixed Timestep' in the Physics section of game.project).
     *
     * @param self - reference to the script state to be used for storing data
     * @param dt - the time-step of the frame update
     */
    export function fixed_update(self: Opaque<"userdata">, dt: number): void;
    /**
     * Returns or constructs an instance identifier. The instance id is a hash
     * of the absolute path to the instance.
     *
     * - If `path` is specified, it can either be absolute or relative to the instance of the calling script.
     *
     * - If `path` is not specified, the id of the game object instance the script is attached to will be returned.
     *
     * @param path - path of the instance for which to return the id
     * @returns instance id
     * @example
     * ```ts
     * // For the instance with path /my_sub_collection/my_instance, the following calls
     * // are equivalent:
     * const id = go.get_id(); // no path, defaults to the instance containing the calling script
     * print(id); // => hash: [/my_sub_collection/my_instance]
     *
     * const id2 = go.get_id("/my_sub_collection/my_instance"); // absolute path
     * print(id2); // => hash: [/my_sub_collection/my_instance]
     *
     * const id3 = go.get_id("my_instance"); // relative path
     * print(id3); // => hash: [/my_sub_collection/my_instance]
     * ```
     */
    export function get_id(path?: string): Hash;
    /**
     * Get the parent for a game object instance.
     *
     * @param id - optional id of the game object instance to get parent for, defaults to the instance containing the calling script
     * @returns parent instance or `nil`
     * @example
     * ```ts
     * // Get parent of the instance containing the calling script:
     * const parent_id = go.get_parent();
     *
     * // Get parent of the instance with id "x":
     * const parent_id2 = go.get_parent("x");
     * ```
     */
    export function get_parent(id?: string | Hash | Url): Hash | unknown;
    /**
     * The position is relative the parent (if any). Use go.get_world_position to retrieve the global world position.
     *
     * @param id - optional id of the game object instance to get the position for, by default the instance of the calling script
     * @returns instance position
     * @example
     * ```ts
     * // Get the position of the game object the script is attached to:
     * const p = go.get_position();
     *
     * // Get the position of another game object "my_gameobject":
     * const pos = go.get_position("my_gameobject");
     * ```
     */
    export function get_position(id?: string | Hash | Url): Vector3;
    /**
     * The rotation is relative to the parent (if any). Use go.get_world_rotation to retrieve the global world rotation.
     *
     * @param id - optional id of the game object instance to get the rotation for, by default the instance of the calling script
     * @returns instance rotation
     * @example
     * ```ts
     * // Get the rotation of the game object the script is attached to:
     * const r = go.get_rotation();
     *
     * // Get the rotation of another game object with id "x":
     * const r2 = go.get_rotation("x");
     * ```
     */
    export function get_rotation(id?: string | Hash | Url): Quaternion;
    /**
     * The scale is relative the parent (if any). Use go.get_world_scale to retrieve the global world 3D scale factor.
     *
     * @param id - optional id of the game object instance to get the scale for, by default the instance of the calling script
     * @returns instance scale factor
     * @example
     * ```ts
     * // Get the scale of the game object the script is attached to:
     * const s = go.get_scale();
     *
     * // Get the scale of another game object with id "x":
     * const s2 = go.get_scale("x");
     * ```
     */
    export function get_scale(id?: string | Hash | Url): Vector3;
    /**
     * The uniform scale is relative the parent (if any). If the underlying scale vector is non-uniform the min element of the vector is returned as the uniform scale factor.
     *
     * @param id - optional id of the game object instance to get the uniform scale for, by default the instance of the calling script
     * @returns uniform instance scale factor
     * @example
     * ```ts
     * // Get the uniform scale of the game object the script is attached to:
     * const s = go.get_scale_uniform();
     *
     * // Get the uniform scale of another game object with id "x":
     * const s2 = go.get_scale_uniform("x");
     * ```
     */
    export function get_scale_uniform(id?: string | Hash | Url): number;
    /**
     * The function will return the world position calculated at the end of the previous frame.
     * To recalculate it within the current frame, use go.update_world_transform on the instance before calling this.
     * Use go.get_position to retrieve the position relative to the parent.
     *
     * @param id - optional id of the game object instance to get the world position for, by default the instance of the calling script
     * @returns instance world position
     * @example
     * ```ts
     * // Get the world position of the game object the script is attached to:
     * const p = go.get_world_position();
     *
     * // Get the world position of another game object with id "x":
     * const p2 = go.get_world_position("x");
     * ```
     */
    export function get_world_position(id?: string | Hash | Url): Vector3;
    /**
     * The function will return the world rotation calculated at the end of the previous frame.
     * To recalculate it within the current frame, use go.update_world_transform on the instance before calling this.
     * Use go.get_rotation to retrieve the rotation relative to the parent.
     *
     * @param id - optional id of the game object instance to get the world rotation for, by default the instance of the calling script
     * @returns instance world rotation
     * @example
     * ```ts
     * // Get the world rotation of the game object the script is attached to:
     * const r = go.get_world_rotation();
     *
     * // Get the world rotation of another game object with id "x":
     * const r2 = go.get_world_rotation("x");
     * ```
     */
    export function get_world_rotation(id?: string | Hash | Url): Quaternion;
    /**
     * The function will return the world 3D scale factor calculated at the end of the previous frame.
     * To recalculate it within the current frame, use go.update_world_transform on the instance before calling this.
     * Use go.get_scale to retrieve the 3D scale factor relative to the parent.
     * This vector is derived by decomposing the transformation matrix and should be used with care.
     * For most cases it should be fine to use go.get_world_scale_uniform instead.
     *
     * @param id - optional id of the game object instance to get the world scale for, by default the instance of the calling script
     * @returns instance world 3D scale factor
     * @example
     * ```ts
     * // Get the world 3D scale of the game object the script is attached to:
     * const s = go.get_world_scale();
     *
     * // Get the world scale of another game object "x":
     * const s2 = go.get_world_scale("x");
     * ```
     */
    export function get_world_scale(id?: string | Hash | Url): Vector3;
    /**
     * The function will return the world scale factor calculated at the end of the previous frame.
     * To recalculate it within the current frame, use go.update_world_transform on the instance before calling this.
     * Use go.get_scale_uniform to retrieve the scale factor relative to the parent.
     *
     * @param id - optional id of the game object instance to get the world scale for, by default the instance of the calling script
     * @returns instance world scale factor
     * @example
     * ```ts
     * // Get the world uniform scale of the game object the script is attached to:
     * const s = go.get_world_scale_uniform();
     *
     * // Get the world uniform scale of another game object with id "x":
     * const s2 = go.get_world_scale_uniform("x");
     * ```
     */
    export function get_world_scale_uniform(id?: string | Hash | Url): number;
    /**
     * The function will return the world transform matrix calculated at the end of the previous frame.
     * To recalculate it within the current frame, use go.update_world_transform on the instance before calling this.
     *
     * @param id - optional id of the game object instance to get the world transform for, by default the instance of the calling script
     * @returns instance world transform
     * @example
     * ```ts
     * // Get the world transform of the game object the script is attached to:
     * const m = go.get_world_transform();
     *
     * // Get the world transform of another game object with id "x":
     * const m2 = go.get_world_transform("x");
     * ```
     */
    export function get_world_transform(id?: string | Hash | Url): Matrix4;
    /**
     * This is a callback-function, which is called by the engine when a script component is initialized. It can be used
     * to set the initial state of the script.
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
    export function init(self: Opaque<"userdata">): void;
    /**
     * This is a callback-function, which is called by the engine at the end of the frame to update the state of a script
     * component. Use it to make final adjustments to the game object instance.
     *
     * @param self - reference to the script state to be used for storing data
     * @param dt - the time-step of the frame update
     */
    export function late_update(self: Opaque<"userdata">, dt: number): void;
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
     * @returns optional boolean to signal if the input should be consumed (not passed on to others) or not, default is false
     * @example
     * ```ts
     * // This example demonstrates how a game object instance can be moved as a response to user input.
     * export default defineScript({
     *   init() {
     *     // acquire input focus
     *     msg.post(".", "acquire_input_focus");
     *     return {
     *       // maximum speed the instance can be moved
     *       max_speed: 2,
     *       // velocity of the instance, initially zero
     *       velocity: vmath.vector3(),
     *     };
     *   },
     *
     *   update(self, dt) {
     *     // move the instance
     *     go.set_position(go.get_position().add(self.velocity.mul(dt)));
     *   },
     *
     *   on_input(self, action_id, action) {
     *     // check for movement input
     *     if (action_id === hash("right")) {
     *       if (action.released) {
     *         // reset velocity if input was released
     *         self.velocity = vmath.vector3();
     *       } else {
     *         // update velocity
     *         self.velocity = vmath.vector3(action.value * self.max_speed, 0, 0);
     *       }
     *     }
     *   },
     * });
     * ```
     */
    export function on_input(self: Opaque<"userdata">, action_id: Hash, action: { value?: number; pressed?: boolean; released?: boolean; repeated?: boolean; x?: number; y?: number; screen_x?: number; screen_y?: number; dx?: number; dy?: number; screen_dx?: number; screen_dy?: number; gamepad?: number; gamepad_axis?: Vector3; touch?: { id?: number; pressed?: boolean; released?: boolean; tap_count?: number; x?: number; y?: number; dx?: number; dy?: number; acc_x?: number; acc_y?: number; acc_z?: number }[]; text?: string }): boolean | unknown;
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
     * // This example demonstrates how a game object instance, called "a", can communicate with another instance, called "b". It
     * // is assumed that both script components of the instances has id "script".
     *
     * // a.script — Script of instance "a":
     * export default defineScript({
     *   init() {
     *     // let b know about some important data
     *     msg.post("b#script", "my_data", { important_value: 1 });
     *   },
     * });
     *
     * // b.script — Script of instance "b":
     * export default defineScript({
     *   init() {
     *     // store the url of instance "a" for later use, by specifying undefined as socket we
     *     // automatically use our own socket
     *     return { a_url: msg.url(undefined, go.get_id("a"), "script") };
     *   },
     *
     *   on_message(self, message_id, message, sender) {
     *     // check message and sender
     *     if (message_id === hash("my_data") && sender === self.a_url) {
     *       // use the data in some way
     *       self.important_value = message.important_value;
     *     }
     *   },
     * });
     * ```
     */
    export function on_message(self: Opaque<"userdata">, message_id: Hash, message: Record<string | number, unknown>, sender: Url): void;
    /**
     * This is a callback-function, which is called by the engine when the script component is reloaded, e.g. from the editor.
     * It can be used for live development, e.g. to tweak constants or set up the state properly for the instance.
     *
     * @param self - reference to the script state to be used for storing data
     * @example
     * ```ts
     * // This example demonstrates how to tweak the speed of a game object instance that is moved on user input.
     * export default defineScript({
     *   init() {
     *     // acquire input focus
     *     msg.post(".", "acquire_input_focus");
     *     return {
     *       // maximum speed the instance can be moved, this value is tweaked in the on_reload function below
     *       max_speed: 2,
     *       // velocity of the instance, initially zero
     *       velocity: vmath.vector3(),
     *     };
     *   },
     *
     *   update(self, dt) {
     *     // move the instance
     *     go.set_position(go.get_position().add(self.velocity.mul(dt)));
     *   },
     *
     *   on_input(self, action_id, action) {
     *     // check for movement input
     *     if (action_id === hash("right")) {
     *       if (action.released) {
     *         // reset velocity if input was released
     *         self.velocity = vmath.vector3();
     *       } else {
     *         // update velocity
     *         self.velocity = vmath.vector3(action.value * self.max_speed, 0, 0);
     *       }
     *     }
     *   },
     *
     *   on_reload(self) {
     *     // edit this value and reload the script component
     *     self.max_speed = 100;
     *   },
     * });
     * ```
     */
    export function on_reload(self: Opaque<"userdata">): void;
    /**
     * Sets the parent for a game object instance. This means that the instance will exist in the geometrical space of its parent,
     * like a basic transformation hierarchy or scene graph. If no parent is specified, the instance will be detached from any parent and exist in world
     * space.
     * This function will generate a `set_parent` message. It is not until the message has been processed that the change actually takes effect. This
     * typically happens later in the same frame or the beginning of the next frame. Refer to the manual to learn how messages are processed by the
     * engine.
     *
     * @param id - optional id of the game object instance to set parent for, defaults to the instance containing the calling script
     * @param parent_id - optional id of the new parent game object, defaults to detaching game object from its parent
     * @param keep_world_transform - optional boolean, set to true to maintain the world transform when changing spaces. Defaults to false.
     * @example
     * ```ts
     * // Attach myself to another instance "my_parent":
     * go.set_parent(go.get_id(), go.get_id("my_parent"));
     *
     * // Attach an instance "my_instance" to another instance "my_parent":
     * go.set_parent(go.get_id("my_instance"), go.get_id("my_parent"));
     *
     * // Detach an instance "my_instance" from its parent (if any):
     * go.set_parent(go.get_id("my_instance"));
     * ```
     */
    export function set_parent(id?: string | Hash | Url, parent_id?: string | Hash | Url, keep_world_transform?: boolean): void;
    /**
     * The position is relative to the parent (if any). The global world position cannot be manually set.
     *
     * @param position - position to set
     * @param id - optional id of the game object instance to set the position for, by default the instance of the calling script
     * @example
     * ```ts
     * // `p` is the desired position (a Vector3).
     * const p = vmath.vector3();
     *
     * // Set the position of the game object the script is attached to:
     * go.set_position(p);
     *
     * // Set the position of another game object with id "x":
     * go.set_position(p, "x");
     * ```
     */
    export function set_position(position: Vector3, id?: string | Hash | Url): void;
    /**
     * The rotation is relative to the parent (if any). The global world rotation cannot be manually set.
     *
     * @param rotation - rotation to set
     * @param id - optional id of the game object instance to get the rotation for, by default the instance of the calling script
     * @example
     * ```ts
     * // `r` is the desired rotation (a Quaternion).
     * const r = vmath.quat();
     *
     * // Set the rotation of the game object the script is attached to:
     * go.set_rotation(r);
     *
     * // Set the rotation of another game object with id "x":
     * go.set_rotation(r, "x");
     * ```
     */
    export function set_rotation(rotation: Quaternion, id?: string | Hash | Url): void;
    /**
     * The scale factor is relative to the parent (if any). The global world scale factor cannot be manually set.
     * See manual to know how physics affected when setting scale from this function.
     *
     * @param scale - vector or uniform scale factor, must be greater than 0
     * @param id - optional id of the game object instance to get the scale for, by default the instance of the calling script
     * @example
     * ```ts
     * // Set the scale of the game object the script is attached to:
     * const s = vmath.vector3(2.0, 1.0, 1.0);
     * go.set_scale(s);
     *
     * // Set the scale of another game object with id "obj_id":
     * const s2 = 1.2;
     * go.set_scale(s2, "obj_id");
     * ```
     */
    export function set_scale(scale: number | Vector3, id?: string | Hash | Url): void;
    /**
     * The scale factor is relative to the parent (if any). The global world scale factor cannot be manually set.
     * See manual to know how physics affected when setting scale from this function.
     *
     * @param scale - vector or uniform scale factor, must be greater than 0
     * @param id - optional id of the game object instance to get the scale for, by default the instance of the calling script
     * @example
     * ```ts
     * // Set the scale of the game object the script is attached to:
     * const s = vmath.vector3(2.0, 1.0, 5.0);
     * go.set_scale_xy(s); // z will not be set here, only x and y
     *
     * // Set the scale of another game object with id "obj_id":
     * const s2 = 1.2;
     * go.set_scale_xy(s2, "obj_id"); // z will not be set here, only x and y
     * ```
     */
    export function set_scale_xy(scale: number | Vector3, id?: string | Hash | Url): void;
    /**
     * This is a callback-function, which is called by the engine every frame to update the state of a script component.
     * It can be used to perform any kind of game related tasks, e.g. moving the game object instance.
     *
     * @param self - reference to the script state to be used for storing data
     * @param dt - the time-step of the frame update
     * @example
     * ```ts
     * // This example demonstrates how to move a game object instance through the script component:
     * export default defineScript({
     *   init() {
     *     // set initial velocity to be 1 along world x-axis
     *     return { my_velocity: vmath.vector3(1, 0, 0) };
     *   },
     *
     *   update(self, dt) {
     *     // move the game object instance
     *     go.set_position(go.get_position().add(self.my_velocity.mul(dt)));
     *   },
     * });
     * ```
     */
    export function update(self: Opaque<"userdata">, dt: number): void;
    /**
     * Recalculates and updates the cached world transform immediately for the target instance
     * and its ancestors (parent chain up to the collection root). Descendants (children) are
     * not updated by this function.
     * If no id is provided, the instance of the calling script is used.
     * Use this after changing local transform mid-frame when you need the
     * new world transform right away (e.g. before end-of-frame updates). Note that child
     * instances will still have last-frame world transforms until the regular update.
     *
     * @param id - optional id of the game object instance to update
     * @example
     * ```ts
     * // Update this game object's world transform:
     * go.update_world_transform();
     *
     * // Update another game object's world transform:
     * go.update_world_transform("/other");
     * ```
     */
    export function update_world_transform(id?: string | Hash | Url): void;
    /**
     * The function uses world transformation calculated at the end of previous frame.
     *
     * @param position - position which need to be converted
     * @param url - url of the game object which coordinate system convert to
     * @returns converted position
     * @example
     * ```ts
     * // Convert position of "test" game object into coordinate space of "child" object.
     * const test_pos = go.get_world_position("/test");
     * const child_pos = go.get_world_position("/child");
     * const new_position = go.world_to_local_position(test_pos, "/child");
     * ```
     */
    export function world_to_local_position(position: Vector3, url: string | Hash | Url): Vector3;
    /**
     * The function uses world transformation calculated at the end of previous frame.
     *
     * @param transformation - transformation which need to be converted
     * @param url - url of the game object which coordinate system convert to
     * @returns converted transformation
     * @example
     * ```ts
     * // Convert transform of "test" game object into coordinate space of "child" object.
     * const test_transform = go.get_world_transform("/test");
     * const child_transform = go.get_world_transform("/child");
     * const result_transform = go.world_to_local_transform(test_transform, "/child");
     * ```
     */
    export function world_to_local_transform(transformation: Matrix4, url: string | Hash | Url): Matrix4;
    export { _delete as delete };
    export interface properties {
      /**
       * The rotation of the game object expressed in Euler angles.
       * Euler angles are specified in degrees in the interval (-360, 360).
       * The type of the property is vector3.
       */
      euler: Vector3;
      /**
       * The position of the game object.
       * The type of the property is vector3.
       */
      position: Vector3;
      /**
       * The rotation of the game object.
       * The type of the property is quaternion.
       */
      rotation: Quaternion;
      /**
       * The uniform scale of the game object. The type of the property is number.
       */
      scale: number;
    }
  }
}

export {};
