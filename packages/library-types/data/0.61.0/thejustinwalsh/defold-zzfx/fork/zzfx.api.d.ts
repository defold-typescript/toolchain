/** @noSelfInFile **/

type ZzFXSample = LuaUserdata & {
  readonly __index: 'zzfx_ext_sample';
};

/**
 * ZzFX extension for Defold
 * @see {@link https://github.com/thejustinwalsh/defold-zzfx|Github Source}
 * @noResolution
 */
declare module 'zzfx.api' {
  /**
   * Build a sample from a ZzFX parameter list and play it in one call.
   * @see {@link https://killedbyapixel.github.io/ZzFX/|the ZzFX sound designer}
   */
  export function play(...args: number[]): void;

  /** Set the sample rate used to render subsequent samples. Defaults to 44100. */
  export function samplerate(rate: number): void;

  /** Play a sample previously returned by {@link build_sample}. */
  export function play_sample(sample: ZzFXSample): void;

  /** Build a reusable sample from a ZzFX parameter list, without playing it. */
  export function build_sample(...args: number[]): ZzFXSample;
}
