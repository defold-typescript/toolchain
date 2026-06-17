/** @noSelfInFile */
import type { Hash, Url, Vector4 } from "../src/core-types";

declare global {
  /**
   * Functions and properties for controlling particle effect component playback and
   * shader constants.
   */
  namespace particlefx {
    /**
     * The emitter is not spawning any particles, but has particles that are still alive.
     */
    const EMITTER_STATE_POSTSPAWN: number & { readonly __brand: "particlefx.EMITTER_STATE_POSTSPAWN" };
    /**
     * The emitter will be in this state when it has been started but before spawning any particles. Normally the emitter is in this state for a short time, depending on if a start delay has been set for this emitter or not.
     */
    const EMITTER_STATE_PRESPAWN: number & { readonly __brand: "particlefx.EMITTER_STATE_PRESPAWN" };
    /**
     * The emitter does not have any living particles and will not spawn any particles in this state.
     */
    const EMITTER_STATE_SLEEPING: number & { readonly __brand: "particlefx.EMITTER_STATE_SLEEPING" };
    /**
     * The emitter is spawning particles.
     */
    const EMITTER_STATE_SPAWNING: number & { readonly __brand: "particlefx.EMITTER_STATE_SPAWNING" };
    /**
     * Starts playing a particle FX component.
     * Particle FX started this way need to be manually stopped through `particlefx.stop()`.
     * Which particle FX to play is identified by the URL.
     * A particle FX will continue to emit particles even if the game object the particle FX component belonged to is deleted. You can call `particlefx.stop()` to stop it from emitting more particles.
     *
     * @param url - the particle fx that should start playing.
     * @param emitter_state_function - optional callback function that will be called when an emitter attached to this particlefx changes state.
     *
     * `self`
     * object The current object
     * `id`
     * hash The id of the particle fx component
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
     * // How to play a particle fx when a game object is created.
     * // The callback receives the hash of the path to the particlefx, the hash of the id
     * // of the emitter, and the new state of the emitter as particlefx.EMITTER_STATE_.
     * function emitter_state_change(self, id, emitter, state) {
     *   if (emitter === hash("exhaust") && state === particlefx.EMITTER_STATE_POSTSPAWN) {
     *     // exhaust is done spawning particles...
     *   }
     * }
     *
     * export default defineScript({
     *   init(self) {
     *     particlefx.play("#particlefx", emitter_state_change);
     *   },
     * });
     * ```
     */
    function play(url: string | Hash | Url, emitter_state_function?: (self: unknown, id: unknown, emitter: unknown, state: unknown) => void): void;
    /**
     * Resets a shader constant for a particle FX component emitter.
     * The constant must be defined in the material assigned to the emitter.
     * Resetting a constant through this function implies that the value defined in the material will be used.
     * Which particle FX to reset a constant for is identified by the URL.
     *
     * @param url - the particle FX that should have a constant reset
     * @param emitter - the id of the emitter
     * @param constant - the name of the constant
     * @example
     * ```ts
     * // The following examples assume that the particle FX has id "particlefx", it
     * // contains an emitter with the id "emitter" and that the default-material in
     * // builtins is used, which defines the constant "tint".
     * // If you assign a custom material to the sprite, you can reset the constants
     * // defined there in the same manner.
     * // How to reset the tinting of particles from an emitter:
     * export default defineScript({
     *   init(self) {
     *     particlefx.reset_constant("#particlefx", "emitter", "tint");
     *   },
     * });
     * ```
     */
    function reset_constant(url: string | Hash | Url, emitter: string | Hash, constant: string | Hash): void;
    /**
     * Sets a shader constant for a particle FX component emitter.
     * The constant must be defined in the material assigned to the emitter.
     * Setting a constant through this function will override the value set for that constant in the material.
     * The value will be overridden until particlefx.reset_constant is called.
     * Which particle FX to set a constant for is identified by the URL.
     *
     * @param url - the particle FX that should have a constant set
     * @param emitter - the id of the emitter
     * @param constant - the name of the constant
     * @param value - the value of the constant
     * @example
     * ```ts
     * // The following examples assume that the particle FX has id "particlefx", it
     * // contains an emitter with the id "emitter" and that the default-material in
     * // builtins is used, which defines the constant "tint".
     * // If you assign a custom material to the sprite, you can reset the constants
     * // defined there in the same manner.
     * // How to tint particles from an emitter red:
     * export default defineScript({
     *   init(self) {
     *     particlefx.set_constant("#particlefx", "emitter", "tint", vmath.vector4(1, 0, 0, 1));
     *   },
     * });
     * ```
     */
    function set_constant(url: string | Hash | Url, emitter: string | Hash, constant: string | Hash, value: Vector4): void;
    /**
     * Stops a particle FX component from playing.
     * Stopping a particle FX does not remove already spawned particles.
     * Which particle FX to stop is identified by the URL.
     *
     * @param url - the particle fx that should stop playing
     * @param options - Options when stopping the particle fx. Supported options:
     *
     * - boolean `clear`: instantly clear spawned particles
     * @example
     * ```ts
     * // How to stop a particle fx when a game object is deleted and immediately also
     * // clear any spawned particles:
     * export default defineScript({
     *   final(self) {
     *     particlefx.stop("#particlefx", { clear: true });
     *   },
     * });
     * ```
     */
    function stop(url: string | Hash | Url, options?: { clear?: boolean }): void;
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
