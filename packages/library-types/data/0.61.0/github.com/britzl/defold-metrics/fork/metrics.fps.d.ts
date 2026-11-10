/** @noSelfInFile **/

/** 
 * @see {@link https://github.com/britzl/defold-metrics|Github Source}
 * @noResolution
 */
declare module 'metrics.fps' {
  /** @noSelf */
  export interface Metrics {
    fps: () => number;
    update: () => void;
    draw: () => void;
  }

  /** Where `draw()` places the text, and the default `create()` uses when given no position. */
  export const POSITION: Vector3;

  /** The `string.format` pattern the FPS reading is rendered through. */
  export const FORMAT: string;

  /** The colour `draw()` renders the text in, and the default `create()` uses when given no colour. */
  export const COLOR: Vector4;

  export function create(samples?: number, format?: string, position?: Vector3, color?: Vector4): Metrics;

  /** Call this once per frame. Once enough samples have been collected it is possible to call fps() to get the current FPS. */
  export function update(): void;

  /** Get the current FPS, based on collected samples. */
  export function fps(): number;

  /** Draw fps count text using `draw_debug_text`. */
  export function draw(): void;
}
