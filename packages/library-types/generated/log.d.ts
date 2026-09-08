/** @noResolution */
declare module 'log.log' {
	type logger = log;
	interface log {
		name: string;
		level: string;
		_last_gc_memory?: number | undefined;
		_last_message_time?: number | undefined;
		/**
		 * Log message with TRACE level
		 */
		trace(message: string | undefined, data: unknown): void;
		/**
		 * Log message with DEBUG level
		 */
		debug(message: string | undefined, data: unknown): void;
		/**
		 * Log message with INFO level
		 */
		info(message: string | undefined, data: unknown): void;
		/**
		 * Log message with WARN level
		 */
		warn(message: string | undefined, data: unknown): void;
		/**
		 * Log message with ERROR level
		 */
		error(message: string | undefined, data: unknown): void;
		/**
		 * Write this logger messages to a `<logger_name>.log` file next to the calling script.
		 * Editor and desktop builds only, since it requires the project folder
		 */
		set_file_nearby(): string | undefined;
		(name: string | undefined, force_logger_level_in_debug: string | undefined): logger;
	}
	/**
	 * Return the new logger instance
	 */
	export function get_logger(this: void, logger_name?: string | undefined, force_logger_level_in_debug?: string | undefined): logger;
	/**
	 * Add a custom handler for log messages
	 */
	export function add_callback(this: void, callback: (logger: logger, level: string, message: string, context: unknown, log_message: string) => void): void;
	/**
	 * Remove a previously added handler
	 */
	export function remove_callback(this: void, callback: (...args: any[]) => unknown): void;
	/**
	 * Remove all custom handlers. The file writing is not affected
	 */
	export function clear_callbacks(this: void): void;
	/**
	 * Set the log file for all loggers, in addition to the console and the personal logger files.
	 * The path is always relative (`/logs/game.log`): project folder in the editor, save folder on a device.
	 * Pass nil to disable
	 */
	export function set_file(this: void, path?: string | undefined): string | undefined;
	/**
	 * Get the current log file path for all loggers, or nil if disabled
	 */
	export function get_file(this: void): string | undefined;
	/**
	 * Delete all known logger .log files from the disk
	 */
	export function clear_log_files(this: void): void;
	/**
	 * Flush, close and disable all log files.
	 * Call it once on the application shutdown, e.g. from the `final` of your bootstrap script.
	 * Further log messages will not reopen the files until `set_file` / `set_file_nearby` is called again
	 */
	export function final(this: void): void;
}
