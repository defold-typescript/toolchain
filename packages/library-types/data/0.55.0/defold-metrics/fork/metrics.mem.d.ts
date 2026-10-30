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

  /** Where `draw()` places the text, and the default `create()` uses when given no position. */
  export const POSITION: Vector3;

  /** The `string.format` pattern the memory reading is rendered through. */
  export const FORMAT: string;

  /** The colour `draw()` renders the text in, and the default `create()` uses when given no colour. */
  export const COLOR: Vector4;

  export function create(format?: string, position?: Vector3, color?: Vector4): Metrics;

  /** Call this to get a new memory usage reading. */
  export function update(): void;

  /** Get the current memory usage, in kilobytes. */
  export function mem(): number;

  /** Draw memory usage text using `draw_debug_text`. */
  export function draw(): void;
}