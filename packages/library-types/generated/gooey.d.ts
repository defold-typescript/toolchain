/** @noSelfInFile */

/**
 * This is a definition stub with incomplete or untested signatures.
 * Contributions to improve the accuracy of these types are welcome.
 * @see {@link https://github.com/britzl/gooey|Github Source}
 * @noResolution
 */
declare module 'gooey.gooey' {
	type table = {};

	type ButtonState = {
		node: Opaque<"node">;
		node_id: Hash;
		enabled: boolean;
		consumed: boolean;
		clicked: boolean;
		over: boolean;
		over_now: boolean;
		out_now: boolean;
		pressed: boolean;
		pressed_now: boolean;
		long_pressed: boolean;
		released_now: boolean;
	};

	type CheckboxState = {
		node: Opaque<"node">;
		node_id: Hash;
		enabled: boolean;
		consumed: boolean;
		clicked: boolean;
		over: boolean;
		over_now: boolean;
		out_now: boolean;
		checked: boolean;
		pressed: boolean;
		pressed_now: boolean;
		long_pressed: boolean;
		released_now: boolean;
		checked_now: boolean;
		unchecked_now: boolean;
	};

	type RadioState = {
		node: Opaque<"node">;
		node_id: Hash;
		enabled: boolean;
		consumed: boolean;
		clicked: boolean;
		over: boolean;
		over_now: boolean;
		out_now: boolean;
		selected: boolean;
		pressed: boolean;
		pressed_now: boolean;
		long_pressed: boolean;
		released_now: boolean;
		selected_now: boolean;
		deselected_now: boolean;
	};

	type ListState = {
		id: string;
		enabled: boolean;
		consumed: boolean;
		items: {
			root: Opaque<"node">;
			nodes: LuaMap<Hash, Opaque<"node">>;
			data: unknown;
			index: number;
		}[];
		over: boolean;
		over_item: {
			root: Opaque<"node">;
			nodes: LuaMap<Hash, Opaque<"node">>;
			data: unknown;
			index: number;
		};
		over_item_now: {
			root: Opaque<"node">;
			nodes: LuaMap<Hash, Opaque<"node">>;
			data: unknown;
			index: number;
		};
		out_item_now: {
			root: Opaque<"node">;
			nodes: LuaMap<Hash, Opaque<"node">>;
			data: unknown;
			index: number;
		};
		selected_item: number | undefined;
		pressed_item: number | undefined;
		pressed_item_now: number | undefined;
		long_pressed: boolean;
		released_item_now: number | undefined;
		scroll: Vector3;
		is_horizontal: boolean;
	};

	type ScrollbarState = {
		enabled: boolean;
		pressed: boolean;
		pressed_now: boolean;
		released_now: boolean;
		over: boolean;
		over_now: boolean;
		out_now: boolean;
		clicked: boolean;
		scroll: Vector3;
	};

	type InputState = {
		node: Opaque<"node">;
		node_id: Hash | string;
		enabled: boolean;
		consumed: boolean;
		over: boolean;
		over_now: boolean;
		out_now: boolean;
		selected: boolean;
		pressed: boolean;
		pressed_now: boolean;
		long_pressed: boolean;
		released_now: boolean;
		selected_now: boolean;
		deselected_now: boolean;
		text: string;
		marked_text: string;
		keyboard_type: number;
		masked_text: string;
		masked_marked_text: string;
		text_width: number;
		marked_text_width: number;
		total_width: number;
	};

	/** What `create_theme` hands back: the helpers it installs, over any component
	 * carrying a node. `is_enabled` and `set_enabled` return nothing when it does not. */
	type Theme = {
		is_enabled: (component: { node?: Opaque<"node"> }) => boolean | undefined;
		set_enabled: (component: { node?: Opaque<"node"> }, enabled: boolean) => void;
		acquire_input: () => void;
		release_input: () => void;
		group: (
			group_id: Hash | string,
			action_id: Hash,
			action: table,
			group_fn: () => void,
		) => table;
	};

	/**
	 * Check if a node is enabled. This is done by not only looking at the state of the
	 * node itself but also it's ancestors all the way up the hierarchy.
	 */
	export function is_enabled(node: Opaque<"node">): boolean;

	/** Convenience function to acquire input focus */
	export function acquire_input(): void;

