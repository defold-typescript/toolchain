/** @noResolution */
declare module 'live_unbundler.live_unbundler' {
	type liveupdater_res_mode = number;
	type liveupdater_resolution = "low" | "high";
	interface liveupdater_module {
		files: string[];
		priority: number;
		res_mode?: liveupdater_res_mode | undefined;
		by_request?: boolean | undefined;
		processed?: boolean | undefined;
	}
	interface liveupdater_file_version_info {
		version: string;
		size?: number | undefined;
	}
	interface liveupdater_manifest {
		version: string;
		deps: LuaTable<string, string[]>;
		file_versions: LuaTable<string, liveupdater_file_version_info | string>;
		file_sizes?: LuaTable<string, number> | undefined;
	}
	interface liveupdater_manifest_group {
		lowres?: liveupdater_manifest | undefined;
		highres?: liveupdater_manifest | undefined;
	}
	/**
	 * Normalized view of one remote manifest, built once per init.
	 */
	interface liveupdater_manifest_side {
		versions: LuaTable<string, string>;
		sizes: LuaTable<string, number>;
		dep_lists: LuaTable<string, string[]>;
		dep_set: LuaTable<string, boolean>;
		path: string;
		prefix: string;
	}
	/**
	 * A resolution side is present only when its server path was passed to M.init.
	 * At least one of the two is always present.
	 */
	interface liveupdater_manifest_cache {
		low?: liveupdater_manifest_side | undefined;
		high?: liveupdater_manifest_side | undefined;
	}
	interface liveupdater_file_progress {
		progress: number;
		prefix: string;
	}
	interface liveupdater_queue_item {
		file_name: string;
		priority: number;
		version: string;
		size: number;
		module_name: string;
		path: string;
		prefix: string;
		resolution: liveupdater_resolution;
		remount?: boolean | undefined;
		order?: number | undefined;
		reason?: string | undefined;
	}
	interface liveupdater_module_file_progress {
		name: string;
		progress: number;
	}
	interface liveupdater_module_progress {
		name: string;
		progress: number;
		files: liveupdater_module_file_progress[];
	}
	interface liveupdater_resolution_progress {
		total_bytes: number;
		downloaded_bytes: number;
		pending_files: number;
		progress: number;
	}
	interface liveupdater_download_progress extends liveupdater_resolution_progress {
		low: liveupdater_resolution_progress;
		high: liveupdater_resolution_progress;
	}
	/**
	 * At least one of lowres_server_path / hires_server_path must be provided. When
	 * only one is provided that resolution is the only active one: res_mode on the
	 * modules is ignored and every module loads that single resolution.
	 */
	interface liveupdater_init_options {
		modules: LuaTable<string, liveupdater_module>;
		lowres_server_path?: string | undefined;
		hires_server_path?: string | undefined;
	}
	interface liveupdater {
		initialized: boolean;
		saved_list: LuaTable<string, string>;
		save_cache_key: string;
		modules: LuaTable<string, liveupdater_module>;
	}
	/**
	 * Posted to every listener once `init` finishes.
	 */
	export const MSG_INITIALIZED: Hash;
	/**
	 * Message id reserved for a failed initialization; this version never posts it.
	 */
	export const MSG_INITIALIZATION_FAILED: Hash;
	/**
	 * Posted with `file_name` and `module_name` each time an archive is mounted.
	 */
	export const MSG_FILE_LOADED: Hash;
	/**
	 * Posted with `file_name` and `module_name` once every archive of a module is mounted.
	 */
	export const MSG_MODULE_LOADED: Hash;
	/**
	 * Posted once every queued archive is mounted.
	 */
	export const MSG_ALL_LOADED: Hash;
	/**
	 * Posted when an archive download fails; the download retries after five seconds.
	 */
	export const MSG_NETWORK_ERROR: Hash;
	/**
	 * Debug log level passed to the `set_log_function` callback.
	 */
	export const DEBUG: number;
	/**
	 * Info log level passed to the `set_log_function` callback.
	 */
	export const INFO: number;
	/**
	 * Warning log level passed to the `set_log_function` callback.
	 */
	export const WARN: number;
	/**
	 * Error log level passed to the `set_log_function` callback.
	 */
	export const ERROR: number;
	/**
	 * Fatal log level passed to the `set_log_function` callback.
	 */
	export const FATAL: number;
	/**
	 * `res_mode` that loads only the high-resolution archives; the default.
	 */
	export const RES_HIGH_ONLY: liveupdater_res_mode;
	/**
	 * `res_mode` that loads only the low-resolution archives.
	 */
	export const RES_LOW_ONLY: liveupdater_res_mode;
	/**
	 * `res_mode` that loads both resolutions.
	 */
	export const RES_BOTH: liveupdater_res_mode;
	/**
	 * Assign a project logger. Signature: function(level, message), where level is
	 * one of M.DEBUG..M.FATAL. Optional — defaults to a no-op.
	 */
	export function set_log_function(this: void, fn: (level: number, message: string) => void): void;
	export function set_platform_supported(this: void, supported: boolean): void;
	/**
	 * Sets the save-file key used to persist the list of downloaded archives. Must
	 * be called before M.init. The value is whatever sys.get_save_file(...) returns;
	 * keep it stable across releases so existing installs keep their saved state.
	 */
	export function set_save_cache_key(this: void, key: string): void;
	export function has_module(this: void, module_name: string): boolean;
	export function is_module_loaded(this: void, module_name: string): boolean;
	export function init(this: void, options: liveupdater_init_options, cb: (success: boolean, error_text: string | undefined) => void, module_available_fn?: ((module_name: string) => boolean) | undefined): void;
	export function add_listener(this: void, url?: Url | undefined): void;
	export function remove_listener(this: void, url?: Url | undefined): void;
	export function get_module_progress(this: void, module_name: string, module?: liveupdater_module | undefined): liveupdater_module_progress | undefined;
	export function is_liveupdate_loaded(this: void): boolean;
	export function get_downloadable_files(this: void): LuaTable<string, liveupdater_file_progress>;
	export function get_downloadable_missing_files(this: void): LuaTable<string, string>;
	/**
	 * Byte-based progress for a module or a set of modules, with a per-resolution
	 * breakdown in the low/high fields. Shared dependency archives are counted once
	 * per set; an archive identical in both manifests counts toward the resolution
	 * counted first (for RES_BOTH that is lowres — the pass that actually downloads
	 * it). Anchored to the download queue: an archive counts as downloaded when
	 * nothing for it is pending, so the result reaches 100 exactly when the set's
	 * downloads drain. For by_request modules that were not requested yet, the
	 * future queue content is predicted from the same rules enqueue_modules uses;
	 * that prediction can dip for a moment while a shared archive is remounted to
	 * its highres copy, it recovers on the next mount.
	 */
	export function get_modules_download_progress(this: void, module_names: string | string[]): liveupdater_download_progress;
	/**
	 * Byte-based progress of the current download session, with a per-resolution
	 * breakdown in the low/high fields (requires manifest with file_sizes).
	 */
	export function get_download_progress(this: void): liveupdater_download_progress;
	export function get_total_downloadable_progress(this: void): number;
	export function is_module_in_queue(this: void, module_name: string): boolean | undefined;
	export function request_module_load(this: void, module_name: string): void;
}
