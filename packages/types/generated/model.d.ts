/** @noSelfInFile */
import type { Hash, Opaque, Url } from "../src/core-types";

declare global {
  namespace model {
    /**
     * Cancels all animation on a model component.
     *
     * @param url - the model for which to cancel the animation
     */
    function cancel(url: string | Hash | Url): void;
    /**
     * Get AABB of the whole model in local coordinate space.
     * AABB information return as a table with `min` and `max` fields, where `min` and `max` has type `vmath.vector3`.
     *
     * @param url - the model
     * @returns A table containing AABB of the model. If model has no meshes - return vmath.vector3(0,0,0) for min and max fields.
     */
    function get_aabb(url: string | Hash | Url): Record<string | number, unknown>;
    /**
     * Gets the id of the game object that corresponds to a model skeleton bone.
     * The returned game object can be used for parenting and transform queries.
     * This function has complexity `O(n)`, where `n` is the number of bones in the model skeleton.
     * Game objects corresponding to a model skeleton bone can not be individually deleted.
     *
     * @param url - the model to query
     * @param bone_id - id of the corresponding bone
     * @returns id of the game object
     */
    function get_go(url: string | Hash | Url, bone_id: string | Hash): Hash;
    /**
     * Get AABB of all meshes.
     * AABB information return as a table with `min` and `max` fields, where `min` and `max` has type `vmath.vector3`.
     *
     * @param url - the model
     * @returns A table containing info about all AABB in the format
     */
    function get_mesh_aabb(url: string | Hash | Url): Record<string | number, unknown>;
    /**
     * Get the enabled state of a mesh
     *
     * @param url - the model
     * @param mesh_id - the id of the mesh
     * @returns true if the mesh is visible, false otherwise
     */
    function get_mesh_enabled(url: string | Hash | Url, mesh_id: string | Hash | Url): boolean;
    /**
     * Plays an animation on a model component with specified playback
     * mode and parameters.
     * An optional completion callback function can be provided that will be called when
     * the animation has completed playing. If no function is provided,
     * a model_animation_done message is sent to the script that started the animation.
     * The callback is not called (or message sent) if the animation is
     * cancelled with model.cancel. The callback is called (or message sent) only for
     * animations that play with the following playback modes:
     * - `go.PLAYBACK_ONCE_FORWARD`
     * - `go.PLAYBACK_ONCE_BACKWARD`
     * - `go.PLAYBACK_ONCE_PINGPONG`
     *
     * @param url - the model for which to play the animation
     * @param anim_id - id of the animation to play
     * @param playback - playback mode of the animation
  - `go.PLAYBACK_ONCE_FORWARD`
  - `go.PLAYBACK_ONCE_BACKWARD`
  - `go.PLAYBACK_ONCE_PINGPONG`
  - `go.PLAYBACK_LOOP_FORWARD`
  - `go.PLAYBACK_LOOP_BACKWARD`
  - `go.PLAYBACK_LOOP_PINGPONG`
     * @param play_properties - optional table with properties
  Play properties table:
  `blend_duration`
  number Duration of a linear blend between the current and new animation.
  `offset`
  number The normalized initial value of the animation cursor when the animation starts playing.
  `playback_rate`
  number The rate with which the animation will be played. Must be positive.
     * @param complete_function - function to call when the animation has completed.
  `self`
  object The current object.
  `message_id`
  hash The name of the completion message, `"model_animation_done"`.
  `message`
  table Information about the completion:
  - hash `animation_id` - the animation that was completed.
  - constant `playback` - the playback mode for the animation.
  `sender`
  url The invoker of the callback: the model component.
     */
    function play_anim(url: string | Hash | Url, anim_id: string | Hash, playback: Opaque<"constant">, play_properties?: { blend_duration?: number; offset?: number; playback_rate?: number }, complete_function?: (self: unknown, message_id: unknown, message: unknown, sender: unknown) => void): void;
    /**
     * Enable or disable visibility of a mesh
     *
     * @param url - the model
     * @param mesh_id - the id of the mesh
     * @param enabled - true if the mesh should be visible, false if it should be hideen
     */
    function set_mesh_enabled(url: string | Hash | Url, mesh_id: string | Hash | Url, enabled: boolean): void;
    interface properties {
      animation: Hash;
      cursor: number;
      material: Hash;
      playback_rate: number;
      textureN: Hash;
    }
  }
}

export {};
