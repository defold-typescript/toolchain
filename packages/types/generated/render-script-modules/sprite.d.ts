/** @noSelfInFile */
import type { Hash, Vector3, Vector4 } from "../../src/core-types";

declare global {
  /**
   * Sprite API documentation
   */
  namespace sprite {
    /**
     * Sprite flipbook playback properties
     */
    interface PlayProperties {
      /**
       * Normalized initial animation cursor.
       */
      offset?: number;
      /**
       * Positive animation playback rate.
       */
      playback_rate?: number;
    }
    interface Properties {
      /**
       * READ ONLY The current animation id. An animation that plays currently for the sprite. The type of the property is hash.
       */
      readonly animation: Hash;
      /**
       * The normalized animation cursor. The type of the property is number.
       */
      cursor: number;
      /**
       * READ ONLY The frame count of the currently playing animation.
       */
      readonly frame_count: number;
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
