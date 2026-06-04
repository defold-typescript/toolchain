/** @noSelfInFile */
import type { Hash, Url, Vector4 } from "../src/core-types";

declare global {
  namespace particlefx {
    const EMITTER_STATE_POSTSPAWN: number & { readonly __brand: "particlefx.EMITTER_STATE_POSTSPAWN" };
    const EMITTER_STATE_PRESPAWN: number & { readonly __brand: "particlefx.EMITTER_STATE_PRESPAWN" };
    const EMITTER_STATE_SLEEPING: number & { readonly __brand: "particlefx.EMITTER_STATE_SLEEPING" };
    const EMITTER_STATE_SPAWNING: number & { readonly __brand: "particlefx.EMITTER_STATE_SPAWNING" };
    /**
     * Starts playing a particle FX component.
     * Particle FX started this way need to be manually stopped through `particlefx.stop()`.
     * Which particle FX to play is identified by the URL.
     * A particle FX will continue to emit particles even if the game object the particle FX component belonged to is deleted. You can call `particlefx.stop()` to stop it from emitting more particles.
     *
     * @param url - the particle fx that should start playing.
     * @param emitter_state_function - optional callback function that will be called when an emitter attached to this particlefx changes state.
  `self`
  object The current object
  `id`
  hash The id of the particle fx component
  `emitter`
  hash The id of the emitter
  `state`
  constant the new state of the emitter:
  - `particlefx.EMITTER_STATE_SLEEPING`
  - `particlefx.EMITTER_STATE_PRESPAWN`
  - `particlefx.EMITTER_STATE_SPAWNING`
  - `particlefx.EMITTER_STATE_POSTSPAWN`
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
     */
    function set_constant(url: string | Hash | Url, emitter: string | Hash, constant: string | Hash, value: Vector4): void;
    /**
     * Stops a particle FX component from playing.
     * Stopping a particle FX does not remove already spawned particles.
     * Which particle FX to stop is identified by the URL.
     *
     * @param url - the particle fx that should stop playing
     * @param options - Options when stopping the particle fx. Supported options:
  - boolean `clear`: instantly clear spawned particles
     */
    function stop(url: string | Hash | Url, options?: { clear?: boolean }): void;
    interface properties {
      animation: Hash;
      image: Hash;
      material: Hash;
    }
  }
}

export {};
