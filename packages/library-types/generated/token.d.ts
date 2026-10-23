/** @noResolution */
declare module 'token.token' {
	import type { event } from 'event.event';
	/**
	 * Token configuration management module
	 * Manages token configs, groups, and lots
	 */
	interface token_config {
		tokens?: LuaTable<string, LuaTable<string, token_token_config_data>> | undefined;
		groups?: LuaTable<string, LuaTable<string, number>> | undefined;
		lots?: LuaTable<string, token_lot> | undefined;
	}
	interface token_token_config_data {
		id?: string | undefined;
		"default"?: number | undefined;
		min?: number | undefined;
		max?: number | undefined;
	}
	interface token_lot {
		price: string;
		reward: string;
	}
	interface token_container_event_on_token_change extends event {
	}
	interface token_container_event_on_token_visual_change extends event {
	}
	interface token_container {
		id: string;
		config_group?: string | undefined;
		_state_data: token_container_data;
		_tokens: LuaTable<string, token_value>;
		on_token_change: token_container_event_on_token_change;
		on_token_visual_change: token_container_event_on_token_visual_change;
		on_token_restore_change: event;
		/**
		 * Switch config group on an existing container. Amounts stay; min/max/default come from the new group.
		 */
		set_config_group(config_group: string): void;
		/**
		 * Get token instance
		 */
		token(token_id: string | token_token_config_data): token_value;
		/**
		 * Get container state data
		 * **For internal use only by token module plugins (restore/infinity)**
		 */
		get_state_data(): token_container_data;
		/**
		 * Add tokens to the container
		 */
		add(token_id: string | token_token_config_data, amount: number, reason?: string | undefined, visual_later?: boolean | undefined): number;
		/**
		 * Set token amount in the container
		 */
		set(token_id: string | token_token_config_data, amount: number, reason?: string | undefined, visual_later?: boolean | undefined): number;
		/**
		 * Get token amount from the container
		 */
		get(token_id: string | token_token_config_data): number | unknown;
		/**
		 * Pay (subtract) tokens from the container
		 */
		pay(token_id: string, amount: number, reason?: string | undefined, visual_later?: boolean | undefined): boolean;
		/**
		 * Check if container has enough tokens
		 */
		is_enough(token_id: string, amount: number): boolean;
		/**
		 * Check if token is empty (zero)
		 */
		is_empty(token_id: string): boolean;
		/**
		 * Check if token is at maximum value
		 */
		is_max(token_id: string): boolean;
		/**
		 * Add multiple tokens to the container
		 */
		add_many(tokens?: LuaMap<string, number> | Record<string, number> | undefined, reason?: string | undefined, visual_later?: boolean | undefined): void;
		/**
		 * Set multiple tokens in the container
		 */
		set_many(tokens?: LuaMap<string, number> | Record<string, number> | undefined, reason?: string | undefined, visual_later?: boolean | undefined): void;
		/**
		 * Pay multiple tokens from the container
		 */
		pay_many(tokens: LuaMap<string, number> | Record<string, number>, reason?: string | undefined, visual_later?: boolean | undefined): boolean;
		/**
		 * Check if container has enough of multiple tokens
		 */
		is_enough_many(tokens?: LuaMap<string, number> | Record<string, number> | undefined): boolean;
		/**
		 * Get all tokens from the container
		 */
		get_many(): LuaTable<string, number>;
		/**
		 * Sync visual debt for a token
		 */
		sync_visual(token_id: string): number;
		/**
		 * Add visual debt to a token
		 */
		add_visual(token_id: string, amount: number): number;
		/**
		 * Get visual value of a token
		 */
		get_visual(token_id: string): number;
		/**
		 * Get total sum for a token
		 */
		get_total_sum(token_id: string): number;
		/**
		 * Get token configuration
		 */
		get_token_config(token_id: string): token_token_config_data;
		/**
		 * Add tokens from a token group to container
		 */
		add_group(group_id: string, reason?: string | undefined, visual_later?: boolean | undefined): void;
		/**
		 * Set tokens in container to match a token group
		 */
		set_group(group_id: string, reason?: string | undefined, visual_later?: boolean | undefined): void;
		/**
		 * Pay tokens from container using a token group as cost
		 */
		pay_group(group_id: string, reason?: string | undefined, visual_later?: boolean | undefined): boolean;
		/**
		 * Check if container has enough tokens to pay for a token group
		 */
		is_enough_group(group_id: string): boolean;
	}
	interface token_logger {
		trace: (_: unknown, msg: string, data: unknown) => void;
		debug: (_: unknown, msg: string, data: unknown) => void;
		info: (_: unknown, msg: string, data: unknown) => void;
		warn: (_: unknown, msg: string, data: unknown) => void;
		error: (_: unknown, msg: string, data: unknown) => void;
	}
	interface token_token_restore_config {
		is_enabled: boolean;
		last_restore_time: number;
		disabled_time?: number | undefined;
		timer: number;
		value: number;
		max?: number | undefined;
		was_at_restore_max?: boolean | undefined;
	}
	interface token_token_restore_param {
		timer: number;
		value?: number | undefined;
		max?: number | undefined;
	}
	/**
	 * Token state management module
	 * This module can be replaced before loading the token system
	 */
	interface token_state {
		containers: LuaTable<string, token_container_data>;
	}
	interface token_container_data {
		tokens: LuaTable<string, number>;
		history?: LuaTable<string, number> | undefined;
		restore_config?: LuaTable<string, token_token_restore_config> | undefined;
		infinity_timers?: LuaTable<string, number> | undefined;
		config_group?: string | undefined;
	}
	/**
	 * Token value wrapper
	 * Manages individual token instances with value, visual debt, and total sum tracking
	 */
	interface token_value {
		amount: number;
		total_sum: number;
		visual_credit: number;
		config: token_token_config_data;
		_on_change_callbacks?: ((...args: any[]) => unknown)[] | undefined;
		_on_visual_change_callbacks?: ((...args: any[]) => unknown)[] | undefined;
		/**
		 * Set token value
		 */
		set(value: number, reason?: string | undefined, visual_later?: boolean | undefined): number;
		/**
		 * Get current token value
		 */
		get(): number;
		/**
		 * Add to token value
		 */
		add(value: number, reason?: string | undefined, visual_later?: boolean | undefined): number;
		/**
		 * Check if token has enough value
		 */
		check(value: number): boolean;
		/**
		 * Pay (subtract) value from token
		 */
		pay(value: number, reason?: string | undefined, visual_later?: boolean | undefined): boolean;
		/**
		 * Sync visual debt with actual value
		 */
		sync_visual(): number;
		/**
		 * Add visual debt to token
		 */
		add_visual(value: number): number;
		/**
		 * Get visual value (actual value - visual debt)
		 */
		get_visual(): number;
		/**
		 * Get total sum (all tokens ever accumulated)
		 */
		get_total_sum(): number;
		/**
		 * Set token to maximum value
		 */
		set_max(): void;
		/**
		 * Register callback for value changes
		 */
		on_change(callback: (token: token_value, delta: number, reason: string | undefined) => void): void;
		/**
		 * Register callback for visual changes
		 */
		on_visual_change(callback: (token: token_value, delta: number) => void): void;
		/**
		 * Get token id from config
		 */
		get_token_id(): string | undefined;
	}
	/**
	 * The Defold Token module.
	 * Used to manage all countable items in the game.
	 */
	interface token {
	}
	/**
	 * Triggers when token amount was changed. `amount` is the new total, `delta` is the applied change
	 * Callback is fun(container_id: string, token_id: string, amount: number, reason: string|nil, delta: number)
	 */
	interface token_event_on_token_change extends event {
	}
	/**
	 * Triggers when token visual amount was changed. `amount` is the new visual total, `delta` is the applied visual change
	 * Callback is fun(container_id: string, token_id: string, amount: number, delta: number)
	 */
	interface token_event_on_token_visual_change extends event {
	}
	/**
	 * Triggers when token restore config was changed
	 * Callback is fun(container_id: string, token_id: string, config: token.token_restore_config)
	 */
	interface token_event_on_token_restore_change extends event {
	}
	/**
	 * Active container instances
	 * Timer handle for update loop
	 * Call this to reset state to default
	 */
	export function reset_state(this: void): void;
	/**
	 * Get the current state for serialization
	 */
	export function get_state(this: void): token_state;
	/**
	 * Set the state (for deserialization)
	 */
	export function set_state(this: void, new_state: token_state): void;
	/**
	 * Customize the logging mechanism used by Token Module. You can use **Defold Log** library or provide a custom logger.
	 */
	export function set_logger(this: void, logger_instance?: token_logger | LuaTable | undefined): void;
	/**
	 * Get container instance, create if it doesn't exist.
	 * If `config_group` is passed, it overrides the stored group on that container.
	 */
	export function container(this: void, container_id: string, config_group?: string | undefined): token_container;
	/**
	 * Delete a container and all its tokens
	 */
	export function delete_container(this: void, container_id: string): void;
	/**
	 * Clear all tokens from a container but keep the container
	 */
	export function clear_container(this: void, container_id: string): void;
	/**
	 * Check if container exists
	 */
	export function is_container_exist(this: void, container_id: string): boolean;
	/**
	 * Register tokens in the token system
	 * Call this before `token.init()` when using a named config group.
	 * Saved containers restore with the `config_group` stored on their state.
	 */
	export function register_tokens(this: void, tokens: LuaMap<string, token_token_config_data> | Record<string, token_token_config_data> | string, config_group?: string | undefined): void;
	/**
	 * Register token groups in the token system
	 */
	export function register_token_groups(this: void, groups: LuaMap<string, LuaMap<string, number> | Record<string, number>> | Record<string, LuaMap<string, number> | Record<string, number>> | string): void;
	/**
	 * Register lots in the token system
	 */
	export function register_lots(this: void, lots_data: LuaMap<string, token_lot> | Record<string, token_lot> | string): void;
	/**
	 * Get a token group by its identifier
	 */
	export function get_token_group(this: void, token_group_id: string): LuaTable<string, number> | undefined;
	/**
	 * Get the reward tokens for a specific lot
	 */
	export function get_lot_reward(this: void, lot_id: string): LuaTable<string, number> | undefined;
	/**
	 * Get the price tokens for a specific lot
	 */
	export function get_lot_price(this: void, lot_id: string): LuaTable<string, number> | undefined;
	/**
	 * Get token configuration
	 */
	export function get_token_config(this: void, token_id: string): token_token_config_data | undefined;
	/**
	 * Initialize the token system with token configuration (optional)
	 * Register named config groups with `register_tokens(tokens, config_group)` before calling `init`.
	 * Saved containers are restored with the `config_group` stored on their state; otherwise `"default"`.
	 */
	export function init(this: void, tokens_config_or_path?: LuaMap<string, token_token_config_data> | Record<string, token_token_config_data> | string | undefined, config_group?: string | undefined): void;
	/**
	 * Update the token system
	 */
	export function update(this: void): void;
}
