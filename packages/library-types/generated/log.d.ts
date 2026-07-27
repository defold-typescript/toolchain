/** @noResolution */
declare module 'log.log' {
	type logger = log;
	interface log {
		name: string;
		level: string;
		_last_gc_memory: number;
		_last_message_time: number;
		/**
		 * Format log message
		 */
		format(level: string, message: string, context: unknown): string | undefined;
		/**
		 * Log message with specified level and message
		 */
		log(level: string, message: string, context: unknown): void;
		/**
		 * Log message with TRACE level
		 */
		trace(message: string, data: unknown): void;
		/**
		 * Log message with DEBUG level
		 */
		debug(message: string, data: unknown): void;
		/**
		 * Log message with INFO level
		 */
		info(message: string, data: unknown): void;
		/**
		 * Log message with WARN level
		 */
		warn(message: string, data: unknown): void;
		/**
		 * Log message with ERROR level
		 */
		error(message: string, data: unknown): void;
	}
	/**
	 * Return the new logger instance
	 */
	export function get_logger(this: void, logger_name?: string | undefined, force_logger_level_in_debug?: string | undefined): logger;
	/**
	 * Return the basename of the current file
	 */
	export function get_default_logger_name(this: void, debuginfo: unknown): string;
}
