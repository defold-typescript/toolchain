/** @noSelfInFile **/

/** 
 * @see {@link https://github.com/britzl/defold-metrics|Github Source}
 * @noResolution
 */
declare module 'metrics.mem' {
  /** @noSelf */
  export interface Metrics {
    mem: () => number;
    update: () => void;
    draw: () => void;
  }

  export function create(format?: string, position?: string, color?: string): Metrics;

  /** Call this to get a new memory usage reading. */
  export function update(): void;

  /** Get the current memory usage, in kilobytes. */
  export function mem(): number;

  /** Draw memory usage text using `draw_debug_text`. */
  export function draw(): void;
}