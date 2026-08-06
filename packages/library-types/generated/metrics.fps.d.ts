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

  export function create(samples?: number, format?: string, position?: string, color?: string): Metrics;

  /** Call this once per frame. Once enough samples have been collected it is possible to call fps() to get the current FPS. */
  export function update(): void;

  /** Get the current FPS, based on collected samples. */
  export function fps(): number;

  /** Draw fps count text using `draw_debug_text`. */
  export function draw(): void;
}
