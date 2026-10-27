/** @noSelfInFile */

/**
 * Color parsing and normalized hexadecimal color helpers for Flow.
 * @see {@link https://github.com/Pause-Games/flow|GitHub source}
 * @noResolution
 */
declare module 'flow.color' {
  import type { Flow_ColorValue } from 'flow.types';

  /** A parsed color with normalized channels from `0` to `1`. */
  interface FlowColor {
    /** The red channel. */
    r: number;
    /** The green channel. */
    g: number;
    /** The blue channel. */
    b: number;
    /** The alpha channel. */
    a: number;
  }

  /** The callable `flow.color` module. */
  interface FlowColorModule {
    /** Creates a hexadecimal color from normalized or byte-valued channels. */
    (r: number, g: number, b: number, a?: number): Flow_ColorValue;

    /** Creates an opaque hexadecimal color from normalized or byte-valued channels. */
    rgb(r: number, g: number, b: number): Flow_ColorValue;

    /** Creates a hexadecimal color from normalized or byte-valued channels. */
    rgba(r: number, g: number, b: number, a: number): Flow_ColorValue;

    /** Normalizes a hexadecimal color in `#RGB`, `#RGBA`, `#RRGGBB`, or `#RRGGBBAA` form. */
    hex(value: string): Flow_ColorValue;

    /** Returns a color with a replaced alpha channel. */
    with_alpha(value: Flow_ColorValue, alpha: number): Flow_ColorValue;

    /** Parses a hexadecimal or CSS named color into normalized channels. */
    parse(value: Flow_ColorValue): FlowColor;

    /** Resolves a hexadecimal or CSS named color to a Defold vector. */
    resolve(value: Flow_ColorValue): Vector4;
  }

  const color: FlowColorModule;
  export = color;
}
