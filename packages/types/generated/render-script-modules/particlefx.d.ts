/** @noSelfInFile */
import type { Hash } from "../../src/core-types";

declare global {
  /**
   * Functions and properties for controlling particle effect component playback and
   * shader constants.
   */
  namespace particlefx {
    /**
     * Options used when stopping particle effects.
     */
    interface stop_options {
      /**
       * Instantly clear spawned particles.
       */
      clear?: boolean;
    }
    type EmitterState = typeof particlefx.EMITTER_STATE_POSTSPAWN | typeof particlefx.EMITTER_STATE_PRESPAWN | typeof particlefx.EMITTER_STATE_SLEEPING | typeof particlefx.EMITTER_STATE_SPAWNING;
    /**
     * postspawn state The emitter is not spawning any particles, but has particles that are still alive.
     */
    const EMITTER_STATE_POSTSPAWN: number & { readonly __brand: "particlefx.EMITTER_STATE_POSTSPAWN" };
    /**
     * prespawn state The emitter will be in this state when it has been started but before spawning any particles. Normally the emitter is in this state for a short time, depending on if a start delay has been set for this emitter or not.
     */
    const EMITTER_STATE_PRESPAWN: number & { readonly __brand: "particlefx.EMITTER_STATE_PRESPAWN" };
    /**
     * sleeping state The emitter does not have any living particles and will not spawn any particles in this state.
     */
    const EMITTER_STATE_SLEEPING: number & { readonly __brand: "particlefx.EMITTER_STATE_SLEEPING" };
    /**
     * spawning state The emitter is spawning particles.
     */
    const EMITTER_STATE_SPAWNING: number & { readonly __brand: "particlefx.EMITTER_STATE_SPAWNING" };
    interface properties {
      /**
       * The animation used during rendering by an emitter in a particle FX component.
       * The property type is a hash and refers to a valid animation in an atlas or a tile source resource.
       * If the animation isn't found, and error will be thrown.
       */
      animation: Hash;
      /**
       * The image used during rendering by an emitter in a particle FX component.
       * The property type is a hash and refers to an image resource (atlas or tile source).
       * Note: When setting the image, if the currently playing animation of the emitter
       * isn't found in the new image, the animation will be set to the first animation found.
       */
      image: Hash;
      /**
       * The material used during rendering by an emitter in a particle FX component.
       * The property type is a hash and refers to a material resource.
       */
      material: Hash;
    }
  }
}

export {};
