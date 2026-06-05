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
     * `self`
     * object The current object.
     * `message_id`
     * hash The name of the completion message, `"animation_done"`.
     * `message`
     * table Information about the completion:
     * - number `current_tile` - the current tile of the sprite.
     * - hash `id` - id of the animation that was completed.
     * `sender`
     * url The invoker of the callback: the sprite component.
     * @param play_properties - optional table with properties:
     * `offset`
     * number the normalized initial value of the animation cursor when the animation starts playing.
     * `playback_rate`
     * number the rate with which the animation will be played. Must be positive.
     * @example
     * ```lua
     * The following examples assumes that the model has id "sprite".
     * How to play the "jump" animation followed by the "run" animation:
     * local function anim_done(self, message_id, message, sender)
     *   if message_id == hash("animation_done") then
     *     if message.id == hash("jump") then
     *       -- jump animation done, chain with "run"
     *       sprite.play_flipbook(url, "run")
     *     end
     *   end
     * end
     *
     * function init(self)
     *   local url = msg.url("#sprite")
     *   sprite.play_flipbook(url, "jump", anim_done)
     * end
     * ```
     */
    function play_flipbook(url: string | Hash | Url, id: string | Hash, complete_function?: (self: unknown, message_id: unknown, message: unknown, sender: unknown) => void, play_properties?: { offset?: number; playback_rate?: number }): void;
    /**
     * Sets horizontal flipping of the provided sprite's animations.
     * The sprite is identified by its URL.
     * If the currently playing animation is flipped by default, flipping it again will make it appear like the original texture.
     *
     * @param url - the sprite that should flip its animations
     * @param flip - `true` if the sprite should flip its animations, `false` if not
     * @example
     * ```lua
     * How to flip a sprite so it faces the horizontal movement:
     * function update(self, dt)
     *   -- calculate self.velocity somehow
     *   sprite.set_hflip("#sprite", self.velocity.x < 0)
     * end
     *
     * It is assumed that the sprite component has id "sprite" and that the original animations faces right.
     * ```
     */
    function set_hflip(url: string | Hash | Url, flip: boolean): void;
    /**
     * Sets vertical flipping of the provided sprite's animations.
     * The sprite is identified by its URL.
     * If the currently playing animation is flipped by default, flipping it again will make it appear like the original texture.
     *
     * @param url - the sprite that should flip its animations
     * @param flip - `true` if the sprite should flip its animations, `false` if not
     * @example
     * ```lua
     * How to flip a sprite in a game which negates gravity as a game mechanic:
     * function update(self, dt)
     *   -- calculate self.up_side_down somehow, then:
     *   sprite.set_vflip("#sprite", self.up_side_down)
     * end
     *
     * It is assumed that the sprite component has id "sprite" and that the original animations are up-right.
     * ```
     */
    function set_vflip(url: string | Hash | Url, flip: boolean): void;
    interface properties {
      /**
       * READ ONLY The current animation id. An animation that plays currently for the sprite. The type of the property is hash.
       */
      animation: Hash;
      /**
       * The normalized animation cursor. The type of the property is number.
       */
      cursor: number;
      /**
       * READ ONLY The frame count of the currently playing animation.
       */
      frame_count: Hash;
      /**
       * The image used when rendering the sprite. The type of the property is hash.
       */
      image: Hash;
      /**
       * The material used when rendering the sprite. The type of the property is hash.
       */
      material: Hash;
      /**
       * The animation playback rate. A multiplier to the animation playback rate. The type of the property is number.
       * The playback_rate is a non-negative number, a negative value will be clamped to 0.
       */
      playback_rate: number;
      /**
       * The non-uniform scale of the sprite. The type of the property is vector3.
       */
      scale: Vector3;
      /**
       * The size of the sprite, not allowing for any additional scaling that may be applied.
       * The type of the property is vector3. It is not possible to set the size if the size mode
       * of the sprite is set to auto.
       */
      size: Vector3;
      /**
       * The slice values of the sprite. The type of the property is a vector4 that corresponds to
       * the left, top, right, bottom values of the sprite in the editor.
       * It is not possible to set the slice property if the size mode of the sprite is set to auto.
       */
      slice: Vector4;
    }
  }
}

export {};
