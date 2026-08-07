/** @noResolution */
declare module 'panthera.panthera' {
	interface panthera_animation {
		adapter: panthera_adapter;
		speed: number;
		current_time: number;
		nodes: LuaTable;
		childs?: panthera_animation[] | undefined;
		get_node: (node_id: string) => Opaque<"node">;
		animation_id?: string | undefined;
		previous_animation_id?: string | undefined;
		animation_path: string;
		animation_keys_index: number;
		events?: LuaTable | undefined;
		timer_id?: number | undefined;
	}
	interface panthera_options {
		is_loop?: boolean | undefined;
		is_skip_init?: boolean | undefined;
		is_detached?: boolean | undefined;
		speed?: number | undefined;
		easing?: string | Opaque<"constant"> | undefined;
		callback?: ((animation_id: string) => undefined) | undefined;
		callback_event?: ((event_id: string, node: Opaque<"node"> | undefined, string_value: string, number_value: number) => undefined) | undefined;
	}
	interface panthera_options_tweener {
		speed?: number | undefined;
		is_loop?: boolean | undefined;
		easing?: string | Opaque<"constant"> | undefined;
		callback?: ((animation_id: string) => undefined) | undefined;
		callback_event?: ((event_id: string, node: Opaque<"node"> | undefined, string_value: string, number_value: number) => undefined) | undefined;
		is_reverse?: boolean | undefined;
		from?: number | undefined;
		to?: number | undefined;
	}
	interface panthera {
		SPEED: number;
	}
	interface panthera_adapter {
		get_node: (node_id: string) => Opaque<"node">;
		get_easing: (easing_id: string) => Hash;
		tween_animation_key: (node: Opaque<"node">, property_id: string, easing: Hash | number[], duration: number, end_value: number) => undefined;
		trigger_animation_key: (node: Opaque<"node">, property_id: string, value: unknown) => undefined;
		event_animation_key: (node: Opaque<"node">, key: panthera_animation_data_animation_key) => undefined;
		set_node_property: (node: Opaque<"node">, property_id: string, value: number | string) => boolean;
		stop_tween: (node: Opaque<"node">, property_id: string) => undefined;
		is_node_valid: (node: Opaque<"node">) => boolean;
	}
	interface panthera_logger {
		trace: (logger: panthera_logger, message: string, data: unknown | undefined) => void;
		debug: (logger: panthera_logger, message: string, data: unknown | undefined) => void;
		info: (logger: panthera_logger, message: string, data: unknown | undefined) => void;
		warn: (logger: panthera_logger, message: string, data: unknown | undefined) => void;
		error: (logger: panthera_logger, message: string, data: unknown | undefined) => void;
	}
	interface panthera_animation_data_node {
	}
	interface panthera_animation_data_metadata {
		gui_path: string;
		fps: number;
		settings: LuaTable;
		gizmo_steps: LuaTable;
		template_animation_paths: LuaTable<string, string>;
	}
	interface panthera_animation_data_animation {
		duration: number;
		animation_id: string;
		initial_state: string;
		animation_keys: panthera_animation_data_animation_key[];
	}
	interface panthera_animation_data {
		name: string;
		nodes: panthera_animation_data_node[];
		animations: panthera_animation_data_animation[];
		metadata: panthera_animation_data_metadata;
		group_animation_keys: LuaTable<string, LuaTable<string, LuaTable<string, panthera_animation_data_animation_key[]>>>;
		animations_dict: LuaTable<string, panthera_animation_data_animation>;
	}
	interface panthera_animation_project_file {
		data: panthera_animation_data;
		format: string;
		version: string;
		type: string;
	}
	interface panthera_animation_data_animation_key {
		key_type: number;
		node_id: string;
		property_id: string;
		start_time: number;
		duration: number;
		start_value: number;
		end_value: number;
		easing: string;
		easing_custom?: number[] | Vector | undefined;
		start_data: string;
		data: string;
		event_id: string;
		is_editor_only: boolean;
	}
	/**
	 * Customize the logging mechanism used by Panthera Runtime. You can use Defold Log library or provide a custom logger.
	 */
	export function set_logger(this: void, logger_instance?: panthera_logger | LuaTable | undefined): void;
	/**
	 * Load and create a game object animation state from a Lua table or JSON file.
	 */
	export function create_go(this: void, animation_or_path: string | LuaTable, collection_name?: string | undefined, objects?: LuaTable<string | Hash, string | Hash> | undefined): panthera_animation;
	/**
	 * Load and create a GUI animation state from a Lua table or JSON file.
	 */
	export function create_gui(this: void, animation_or_path: string | LuaTable, template?: string | undefined, nodes?: LuaTable<string | Hash, Opaque<"node">> | undefined): panthera_animation;
	/**
	 * Load an animation from a Lua table or JSON file and create an animation state using a specified adapter.
	 */
	export function create(this: void, animation_or_path: string | LuaTable, adapter: panthera_adapter, get_node: (node_id: string) => Opaque<"node">): panthera_animation;
	/**
	 * Clone an existing animation state object, enabling multiple instances of the same animation to play simultaneously or independently.
	 */
	export function clone_state(this: void, animation_state: panthera_animation): panthera_animation;
	/**
	 * Play an animation with specified ID and options.
	 */
	export function play(this: void, animation_state: panthera_animation, animation_id: string, options?: panthera_options | undefined): void;
	/**
	 * Play animation with easing support using tweener. Allows for non-linear animation playback with custom easing functions.
	 */
	export function play_tweener(this: void, animation_state: panthera_animation, animation_id: string, options?: panthera_options_tweener | undefined): void;
	/**
	 * Play animation as a child of the current animation state, allowing multiple animations to run independently and simultaneously.
	 *
	 * This creates a detached animation that runs in parallel with the main animation state without affecting it.
	 * The child animation will be automatically cleaned up when it completes.
	 */
	export function play_detached(this: void, animation_state: panthera_animation, animation_id: string, options?: panthera_options | undefined): void;
	/**
	 * Set the current time of an animation. This function stops any currently playing animation.
	 */
	export function set_time(this: void, animation_state: panthera_animation, animation_id: string, time: number, event_callback?: ((event_id: string, node: Opaque<"node"> | undefined, string_value: string, number_value: number) => void) | undefined): boolean;
	/**
	 * Retrieve the current playback time in seconds of an animation. If the animation is not playing, the function returns 0.
	 */
	export function get_time(this: void, animation_state: panthera_animation): number;
	/**
	 * Stop a currently playing animation. The animation will be stopped at current time.
	 */
	export function stop(this: void, animation_state: panthera_animation): boolean;
	/**
	 * Retrieve the total duration of a specific animation.
	 */
	export function get_duration(this: void, animation_state: panthera_animation, animation_id: string): number;
	/**
	 * Check if an animation is currently playing.
	 */
	export function is_playing(this: void, animation_state: panthera_animation): boolean;
	/**
	 * Get the ID of the last animation that was started.
	 */
	export function get_latest_animation_id(this: void, animation_state: panthera_animation): string | undefined;
	/**
	 * Return a list of animation IDs from the created animation state.
	 */
	export function get_animations(this: void, animation_state: panthera_animation): string[];
	/**
	 * Reload animations from JSON files, useful for development and debugging.
	 *
	 * The animations loaded from Lua tables will not be reloaded.
	 * Animation will be reloaded only at desktop.
	 */
	export function reload_animation(this: void, animation_path?: string | undefined): void;
}
