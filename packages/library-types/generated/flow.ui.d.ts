/** @noResolution */
declare module 'flow.ui' {
	import type { Flow_Element, Flow_MountOptions } from 'flow.types';
	/**
	 * Register a custom element type definition.
	 * Every element type string ("box", "text", "button", etc.) must be registered
	 * before it can appear in a UI tree. The definition describes how to create,
	 * update, and interact with the corresponding Defold GUI node.
	 *
	 * Required fields in def:
	 * create_node(el) -> userdata  — creates and returns a new gui node
	 *
	 * Optional fields in def:
	 * apply(self, el, node, alpha)            — update node visuals each frame
	 * is_visible(el) -> boolean               — custom visibility check
	 * is_hittable(el) -> boolean              — custom hit-test eligibility
	 * is_scroll_container -> boolean          — marks element as scroll root
	 * clips_children -> boolean               — node is used as parent for children
	 * capture_descendant_hits -> boolean      — returns self instead of child on hit
	 * is_backdrop_click_target -> boolean     — receives backdrop click events
	 * get_text_anchor(el) -> "left"|"center"|"right" — text pivot anchor for positioning
	 * hover_begin(self, el, deps)             — called when pointer enters element
	 * hover_end(self, el, deps)               — called when pointer leaves element
	 * press_begin(self, el, deps)             — called when element is pressed
	 * press_update(self, el, is_hot, deps)    — called while dragging over element
	 * press_end(self, el, activated, deps)    — called on release
	 * on_wheel(self, el, delta, deps)         — called on mouse wheel
	 * on_drag_start(self, el, x, y, t, deps) — called when drag begins
	 * on_drag_move(self, el, x, y, t, deps)  — called each drag frame
	 * on_drag_end(self, el, action, t, deps)  — called when drag ends
	 * update_anim(el, dt, deps) -> bool,bool  — per-frame animation tick
	 * render_extras(self, el, prefix, alpha, deps) — render auxiliary nodes
	 * collect_extra_keys(el, prefix, keys, deps)   — declare extra cached node keys
	 * get_child_extra_offset_y(el) -> number  — additional Y offset for children
	 */
	export function register(this: void, type_name: string, def: LuaTable): LuaTable;
	/**
	 * Return the logical GUI display size (same as the [display] settings).
	 * Exposed on the module so external code can query the design resolution.
	 */
	export function get_size(this: void): LuaMultiReturn<[number, number]>;
	/**
	 * Initialize the renderer state on a gui_script self table.
	 * Must be called once in gui_script init() before any other ui calls.
	 * Creates self.ui with an empty node cache, redraw flag, and debug toggle.
	 */
	export function mount(this: void, self: LuaMap<string, unknown> | Record<string, unknown>, opts?: Flow_MountOptions): void;
	/**
	 * Enable or disable debug logging for input and hit-testing.
	 * When enabled, every touch press emits debug logs through `flow.log`
	 * under the `ui.input` context.
	 */
	export function set_debug(this: void, self: LuaMap<string, unknown> | Record<string, unknown>, enabled: boolean): boolean;
	/**
	 * Internal: switch between "window" and "gui" layout spaces.
	 * In "window" mode, layout is computed in physical pixels and nodes are
	 * scaled back to GUI space via _scale_x/_scale_y. This gives pixel-perfect
	 * rendering on high-DPI displays. Not intended for direct consumer use.
	 */
	export function _set_layout_space_unsafe(this: void, self: LuaMap<string, unknown> | Record<string, unknown>, space: string): void;
	/**
	 * Request a renderer redraw so the next M.update() call triggers a full re-render.
	 * Call this whenever the data driving the UI tree changes and you want the
	 * screen to reflect the new state immediately.
	 */
	export function request_redraw(this: void, self: LuaMap<string, unknown> | Record<string, unknown>): void;
	/**
	 * Request a redraw for an element tree so renderer_core.update() re-renders it.
	 * Use this when you hold a reference to a tree and want to force a re-layout
	 * without going through the full renderer self table.
	 */
	export function request_tree_redraw(this: void, tree?: Flow_Element | undefined): void;
	/**
	 * Update the renderer: re-layout and re-apply all nodes if the tree or
	 * display size has changed since the last frame.
	 * Internally delegates to renderer_core.update() with the full dependency bundle.
	 */
	export function update(this: void, self: LuaMap<string, unknown> | Record<string, unknown>, tree?: Flow_Element | undefined): boolean;
	/**
	 * -----------------------------------------------------------------------------
	 * -----------------------------------------------------------------------------
	 * Perform a point hit-test against the current element tree.
	 * Coordinates must be in GUI space (as received from on_input action.x/y).
	 * Returns the deepest hittable element whose layout bounds contain the point,
	 * or nil if nothing was hit.
	 */
	export function hit_test(this: void, self: LuaMap<string, unknown> | Record<string, unknown>, x: number, y: number): Flow_Element | undefined;
	/**
	 * Route a Defold input action to the appropriate element.
	 * Handles touch press/move/release, scroll wheel, and drag gestures.
	 * Call this from gui_script on_input(); returns true if the input was consumed.
	 */
	export function on_input(this: void, self: LuaMap<string, unknown> | Record<string, unknown>, action_id: Hash | undefined, action: { x?: number; y?: number; pressed?: boolean; released?: boolean }): boolean;
	/**
	 * -----------------------------------------------------------------------------
	 * -----------------------------------------------------------------------------
	 * Advance all per-element animations by one frame (dt seconds).
	 * Iterates the current tree and calls each element's update_anim handler.
	 * Requests a redraw when at least one element is still animating.
	 * Call this every frame from gui_script update() before M.update().
	 */
	export function update_animations(this: void, self: LuaMap<string, unknown> | Record<string, unknown>, dt: number): boolean;
	/**
	 * Force a full layout + render pass using the given tree and dimensions.
	 * Bypasses redraw gating — always re-computes and re-applies all nodes.
	 * Prefer M.update() for normal frame rendering; use M.render() when you
	 * need to guarantee an immediate re-render (e.g. after a window resize event
	 * detected in on_input).
	 */
	export function render(this: void, self: LuaMap<string, unknown> | Record<string, unknown>, tree: Flow_Element, w?: number | undefined, h?: number | undefined): void;
	/**
	 * Re-render only if the display size has changed since the last render pass.
	 * Cheaper than M.update() — no redraw-flag check, just a size comparison.
	 * Returns true when a re-render was performed.
	 */
	export function render_if_size_changed(this: void, self: LuaMap<string, unknown> | Record<string, unknown>, tree?: Flow_Element | undefined): boolean;
}
