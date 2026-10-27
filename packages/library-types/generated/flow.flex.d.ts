/** @noResolution */
declare module 'flow.flex' {
	import type { Flow_Element, Flow_FlexNode, Flow_FlexNodeOptions, Flow_LayoutRect } from 'flow.types';
	export interface Node extends Flow_FlexNode {
		/**
		 * Insert a child node at a given index (1-based, default = append).
		 * Chainable — returns self.
		 *
		 * @param index - 1-based insertion index; default appends after last child. **⚠️ 1-based; passed to `flow.flex` unchanged.**
		 */
		insert_child(child: Flow_FlexNode, index?: number | undefined): Node;
		/**
		 * Remove a child node by reference. No-op when child is not found.
		 * Chainable — returns self.
		 */
		remove_child(child: Flow_FlexNode): Node;
		/**
		 * Return the child at a 0-based index (Yoga API convention).
		 * Index 0 returns the first child.
		 *
		 * @param index - 0-based child index. **0️⃣ 0-based; passed to `flow.flex` unchanged.**
		 */
		get_child(index: number): Flow_FlexNode | undefined;
		/**
		 * Return the total number of children.
		 */
		get_child_count(): number;
		/**
		 * Set an arbitrary style property by key. Chainable.
		 */
		set_style(key: string, value: unknown): Node;
		/**
		 * Read an arbitrary style property by key.
		 */
		get_style(key: string): unknown;
		/**
		 * Set the fixed width in pixels. Chainable.
		 */
		set_width(value: number): Node;
		/**
		 * Set the fixed height in pixels. Chainable.
		 */
		set_height(value: number): Node;
		/**
		 * Set the width as a percentage of the parent's width. Chainable.
		 */
		set_width_percent(value: number): Node;
		/**
		 * Set the height as a percentage of the parent's height. Chainable.
		 */
		set_height_percent(value: number): Node;
		/**
		 * Store a minimum width constraint in pixels. Chainable.
		 * Kept for API compatibility; the current layout engine does not enforce it.
		 */
		set_min_width(value: number): Node;
		/**
		 * Store a minimum height constraint in pixels. Chainable.
		 * Kept for API compatibility; the current layout engine does not enforce it.
		 */
		set_min_height(value: number): Node;
		/**
		 * Store a maximum width constraint in pixels. Chainable.
		 * Kept for API compatibility; the current layout engine does not enforce it.
		 */
		set_max_width(value: number): Node;
		/**
		 * Store a maximum height constraint in pixels. Chainable.
		 * Kept for API compatibility; the current layout engine does not enforce it.
		 */
		set_max_height(value: number): Node;
		/**
		 * Set the main-axis direction for children. Chainable.
		 */
		set_flex_direction(value: "column" | "row"): Node;
		/**
		 * Set how much this node grows to fill available space on the main axis. Chainable.
		 */
		set_flex_grow(value: number): Node;
		/**
		 * Store the flex shrink factor. Chainable.
		 * Kept for API compatibility; the current layout engine does not consume it.
		 */
		set_flex_shrink(value: number): Node;
		/**
		 * Store the flex basis value. Chainable.
		 * Kept for API compatibility; the current layout engine does not consume it.
		 */
		set_flex_basis(value: number | string): Node;
		/**
		 * Set how children are distributed along the main axis. Chainable.
		 */
		set_justify_content(value: string): Node;
		/**
		 * Set how children are aligned on the cross axis. Chainable.
		 */
		set_align_items(value: string): Node;
		/**
		 * Override the parent's align_items for this node only. Chainable.
		 */
		set_align_self(value: string): Node;
		/**
		 * Set the gap between children in pixels. Chainable.
		 */
		set_gap(value: number): Node;
		/**
		 * Set padding on one or more edges. Chainable.
		 */
		set_padding(edge: string, value: number): Node;
		/**
		 * Set padding on one or more edges as a percentage of parent size. Chainable.
		 */
		set_padding_percent(edge: string, value: number): Node;
		/**
		 * Store margin on one or more edges in pixels. Chainable.
		 * Kept for API compatibility; the current layout engine does not consume it.
		 */
		set_margin(edge: string, value: number): Node;
		/**
		 * Store margin on one or more edges as a percentage of parent size. Chainable.
		 * Kept for API compatibility; the current layout engine does not consume it.
		 */
		set_margin_percent(edge: string, value: number): Node;
		/**
		 * Store border width on one or more edges in pixels. Chainable.
		 * Kept for API compatibility; the current layout engine does not consume it.
		 */
		set_border(edge: string, value: number): Node;
		/**
		 * Store position offsets on one or more edges in pixels. Chainable.
		 * Kept for API compatibility; the current layout engine does not consume it.
		 */
		set_position(edge: string, value: number): Node;
		/**
		 * Store the position type (static / relative / absolute). Chainable.
		 * Kept for API compatibility; the current layout engine does not consume it.
		 */
		set_position_type(value: string): Node;
		/**
		 * Store the flex wrap behavior. Chainable.
		 * Kept for API compatibility; the current layout engine does not consume it.
		 */
		set_flex_wrap(value: string): Node;
		/**
		 * Store the overflow behavior. Chainable.
		 * Kept for API compatibility; the current layout engine does not consume it.
		 */
		set_overflow(value: string): Node;
		/**
		 * Store the display mode. Chainable.
		 * Kept for API compatibility; the current layout engine does not consume it.
		 */
		set_display(value: string): Node;
		/**
		 * Store the aspect ratio (width / height). Chainable.
		 * Kept for API compatibility; the current layout engine does not consume it.
		 */
		set_aspect_ratio(value: number): Node;
		/**
		 * Store the text direction for this subtree. Chainable.
		 * Kept for API compatibility; the current layout engine does not consume it.
		 */
		set_direction(value: string): Node;
		/**
		 * Attach a custom measure function to this node.
		 * The measure function is called by the layout engine to determine intrinsic
		 * content size (e.g. for text or image elements). Not used by the default
		 * flow/layout.lua but reserved for compatibility with future extensions.
		 */
		set_measure_func(fn: (...args: any[]) => unknown): Node;
		/**
		 * Run the layout engine on this node tree and store results in node.layout.
		 * After calling this, use get_computed_* or get_layout() to read the results.
		 */
		calculate_layout(width?: number | undefined, height?: number | undefined): Node;
		/**
		 * Return the full layout result table ({x, y, w, h}) after calculate_layout().
		 */
		get_layout(): Flow_LayoutRect | undefined;
		/**
		 * Return the computed left edge (x) of this node in layout space.
		 */
		get_computed_left(): number;
		/**
		 * Return the computed top edge (y + h) of this node in layout space.
		 * Note: layout uses bottom-left origin, so "top" = y + height.
		 */
		get_computed_top(): number;
		/**
		 * Return the computed width of this node in pixels.
		 */
		get_computed_width(): number;
		/**
		 * Return the computed height of this node in pixels.
		 */
		get_computed_height(): number;
	}
	/**
	 * Run the layout engine on a node tree without creating a Node instance.
	 * Convenience function for callers using plain Lua table element trees.
	 */
	export function calculate_layout(this: void, root: Flow_Element, width?: number | undefined, height?: number | undefined): Flow_Element;
	export const Node: {
		/**
		 * Create a new FlexNode with initial properties.
		 * All fields have sensible defaults; only key is typically required.
		 */
		"new"(this: void, opts?: Flow_FlexNodeOptions | undefined): Node;
	};
}
