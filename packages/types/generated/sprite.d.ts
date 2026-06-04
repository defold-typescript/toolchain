/** @noSelfInFile */
import type { Hash, Url, Vector3, Vector4 } from "../src/core-types";

declare global {
  namespace sprite {
    /**
     * Play an animation on a sprite component from its tile set
     * An optional completion callback function can be provided that will be called when
     * the animation has completed playing. If no function is provided,
     * a animation_done message is sent to the script that started the animation.
     *
     * @param url - the sprite that should play the animation
     * @param id - hashed id of the animation to play
     * @param complete_function - function to call when the animation has completed.
  `self`
  object The current object.
  `message_id`
  hash The name of the completion message, `"animation_done"`.
  `message`
  table Information about the completion:
  - number `current_tile` - the current tile of the sprite.
  - hash `id` - id of the animation that was completed.
  `sender`
  url The invoker of the callback: the sprite component.
     * @param play_properties - optional table with properties:
  `offset`
  number the normalized initial value of the animation cursor when the animation starts playing.
  `playback_rate`
  number the rate with which the animation will be played. Must be positive.
     */
    function play_flipbook(url: string | Hash | Url, id: string | Hash, complete_function?: (self: unknown, message_id: unknown, message: unknown, sender: unknown) => void, play_properties?: { offset?: number; playback_rate?: number }): void;
    /**
     * Sets horizontal flipping of the provided sprite's animations.
     * The sprite is identified by its URL.
     * If the currently playing animation is flipped by default, flipping it again will make it appear like the original texture.
     *
     * @param url - the sprite that should flip its animations
     * @param flip - `true` if the sprite should flip its animations, `false` if not
     */
    function set_hflip(url: string | Hash | Url, flip: boolean): void;
    /**
     * Sets vertical flipping of the provided sprite's animations.
     * The sprite is identified by its URL.
     * If the currently playing animation is flipped by default, flipping it again will make it appear like the original texture.
     *
     * @param url - the sprite that should flip its animations
     * @param flip - `true` if the sprite should flip its animations, `false` if not
     */
    function set_vflip(url: string | Hash | Url, flip: boolean): void;
    interface properties {
      animation: Hash;
      cursor: number;
      frame_count: Hash;
      image: Hash;
      material: Hash;
      playback_rate: number;
      scale: Vector3;
      size: Vector3;
      slice: Vector4;
    }
  }
}

export {};
