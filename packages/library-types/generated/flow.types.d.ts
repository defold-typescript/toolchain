/** @noResolution */
declare module 'flow.types' {
	type Flow_ColorValue = string;
	type Flow_LogLevel = "none" | "error" | "warn" | "info" | "debug";
	type Flow_ScreenRegistry = LuaTable<string, Flow_ScreenDef>;
	type Flow_DefRegistry = LuaTable<string, LuaTable>;
	interface Flow_Style {
		width?: number | string;
		height?: number | string;
		min_width?: number;
		min_height?: number;
		max_width?: number;
		max_height?: number;
		flex_direction?: "column" | "row";
		flex_grow?: number;
		flex_shrink?: number;
		flex_basis?: number | string;
		align_items?: "start" | "center" | "end" | "stretch";
		align_self?: "start" | "center" | "end" | "stretch" | "auto";
		justify_content?: "start" | "center" | "end" | "space-between" | "space-around" | "space-evenly";
		gap?: number;
		padding?: number | string;
		padding_left?: number | string;
		padding_right?: number | string;
		padding_top?: number | string;
		padding_bottom?: number | string;
		margin?: number | string;
		margin_left?: number | string;
		margin_right?: number | string;
		margin_top?: number | string;
		margin_bottom?: number | string;
		border?: number | string;
		border_left?: number | string;
		border_right?: number | string;
		border_top?: number | string;
		border_bottom?: number | string;
		position_left?: number | string;
		position_right?: number | string;
		position_top?: number | string;
		position_bottom?: number | string;
		position_type?: "static" | "relative" | "absolute";
		flex_wrap?: "no-wrap" | "wrap" | "wrap-reverse";
		overflow?: "visible" | "hidden" | "scroll";
		display?: "flex" | "none";
		aspect_ratio?: number;
		direction?: "inherit" | "ltr" | "rtl";
	}
	interface Flow_Element {
		key: string;
		type?: string;
		style?: Flow_Style;
		children?: Flow_Element[];
		layout?: Flow_LayoutRect;
		color?: Flow_ColorValue;
		scale?: number | { x?: number; y?: number; z?: number };
		text?: string;
		align?: "left" | "center" | "right";
		font?: string;
		line_break?: boolean;
		image?: string;
		texture?: string;
		scale_mode?: "stretch" | "fit";
		image_aspect?: number;
		border?: number | { left?: number; top?: number; right?: number; bottom?: number };
		pressed_color?: Flow_ColorValue;
		on_click?: (element: Flow_Element) => void;
		backdrop_color?: Flow_ColorValue;
		on_backdrop_click?: (element: Flow_Element) => void;
		_visible?: boolean;
		_is_overlay?: boolean;
		_alpha?: number;
		_offset_x?: number;
		_offset_y?: number;
		_offset_x_pixels?: number;
		_offset_y_pixels?: number;
		_pressed?: boolean;
		_hovered?: boolean;
		_open?: boolean;
		_anim_y?: number;
		_anim_velocity?: number;
		_on_anim_update?: (anim_y: number, velocity: number) => void;
		_sheet_height?: number;
		_scrollbar?: boolean;
		_bounce?: boolean;
		_momentum?: boolean;
		_virtual_height?: number;
		_virtual_width?: number;
		_scroll_y?: number;
		_scroll_x?: number;
		_momentum_active?: boolean;
		_bouncing?: boolean;
		_velocity?: number;
		_dragging_axis?: "x" | "y";
		_dragging?: boolean;
		_drag_start_y?: number;
		_drag_start_x?: number;
		_scroll_start_y?: number;
		_scroll_start_x?: number;
		_last_drag_y?: number;
		_last_drag_x?: number;
		_last_drag_time?: number;
		_cache_key?: string;
		_node_prefix?: string;
		_background_screen?: Flow_Element;
		_scroll_ancestor?: Flow_Element;
		_needs_redraw?: boolean;
		_scroll_changed?: boolean;
		_clips_children?: boolean;
		_clipping_visible?: boolean;
	}
	interface Flow_BoxProps extends Flow_Element {
	}
	interface Flow_TextProps extends Flow_Element {
		text: string;
		align?: "left" | "center" | "right";
		font?: string;
		scale?: number | { x?: number; y?: number; z?: number };
		line_break?: boolean;
	}
	interface Flow_ButtonProps extends Flow_Element {
		pressed_color?: Flow_ColorValue;
		on_click?: (element: Flow_Element) => void;
		image?: string;
		texture?: string;
		border?: number | { left?: number; top?: number; right?: number; bottom?: number };
	}
	interface Flow_ButtonImageProps extends Flow_ButtonProps {
		image: string;
	}
	interface Flow_IconProps extends Flow_Element {
		image: string;
		texture?: string;
		scale?: number | { x?: number; y?: number; z?: number };
		scale_mode?: "stretch" | "fit";
		image_aspect?: number;
	}
	interface Flow_ScrollProps extends Flow_Element {
		_scrollbar?: boolean;
		_bounce?: boolean;
		_momentum?: boolean;
		_virtual_height?: number;
		_virtual_width?: number;
		_scroll_y?: number;
		_scroll_x?: number;
	}
	interface Flow_PopupProps extends Flow_Element {
		backdrop_color?: Flow_ColorValue;
		on_backdrop_click?: (element: Flow_Element) => void;
	}
	interface Flow_BottomSheetProps extends Flow_Element {
		backdrop_color?: Flow_ColorValue;
		_open?: boolean;
		_anim_y?: number;
		_anim_velocity?: number;
		_on_anim_update?: (anim_y: number, velocity: number) => void;
		on_backdrop_click?: (element: Flow_Element) => void;
	}
	interface Flow_BottomSheetApi {
		dismiss: (result?: unknown) => boolean;
		invalidate: () => boolean;
	}
	interface Flow_BottomSheetSheetDef {
		view?: (params: LuaTable, api: Flow_BottomSheetApi) => Flow_Element;
		screens?: LuaTable<string, Flow_ScreenDef>;
		initial_screen?: string;
		initial_params?: LuaTable | ((params: LuaTable, api: Flow_BottomSheetApi) => LuaTable);
		backdrop_color?: Flow_ColorValue;
		dismiss_on_backdrop?: boolean;
		on_dismiss?: (params: LuaTable, result: unknown, api: Flow_BottomSheetApi) => void;
	}
	interface Flow_BottomSheetHostConfig {
		id: string;
		sheet: Flow_BottomSheetSheetDef;
		open_message_id?: Hash | string;
		close_message_id?: Hash | string;
		background_focus_url?: Url;
		render_order?: number;
		debug?: boolean;
		on_update?: (self: LuaTable, dt: number, api: Flow_BottomSheetApi) => boolean | undefined;
		on_message?: (self: LuaTable, message_id: Hash | string, message: LuaTable | undefined, sender: Url | undefined, api: Flow_BottomSheetApi) => boolean | undefined;
	}
	interface Flow_LayoutRect {
		x: number;
		y: number;
		w: number;
		h: number;
	}
	interface Flow_Logger {
		levels: LuaTable<string, number>;
		get_level: () => Flow_LogLevel;
		set_level: (level: Flow_LogLevel | number) => Flow_LogLevel;
		get_context_level: (context: string) => Flow_LogLevel | undefined;
		set_context_level: (context: string, level: Flow_LogLevel | number) => Flow_LogLevel;
		clear_context_level: (context: string) => boolean;
		none: (context?: string) => Flow_LogLevel;
		is_enabled: (level: Flow_LogLevel | number, context?: string) => boolean;
		set_sink: (fn?: (entry: LuaTable) => void) => boolean;
		debug: (context: string, ...args: unknown[]) => boolean;
		info: (context: string, ...args: unknown[]) => boolean;
		warn: (context: string, ...args: unknown[]) => boolean;
		error: (context: string, ...args: unknown[]) => boolean;
		_reset_for_tests: () => boolean;
	}
	interface Flow_TransitionMeta {
		action: string;
		type: "fade" | "slide_left" | "slide_right" | "none";
		duration: number;
		from_id?: string;
		to_id?: string;
	}
	interface Flow_ScreenDef {
		view?: (params: LuaTable, navigation: Flow_Navigation) => Flow_Element | undefined;
		url?: Url;
		focus_url?: Url;
		proxy_url?: Url;
		preload?: boolean;
		transition?: "fade" | "slide_left" | "slide_right" | "none";
		meta?: unknown;
		on_enter?: (params: LuaTable, navigation: Flow_Navigation) => void;
		on_exit?: (params: LuaTable, navigation: Flow_Navigation) => void;
		on_pause?: (params: LuaTable, navigation: Flow_Navigation) => void;
		on_resume?: (params: LuaTable, navigation: Flow_Navigation) => void;
	}
	interface Flow_RegisteredScreen extends Flow_ScreenDef {
		id: string;
		_source: Flow_ScreenDef;
	}
	interface Flow_PushOptions {
		transition?: "fade" | "slide_left" | "slide_right" | "none";
		duration?: number;
		on_result?: (result: unknown) => void;
		result_url?: Url;
		result_message_id?: Hash | string;
	}
	interface Flow_StackEntry {
		id: string;
		params: LuaTable;
		screen: Flow_RegisteredScreen;
		on_result?: (result: unknown) => void;
		result_url?: Url;
		result_message_id?: Hash | string;
	}
	interface Flow_ScreenScope {
		screen_id: string;
	}
	interface Flow_Navigation {
		register: (id: string, screen_def: Flow_ScreenDef) => Flow_RegisteredScreen;
		get_screen: (id: string) => Flow_RegisteredScreen | undefined;
		push: (id: string, params?: LuaMap<string, unknown> | Record<string, unknown>, options?: Flow_PushOptions) => Flow_StackEntry | undefined;
		pop: (result?: unknown, options?: Flow_PushOptions | string) => Flow_StackEntry | undefined;
		replace: (id: string, params?: LuaMap<string, unknown> | Record<string, unknown>, options?: Flow_PushOptions) => Flow_StackEntry | undefined;
		reset: (id: string, params?: LuaMap<string, unknown> | Record<string, unknown>, options?: Flow_PushOptions | string) => Flow_StackEntry | undefined;
		back: (result?: unknown, options?: Flow_PushOptions | string) => Flow_StackEntry | undefined;
		current: () => Flow_StackEntry | undefined;
		peek: (offset?: number) => Flow_StackEntry | undefined;
		stack_depth: () => number;
		invalidate: () => void;
		is_invalidated: () => boolean;
		clear_invalidation: () => void;
		is_busy: () => boolean;
		get_transition: () => Flow_TransitionMeta | undefined;
		begin_transition: (meta: Flow_TransitionMeta) => Flow_TransitionMeta;
		complete_transition: () => boolean;
		get_data: (key_or_opts?: string | Flow_ScreenScope, opts?: Flow_ScreenScope) => unknown;
		set_data: (key: string, value: unknown, opts?: Flow_ScreenScope) => unknown;
		get_scroll_offset: (key: string, opts?: Flow_ScreenScope) => number;
		on: (event: string, fn: (...args: any[]) => unknown) => (...args: any[]) => unknown;
		off: (event: string, fn: (...args: any[]) => unknown) => void;
		_reset_for_tests: () => boolean;
		_router: () => LuaTable;
	}
	interface Flow_MountOptions {
		debug?: boolean;
	}
	interface Flow_InitConfig {
		screens?: LuaMap<string, Flow_ScreenDef> | Record<string, Flow_ScreenDef>;
		initial_screen?: string;
		initial_params?: LuaMap<string, unknown> | Record<string, unknown>;
		debug?: boolean;
		on_update?: (self: LuaTable, dt: number, nav: Flow_Navigation) => boolean;
		on_message?: (self: LuaTable, message_id: Hash | string, message: LuaTable | undefined, sender: Url | undefined, nav: Flow_Navigation) => boolean;
	}
	interface Flow_RuntimeConfig {
		screens?: LuaMap<string, Flow_ScreenDef> | Record<string, Flow_ScreenDef>;
		initial_screen?: string;
		initial_params?: LuaMap<string, unknown> | Record<string, unknown>;
		initial_options?: Flow_PushOptions | string;
		enable_proxy_runtime?: boolean;
		proxy_options?: Flow_ProxyAttachOptions;
	}
	interface Flow_ProxyAttachOptions {
		preload_message_id?: Hash | string;
		enable_message_id?: Hash | string;
		disable_message_id?: Hash | string;
		sync_existing?: boolean;
	}
	interface Flow_MarkdownOptions {
		text?: string;
		key?: string;
		style?: Flow_Style;
		font?: string;
		scale?: number | { x?: number; y?: number; z?: number };
		_scrollbar?: boolean;
		_bounce?: boolean;
		_momentum?: boolean;
		auto_wrap?: boolean;
		wrap_width?: number;
		flatten_formatting?: boolean;
	}
	interface Flow_FlexNodeOptions {
		key?: string;
		type?: string;
		color?: Flow_ColorValue;
		style?: Flow_Style;
		children?: Flow_Element[];
	}
	interface Flow_FlexNode extends Flow_Element {
		style: Flow_Style;
		children: Flow_FlexNode[];
		measure?: (...args: any[]) => unknown;
	}
	interface Flow_InputDeps {
		registry: Flow_DefRegistry;
		get_window_size: (...args: any[]) => unknown;
		get_gui_size: (...args: any[]) => unknown;
		is_debug_enabled: (self: LuaTable) => boolean;
	}
	interface Flow_AnimationDeps {
		registry: Flow_DefRegistry;
		request_redraw: (self: LuaTable) => void;
	}
	interface Flow_RendererDeps {
		registry: Flow_DefRegistry;
		get_window_size: (...args: any[]) => unknown;
		get_gui_size: (...args: any[]) => unknown;
		layout: LuaTable;
		set_node_color: (node: Opaque<"node">, r: number, g: number, b: number, a: number) => void;
		set_node_position: (node: Opaque<"node">, x: number, y: number) => void;
		set_node_size: (node: Opaque<"node">, w: number, h: number) => void;
	}
}
