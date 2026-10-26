/** @noResolution */
declare module 'ads_wrapper.events' {
	type ads_queue = ((...args: any[]) => unknown)[];
	type ads_callback = (response: ads_response) => void;
	interface ads_network {
		/**
		 * Api setup
		 */
		setup(this: void, params?: unknown | undefined): void;
		/**
		 * Initializes `admob` sdk.
		 */
		init(this: void, callback?: ads_callback | undefined, params?: LuaTable | undefined): void;
		/**
		 * Requests IDFA
		 */
		request_idfa(this: void, callback?: ads_callback | undefined, params?: LuaTable | undefined): void;
		/**
		 * Check if the environment supports admob api
		 */
		is_supported(this: void): boolean;
		/**
		 * Check if the admob is initialized
		 */
		is_initialized(this: void): boolean;
		/**
		 * Shows rewarded ads.
		 */
		show_rewarded(this: void, callback?: ads_callback | undefined, params?: LuaTable | undefined): void;
		/**
		 * Loads rewarded ads
		 */
		load_rewarded(this: void, callback?: ads_callback | undefined, params?: LuaTable | undefined): void;
		/**
		 * Check if the rewarded ads is loaded
		 */
		is_rewarded_loaded(this: void, params?: LuaTable | undefined): boolean;
		/**
		 * Shows interstitial ads.
		 */
		show_interstitial(this: void, callback?: ads_callback | undefined, params?: LuaTable | undefined): void;
		/**
		 * Loads interstitial ads
		 */
		load_interstitial(this: void, callback?: ads_callback | undefined, params?: LuaTable | undefined): void;
		/**
		 * Check if the interstitial ads is loaded
		 */
		is_interstitial_loaded(this: void, params?: LuaTable | undefined): boolean;
		/**
		 * Check if the banner is set up
		 */
		is_banner_setup(this: void): boolean;
		/**
		 * Loads banner. Use `ads.T_BANNER` parameter.
		 */
		load_banner(this: void, callback?: ads_callback | undefined, params?: LuaTable | undefined): void;
		/**
		 * Unloads active banner.
		 */
		unload_banner(this: void, callback?: ads_callback | undefined, params?: LuaTable | undefined): void;
		/**
		 * Check if the banner is loaded
		 */
		is_banner_loaded(this: void, params?: LuaTable | undefined): boolean;
		/**
		 * Shows loaded banner.
		 */
		show_banner(this: void, callback?: ads_callback | undefined, params?: LuaTable | undefined): void;
		/**
		 * Hides loaded banner.
		 */
		hide_banner(this: void, callback?: ads_callback | undefined, params?: LuaTable | undefined): void;
		/**
		 * Check if the banner is showed
		 */
		is_banner_showed(this: void, params?: LuaTable | undefined): boolean;
	}
	interface ads_order {
		id: number;
		count?: number | undefined;
	}
	interface ads_mediator {
		order: ads_network[];
		networks: LuaTable<number, ads_network>;
		current_network_num: number;
		repeater: number;
		repeat_num: number;
	}
	interface ads_response {
		result: Hash;
		message?: string | undefined;
		data?: unknown | undefined;
		code?: Hash | undefined;
		cancelled?: boolean | undefined;
		name?: string | undefined;
		network_name?: string | undefined;
	}
	/**
	 * Result a network step returns to stop the queue early; the callback receives it as `SUCCESS`.
	 */
	export const ABORT: Hash;
	/**
	 * `response.result` when the call succeeded.
	 */
	export const SUCCESS: Hash;
	/**
	 * `response.result` when the call failed.
	 */
	export const ERROR: Hash;
	/**
	 * `response.code` when the rewarded ad was skipped.
	 */
	export const C_SKIPPED: Hash;
	/**
	 * `response.code` for an unknown error.
	 */
	export const C_ERROR_UNKNOWN: Hash;
	/**
	 * `response.code` when an ad blocker caused the error.
	 */
	export const C_ERROR_AD_BLOCK: Hash;
	/**
	 * `response.code` when there is no internet connection.
	 */
	export const C_ERROR_NO_CONNECTION: Hash;
	/**
	 * `queue.set_verbose_mode` level that logs nothing; the default.
	 */
	export const V_NONE: Hash;
	/**
	 * `queue.set_verbose_mode` level that logs every error.
	 */
	export const V_ERROR: Hash;
	/**
	 * `queue.set_verbose_mode` level that logs every success response.
	 */
	export const V_SUCCESS: Hash;
	/**
	 * `queue.set_verbose_mode` level that logs every message.
	 */
	export const V_ALL: Hash;
}
