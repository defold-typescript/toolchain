/** @noResolution */
declare module 'squid.squid' {
	/**
	 * @(1) trace logging level constant
	 */
	export const TRACE: number;
	/**
	 * @(2) debug logging level constant
	 */
	export const DEBUG: number;
	/**
	 * @(3) info logging level constant
	 */
	export const INFO: number;
	/**
	 * @(4) warning logging level constant
	 */
	export const WARN: number;
	/**
	 * @(5) error logging level constant
	 */
	export const ERROR: number;
	/**
	 * @Public list of allowed tags (pairs tag[string] - is_allowed[boolean])
	 */
	export const ALLOWLIST: LuaTable;
	interface SquidInstance {
		log(message: string | number, level: number, data?: unknown): void;
		trace(message: string | number, data?: unknown): void;
		debug(message: string | number, data?: unknown): void;
		info(message: string | number, data?: unknown): void;
		warn(message: string | number, data?: unknown): void;
		error(message: string | number, data?: unknown): void;
		set_allowed(this_tag?: string, this_is_allowed?: boolean): void;
		save_logs(): void;
		init(): void;
		final(): void;
	}
	interface SquidConfig {
		app_catalog: string;
		log_file_name: string;
		log_file_extension: string;
		is_enabled: boolean;
		is_enabled_in_release: boolean;
		is_printing: boolean;
		is_saving: boolean;
		is_adding_timestamp: boolean;
		is_using_allowlist: boolean;
		days_to_delete_logs: number;
		min_log_level: number;
		unsaved_logs_buffer: number;
		max_data_length: number;
		max_data_depth: number;
		is_printing_crashes: boolean;
		is_saving_crashes: boolean;
		crash_file_name: string;
		crash_file_extension: string;
	}
	interface SystemHelper {
		is_linux: boolean;
		is_mobile: boolean;
		is_debug: boolean;
	}
	interface TableToString {
	}
	/**
	 * ------
	 * ------
	 * ------
	 * ------
	 * Initialize Squid for error and crash handling and logging
	 */
	export function init(this: void): void;
	/**
	 * Set if logs should be saved to file
	 */
	export function set_allowed(this: void, tag: string, is_allowed: boolean): void;
	/**
	 * Log TRACE level message with optional data and tag
	 */
	export function trace(this: void, message: string | number, data_or_tag?: unknown, tag?: string): void;
	/**
	 * Log DEBUG level message with optional data and tag
	 */
	export function debug(this: void, message: string | number, data_or_tag?: unknown, tag?: string): void;
	/**
	 * Log INFO level message with optional data and tag
	 */
	export function info(this: void, message: string | number, data_or_tag?: unknown, tag?: string): void;
	/**
	 * Log WARNING level message with optional data and tag
	 */
	export function warn(this: void, message: string | number, data_or_tag?: unknown, tag?: string): void;
	/**
	 * Log ERROR level message with optional data and tag
	 */
	export function error(this: void, message: string | number, data_or_tag?: unknown, tag?: string): void;
	/**
	 * Log message with provided level, message, data and tag
	 */
	export function log(this: void, message: string | number, level?: number, data_or_tag?: unknown, tag?: string): void;
	/**
	 * Explicitly save buffer of unsaved logs to a file
	 */
	export function save_logs(this: void): boolean;
	/**
	 * Set error callback function that will be called on error after logging it
	 */
	export function set_error_callback(this: void, callback: (source: string, message: string, traceback: string) => void): void;
	/**
	 * Finalize Squid logging - check for crashes and saved all unsaved buffered logs
	 */
	export function final(this: void): void;
	/**
	 * Create a new instance of the Squid logger
	 */
	export function new_(this: void, tag?: string, is_allowed?: boolean): SquidInstance;
	export { new_ as new };
	/**
	 * Get Squid configuration
	 */
	export function get_config(this: void): SquidConfig;
	/**
	 * Set and use user configuration
	 */
	export function set_config(this: void, config: SquidConfig): void;
}
