/** @noResolution */
declare module 'flow.layout' {
	import type { Flow_Element } from 'flow.types';
	/**
	 * Compute layout for a node tree. Writes layout.x/y/w/h to every node
	 * in the tree recursively, using bottom-left origin coordinates.
	 *
	 * Algorithm:
	 * 1. Measure all regular (non-overlay) children to sum fixed sizes and flex_grow weights.
	 * 2. Distribute remaining free space according to justify_content.
	 * 3. Place each child along the main axis, applying align_items / align_self on the cross axis.
	 * 4. Recurse into each child.
	 * 5. Layout overlay children (popup, bottom_sheet) at full parent bounds as a final pass.
	 */
	export function compute(this: void, node: Flow_Element, x: number, y: number, w: number, h: number): void;
}
