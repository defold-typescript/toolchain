/** @noSelfInFile */
import type { Hash } from "../../src/core-types";

declare global {
  /**
   * Functions and messages used to manipulate tile map components.
   */
  namespace tilemap {
    type TRANSFORM = typeof tilemap.H_FLIP | typeof tilemap.ROTATE_180 | typeof tilemap.ROTATE_270 | typeof tilemap.ROTATE_90 | typeof tilemap.V_FLIP;
    /**
     * flip tile horizontally
     */
    const H_FLIP: number & { readonly __brand: "tilemap.H_FLIP" };
    /**
     * rotate tile 180 degrees clockwise
     */
    const ROTATE_180: number & { readonly __brand: "tilemap.ROTATE_180" };
    /**
     * rotate tile 270 degrees clockwise
     */
    const ROTATE_270: number & { readonly __brand: "tilemap.ROTATE_270" };
    /**
     * rotate tile 90 degrees clockwise
     */
    const ROTATE_90: number & { readonly __brand: "tilemap.ROTATE_90" };
    /**
     * flip tile vertically
     */
    const V_FLIP: number & { readonly __brand: "tilemap.V_FLIP" };
    interface properties {
      /**
       * The material used when rendering the tile map. The type of the property is hash.
       */
      material: Hash;
      /**
       * The tile source used when rendering the tile map. The type of the property is hash.
       */
      tile_source: Hash;
    }
  }
}

export {};
