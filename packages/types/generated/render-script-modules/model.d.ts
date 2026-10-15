/** @noSelfInFile */
import type { Hash, Vector3 } from "../../src/core-types";

declare global {
  /**
   * Model API documentation
   */
  namespace model {
    /**
     * Axis-aligned bounding box
     */
    interface aabb {
      /**
       * minimum local-space bounds
       */
      min: Vector3;
      /**
       * maximum local-space bounds
       */
      max: Vector3;
    }
    /**
     * Model animation playback properties
     */
    interface play_properties {
      /**
       * duration of a linear blend from the current animation
       */
      blend_duration?: number;
      /**
       * normalized initial animation cursor
       */
      offset?: number;
      /**
       * positive animation playback rate
       */
      playback_rate?: number;
    }
    interface properties {
      /**
       * The current animation set on the component. The type of the property is hash.
       */
      readonly animation: Hash;
      /**
       * The normalized animation cursor. The type of the property is number.
       * Please note that model events may not fire as expected when the cursor is manipulated directly.
       */
      cursor: number;
      /**
       * The animation playback rate. A multiplier to the animation playback rate. The type of the property is number.
       */
      playback_rate: number;
      /**
       * The texture hash id of the model. Used for getting/setting model texture for unit 0-7
       */
      texture0: Hash;
      /**
       * The texture hash id of the model. Used for getting/setting model texture for unit 0-7
       */
      texture1: Hash;
      /**
       * The texture hash id of the model. Used for getting/setting model texture for unit 0-7
       */
      texture2: Hash;
      /**
       * The texture hash id of the model. Used for getting/setting model texture for unit 0-7
       */
      texture3: Hash;
      /**
       * The texture hash id of the model. Used for getting/setting model texture for unit 0-7
       */
      texture4: Hash;
      /**
       * The texture hash id of the model. Used for getting/setting model texture for unit 0-7
       */
      texture5: Hash;
      /**
       * The texture hash id of the model. Used for getting/setting model texture for unit 0-7
       */
      texture6: Hash;
      /**
       * The texture hash id of the model. Used for getting/setting model texture for unit 0-7
       */
      texture7: Hash;
    }
  }
}

export {};