	/** Convenience function to release input focus */
	export function release_input(): void;

	export function create_theme(): Theme;

	/** Mask text by replacing every character with a mask character */
	export function mask_text(text: string, mask: string): string;

	export function button(
		node_id: Hash | string,
		action_id: Hash,
		action: table,
		fn: (button: ButtonState) => void,
		refresh_fn?: (button: ButtonState) => void,
	): ButtonState;

	export function checkbox(
		node_id: Hash | string,
		action_id: Hash,
		action: table,
		fn: (checkbox: CheckboxState) => void,
		refresh_fn?: (checkbox: CheckboxState) => void,
	): CheckboxState;

	/** Wraps the `gooey.radio` calls of one group; `fn` receives the group's id and the
	 * input it was called with, not a radio state (`README.md:265`). */
	export function radiogroup(
		group_id: Hash | string,
		action_id: Hash,
		action: table,
		fn: (group_id: Hash | string, action_id: Hash, action: table) => void,
	): table;

	export function radio(
		node_id: Hash | string,
		group: string,
		action_id: Hash,
		action: table,
		fn: (radio: RadioState) => void,
		refresh_fn?: (radio: RadioState) => void,
	): RadioState;

	export function static_list(
		list_id: string,
		stencil_id: Hash | string,
		item_ids: (Hash | string)[],
		action_id: Hash,
		action: table,
		config: { horizontal?: boolean } | undefined,
		fn: (list: ListState) => void,
		refresh_fn?: (list: ListState) => void,
	): ListState;

	export function dynamic_list(
		list_id: string,
		stencil_id: Hash | string,
		item_id: Hash | string,
		data: table,
		action_id: Hash,
		action: table,
		config: { horizontal?: boolean; carousel?: boolean } | undefined,
		fn: (list: ListState) => void,
		refresh_fn?: (list: ListState) => void,
	): ListState;

	export function horizontal_dynamic_list(
		list_id: string,
		stencil_id: Hash | string,
		item_id: Hash | string,
		data: table,
		action_id: Hash,
		action: table,
		config: { carousel?: boolean } | undefined,
		fn: (list: ListState) => void,
		refresh_fn?: (list: ListState) => void,
	): ListState;

	export function vertical_dynamic_list(
		list_id: string,
		stencil_id: Hash | string,
		item_id: Hash | string,
		data: table,
		action_id: Hash,
		action: table,
		config: { carousel?: boolean } | undefined,
		fn: (list: ListState) => void,
		refresh_fn?: (list: ListState) => void,
	): ListState;

	export function horizontal_static_list(
		list_id: string,
		stencil_id: Hash | string,
		item_ids: (Hash | string)[],
		action_id: Hash,
		action: table,
		config: undefined,
		fn: (list: ListState) => void,
		refresh_fn?: (list: ListState) => void,
	): ListState;

	export function vertical_static_list(
		list_id: string,
		stencil_id: Hash | string,
		item_ids: (Hash | string)[],
		action_id: Hash,
		action: table,
		config: undefined,
		fn: (list: ListState) => void,
		refresh_fn?: (list: ListState) => void,
	): ListState;

	export function vertical_scrollbar(
		handle_id: Hash | string,
		bounds_id: Hash | string,
		action_id: Hash,
		action: table,
		config: table | undefined,
		fn: (scrollbar: ScrollbarState) => void,
		refresh_fn?: (scrollbar: ScrollbarState) => void,
	): ScrollbarState;

	export function horizontal_scrollbar(
		handle_id: Hash | string,
		bounds_id: Hash | string,
		action_id: Hash,
		action: table,
		config: table | undefined,
		fn: (scrollbar: ScrollbarState) => void,
		refresh_fn?: (scrollbar: ScrollbarState) => void,
	): ScrollbarState;

	export function input(
		node_id: Hash | string,
		keyboard_type: number,
		action_id: Hash,
		action: table,
		config?: {
			max_length?: number;
			empty_text?: string;
			allowed_characters?: string;
			use_marked_text?: boolean;
		},
		refresh_fn?: (input: InputState) => void,
	): InputState;

	export function group(
		group_id: Hash | string,
		action_id: Hash,
		action: table,
		group_fn: () => void,
	): table;

	/** Move a group's focus to the component at `index`, refreshing it. */
	export function set_focus(group: table, index: number): void;
}
