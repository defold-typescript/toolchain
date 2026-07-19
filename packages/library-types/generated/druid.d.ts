/** @noResolution */
declare module 'druid.druid' {
	type druid_text_adjust_type = "downscale" | "trim" | "no_adjust" | "downscale_limited" | "scroll" | "scale_then_scroll" | "trim_left" | "scale_then_trim" | "scale_then_trim_left";
	type color = Vector4 | Vector3 | string;
	type druid_container_mode = "stretch" | "fit" | "stretch_x" | "stretch_y";
	type druid_layout_type = "horizontal" | "vertical" | "horizontal_wrap";
	/**
	 * Component to handle back button. It handles Android back button and Backspace key.
	 *
	 * ### Setup
	 * Create back handler component with druid: `druid:new_back_handler(callback)`
	 *
	 * ### Notes
	 * - Key triggers in `input.binding` should be setup for correct working
	 * - It uses a key_back and key_backspace action ids
	 */
	interface druid_back_handler {
		on_back: unknown;
		params: unknown | undefined;
		/**
		 * The Back Handler constructor
		 */
		init(callback: unknown | undefined, params: unknown | undefined): void;
		on_input(action_id: Hash, action: LuaTable): boolean;
	}
	/**
	 * Druid component for block input. Use it to block input in special zone.
	 *
	 * ### Setup
	 * Create blocker component with druid: `druid:new_blocker(node_name)`
	 *
	 * ### Notes
	 * - Blocker can be used to create safe zones, where you have big buttons
	 * - Blocker will capture all input events that hit the node, preventing them from reaching other components
	 * - Blocker works placed as usual component in stack, so any other component can be placed on top of it and will work as usual
	 */
	interface druid_blocker {
		node: Opaque<"node">;
		_is_enabled: boolean;
		/**
		 * The Blocker constructor
		 */
		init(node: Opaque<"node"> | string): void;
		on_input(action_id: string, action: LuaTable): boolean;
		/**
		 * Set blocker enabled state
		 */
		set_enabled(state: boolean): druid_blocker;
		/**
		 * Get blocker enabled state
		 */
		is_enabled(): boolean;
	}
	/**
	 * Button style params.
	 * You can override this component styles params in Druid styles table or create your own style
	 */
	interface druid_button_style {
		LONGTAP_TIME: number | undefined;
		AUTOHOLD_TRIGGER: number | undefined;
		DOUBLETAP_TIME: number | undefined;
		on_init: ((self: unknown) => void) | undefined;
		on_click: ((self: unknown, node: unknown) => void) | undefined;
		on_click_disabled: ((self: unknown, node: unknown) => void) | undefined;
		on_hover: ((self: unknown, node: unknown, hover_state: unknown) => void) | undefined;
		on_mouse_hover: ((self: unknown, node: unknown, hover_state: unknown) => void) | undefined;
		on_set_enabled: ((self: unknown, node: unknown, enabled_state: unknown) => void) | undefined;
	}
	/**
	 * Basic Druid input component. Handle input on node and provide different callbacks on touch events.
	 *
	 * ### Setup
	 * Create button with druid: `button = druid:new_button(node_name, callback, [params], [animation_node])`
	 * Where node_name is name of node from GUI scene. You can use `node_name` as input trigger zone and point another node for animation via `animation_node`
	 *
	 * ### Notes
	 * - Button callback have next params: (self, params, button_instance)
	 * -   - **self** - Druid self context
	 * -   - **params** - Additional params, specified on button creating
	 * -   - **button_instance** - button itself
	 * - You can set _params_ on button callback on button creating: `druid:new_button("node_name", callback, params)`.
	 * - Button have several events like on_click, on_repeated_click, on_long_click, on_hold_click, on_double_click
	 * - Click event will not trigger if between pressed and released state cursor was outside of node zone
	 * - Button can have key trigger to use them by key: `button:set_key_trigger`
	 * -
	 */
	interface druid_button {
		on_click: unknown;
		on_pressed: unknown;
		on_repeated_click: unknown;
		on_long_click: unknown;
		on_double_click: unknown;
		on_hold_callback: unknown;
		on_click_outside: unknown;
		node: Opaque<"node">;
		node_id: Hash;
		anim_node: Opaque<"node">;
		params: unknown;
		hover: druid_hover;
		click_zone: Opaque<"node"> | undefined;
		start_scale: Vector3;
		start_pos: Vector3;
		disabled: boolean;
		key_trigger: Hash;
		style: LuaTable;
		/**
		 * The constructor for the button component
		 */
		init(node_or_node_id: Opaque<"node"> | string, callback: (() => void) | undefined, custom_args: unknown | undefined, anim_node: Opaque<"node"> | string | undefined): void;
		on_style_change(style: druid_button_style): void;
		/**
		 * Remove default button style animations
		 */
		set_animations_disabled(): druid_button;
		on_late_init(): void;
		on_input(action_id: Hash, action: LuaTable): boolean;
		on_input_interrupt(): void;
		/**
		 * Set button enabled state.
		 * The style.on_set_enabled will be triggered.
		 * Disabled button is not clickable.
		 */
		set_enabled(state: boolean | undefined): druid_button;
		/**
		 * Get button enabled state.
		 * By default all Buttons are enabled on creating.
		 */
		is_enabled(): boolean;
		/**
		 * Set additional button click area.
		 * Useful to restrict click outside of stencil node or scrollable content.
		 * If button node placed inside stencil node, it will be automatically set to this stencil node.
		 */
		set_click_zone(zone: Opaque<"node"> | string | undefined): druid_button;
		/**
		 * Set key name to trigger this button by keyboard.
		 */
		set_key_trigger(key: Hash | string): druid_button;
		/**
		 * Get current key name to trigger this button.
		 */
		get_key_trigger(): Hash;
		/**
		 * Set function for additional check for button click availability.
		 */
		set_check_function(check_function: unknown | undefined, failure_callback: unknown | undefined): druid_button;
		/**
		 * Set Button mode to work inside user HTML5 interaction event.
		 *
		 * It's required to make protected things like copy & paste text, show mobile keyboard, etc
		 * The HTML5 button doesn't call any events except on_click event.
		 *
		 * If the game is not HTML, html mode will be not enabled
		 */
		set_web_user_interaction(is_web_mode: boolean | undefined): druid_button;
		_is_input_match(action_id: Hash): boolean;
		/**
		 * Call button style on_hover callback
		 */
		button_hover(hover_state: boolean): void;
		/**
		 * Call button style on_hover callback
		 */
		button_mouse_hover(hover_state: boolean): void;
		/**
		 * Call button click callback
		 */
		button_click(): void;
		/**
		 * Call button repeated click callback
		 */
		button_repeated_click(): void;
		/**
		 * Call button long click callback
		 */
		button_long_click(): void;
		/**
		 * Call button double click callback
		 */
		button_double_click(): void;
		/**
		 * Call button hold callback
		 */
		button_hold(press_time: number): void;
		_on_button_release(): void;
	}
	interface druid_drag_style {
		DRAG_DEADZONE: number;
		NO_USE_SCREEN_KOEF: boolean;
	}
	/**
	 * A component that allows you to subscribe to drag events over a node
	 */
	interface druid_drag {
		node: Opaque<"node">;
		on_touch_start: unknown;
		on_touch_end: unknown;
		on_drag_start: unknown;
		on_drag: unknown;
		on_drag_end: unknown;
		style: druid_drag_style;
		click_zone: Opaque<"node"> | undefined;
		is_touch: boolean;
		is_drag: boolean;
		can_x: boolean;
		can_y: boolean;
		dx: number;
		dy: number;
		touch_id: number;
		x: number;
		y: number;
		screen_x: number;
		screen_y: number;
		touch_start_pos: Vector3;
		_is_enabled: boolean;
		_x_koef: number;
		_y_koef: number;
		/**
		 * The constructor for Drag component
		 */
		init(node_or_node_id: Opaque<"node"> | string, on_drag_callback: (self: unknown, touch: unknown) => void): void;
		on_style_change(style: druid_drag_style): void;
		/**
		 * Set Drag component enabled state.
		 */
		set_drag_cursors(is_enabled: boolean): void;
		on_late_init(): void;
		on_window_resized(): void;
		on_input_interrupt(): void;
		on_input(action_id: Hash, action: LuaTable): boolean;
		/**
		 * Set Drag click zone
		 */
		set_click_zone(node: Opaque<"node"> | string | undefined): druid_drag;
		/**
		 * Set Drag component enabled state.
		 */
		set_enabled(is_enabled: boolean): druid_drag;
		/**
		 * Check if Drag component is capture input
		 */
		is_enabled(): boolean;
		_start_touch(): void;
		_end_touch(touch: touch | undefined): void;
		_process_touch(touch: touch): void;
		/**
		 * Return current touch action from action input data
		 * If touch_id stored - return exact this touch action
		 */
		_find_touch(action_id: Hash, action: LuaTable, touch_id: number): LuaTable | undefined;
		/**
		 * Process on touch release. We should to find, if any other
		 * touches exists to switch to another touch.
		 */
		_on_touch_release(action_id: Hash, action: LuaTable, touch: LuaTable): void;
	}
	interface druid_hover_style {
		ON_HOVER_CURSOR: string | number | undefined;
		ON_MOUSE_HOVER_CURSOR: string | number | undefined;
	}
	/**
	 * The component for handling hover events on a node
	 */
	interface druid_hover {
		node: Opaque<"node">;
		on_hover: unknown;
		on_mouse_hover: unknown;
		style: druid_hover_style;
		click_zone: Opaque<"node">;
		_is_hovered: boolean | undefined;
		_is_mouse_hovered: boolean | undefined;
		_is_enabled: boolean | undefined;
		_is_mobile: boolean;
		/**
		 * The constructor for the hover component
		 */
		init(node: Opaque<"node">, on_hover_callback: unknown, on_mouse_hover: unknown): void;
		on_late_init(): void;
		on_style_change(style: druid_hover_style): void;
		on_input(action_id: Hash, action: LuaTable): boolean;
		on_input_interrupt(): void;
		/**
		 * Set hover state
		 */
		set_hover(state: boolean | undefined): void;
		/**
		 * Return current hover state. True if touch action was on the node at current time
		 */
		is_hovered(): boolean;
		/**
		 * Set mouse hover state
		 */
		set_mouse_hover(state: boolean | undefined): void;
		/**
		 * Return current hover state. True if nil action_id (usually desktop mouse) was on the node at current time
		 */
		is_mouse_hovered(): boolean;
		/**
		 * Strict hover click area. Useful for no click events outside stencil node
		 */
		set_click_zone(zone: Opaque<"node"> | string | undefined): void;
		/**
		 * Set enable state of hover component.
		 * If hover is not enabled, it will not generate
		 * any hover events
		 */
		set_enabled(state: boolean | undefined): void;
		/**
		 * Return current hover enabled state
		 */
		is_enabled(): boolean;
		on_remove(): void;
		_set_cursor(): void;
	}
	/**
	 * Scroll style parameters
	 */
	interface druid_scroll_style {
		FRICT: number | undefined;
		FRICT_HOLD: number | undefined;
		INERT_THRESHOLD: number | undefined;
		INERT_SPEED: number | undefined;
		POINTS_DEADZONE: number | undefined;
		BACK_SPEED: number | undefined;
		ANIM_SPEED: number | undefined;
		EXTRA_STRETCH_SIZE: number | undefined;
		SMALL_CONTENT_SCROLL: boolean | undefined;
		WHEEL_SCROLL_SPEED: number | undefined;
		WHEEL_SCROLL_INVERTED: boolean | undefined;
		WHEEL_SCROLL_BY_INERTION: boolean | undefined;
	}
	/**
	 * Basic Druid scroll component. Handles all scrolling behavior in Druid GUI.
	 *
	 * ### Setup
	 * Create scroll component with druid: `druid:new_scroll(view_node, content_node)`
	 *
	 * ### Notes
	 * - View_node is the static part that captures user input and recognizes scrolling touches
	 * - Content_node is the dynamic part that will change position according to the scroll system
	 * - Initial scroll size will be equal to content_node size
	 * - The initial view box will be equal to view_node size
	 * - Scroll by default style has inertia and extra size for stretching effect
	 * - You can setup "points of interest" to make scroll always center on closest point
	 * - Scroll events:
	 * -   - on_scroll(self, position): On scroll move callback
	 * -   - on_scroll_to(self, position, is_instant): On scroll_to function callback
	 * -   - on_point_scroll(self, item_index, position): On scroll_to_index function callback
	 * - Multitouch is required for scroll. Scroll correctly handles touch_id swap while dragging
	 */
	interface druid_scroll {
		node: Opaque<"node">;
		click_zone: Opaque<"node"> | undefined;
		on_scroll: unknown;
		on_scroll_to: unknown;
		on_point_scroll: unknown;
		view_node: Opaque<"node">;
		view_border: Vector4;
		content_node: Opaque<"node">;
		view_size: Vector3;
		position: Vector3;
		target_position: Vector3;
		available_pos: Vector4;
		available_size: Vector3;
		drag: druid_drag;
		selected: number | undefined;
		is_animate: boolean;
		style: druid_scroll_style;
		_is_inert: boolean;
		inertion: Vector3;
		_is_horizontal_scroll: boolean;
		_is_vertical_scroll: boolean;
		_grid_on_change: unknown;
		_grid_on_change_callback: unknown;
		_offset: Vector3;
		_layout_on_change_callback: unknown;
		/**
		 * The Scroll constructor
		 */
		init(view_node: string | Opaque<"node">, content_node: string | Opaque<"node">): void;
		on_style_change(style: druid_scroll_style): void;
		on_late_init(): void;
		on_layout_change(): void;
		update(): void;
		on_input(): void;
		on_remove(): void;
		/**
		 * Start scroll to target point.
		 */
		scroll_to(point: Vector3, is_instant: boolean | undefined): void;
		/**
		 * Scroll to the node, if node is not visible in scroll view
		 */
		scroll_to_make_node_visible(node: Opaque<"node">, is_instant: boolean | undefined): void;
		/**
		 * Scroll to item in scroll by point index.
		 */
		scroll_to_index(index: number, is_silent: boolean | undefined, is_instant: boolean | undefined): void;
		/**
		 * Start scroll to target scroll percent
		 */
		scroll_to_percent(percent: Vector3, is_instant: boolean | undefined): void;
		/**
		 * Return current scroll progress status.
		 */
		get_percent(): Vector3;
		/**
		 * Set scroll content size.
		 */
		set_size(size: Vector3, offset: Vector3 | undefined): druid_scroll;
		/**
		 * Set new scroll view size in case the node size was changed.
		 */
		set_view_size(size: Vector3): druid_scroll;
		/**
		 * Refresh scroll view size, used when view node size is changed
		 */
		update_view_size(): druid_scroll;
		/**
		 * Enable or disable scroll inert
		 */
		set_inert(state: boolean): druid_scroll;
		/**
		 * Return if scroll have inertion
		 */
		is_inert(): boolean;
		/**
		 * Set extra size for scroll stretching
		 */
		set_extra_stretch_size(stretch_size: number | undefined): druid_scroll;
		/**
		 * Return vector of scroll size with width and height.
		 */
		get_scroll_size(): Vector3;
		/**
		 * Set points of interest.
		 */
		set_points(points: LuaTable): druid_scroll;
		/**
		 * Lock or unlock horizontal scroll
		 */
		set_horizontal_scroll(state: boolean): druid_scroll;
		/**
		 * Lock or unlock vertical scroll
		 */
		set_vertical_scroll(state: boolean): druid_scroll;
		/**
		 * Check node if it visible now on scroll.
		 */
		is_node_in_view(node: Opaque<"node">): boolean;
		/**
		 * Bind the grid component (Static or Dynamic) to recalculate
		 */
		bind_grid(grid: druid_grid | undefined): druid_scroll;
		/**
		 * Bind the layout component to recalculate
		 */
		bind_layout(layout: druid_layout | undefined): druid_scroll;
		/**
		 * Strict drag scroll area. Useful for
		 */
		set_click_zone(node: Opaque<"node"> | string): void;
		_on_scroll_drag(): void;
		_check_soft_zone(): void;
		_cancel_animate(): void;
		_set_scroll_position(): void;
		/**
		 * Find closer point of interest
		 */
		_check_points(): void;
		_check_threshold(): void;
		_update_free_scroll(): void;
		_update_hand_scroll(): void;
		_on_touch_start(): void;
		_on_touch_end(): void;
		_update_size(): void;
		_process_scroll_wheel(): void;
		_on_mouse_hover(): void;
		_inverse_lerp(): void;
		/**
		 * Update vector with next conditions:
		 * Field x have to <= field z
		 * Field y have to <= field w
		 */
		_get_border_vector(vector: Vector4, offset: Vector3): Vector4;
		/**
		 * Return size from scroll border vector4
		 */
		_get_size_vector(vector: Vector4): Vector3;
	}
	interface druid_grid_style {
		IS_DYNAMIC_NODE_POSES: boolean | undefined;
		IS_ALIGN_LAST_ROW: boolean | undefined;
	}
	/**
	 * The component for manage the nodes position in the grid with various options
	 */
	interface druid_grid {
		on_add_item: unknown;
		on_remove_item: unknown;
		on_change_items: unknown;
		on_clear: unknown;
		on_update_positions: unknown;
		parent: Opaque<"node">;
		nodes: Opaque<"node">[];
		first_index: number;
		last_index: number;
		anchor: Vector3;
		pivot: Vector3;
		node_size: Vector3;
		border: Vector4;
		in_row: number;
		style: druid_grid_style;
		/**
		 * The constructor for the grid component
		 */
		init(parent: string | Opaque<"node">, element: Opaque<"node">, in_row: number | undefined): void;
		on_style_change(style: druid_grid_style): void;
		/**
		 * Return pos for grid node index
		 */
		get_pos(index: number): Vector3;
		/**
		 * Return grid index by content-local x, y. Inverse of get_pos + _get_dynamic_offset.
		 */
		get_index_xy(x: number, y: number): number;
		/**
		 * Return grid index by position. Inverse of get_pos + _get_dynamic_offset.
		 */
		get_index(pos: Vector3): number;
		/**
		 * Return grid index by node
		 */
		get_index_by_node(node: Opaque<"node">): number | undefined;
		on_layout_change(): void;
		/**
		 * Set grid anchor. Default anchor is equal to anchor of grid parent node
		 */
		set_anchor(anchor: Vector3): void;
		/**
		 * Instantly update the grid content
		 */
		refresh(): druid_grid;
		/**
		 * Set grid pivot
		 */
		set_pivot(pivot: Opaque<"constant">): druid_grid;
		/**
		 * Add new item to the grid
		 */
		add(item: Opaque<"node">, index: number | undefined, shift_policy: number | undefined, is_instant: boolean | undefined): druid_grid;
		/**
		 * Set new items to the grid. All previous items will be removed
		 */
		set_items(nodes: Opaque<"node">[], is_instant: boolean | undefined): druid_grid;
		/**
		 * Remove the item from the grid. Note that gui node will be not deleted
		 */
		remove(index: number, shift_policy: number | undefined, is_instant: boolean | undefined): Opaque<"node">;
		/**
		 * Return items count in grid
		 */
		get_items_count(): number;
		/**
		 * Return grid content size
		 */
		get_size(): Vector3;
		/**
		 * Return grid content size for given count of nodes
		 */
		get_size_for(count: number): Vector3;
		/**
		 * Return grid content borders
		 */
		get_borders(): Vector4;
		/**
		 * Return array of all node positions
		 */
		get_all_pos(): Vector3[];
		/**
		 * Change set position function for grid nodes. It will call on
		 */
		set_position_function(callback: unknown): druid_grid;
		/**
		 * Clear grid nodes array. GUI nodes will be not deleted!
		 */
		clear(): druid_grid;
		/**
		 * Return StaticGrid offset, where StaticGrid content starts.
		 */
		get_offset(): Vector3;
		/**
		 * Set new in_row elements for grid
		 */
		set_in_row(in_row: number): druid_grid;
		/**
		 * Set new node size for grid
		 */
		set_item_size(width: number | undefined, height: number | undefined): druid_grid;
		/**
		 * Sort grid nodes by custom comparator function
		 */
		sort_nodes(comparator: unknown): druid_grid;
		/**
		 * Update grid inner state
		 */
		_update(is_instant: boolean | undefined): void;
		/**
		 * Update first and last indexes of grid nodes
		 */
		_update_indexes(): void;
		/**
		 * Update grid content borders, recalculate min and max values
		 */
		_update_borders(): void;
		/**
		 * Update grid nodes position
		 */
		_update_pos(is_instant: boolean | undefined): void;
		/**
		 * Return dynamic centering offset. Only non-zero when IS_DYNAMIC_NODE_POSES is enabled,
		 * centers grid content according to pivot within its current borders.
		 */
		_get_dynamic_offset(): LuaMultiReturn<[number, number]>;
		/**
		 * Return x offset for a given row. For most rows returns _base_offset.x,
		 * but when IS_ALIGN_LAST_ROW is enabled, the last row gets a different offset.
		 */
		_get_row_offset_x(): number;
		_extend_border(border: Vector4, pos: Vector3, size: Vector3, pivot: Vector3): void;
	}
	interface druid_text_style {
		TRIM_POSTFIX: string | undefined;
		DEFAULT_ADJUST: string | undefined;
		ADJUST_STEPS: number | undefined;
		ADJUST_SCALE_DELTA: number | undefined;
	}
	/**
	 * Basic Druid text component. Text components by default have the text size adjusting.
	 *
	 * ### Setup
	 * Create text node with druid: `text = druid:new_text(node_name, [initial_value], [text_adjust_type])`
	 *
	 * ### Notes
	 * - Text component by default have auto adjust text sizing. Text never will be bigger, than text node size, which you can setup in GUI scene.
	 * - Text pivot can be changed with `text:set_pivot`, and text will save their position inside their text size box
	 * - There are several text adjust types:
	 * -   - **"downscale"** - Change text's scale to fit in the text node size (default)
	 * -   - **"trim"** - Trim the text with postfix (default - "...") to fit in the text node size
	 * -   - **"no_adjust"** - No any adjust, like default Defold text node
	 * -   - **"downscale_limited"** - Change text's scale like downscale, but there is limit for text's scale
	 * -   - **"scroll"** - Change text's pivot to imitate scrolling in the text box. Use with stencil node for better effect.
	 * -   - **"scale_then_scroll"** - Combine two modes: first limited downscale, then scroll
	 * -   - **"trim_left"** - Trim the text with postfix (default - "...") to fit in the text node size
	 * -   - **"scale_then_trim"** - Combine two modes: first limited downscale, then trim
	 * -   - **"scale_then_trim_left"** - Combine two modes: first limited downscale, then trim left
	 */
	interface druid_text {
		node: Opaque<"node">;
		on_set_text: unknown;
		on_update_text_scale: unknown;
		on_set_pivot: unknown;
		style: druid_text_style;
		start_pivot: number;
		start_scale: Vector3;
		scale: Vector3;
		/**
		 * The Text constructor
		 */
		init(node: string | Opaque<"node">, value: string | undefined, adjust_type: druid_text_adjust_type | undefined): void;
		on_style_change(style: druid_text_style): void;
		on_layout_change(): void;
		/**
		 * Calculate text width with font with respect to trailing space
		 */
		get_text_size(text: string | undefined): LuaMultiReturn<[number, number]>;
		/**
		 * Get chars count by width
		 */
		get_text_index_by_width(width: number): number;
		/**
		 * Set text to text field
		 */
		set_to(set_to: string): druid_text;
		set_text(): void;
		get_text(): void;
		/**
		 * Set text area size
		 */
		set_size(size: Vector3): druid_text;
		/**
		 * Set color
		 */
		set_color(color: Vector4): druid_text;
		/**
		 * Set alpha
		 */
		set_alpha(alpha: number): druid_text;
		/**
		 * Set scale
		 */
		set_scale(scale: Vector3): druid_text;
		/**
		 * Set text pivot. Text will re-anchor inside text area
		 */
		set_pivot(pivot: number): druid_text;
		/**
		 * Return true, if text with line break
		 */
		is_multiline(): boolean;
		/**
		 * Set text adjust, refresh the current text visuals, if needed
		 */
		set_text_adjust(adjust_type: druid_text_adjust_type | undefined, minimal_scale: number | undefined): druid_text;
		/**
		 * Set minimal scale for "downscale_limited" or "scale_then_scroll" adjust types
		 */
		set_minimal_scale(minimal_scale: number): druid_text;
		/**
		 * Return current text adjust type
		 */
		get_text_adjust(): string;
		_update_text_size(): void;
		/**
		 * Reset initial scale for text
		 */
		_reset_default_scale(): void;
		_is_fit_info_area(metrics: LuaTable): boolean;
		/**
		 * Setup scale x, but can only be smaller, than start text scale
		 */
		_update_text_area_size(): void;
		_update_text_with_trim(trim_postfix: string): void;
		_update_text_with_trim_left(trim_postfix: string): void;
		_update_text_with_anchor_shift(): void;
		_update_adjust(): void;
	}
	/**
	 * Color palette and utility functions for working with colors.
	 * Supports palette management, hex conversion, RGB/HSB conversion, and color interpolation.
	 */
	interface druid_color {
	}
	interface druid_component_meta {
		template: string;
		context: LuaTable;
		nodes: LuaTable<Hash, Opaque<"node">> | undefined;
		style: LuaTable | undefined;
		druid: druid_instance;
		input_enabled: boolean;
		children: LuaTable;
		parent: druid_component | undefined;
		instance_class: LuaTable;
	}
	interface druid_component_component {
		name: string;
		input_priority: number;
		default_input_priority: number;
		_is_input_priority_changed: boolean;
		_uid: number;
	}
	interface druid_component {
		druid: druid_instance;
		init: ((self: druid_component, ...args: unknown[]) => void) | undefined;
		update: ((self: druid_component, dt: number) => void) | undefined;
		on_remove: ((self: druid_component) => void) | undefined;
		on_input: ((self: druid_component, action_id: Hash, action: LuaTable) => void) | undefined;
		on_input_interrupt: ((self: druid_component, action_id: Hash, action: LuaTable) => void) | undefined;
		on_message: ((self: druid_component, message_id: Hash, message: LuaTable, sender: Url) => void) | undefined;
		on_late_init: ((self: druid_component) => void) | undefined;
		on_focus_lost: ((self: druid_component) => void) | undefined;
		on_focus_gained: ((self: druid_component) => void) | undefined;
		on_style_change: ((self: druid_component, style: LuaTable) => void) | undefined;
		on_layout_change: ((self: druid_component) => void) | undefined;
		on_window_resized: ((self: druid_component) => void) | undefined;
		on_language_change: ((self: druid_component) => void) | undefined;
		_component: druid_component_component;
		_meta: druid_component_meta;
		/**
		 * Set component style. Pass nil to clear style
		 */
		set_style(self: unknown, druid_style: LuaTable | undefined): unknown;
		/**
		 * Set component template name. Pass nil to clear template.
		 * This template id used to access nodes inside the template on GUI scene.
		 * Parent template will be added automatically if exist.
		 */
		set_template(self: unknown, template: string | undefined): unknown;
		/**
		 * Get full template name.
		 */
		get_template(): string;
		/**
		 * Set current component nodes, returned from `gui.clone_tree` function.
		 */
		set_nodes(nodes: LuaTable<Hash, Opaque<"node">> | Opaque<"node"> | string | undefined): druid_component;
		/**
		 * Return current component context
		 */
		get_context(): unknown;
		/**
		 * Get component node by node_id. Respect to current template and nodes.
		 */
		get_node(node_id: string | Opaque<"node">): Opaque<"node">;
		/**
		 * Get Druid instance for inner component creation.
		 */
		get_druid(template: string | undefined, nodes: LuaTable<Hash, Opaque<"node">> | Opaque<"node"> | string | undefined): druid_instance;
		/**
		 * Get component name
		 */
		get_name(): string;
		/**
		 * Get parent component name
		 */
		get_parent_name(): string | undefined;
		/**
		 * Get component input priority, the bigger number processed first. Default value: 10
		 */
		get_input_priority(): number;
		/**
		 * Set component input priority, the bigger number processed first. Default value: 10
		 */
		set_input_priority(value: number, is_temporary: boolean | undefined): druid_component;
		/**
		 * Reset component input priority to it's default value, that was set in `create` function or `set_input_priority`
		 */
		reset_input_priority(): druid_component;
		/**
		 * Get component UID, unique identifier created in component creation order.
		 */
		get_uid(): number;
		/**
		 * Set component input state. By default it's enabled.
		 * If input is disabled, the component will not receive input events.
		 * Recursive for all children components.
		 */
		set_input_enabled(state: boolean): druid_component;
		/**
		 * Get component input state. By default it's enabled. Can be disabled by `set_input_enabled` function.
		 */
		get_input_enabled(): boolean;
		/**
		 * Get parent component
		 */
		get_parent_component(): druid_component | undefined;
		/**
		 * Setup component context and his style table
		 */
		setup_component(druid_instance: druid_instance, context: LuaTable, style: LuaTable, instance_class: LuaTable): druid_component;
		/**
		 * Return true, if input priority was changed
		 */
		_is_input_priority_changed(): void;
		/**
		 * Reset is_input_priority_changed field
		 */
		_reset_input_priority_changed(): void;
		/**
		 * Get current component nodes
		 */
		get_nodes(): LuaTable<Hash, Opaque<"node">> | undefined;
		/**
		 * Add child to component children list
		 */
		__add_child(child: unknown): unknown;
		/**
		 * Remove child from component children list
		 */
		__remove_child(child: unknown): boolean;
		/**
		 * Return all children components, recursive
		 */
		get_childrens(): LuaTable;
	}
	interface druid_system_const {
	}
	/**
	 * The component that handles a rich text input field, it's a wrapper around the druid.input component
	 */
	interface druid_rich_input {
		root: Opaque<"node">;
		input: druid_input;
		cursor: Opaque<"node">;
		cursor_text: Opaque<"node">;
		cursor_position: Vector3;
		init(template: string, nodes: LuaTable): void;
		on_input(action_id: Hash, action: LuaTable): boolean;
		/**
		 * Set placeholder text
		 */
		set_placeholder(placeholder_text: string): druid_rich_input;
		/**
		 * Select input field
		 */
		select(): druid_rich_input;
		/**
		 * Set input field text
		 */
		set_text(text: string): druid_rich_input;
		/**
		 * Set input field font
		 */
		set_font(font: Hash): druid_rich_input;
		/**
		 * Set input field text
		 */
		get_text(): void;
		/**
		 * Set allowed charaters for input field.
		 */
		set_allowed_characters(characters: string): druid_rich_input;
	}
	interface druid_rich_text_settings {
		parent: Opaque<"node">;
		size: number;
		fonts: LuaTable<string, string>;
		scale: Vector3;
		color: Vector4;
		shadow: Vector4;
		outline: Vector4;
		position: Vector3;
		image_pixel_grid_snap: boolean;
		combine_words: boolean;
		default_animation: string;
		split_by_character: boolean;
		text_prefab: Opaque<"node">;
		adjust_scale: number;
		default_texture: string;
		is_multiline: boolean;
		text_leading: number;
		font: Hash;
		width: number;
		height: number;
	}
	interface druid_rich_text_word {
		node: Opaque<"node">;
		relative_scale: number;
		source_text: string;
		color: Vector4;
		text_color: Vector4;
		position: Vector3;
		offset: Vector3;
		scale: Vector3;
		size: Vector3;
		metrics: druid_rich_text_metrics;
		pivot: Opaque<"constant">;
		text: string;
		shadow: Vector4;
		outline: Vector4;
		font: string;
		image: druid_rich_text_word_image;
		br: boolean;
		nobr: boolean;
		tags: LuaTable<string, boolean>;
	}
	interface druid_rich_text_word_image {
		texture: string;
		anim: string;
		width: number;
		height: number;
	}
	interface druid_rich_text_style {
		ADJUST_STEPS: number;
		ADJUST_SCALE_DELTA: number;
	}
	interface druid_rich_text_lines_metrics {
		text_width: number;
		text_height: number;
		lines: LuaTable<number, druid_rich_text_metrics>;
	}
	interface druid_rich_text_metrics {
		width: number;
		height: number;
		offset_x: number | undefined;
		offset_y: number | undefined;
		node_size: Vector3 | undefined;
	}
	/**
	 * The component that handles a rich text display, allows to custom color, size, font, etc. of the parts of the text
	 */
	interface druid_rich_text {
		root: Opaque<"node">;
		text_prefab: Opaque<"node">;
		_last_value: string;
		_settings: LuaTable;
		_split_to_characters: boolean;
		_anchor: Vector3 | undefined;
		init(text_node: Opaque<"node"> | string, value: string | undefined): void;
		on_layout_change(): void;
		on_style_change(style: druid_rich_text_style): void;
		/**
		 * Set text for Rich Text
		 * -- Color
		 * rich_text:set_text("＜color=red＞Foobar＜/color＞")
		 * rich_text:set_text("＜color=1.0,0,0,1.0＞Foobar＜/color＞")
		 * rich_text:set_text("＜color=#ff0000＞Foobar＜/color＞")
		 * rich_text:set_text("＜color=#ff0000ff＞Foobar＜/color＞")
		 * -- Shadow
		 * rich_text:set_text("＜shadow=red＞Foobar＜/shadow＞")
		 * rich_text:set_text("＜shadow=1.0,0,0,1.0＞Foobar＜/shadow＞")
		 * rich_text:set_text("＜shadow=#ff0000＞Foobar＜/shadow＞")
		 * rich_text:set_text("＜shadow=#ff0000ff＞Foobar＜/shadow＞")
		 * -- Outline
		 * rich_text:set_text("＜outline=red＞Foobar＜/outline＞")
		 * rich_text:set_text("＜outline=1.0,0,0,1.0＞Foobar＜/outline＞")
		 * rich_text:set_text("＜outline=#ff0000＞Foobar＜/outline＞")
		 * rich_text:set_text("＜outline=#ff0000ff＞Foobar＜/outline＞")
		 * -- Font
		 * rich_text:set_text("＜font=MyCoolFont＞Foobar＜/font＞")
		 * -- Size
		 * rich_text:set_text("＜size=2＞Twice as large＜/size＞")
		 * -- Line break
		 * rich_text:set_text("＜br/＞Insert a line break")
		 * -- No break
		 * rich_text:set_text("＜nobr＞Prevent the text from breaking")
		 * -- Image
		 * rich_text:set_text("＜img=texture:image＞Display image")
		 * rich_text:set_text("＜img=texture:image,size＞Display image with size")
		 * rich_text:set_text("＜img=texture:image,width,height＞Display image with width and height")
		 */
		set_text(text: string | undefined): LuaMultiReturn<[druid_rich_text_word[], druid_rich_text_lines_metrics]>;
		/**
		 * Get the current text of the rich text
		 */
		get_text(): string;
		/**
		 * Set pivot and keep the content in place (anchor). After this, resizing the root will keep the anchor fixed.
		 */
		set_pivot(pivot: number): druid_rich_text;
		on_remove(): void;
		/**
		 * Clear all created words.
		 */
		clear(): void;
		/**
		 * Get all words, which has a passed tag.
		 */
		tagged(tag: string): druid_rich_text_word[];
		/**
		 * Set if the rich text should split to characters, not words
		 */
		set_split_to_characters(value: boolean): druid_rich_text;
		/**
		 * Get all current created words, each word is a table that contains the information about the word
		 */
		get_words(): druid_rich_text_word[];
		/**
		 * Get the current line metrics
		 */
		get_line_metric(): druid_rich_text_lines_metrics;
		_create_settings(): LuaTable;
		/**
		 * Set the width of the rich text, not affects the size of current spawned words
		 */
		set_width(width: number): druid_rich_text;
		/**
		 * Set the height of the rich text, not affects the size of current spawned words
		 */
		set_height(height: number): druid_rich_text;
	}
	/**
	 * Entry point for Druid UI Framework.
	 * Create a new Druid instance and adjust the Druid settings here.
	 */
	interface druid {
	}
	interface druid_container_style {
		DRAGGABLE_CORNER_SIZE: Vector3;
		DRAGGABLE_CORNER_COLOR: Vector4;
	}
	/**
	 * Druid component to manage the size and positions with other containers relations to create a adaptable layouts.
	 *
	 * ### Setup
	 * Create container component with druid: `container = druid:new_container(node, mode, callback)`
	 *
	 * ### Notes
	 * - Container can be used to create adaptable layouts that respond to window size changes
	 * - Container supports different layout modes: FIT, STRETCH, STRETCH_X, STRETCH_Y
	 * - Container can be nested inside other containers
	 * - Container supports fixed margins and percentage-based sizing
	 * - Container can be positioned using pivot points
	 * - Container supports minimum size constraints
	 * - Container can be fitted into window or custom size
	 */
	interface druid_container {
		node: Opaque<"node">;
		druid: druid_instance;
		node_offset: Vector4;
		origin_size: Vector3;
		size: Vector3;
		origin_position: Vector3;
		position: Vector3;
		pivot_offset: Vector3;
		center_offset: Vector3;
		mode: druid_container_mode;
		fit_size: Vector3;
		min_size_x: number | undefined;
		min_size_y: number | undefined;
		max_size_x: number | undefined;
		max_size_y: number | undefined;
		on_size_changed: unknown;
		_parent_container: druid_container;
		_containers: LuaTable;
		_draggable_corners: LuaTable;
		/**
		 * The Container constructor
		 */
		init(node: Opaque<"node">, mode: string, callback: ((self: druid_container, size: Vector3) => void) | undefined): void;
		on_late_init(): void;
		on_remove(): void;
		/**
		 * Refresh the origins of the container, origins is the size and position of the container when it was created
		 */
		refresh_origins(): void;
		/**
		 * Set the pivot of the container
		 */
		set_pivot(pivot: Opaque<"constant">): void;
		on_style_change(style: druid_container_style): void;
		/**
		 * Set new size of layout node
		 */
		set_size(width: number | undefined, height: number | undefined, anchor_pivot: Opaque<"constant"> | undefined): druid_container;
		/**
		 * Get the position of the container
		 */
		get_position(): Vector3;
		/**
		 * Set the position of the container
		 */
		set_position(pos_x: number, pos_y: number): void;
		/**
		 * Get the current size of the layout node
		 */
		get_size(): Vector3;
		/**
		 * Get the current scale of the layout node
		 */
		get_scale(): Vector3;
		/**
		 * Set size for layout node to fit inside it
		 */
		fit_into_size(target_size: Vector3): druid_container;
		/**
		 * Set current size for layout node to fit inside it
		 */
		fit_into_window(): druid_container;
		on_window_resized(): void;
		add_container(node_or_container: Opaque<"node"> | string | druid_container | LuaTable, mode: druid_container_mode | undefined, on_resize_callback: ((self: Opaque<"userdata">, size: Vector3) => void) | undefined): druid_container;
		remove_container_by_node(): druid_container | undefined;
		set_parent_container(parent_container: druid_container | undefined): void;
		refresh(): void;
		refresh_scale(): void;
		update_child_containers(): void;
		create_draggable_corners(): druid_container;
		clear_draggable_corners(): druid_container;
		_on_corner_drag(): void;
		/**
		 * Set node for layout node to fit inside it. Pass nil to reset
		 */
		fit_into_node(node: string | Opaque<"node">): druid_container;
		/**
		 * Set the minimum size of the container
		 */
		set_min_size(min_size_x: number | undefined, min_size_y: number | undefined): druid_container;
		/**
		 * Set the maximum size of the container
		 */
		set_max_size(max_size_x: number | undefined, max_size_y: number | undefined): druid_container;
	}
	/**
	 * Druid component to manage a list of data with a scrollable view, used to manage huge list data and render only visible elements.
	 *
	 * ### Setup
	 * Create data list component with druid: `data_list = druid:new_data_list(scroll, grid, create_function)`
	 *
	 * ### Notes
	 * - Data List uses a scroll component for scrolling and a grid component for layout
	 * - Data List only renders visible elements for better performance
	 * - Data List supports caching of elements for better performance
	 * - Data List supports adding, removing and updating elements
	 * - Data List supports scrolling to specific elements
	 * - Data List supports custom element creation and cleanup
	 */
	interface druid_data_list {
		scroll: druid_scroll;
		grid: druid_grid;
		on_scroll_progress_change: unknown;
		on_element_add: unknown;
		on_element_remove: unknown;
		top_index: number;
		last_index: number;
		scroll_progress: number;
		_create_function: unknown;
		_is_use_cache: boolean;
		_cache: LuaTable;
		_data: LuaTable;
		_data_visual: LuaTable;
		/**
		 * The DataList constructor
		 */
		init(scroll: druid_scroll, grid: druid_grid, create_function: unknown): void;
		on_remove(): void;
		/**
		 * Set use cache version of DataList. Requires make setup of components in on_element_add callback and clean in on_element_remove
		 */
		set_use_cache(is_use_cache: boolean): druid_data_list;
		/**
		 * Set new data set for DataList component
		 */
		set_data(data: LuaTable): druid_data_list;
		/**
		 * Return current data from DataList component
		 */
		get_data(): LuaTable;
		/**
		 * Add element to DataList
		 */
		add(data: LuaTable, index: number | undefined, shift_policy: number | undefined): druid_data_list;
		/**
		 * Remove element from DataList
		 */
		remove(index: number | undefined, shift_policy: number | undefined): druid_data_list;
		/**
		 * Remove element from DataList by data value
		 */
		remove_by_data(data: LuaTable, shift_policy: number | undefined): druid_data_list;
		/**
		 * Clear the DataList and refresh visuals
		 */
		clear(): druid_data_list;
		/**
		 * Return index for data value
		 */
		get_index(data: LuaTable): void;
		/**
		 * Return all currently created nodes in DataList
		 */
		get_created_nodes(): Opaque<"node">[];
		/**
		 * Return all currently created components in DataList
		 */
		get_created_components(): druid_component[];
		/**
		 * Instant scroll to element with passed index
		 */
		scroll_to_index(index: number): void;
		/**
		 * Add element at passed index using cache or create new
		 */
		_add_at(index: number): void;
		/**
		 * Remove element from passed index and add it to cache if applicable
		 */
		_remove_at(index: number): void;
		/**
		 * Get the visible area bounds in content-local coordinates (top-left and bottom-right),
		 * clamped to the grid coordinate range so get_index_xy produces valid results.
		 */
		_get_visible_bounds(): LuaMultiReturn<[number, number, number, number]>;
		/**
		 * Refresh all elements in DataList
		 */
		_refresh(): void;
	}
	interface druid_hotkey_style {
		MODIFICATORS: string[] | Hash[];
		MODIFICATOR_RELEASE_TIME: number;
	}
	/**
	 * Druid component to manage hotkeys and trigger callbacks when hotkeys are pressed.
	 *
	 * ### Setup
	 * Create hotkey component with druid: `hotkey = druid:new_hotkey(keys, callback, callback_argument)`
	 *
	 * ### Notes
	 * - Hotkey can be triggered by pressing a single key or a combination of keys
	 * - Hotkey supports modificator keys (e.g. Ctrl, Shift, Alt)
	 * - Hotkey can be triggered on key press, release or repeat
	 * - Hotkey can be added or removed at runtime
	 * - Hotkey can be enabled or disabled
	 * - Hotkey can be set to repeat on key hold
	 */
	interface druid_hotkey {
		on_hotkey_pressed: unknown;
		on_hotkey_released: unknown;
		style: druid_hotkey_style;
		_hotkeys: LuaTable;
		_modificators: LuaTable<Hash, boolean>;
		_modificator_released_at: LuaTable<Hash, number>;
		_node: Opaque<"node"> | undefined;
		/**
		 * The Hotkey constructor
		 */
		init(keys: string[] | string, callback: unknown, callback_argument: unknown | undefined): void;
		on_style_change(style: druid_hotkey_style): void;
		/**
		 * Add hotkey for component callback
		 */
		add_hotkey(keys: string[] | Hash[] | string | Hash, callback_argument: unknown | undefined): druid_hotkey;
		is_processing(): void;
		on_focus_gained(): void;
		_is_modificator_active(modificator: Hash, time: number): boolean;
		on_input(action_id: Hash | undefined, action: action): boolean;
		/**
		 * If true, the callback will be triggered on action.repeated
		 */
		set_repeat(is_enabled_repeated: boolean): druid_hotkey;
		/**
		 * If node is provided, the hotkey can be disabled, if the node is disabled
		 */
		bind_node(node: Opaque<"node"> | undefined): druid_hotkey;
	}
	interface druid_input_style {
		MASK_DEFAULT_CHAR: string;
		IS_LONGTAP_ERASE: boolean;
		IS_UNSELECT_ON_RESELECT: boolean;
		on_init: ((self: druid_input) => void) | undefined;
		on_select: (self: druid_input, button_node: Opaque<"node">) => void;
		on_unselect: (self: druid_input, button_node: Opaque<"node">) => void;
		on_input_wrong: (self: druid_input, button_node: Opaque<"node">) => void;
	}
	/**
	 * Basic Druid text input component. Handles user text input via component with button and text.
	 *
	 * ### Setup
	 * Create input component with druid: `input = druid:new_input(button_node_name, text_node_name, keyboard_type)`
	 *
	 * ### Notes
	 * - Input component handles user text input. Input contains button and text components
	 * - Button needed for selecting/unselecting input field
	 * - Click outside of button to unselect input field
	 * - On focus lost (game minimized) input field will be unselected
	 * - You can setup max length of the text
	 * - You can setup allowed characters. On add not allowed characters `on_input_wrong` will be called
	 */
	interface druid_input {
		on_input_select: unknown;
		on_input_unselect: unknown;
		on_input_text: unknown;
		on_input_empty: unknown;
		on_input_full: unknown;
		on_input_wrong: unknown;
		on_select_cursor_change: unknown;
		style: druid_input_style;
		init(click_node: Opaque<"node">, text_node: Opaque<"node"> | druid_text, keyboard_type: Opaque<"constant"> | undefined): void;
		on_style_change(style: druid_input_style): void;
		on_input(action_id: Hash | undefined, action: action): boolean;
		on_focus_lost(): void;
		get_text_selected(): void;
		/**
		 * Replace selected text with new text
		 */
		get_text_selected_replaced(text: string): string;
		/**
		 * Set text for input field
		 */
		set_text(input_text: string | undefined): void;
		/**
		 * Select input field. It will show the keyboard and trigger on_select events
		 */
		select(): void;
		/**
		 * Remove selection from input. It will hide the keyboard and trigger on_unselect events
		 */
		unselect(): void;
		/**
		 * Return current input field text
		 */
		get_text(): string;
		/**
		 * Set maximum length for input field.
		 * Pass nil to make input field unliminted (by default)
		 */
		set_max_length(max_length: number): druid_input;
		/**
		 * Set allowed charaters for input field.
		 * See: https://defold.com/ref/stable/string/
		 * ex: [%a%d] for alpha and numeric
		 * ex: [abcdef] to allow only these characters
		 * ex: [^%s] to allow only non-space characters
		 */
		set_allowed_characters(characters: string): druid_input;
		/**
		 * Reset current input selection and return previous value
		 */
		reset_changes(): druid_input;
		/**
		 * Set cursor position in input field
		 */
		select_cursor(cursor_index: number | undefined, start_index: number | undefined, end_index: number | undefined): druid_input;
		/**
		 * Change cursor position by delta
		 */
		move_selection(delta: number, is_add_to_selection: boolean, is_move_to_end: boolean): druid_input;
	}
	/**
	 * The component used for displaying localized text, can automatically update text when locale is changed.
	 * It wraps the Text component to handle localization using druid's get_text_function to set text by its id.
	 *
	 * ### Setup
	 * Create lang text component with druid: `text = druid:new_lang_text(node_name, locale_id)`
	 *
	 * ### Notes
	 * - Component automatically updates text when locale is changed
	 * - Uses druid's get_text_function to get localized text by id
	 * - Supports string formatting with additional parameters
	 */
	interface druid_lang_text {
		text: druid_text;
		node: Opaque<"node">;
		on_change: unknown;
		last_locale_args: LuaTable;
		last_locale: string;
		init(node: string | Opaque<"node">, locale_id: string | undefined, adjust_type: string | undefined): void;
		on_language_change(): void;
		/**
		 * Setup raw text to lang_text component. This will clear any locale settings.
		 */
		set_to(text: string): druid_lang_text;
		/**
		 * Setup raw text to lang_text component. This will clear any locale settings.
		 */
		set_text(text: string): druid_lang_text;
		/**
		 * Translate the text by locale_id. The text will be automatically updated when locale changes.
		 */
		translate(locale_id: string, ...args: string[]): druid_lang_text;
		/**
		 * Format string with new text params on localized text. Keeps the current locale but updates the format parameters.
		 */
		format(...args: string[]): druid_lang_text;
	}
	interface event_on_size_changed {
		subscribe: (_: unknown, callback: (new_size: Vector3) => void, context: unknown | undefined) => void;
	}
	interface druid_layout_row_data {
		width: number;
		height: number;
		count: number;
	}
	interface druid_layout_rows_data {
		total_width: number;
		total_height: number;
		nodes_width: LuaTable<Opaque<"node">, number>;
		nodes_height: LuaTable<Opaque<"node">, number>;
		rows: unknown;
	}
	/**
	 * Druid component to manage the layout of nodes, placing them inside the node size with respect to the size and pivot of each node.
	 *
	 * ### Setup
	 * Create layout component with druid: `layout = druid:new_layout(node, layout_type)`
	 *
	 * ### Notes
	 * - Layout can be horizontal, vertical or horizontal with wrapping
	 * - Layout can resize parent node to fit content
	 * - Layout can justify content
	 * - Layout supports margins and padding
	 * - Layout automatically updates when nodes are added or removed
	 * - Layout can be manually updated by calling set_dirty()
	 */
	interface druid_layout {
		node: Opaque<"node">;
		rows_data: druid_layout_rows_data;
		is_dirty: boolean;
		entities: Opaque<"node">[];
		margin: { x: number; y: number };
		padding: Vector4;
		type: string;
		is_resize_width: boolean;
		is_resize_height: boolean;
		is_justify: boolean;
		on_size_changed: event_on_size_changed;
		init(node_or_node_id: Opaque<"node"> | string, layout_type: druid_layout_type): void;
		update(): void;
		on_layout_change(): void;
		get_entities(): Opaque<"node">[];
		get_entities_count(): number;
		set_node_index(node: Opaque<"node">, index: number): druid_layout;
		/**
		 * Set the margin of the layout
		 */
		set_margin(margin_x: number | undefined, margin_y: number | undefined): druid_layout;
		set_padding(padding_x: number | undefined, padding_y: number | undefined, padding_z: number | undefined, padding_w: number | undefined): druid_layout;
		set_dirty(): druid_layout;
		set_justify(is_justify: boolean): druid_layout;
		set_type(layout_type: druid_layout_type): druid_layout;
		set_hug_content(is_hug_width: boolean, is_hug_height: boolean): druid_layout;
		/**
		 * Add node to layout
		 */
		add(node_or_node_id: Opaque<"node"> | string): druid_layout;
		/**
		 * Remove node from layout
		 */
		remove(node_or_node_id: Opaque<"node"> | string): druid_layout;
		get_size(): Vector3;
		get_content_size(): unknown;
		refresh_layout(is_instant: boolean | undefined): druid_layout;
		clear_layout(): druid_layout;
		get_node_size(node: Opaque<"node">): LuaMultiReturn<[number, number]>;
		/**
		 * Calculate rows data for layout. Contains total width, height and rows info (width, height, count of elements in row)
		 */
		calculate_rows_data(): druid_layout_rows_data;
		set_node_position(node: Opaque<"node">, x: number, y: number): Opaque<"node">;
		/**
		 * Set custom position function for layout nodes. It will call on update poses on layout elements. Default: gui.set_position
		 */
		set_position_function(callback: unknown): druid_layout;
	}
	interface druid_progress_style {
		SPEED: number | undefined;
		MIN_DELTA: number | undefined;
	}
	/**
	 * Basic Druid progress bar component. Changes the size or scale of a node to represent progress.
	 *
	 * ### Setup
	 * Create progress bar component with druid: `progress = druid:new_progress(node_name, key, init_value)`
	 *
	 * ### Notes
	 * - Node should have maximum node size in GUI scene, it represents the progress bar's maximum size
	 * - Key is value from druid const: "x" or "y"
	 * - Progress works correctly with 9slice nodes, it tries to set size by _set_size_ first until minimum size is reached, then it continues sizing via _set_scale_
	 * - Progress bar can fill only by vertical or horizontal size. For diagonal progress bar, just rotate the node in GUI scene
	 * - If you have glitchy or dark texture bugs with progress bar, try to disable mipmaps in your texture profiles
	 */
	interface druid_progress {
		node: Opaque<"node">;
		on_change: unknown;
		style: druid_progress_style;
		key: string;
		prop: Hash;
		init(node: string | Opaque<"node">, key: string, init_value: number | undefined): void;
		on_style_change(style: druid_progress_style): void;
		on_layout_change(): void;
		on_remove(): void;
		update(dt: number): void;
		/**
		 * Fill the progress bar
		 */
		fill(): druid_progress;
		/**
		 * Empty the progress bar
		 */
		empty(): druid_progress;
		/**
		 * Instant fill progress bar to value
		 */
		set_to(to: number): druid_progress;
		/**
		 * Return the current value of the progress bar
		 */
		get(): number;
		/**
		 * Set points on progress bar to fire the callback
		 */
		set_steps(steps: number[], callback: unknown): druid_progress;
		/**
		 * Start animation of a progress bar
		 */
		to(to: number, callback: unknown | undefined): druid_progress;
		/**
		 * Set progress bar max node size
		 */
		set_max_size(max_size: Vector3): druid_progress;
		_check_steps(from: number, to: number, exactly: number | undefined): void;
		_set_bar_to(set_to: number): void;
	}
	/**
	 * Basic Druid slider component. Creates a draggable node over a line with progress reporting.
	 *
	 * ### Setup
	 * Create slider component with druid: `slider = druid:new_slider(node_name, end_pos, callback)`
	 *
	 * ### Notes
	 * - Pin node should be placed in initial position at zero progress
	 * - It will be available to move Pin node between start pos and end pos
	 * - You can setup points of interests on slider via `slider:set_steps`. If steps exist, slider values will be only from these steps (notched slider)
	 * - Start pos and end pos should be on vertical or horizontal line (their x or y value should be equal)
	 * - To catch input across all slider, you can setup input node via `slider:set_input_node`
	 */
	interface druid_slider {
		node: Opaque<"node">;
		on_change_value: unknown;
		style: LuaTable;
		start_pos: Vector3;
		pos: Vector3;
		target_pos: Vector3;
		end_pos: Vector3;
		dist: Vector3;
		is_drag: boolean;
		value: number;
		steps: number[] | undefined;
		/**
		 * The Slider constructor
		 */
		init(node: Opaque<"node">, end_pos: Vector3, callback: unknown | undefined): void;
		on_layout_change(): void;
		on_remove(): void;
		on_style_change(style: LuaTable): void;
		on_window_resized(): void;
		on_input(action_id: Hash, action: LuaTable): boolean;
		/**
		 * Set value for slider
		 */
		set(value: number, is_silent: boolean | undefined): druid_slider;
		/**
		 * Set slider steps. Pin node will
		 * apply closest step position
		 */
		set_steps(steps: number[]): druid_slider;
		/**
		 * Adjust the end position of the slider
		 */
		set_end_pos(end_pos: Vector3): druid_slider;
		/**
		 * Set input zone for slider.
		 * User can touch any place of node, pin instantly will
		 * move at this position and node drag will start.
		 * This function require the Defold version 1.3.0+
		 */
		set_input_node(input_node: Opaque<"node"> | string | undefined): druid_slider;
		/**
		 * Set Slider input enabled or disabled
		 */
		set_enabled(is_enabled: boolean): druid_slider;
		/**
		 * Check if Slider component is enabled
		 */
		is_enabled(): boolean;
		_on_change_value(): void;
		_set_position(): void;
	}
	interface druid_swipe_style {
		SWIPE_TIME: number | undefined;
		SWIPE_THRESHOLD: number | undefined;
		SWIPE_TRIGGER_ON_MOVE: boolean | undefined;
	}
	/**
	 * The component to manage swipe events over a node
	 */
	interface druid_swipe {
		node: Opaque<"node">;
		on_swipe: unknown;
		style: druid_swipe_style;
		click_zone: Opaque<"node">;
		_trigger_on_move: boolean;
		_swipe_start_time: number;
		_start_pos: Vector3;
		_is_enabled: boolean;
		_is_mobile: boolean;
		init(node_or_node_id: Opaque<"node"> | string, on_swipe_callback: unknown): void;
		on_late_init(): void;
		on_style_change(style: druid_swipe_style): void;
		on_input(action_id: Hash, action: action): boolean;
		on_input_interrupt(): void;
		/**
		 * Set the click zone for the swipe, useful for restricting events outside stencil node
		 */
		set_click_zone(zone: Opaque<"node"> | string | undefined): void;
		/**
		 * Start swipe event
		 */
		_start_swipe(action: action): void;
		/**
		 * Reset swipe event
		 */
		_reset_swipe(): void;
		/**
		 * Check swipe event
		 */
		_check_swipe(self: druid_swipe, action: action): void;
	}
	/**
	 * Druid component to handle timer work on gui text node. Displays time in a formatted way.
	 *
	 * ### Setup
	 * Create timer component with druid: `timer = druid:new_timer(text_node, from_seconds, to_seconds, callback)`
	 *
	 * ### Notes
	 * - Timer fires callback when timer value equals to _to_seconds_
	 * - Timer will set text node with current timer value
	 * - Timer uses update function to handle time
	 */
	interface druid_timer {
		on_tick: unknown;
		on_set_enabled: unknown;
		on_timer_end: unknown;
		node: Opaque<"node">;
		from: number;
		target: number;
		value: number;
		is_on: boolean | undefined;
		init(node: Opaque<"node">, seconds_from: number | undefined, seconds_to: number | undefined, callback: unknown | undefined): void;
		update(): void;
		on_layout_change(): void;
		/**
		 * Set the timer to a specific value
		 */
		set_to(set_to: number): druid_timer;
		/**
		 * Set the timer to a specific value
		 */
		set_state(is_on: boolean | undefined): druid_timer;
		/**
		 * Set the timer interval
		 */
		set_interval(from: number, to: number): druid_timer;
		_second_string_min(sec: number): string;
	}
	/**
	 * The helper module contains various functions that are used in the Druid library.
	 * You can use these functions in your projects as well.
	 */
	interface druid_helper {
	}
	interface druid_system_animation_data {
		frames: LuaTable<number, LuaTable<string, number>>;
		width: number;
		height: number;
		fps: number;
		current_frame: number;
		node: Opaque<"node">;
		v: Vector4;
	}
	interface druid_widget {
		druid: druid_instance;
	}
	interface druid_logger {
		trace: (message: string, context: unknown) => void;
		debug: (message: string, context: unknown) => void;
		info: (message: string, context: unknown) => void;
		warn: (message: string, context: unknown) => void;
		error: (message: string, context: unknown) => void;
		trace: (_: unknown, msg: string, data: unknown) => void;
		debug: (_: unknown, msg: string, data: unknown) => void;
		info: (_: unknown, msg: string, data: unknown) => void;
		warn: (_: unknown, msg: string, data: unknown) => void;
		error: (_: unknown, msg: string, data: unknown) => void;
	}
	interface GUITextMetrics {
		width: number;
		height: number;
		max_ascent: number;
		max_descent: number;
		offset_x: number;
		offset_y: number;
	}
	interface utf8 {
		len: (s: string) => number;
		sub: (s: string, start_index: number, length: number) => void;
		reverse: () => void;
		char: () => void;
		unicode: () => void;
		gensub: () => void;
		byte: () => void;
		find: () => void;
		match: (s: string, m: string) => void;
		gmatch: (s: string, m: string) => void;
		gsub: () => void;
		dump: () => void;
		format: () => void;
		lower: () => void;
		upper: () => void;
		rep: () => void;
	}
	interface action {
		value: number;
		pressed: boolean;
		released: boolean;
		repeated: boolean;
		x: number;
		y: number;
		screen_x: number;
		screen_y: number;
		dx: number;
		dy: number;
		screen_dx: number;
		screen_dy: number;
		gamepad: number;
		touch: touch[];
		text: string;
	}
	interface touch {
		id: number;
		pressed: boolean;
		released: boolean;
		tap_count: number;
		x: number;
		y: number;
		dx: number;
		dy: number;
		acc_x: number | undefined;
		acc_y: number | undefined;
		acc_z: number | undefined;
	}
	/**
	 * The Druid Factory used to create components
	 */
	interface druid_instance {
		input_inited: boolean;
		components_all: druid_component[];
		components_interest: LuaTable<string, druid_component[]>;
		_context: LuaTable;
		_style: LuaTable;
		_late_init_timer_id: number;
		_late_remove: druid_component[];
		_is_late_remove_enabled: boolean;
		_input_blacklist: druid_component[] | undefined;
		_input_whitelist: druid_component[] | undefined;
		/**
		 * Check whitelists and blacklists for input components
		 */
		_can_use_input_component(component: druid_component): boolean;
		/**
		 * Create new Druid component instance
		 */
		"new"(component: unknown, ...args: unknown[]): unknown;
		/**
		 * Call this in gui_script final function.
		 */
		final(): void;
		/**
		 * Remove created component from Druid instance.
		 *
		 * Component `on_remove` function will be invoked, if exist.
		 */
		remove(component: unknown): boolean;
		/**
		 * Get a context of Druid instance (usually a self of gui script)
		 */
		get_context(): unknown;
		/**
		 * Get a style of Druid instance
		 */
		get_style(): LuaTable;
		/**
		 * Druid late update function called after initialization and before the regular update step.
		 * This function is used to check the GUI state and perform actions after all components and nodes have been created.
		 * An example use case is performing an auto stencil check in the GUI hierarchy for input components.
		 */
		late_init(): void;
		/**
		 * Call this in gui_script update function.
		 */
		update(dt: number): void;
		/**
		 * Call this in gui_script on_input function.
		 */
		on_input(action_id: Hash, action: LuaTable): boolean;
		/**
		 * Call this in gui_script on_message function.
		 */
		on_message(message_id: Hash, message: LuaTable, sender: Url): void;
		/**
		 * Called when the window event occurs
		 */
		on_window_event(window_event: number): void;
		/**
		 * Calls the on_language_change function in all related components
		 * This one called by global druid.on_language_change, but can be called manually to update all translations
		 */
		on_language_change(): void;
		/**
		 * Set whitelist components for input processing.
		 * If whitelist is not empty and component not contains in this list,
		 * component will be not processed on the input step
		 */
		set_whitelist(whitelist_components: LuaTable | druid_component[]): druid_instance;
		/**
		 * Set blacklist components for input processing.
		 * If blacklist is not empty and component is contained in this list,
		 * component will be not processed on the input step DruidInstance
		 */
		set_blacklist(blacklist_components: LuaTable | druid_component[]): druid_instance;
		/**
		 * Remove all components on late remove step DruidInstance
		 */
		_clear_late_remove(): void;
		/**
		 * Create new Druid widget instance
		 */
		new_widget(widget: unknown, template: string | undefined, nodes: LuaTable<Hash, Opaque<"node">> | Opaque<"node"> | string | undefined, ...args: unknown[]): unknown;
		/**
		 * Create Button component
		 */
		new_button(node: string | Opaque<"node">, callback: unknown | unknown | undefined, params: unknown | undefined, anim_node: Opaque<"node"> | string | undefined): druid_button;
		/**
		 * Create Blocker component
		 */
		new_blocker(node: string | Opaque<"node">): druid_blocker;
		/**
		 * Create BackHandler component
		 */
		new_back_handler(callback: unknown | unknown | undefined, params: unknown | undefined): druid_back_handler;
		/**
		 * Create Hover component
		 */
		new_hover(node: string | Opaque<"node">, on_hover_callback: unknown | undefined, on_mouse_hover_callback: unknown | undefined): druid_hover;
		/**
		 * Create Text component
		 */
		new_text(node: string | Opaque<"node"> | druid_text, value: string | undefined, adjust_type: string | undefined): druid_text;
		/**
		 * Create Grid component
		 */
		new_grid(parent_node: string | Opaque<"node">, item: string | Opaque<"node">, in_row: number | undefined): druid_grid;
		/**
		 * Create Scroll component
		 */
		new_scroll(view_node: string | Opaque<"node">, content_node: string | Opaque<"node">): druid_scroll;
		/**
		 * Create Drag component
		 */
		new_drag(node: string | Opaque<"node">, on_drag_callback: unknown | undefined): druid_drag;
		/**
		 * Create Swipe component
		 */
		new_swipe(node: string | Opaque<"node">, on_swipe_callback: unknown | undefined): druid_swipe;
		/**
		 * Create LangText component
		 */
		new_lang_text(node: string | Opaque<"node">, locale_id: string | undefined, adjust_type: string | undefined): druid_lang_text;
		/**
		 * Create Slider component
		 */
		new_slider(pin_node: string | Opaque<"node">, end_pos: Vector3, callback: unknown | undefined): druid_slider;
		/**
		 * Create Input component
		 */
		new_input(click_node: string | Opaque<"node">, text_node: string | Opaque<"node"> | druid_text, keyboard_type: number | undefined): druid_input;
		/**
		 * Create DataList component
		 */
		new_data_list(druid_scroll: druid_scroll, druid_grid: druid_grid, create_function: unknown): druid_data_list;
		/**
		 * Create Timer component
		 */
		new_timer(node: string | Opaque<"node">, seconds_from: number | undefined, seconds_to: number | undefined, callback: unknown | undefined): druid_timer;
		/**
		 * Create Progress component
		 */
		new_progress(node: string | Opaque<"node">, key: string, init_value: number | undefined): druid_progress;
		/**
		 * Create Layout component
		 */
		new_layout(node: string | Opaque<"node">, mode: string | undefined): druid_layout;
		/**
		 * Create Container component
		 */
		new_container(node: string | Opaque<"node">, mode: druid_container_mode | undefined, callback: ((self: druid_container, size: Vector3) => void) | undefined): druid_container;
		/**
		 * Create Hotkey component
		 */
		new_hotkey(keys_array: string | string[], callback: unknown | unknown | undefined, callback_argument: unknown | undefined): druid_hotkey;
		/**
		 * Create RichText component.
		 */
		new_rich_text(text_node: string | Opaque<"node">, value: string | undefined): druid_rich_text;
		/**
		 * Create RichInput component.
		 * As a template please check rich_input.gui layout.
		 */
		new_rich_input(template: string, nodes: LuaTable | undefined): druid_rich_input;
	}
	interface druid_system_settings {
	}
	export function _apply_cursor_stack(this: void): void;
	/**
	 * Get color by ID from palette, hex string, or return vector as-is.
	 * If color_id is not found in palette and not a hex string, returns white.
	 */
	export function get_color(this: void, color_id: string | Vector4 | Vector3): Vector4;
	/**
	 * Add colors to palette. Colors can be hex strings or vector4 values.
	 */
	export function add_palette(this: void, palette_data: LuaTable<string, Vector4 | string>): void;
	/**
	 * Get all palette colors.
	 */
	export function get_palette(this: void): LuaTable<string, Vector4>;
	/**
	 * Set GUI node color. Does not change alpha.
	 */
	export function set_color(this: void, gui_node: Opaque<"node">, color: Vector4 | Vector3 | string): void;
	/**
	 * Interpolate between two colors using HSB space (better visual results than RGB).
	 */
	export function lerp(this: void, t: number, color1: Vector4, color2: Vector4): Vector4;
	/**
	 * Convert hex string to RGB values (0-1 range). Supports #RGB and #RRGGBB formats.
	 */
	export function hex2rgb(this: void, hex: string): unknown;
	/**
	 * Convert hex string to vector4.
	 */
	export function hex2vector4(this: void, hex: string, alpha: number | undefined): Vector4;
	/**
	 * Convert RGB to HSB.
	 */
	export function rgb2hsb(this: void, r: number, g: number, b: number, alpha: number | undefined): unknown;
	/**
	 * Convert HSB to RGB.
	 */
	export function hsb2rgb(this: void, h: number, s: number, v: number, alpha: number | undefined): unknown;
	/**
	 * Convert RGB to hex string (uppercase, without #).
	 */
	export function rgb2hex(this: void, red: number, green: number, blue: number): string;
	export function create_uid(this: void): void;
	/**
	 * Сreate a new component class, which will inherit from the base Druid component.
	 */
	export function create(this: void, name: string | undefined, input_priority: number | undefined): druid_component;
	/**
	 * Create the Druid component instance
	 */
	export function create_widget(this: void, self: druid_instance, widget_class: druid_widget, context: LuaTable): druid_widget;
	export function animate_cursor(this: void): void;
	export function set_selection_width(this: void): void;
	export function update_text(this: void, self: druid_rich_input): void;
	export function on_select(this: void): void;
	export function on_unselect(this: void): void;
	/**
	 * Update selection
	 */
	export function update_selection(this: void): void;
	export function get_index_by_touch(this: void): void;
	export function on_touch_start_callback(this: void): void;
	export function on_drag_callback(this: void, self: druid_rich_input, dx: number, dy: number, x: number, y: number, touch: LuaTable): void;
	export function ltrim(this: void): void;
	export function compare_words(this: void): void;
	/**
	 * Get the length of a text ignoring any tags except image tags
	 * which are treated as having a length of 1
	 */
	export function length(this: void, text: string | LuaTable<string, unknown>): number;
	export function get_text_metrics(this: void, word: druid_rich_text_word, previous_word: druid_rich_text_word | undefined, settings: druid_rich_text_settings): druid_rich_text_metrics;
	export function get_image_metrics(this: void, word: druid_rich_text_word, settings: druid_rich_text_settings): druid_rich_text_metrics;
	export function measure_node(this: void, word: druid_rich_text_word, settings: druid_rich_text_settings, previous_word: druid_rich_text_word | undefined): druid_rich_text_metrics;
	export function create(this: void, text: string, settings: LuaTable, style: druid_rich_text_style): LuaMultiReturn<[druid_rich_text_word[], druid_rich_text_settings, druid_rich_text_lines_metrics]>;
	export function _fill_properties(this: void, word: druid_rich_text_word, metrics: druid_rich_text_metrics, settings: druid_rich_text_settings): void;
	export function _split_on_lines(this: void, words: druid_rich_text_word[], settings: druid_rich_text_settings): druid_rich_text_word[][];
	export function _position_lines(this: void, lines: druid_rich_text_word[][], settings: druid_rich_text_settings): druid_rich_text_lines_metrics;
	export function _get_lines_metrics(this: void, lines: druid_rich_text_word[][], settings: druid_rich_text_settings): druid_rich_text_lines_metrics;
	export function _update_nodes(this: void, lines: druid_rich_text_word[][], settings: druid_rich_text_settings): void;
	export function set_text_scale(this: void, words: druid_rich_text_word[], settings: druid_rich_text_settings, scale: number): druid_rich_text_lines_metrics;
	export function adjust_to_area(this: void, words: druid_rich_text_word[], settings: druid_rich_text_settings, lines_metrics: druid_rich_text_lines_metrics, style: druid_rich_text_style): void;
	export function apply_scale_without_update(this: void): druid_rich_text_word[][];
	export function is_fit_info_area(this: void, lines: druid_rich_text_word[][], settings: druid_rich_text_settings): void;
	/**
	 * Get all words with a specific tag
	 */
	export function tagged(this: void, words: druid_rich_text_word[], tag: string | undefined): druid_rich_text_word[];
	/**
	 * Removes the gui nodes created by rich text
	 */
	export function remove(this: void): void;
	export function parse_hex(this: void): void;
	export function parse_decimal(this: void): void;
	export function parse(this: void): void;
	export function parse_tag(this: void): void;
	export function add_word(this: void): void;
	export function split_line(this: void): void;
	export function split_text(this: void): void;
	export function merge_tags(this: void): void;
	/**
	 * Parse the text into individual words
	 */
	export function parse(this: void, text: string, default_settings: LuaTable<string, unknown>, style: LuaTable<string, unknown>): LuaTable<string, unknown>;
	/**
	 * Get the length of a text, excluding any tags (except image and spine tags)
	 */
	export function length(this: void, text: string): number;
	export function apply(this: void): void;
	export function register(this: void): void;
	/**
	 * Split string at first occurrence of token
	 */
	export function split(this: void, s: string | undefined, token: string): LuaMultiReturn<[string | undefined, string | undefined]>;
	/**
	 * Create a new Druid instance for creating GUI components.
	 */
	export function new_(this: void, context: LuaTable, style: LuaTable | undefined): druid_instance;
	export { new_ as new };
	/**
	 * Register a new external Druid component.
	 * Register component just makes the druid:new_{name} function.
	 * For example, if you register a component called "my_component", you can create it using druid:new_my_component(...).
	 * This can be useful if you have your own "basic" components that you don't want to require in every file.
	 * The default way to create component is `druid_instance:new(component_class, ...)`.
	 */
	export function register(this: void, name: string, module: LuaTable): void;
	/**
	 * Set the default style for all Druid instances.
	 */
	export function set_default_style(this: void, style: LuaTable): void;
	/**
	 * Set the text function for the LangText component.
	 */
	export function set_text_function(this: void, callback: (text_id: string) => void): void;
	/**
	 * Set the sound function to able components to play sounds.
	 */
	export function set_sound_function(this: void, callback: (sound_id: string) => void): void;
	/**
	 * Subscribe Druid to the window listener. It will override your previous
	 * window listener, so if you have one, you should call M.on_window_callback manually.
	 */
	export function init_window_listener(this: void): void;
	/**
	 * Set the window callback to enable Druid window events.
	 */
	export function on_window_callback(this: void, window_event: Opaque<"constant">): void;
	/**
	 * Call this function when the game language changes.
	 * It will notify all Druid instances to update the lang text components.
	 */
	export function on_language_change(this: void): void;
	/**
	 * Set a widget to the current game object. The game object can acquire the widget by calling `bindings.get_widget`
	 * It wraps with events only top level functions cross-context, so you will have no access to nested widgets functions
	 */
	export function wrap_widget(this: void, widget: druid_widget): druid_widget;
	/**
	 * Create a widget from the bound Druid GUI instance.
	 * The widget will be created and all widget functions can be called from Game Object contexts.
	 * This allows using only `druid_widget.gui_script` for GUI files and call this widget functions from Game Object script file.
	 * Widget class here is your lua file for the GUI scene (widgets in Druid)
	 * msg.url(nil, nil, "gui_widget") -- current game object
	 * msg.url(nil, object_url, "gui_widget") -- other game object
	 */
	export function get_widget(this: void, widget_class: unknown, gui_url: Url | string, params: unknown | undefined): unknown;
	/**
	 * Bind a Druid GUI instance to the current game object.
	 * This instance now can produce widgets from `druid.get_widget()` function.
	 * Only one widget can be set per game object.
	 */
	export function register_druid_as_widget(this: void, druid: druid_instance): void;
	/**
	 * Should be called on final, where druid instance is destroyed.
	 */
	export function unregister_druid_as_widget(this: void): void;
	export function set_logger(this: void, logger_instance: druid_logger | LuaTable | undefined): void;
	export function get_logger(this: void, name: string | undefined, level: string | undefined): druid_logger;
	/**
	 * Create a backup of a file
	 */
	export function create_backup(this: void, file_path: string): string | undefined;
	/**
	 * Restore from a backup file
	 */
	export function restore_from_backup(this: void, backup_path: string, original_path: string): boolean;
	/**
	 * Remove a backup file
	 */
	export function remove_backup(this: void, backup_path: string): void;
	/**
	 * Assign layers to GUI nodes based on textures and fonts
	 */
	export function assign_layers(this: void, gui_resource: string): LuaTable;
	export function create_druid_collection(this: void): void;
	export function to_camel_case(this: void): void;
	export function create_druid_gui_script(this: void): void;
	export function to_camel_case(this: void): void;
	export function create_druid_widget(this: void): void;
	/**
	 * Decode a Defold object from a string
	 */
	export function decode_defold_object(this: void, text: string): LuaTable;
	export function encode_defold_object(this: void): void;
	/**
	 * Load lua table from file in Defold Text Proto format
	 */
	export function load_from_file(this: void, file_path: string): LuaTable | unknown;
	/**
	 * Write lua table to file in Defold Text Proto format
	 * The path file extension will be used to determine the Defold format (*.atlas, *.gui, *.font, etc)
	 */
	export function save_to_file(this: void, file_path: string, lua_table: LuaTable): unknown;
	export function unescape_text_field(this: void, value: string): string;
	export function is_multiline_value(this: void): void;
	export function decode_value(this: void, value: unknown, property_name: string | undefined): unknown;
	export function new_inner_struct(this: void, parent_object: LuaTable, name: string, stack: LuaTable): void;
	/**
	 * Apply value to the object, if the value is already present, convert it to an array
	 */
	export function apply_value(this: void, object: LuaTable, name: string, value: unknown): LuaTable;
	export function apply_multiline_value(this: void, object: LuaTable, value: string): LuaTable;
	/**
	 * Check if table is array
	 */
	export function is_array(this: void, t: LuaTable): boolean;
	/**
	 * Check if table-array contains element
	 */
	export function contains(this: void, table: LuaTable, element: unknown): number | boolean;
	export function read_file(this: void, file_path: string): string | unknown;
	export function write_file(this: void, file_path: string, content: string): unknown;
	export function unescape_line(this: void, line: string): void;
	export function split_line(this: void, line: string): unknown;
	export function parse_line(this: void, unescaped_line: string, stack: LuaTable): boolean;
	export function open_settings(this: void): void;
	/**
	 * Read editor port from .internal/editor.port file
	 */
	export function get_editor_port(this: void): number | undefined;
	/**
	 * Call editor HTTP API command
	 */
	export function call_editor_command(this: void, command: string): boolean;
	/**
	 * Mask text by replacing every character with a mask character
	 */
	export function mask_text(this: void, text: string, mask: string): string;
	export function clear_and_select(this: void): void;
	export function get_text_width(this: void): void;
	export function get_icon_width(this: void): void;
	export function is_text_node(this: void): void;
	/**
	 * Text node or icon node can be nil
	 */
	export function get_width(this: void): void;
	/**
	 * Center two nodes.
	 * Nodes will be center around 0 x position
	 * text_node will be first (at left side)
	 */
	export function centrate_text_with_icon(this: void, text_node: Opaque<"node"> | undefined, icon_node: Opaque<"node"> | undefined, margin: number): number;
	/**
	 * Center two nodes.
	 * Nodes will be center around 0 x position
	 * icon_node will be first (at left side)
	 */
	export function centrate_icon_with_text(this: void, icon_node: Opaque<"node"> | undefined, text_node: Opaque<"node"> | undefined, margin: number | undefined): number;
	/**
	 * Centerate nodes by x position with margin.
	 *
	 * This functions calculate total width of nodes and set position for each node.
	 * The centrate will be around 0 x position.
	 */
	export function centrate_nodes(this: void, margin: number | undefined, ...args: Opaque<"node">[]): number;
	/**
	 * Get GUI node from string name, node itself, or template/nodes structure
	 */
	export function get_node(this: void, node_id: string | Opaque<"node">, template: string | undefined, nodes: LuaTable<Hash, Opaque<"node">> | undefined): Opaque<"node">;
	/**
	 * Get current screen stretch multiplier for each side
	 */
	export function get_screen_aspect_koef(this: void): LuaMultiReturn<[number, number]>;
	/**
	 * Get current GUI scale
	 */
	export function get_gui_scale(this: void): number;
	/**
	 * Move value from current to target value with step amount
	 */
	export function step(this: void, current: number, target: number, step: number): number;
	/**
	 * Clamp value between min and max. Works with nil values and swap min and max if needed.
	 */
	export function clamp(this: void, value: number, v1: number | undefined, v2: number | undefined): number;
	/**
	 * Calculate distance between two points
	 */
	export function distance(this: void, x1: number, y1: number, x2: number, y2: number): number;
	/**
	 * Return sign of value
	 */
	export function sign(this: void, val: number): number;
	/**
	 * Round number to specified decimal places
	 */
	export function round(this: void, num: number, num_decimal_places: number | undefined): number;
	/**
	 * Lerp between two values
	 */
	export function lerp(this: void, a: number, b: number, t: number): number;
	/**
	 * Check if value contains in array
	 */
	export function contains(this: void, array: unknown[], value: unknown): number | undefined;
	/**
	 * Make a copy table with all nested tables
	 */
	export function deepcopy(this: void, orig_table: LuaTable): LuaTable;
	/**
	 * Add all elements from source array to the target array
	 */
	export function add_array(this: void, target: unknown[], source: unknown[] | undefined): unknown[];
	/**
	 * Make a check with gui.pick_node, but with additional node_click_area check.
	 */
	export function pick_node(this: void, node: Opaque<"node">, x: number, y: number, node_click_area: Opaque<"node"> | undefined): void;
	/**
	 * Get size of node with scale multiplier
	 */
	export function get_scaled_size(this: void, node: Opaque<"node">): Vector3;
	/**
	 * Get cumulative parent's node scale
	 */
	export function get_scene_scale(this: void, node: Opaque<"node">, include_passed_node_scale: boolean | undefined): Vector3;
	/**
	 * Return closest non inverted clipping parent node for given node
	 */
	export function get_closest_stencil_node(this: void, node: Opaque<"node">): Opaque<"node"> | undefined;
	/**
	 * Get pivot offset for given pivot or node
	 * Offset shown in [-0.5 .. 0.5] range, where -0.5 is left or bottom, 0.5 is right or top.
	 */
	export function get_pivot_offset(this: void, pivot_or_node: number | Opaque<"node">): Vector3;
	/**
	 * Check if device is desktop
	 */
	export function is_desktop(this: void): boolean;
	/**
	 * Check if device is native mobile (Android or iOS)
	 */
	export function is_mobile(this: void): boolean;
	/**
	 * Check if device is HTML5
	 */
	export function is_web(this: void): boolean;
	/**
	 * Check if device is HTML5 mobile
	 */
	export function is_web_mobile(this: void): boolean;
	/**
	 * Check if device is mobile and can support multitouch
	 */
	export function is_multitouch_supported(this: void): boolean;
	/**
	 * Converts table to one-line string
	 */
	export function table_to_string(this: void, t: LuaTable, depth: number | undefined, result: string | undefined): unknown;
	/**
	 * Distance from node position to his borders
	 */
	export function get_border(this: void, node: Opaque<"node">, offset: Vector3 | undefined): Vector4;
	/**
	 * Get text metric from GUI node.
	 */
	export function get_text_metrics_from_node(this: void, text_node: Opaque<"node">): GUITextMetrics;
	/**
	 * Add value to array with shift policy
	 * Shift policy can be: left, right, no_shift
	 */
	export function insert_with_shift(this: void, array: LuaTable, item: unknown, index: number | undefined, shift_policy: number | undefined): unknown;
	/**
	 * Remove value from array with shift policy
	 */
	export function remove_with_shift(this: void, array: unknown[], index: number | undefined, shift_policy: number | undefined): unknown;
	/**
	 * Get full position of node in the GUI tree
	 */
	export function get_full_position(this: void, node: Opaque<"node">, root: Opaque<"node"> | undefined): void;
	/**
	 * Source: https://github.com/Dragosha/defold-sprite-repeat/blob/main/node_repeat/node_repeat.lua
	 * Thanks to Dragosha! ( ・ω・ ) <  Hey friend!
	 */
	export function get_animation_data_from_node(this: void, node: Opaque<"node">, atlas_path: string): druid_system_animation_data;
	export function set_input_state(this: void): void;
	export function sort_input_comparator(this: void, component_a: druid_component, component_b: druid_component): boolean;
	export function sort_input_stack(this: void, self: druid_instance): void;
	/**
	 * Get current component interests
	 */
	export function get_component_interests(this: void, instance: druid_component): LuaTable;
	export function register_interests(this: void, self: druid_instance, instance: druid_component): void;
	/**
	 * Before processing any input check if we need to update input stack
	 */
	export function check_sort_input_stack(this: void, self: druid_instance, components: LuaTable[]): void;
	export function schedule_late_init(this: void): void;
	/**
	 * Druid class constructor which used to create Druid components
	 */
	export function create_druid_instance(this: void, context: LuaTable, style: LuaTable | undefined): druid_instance;
	export function set_logger(this: void, logger: druid_logger | LuaTable | undefined): void;
	export function get_text(this: void, text_id: string, ...args: string[]): void;
	export function play_sound(this: void): void;
	export function utf8charbytes(this: void): void;
	export function utf8len(this: void): void;
	export function utf8sub(this: void): void;
	export function utf8replace(this: void): void;
	export function utf8upper(this: void): void;
	export function utf8lower(this: void): void;
	export function utf8reverse(this: void): void;
	export function utf8char(this: void): void;
	export function utf8unicode(this: void): void;
	export function utf8gensub(this: void): void;
	export function binsearch(this: void): void;
	export function classMatchGenerator(this: void): void;
	export function utf8subWithBytes(this: void): void;
	export function matcherGenerator(this: void): void;
	export function utf8find(this: void): void;
	export function utf8match(this: void): void;
	export function utf8gmatch(this: void): void;
	export function replace(this: void): void;
	export function utf8gsub(this: void): void;
}
