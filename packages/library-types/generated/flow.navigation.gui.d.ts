/** @noResolution */
declare module 'flow.navigation.gui' {
	import type { Flow_Element, Flow_Navigation } from 'flow.types';
	/**
	 * Create a new GUI adapter instance bound to the given navigation router.
	 * Registers listeners for "changed", "transition_begin", and "transition_complete"
	 * so the adapter stays in sync with navigation state automatically.
	 */
	export function new_(this: void, navigation: Flow_Navigation): LuaTable;
	export { new_ as new };
	/**
	 * Remove all navigation listeners and clean up the adapter.
	 * Call this in gui_script final() to prevent leaking event handlers.
	 */
	export function destroy(this: void, adapter: LuaTable): void;
	/**
	 * Invalidate the adapter so the next build_tree() call regenerates the tree.
	 */
	export function invalidate(this: void, adapter: LuaTable): void;
	/**
	 * Return true when the adapter's tree needs to be rebuilt.
	 */
	export function needs_rebuild(this: void, adapter: LuaTable): boolean;
	/**
	 * Clear the rebuild flag. Called after build_tree() has been invoked.
	 */
	export function clear_rebuild_flag(this: void, adapter: LuaTable): void;
	/**
	 * Save the current scroll offsets from a UI tree into the navigation params.
	 * Typically called just before a tree rebuild so that scroll position is preserved.
	 */
	export function save_scroll_state(this: void, adapter: LuaTable, tree: Flow_Element, options?: LuaTable | undefined): void;
	/**
	 * Build (or rebuild) the UI element tree for the current navigation state.
	 * When a transition is active, renders both from and to trees and applies
	 * _alpha or _offset_x according to the transition type and eased progress.
	 *
	 * Transition types:
	 * "fade"        — cross-fade: from_tree._alpha fades out, to_tree._alpha fades in
	 * "slide_left"  — to slides in from the right: from moves left, to comes from right
	 * "slide_right" — to slides in from the left: from moves right, to comes from left
	 *
	 * Returns nil and clears adapter.tree when the stack is empty.
	 */
	export function build_tree(this: void, adapter: LuaTable): Flow_Element | undefined;
	/**
	 * Advance the active transition by dt seconds.
	 * Updates transition.progress and requests an adapter rebuild each frame.
	 * When progress reaches 1.0, calls navigation.complete_transition() to
	 * signal that the transition is done and clear the busy flag.
	 */
	export function update(this: void, adapter: LuaTable, dt: number): boolean;
}
