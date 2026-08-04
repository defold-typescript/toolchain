/** @noResolution */
declare module 'saver.storage' {
	/**
	 * Persist data between game sessions
	 */
	interface saver_state {
		storage: LuaTable<string, unknown>;
		version: number;
		last_game_version: string;
		migration_version: number;
	}
	/**
	 * Whole game state. Add your fields here to inspect all fields
	 */
	interface saver_game_state {
		saver: saver_state;
		storage: saver_storage_state;
	}
	/**
	 * Configuration table for `saver.init` to setup all things you can in game.project file
	 */
	interface saver_config {
		save_folder?: string | undefined;
		save_name?: string | undefined;
		saver_key?: string | undefined;
		storage_key?: string | undefined;
		autosave_timer?: number | undefined;
		lua_require_as_string?: boolean | undefined;
	}
	/**
	 * Logger interface
	 */
	interface saver_logger {
		trace: (logger: saver_logger, message: string, data: unknown | undefined) => void;
		debug: (logger: saver_logger, message: string, data: unknown | undefined) => void;
		info: (logger: saver_logger, message: string, data: unknown | undefined) => void;
		warn: (logger: saver_logger, message: string, data: unknown | undefined) => void;
		error: (logger: saver_logger, message: string, data: unknown | undefined) => void;
	}
	interface saver {
	}
	/**
	 * Persist data between game sessions
	 *
	 * @deprecated
	 */
	interface saver_storage_state {
		storage: LuaTable<string, saver_storage_value>;
	}
	/**
	 * One of the values in the storage
	 */
	interface saver_storage_value {
		s_value?: string | undefined;
		i_value?: number | undefined;
		b_value?: boolean | undefined;
	}
	interface saver_storage {
	}
	export function reset_state(this: void): void;
	/**
	 * Get the value from the storage.
	 */
	export function get(this: void, name: string, default_value?: string | number | boolean | undefined): string | number | boolean | undefined;
	/**
	 * Get the number from the storage.
	 */
	export function get_number(this: void, name: string, default_value?: number | undefined): number;
	/**
	 * Get the string from the storage.
	 */
	export function get_string(this: void, name: string, default_value?: string | undefined): string;
	/**
	 * Get the boolean from the storage.
	 */
	export function get_boolean(this: void, name: string, default_value?: boolean | undefined): boolean;
	/**
	 * Set the value to storage
	 */
	export function set(this: void, id: string, value: string | number | boolean): boolean;
}
