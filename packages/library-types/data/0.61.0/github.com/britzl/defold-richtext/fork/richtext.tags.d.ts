/**
 * @see {@link https://github.com/britzl/defold-richtext|Github Source}
 * @example `import * as tags from 'richtext.tags'`
 * @noResolution
 */
declare module 'richtext.tags' {
	/**
	 * The settings of the word a tag applies to. A tag function sets fields on it; the
	 * built-in tags set the ones listed here, and a custom tag may set its own.
	 */
	type WordSettings = {
		color?: Vector4;
		shadow?: Vector4;
		outline?: Vector4;
		font?: string;
		size?: number;
		bold?: boolean;
		italic?: boolean;
		anchor?: boolean;
		linebreak?: boolean;
		nobr?: boolean;
		image?: { texture?: string; anim?: string; width?: number; height?: number };
		spine?: { scene?: string; anim?: string };
		paragraph?: number | true;
		[field: string]: unknown;
	};

	export function register(
		tag: string,
		fn: (params: string | undefined, settings: WordSettings) => void,
	): void;

	/**
	 * Runs the tag function registered for `tag` on `settings`.
	 * @returns `false` when no function is registered for `tag`, else `true`.
	 */
	export function apply(tag: string, params: string | undefined, settings: WordSettings): boolean;
}
