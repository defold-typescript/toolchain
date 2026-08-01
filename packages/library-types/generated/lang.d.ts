/** @noResolution */
declare module 'lang.lang' {
	interface lang_logger {
		trace: (_: unknown, msg: string, data: unknown) => void;
		debug: (_: unknown, msg: string, data: unknown) => void;
		info: (_: unknown, msg: string, data: unknown) => void;
		warn: (_: unknown, msg: string, data: unknown) => void;
		error: (_: unknown, msg: string, data: unknown) => void;
	}
	interface lang_registry {
	}
	interface lang {
		state: lang_state;
		on_lang_changed: (...args: any[]) => unknown;
	}
	interface lang_state {
		lang: string;
	}
	interface lang_data {
		path?: string | LuaTable | undefined;
		id: string;
		loader?: ((...args: any[]) => unknown) | undefined;
	}
	/**
	 * Global callback after language is loaded and translations are ready.
	 * Called by `set_lang`, `set_next_lang`, and `load_langs`. Set once at startup to refresh UI.
	 */
	export function on_lang_changed(this: void): void;
	/**
	 * Call this to initialize lang module
	 */
	export function init(this: void, available_langs: lang_data[], lang_on_start?: string | undefined): void;
	/**
	 * Load additional locale pack and refresh current language
	 */
	export function load_langs(this: void, pack_id: string, langs: lang_data[], on_lang_changed?: ((...args: any[]) => unknown) | undefined): void;
	/**
	 * Set current language
	 */
	export function set_lang(this: void, lang_id: string, on_lang_changed?: ((...args: any[]) => unknown) | undefined): void;
	/**
	 * Set next language from lang list and return it's code
	 */
	export function set_next_lang(this: void, on_lang_changed?: ((...args: any[]) => unknown) | undefined): string;
	/**
	 * Get next language from lang list and return it's code
	 */
	export function get_next_lang(this: void): string;
	/**
	 * Get current language
	 */
	export function get_lang(this: void): string;
	/**
	 * Return list of available languages
	 */
	export function get_langs(this: void): string[];
	/**
	 * Get translation for text id
	 */
	export function txt(this: void, text_id: string): string;
	/**
	 * Get translation for text id with params
	 */
	export function txp(this: void, text_id: string, ...args: (string | number)[]): string;
	/**
	 * Get random translation for text id, split by \n symbol
	 */
	export function txr(this: void, text_id: string): string;
	/**
	 * Check is translation with text_id exist
	 */
	export function is_exist(this: void, text_id: string): boolean;
	/**
	 * Set logger for lang module. Pass nil to use empty logger
	 */
	export function set_logger(this: void, logger_instance?: lang_logger | LuaTable | undefined): void;
	/**
	 * Reset module lang state
	 */
	export function reset_state(this: void): void;
	/**
	 * Get lang module state
	 */
	export function get_state(this: void): lang_state;
	/**
	 * Set lang module state
	 */
	export function set_state(this: void, state: lang_state): void;
	/**
	 * Get default language
	 */
	export function get_default_lang(this: void): string;
	/**
	 * Get current lang table { key = "value" }
	 */
	export function get_lang_table(this: void): LuaTable<string, string>;
	/**
	 * Check if language is available
	 */
	export function is_lang_available(this: void, lang_id: string): boolean;
}
