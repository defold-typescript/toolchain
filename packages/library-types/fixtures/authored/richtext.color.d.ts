/**
 * @see {@link https://github.com/britzl/defold-richtext|Github Source}
 * @example `import * as color from 'richtext.color'`
 * @noResolution
 */
declare module 'richtext.color' {
	export function add(name: string, color: number | string): void;

	export const COLORS: {
		aqua: Vector4;
		black: Vector4;
		blue: Vector4;
		brown: Vector4;
		cyan: Vector4;
		darkblue: Vector4;
		fuchsia: Vector4;
		green: Vector4;
		grey: Vector4;
		lightblue: Vector4;
		lime: Vector4;
		magenta: Vector4;
		maroon: Vector4;
		navy: Vector4;
		olive: Vector4;
		orange: Vector4;
		purple: Vector4;
		red: Vector4;
		silver: Vector4;
		teal: Vector4;
		white: Vector4;
		yellow: Vector4;
	};
}
