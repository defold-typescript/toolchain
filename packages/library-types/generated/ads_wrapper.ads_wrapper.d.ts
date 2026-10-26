/** @noResolution */
declare module 'ads_wrapper.ads_wrapper' {
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
	 * Rewarded-video ad type, used to set network parameters.
	 */
	export const T_REWARDED: Hash;
	/**
	 * Interstitial ad type, used to set network parameters.
	 */
	export const T_INTERSTITIAL: Hash;
	/**
	 * Banner ad type, used to set network parameters.
	 */
	export const T_BANNER: Hash;
	/**
	 * Checks for internet connection
	 */
	export function is_internet_connected(this: void): boolean;
	/**
	 * Remove all registered networks
	 */
	export function clear_networks(this: void): void;
	/**
	 * Registers network. Returns id
	 */
	export function register_network(this: void, network: ads_network, params?: unknown | undefined): number | undefined;
	/**
	 * Setups interstitial and reward mediator
	 */
	export function setup_video(this: void, order: ads_order[], repeat_count?: number | undefined): void;
	/**
	 * Setups banner mediator
	 */
	export function setup_banner(this: void, order: ads_order[], repeat_count?: number | undefined, _banner_auto_hide?: boolean | undefined): void;
	/**
	 * Initializes all networks.
	 */
	export function init(this: void, initialize_video?: boolean | undefined, initialize_banner?: boolean | undefined, callback?: ads_callback | undefined, params?: LuaTable | undefined): void;
	/**
	 * Initialize video networks
	 */
	export function init_video_networks(this: void, callback?: ads_callback | undefined, params?: LuaTable | undefined): void;
	/**
	 * Initialize banner networks
	 */
	export function init_banner_networks(this: void, callback?: ads_callback | undefined, params?: LuaTable | undefined): void;
	/**
	 * Loads rewarded ads for next network
	 */
	export function load_rewarded(this: void, callback?: ads_callback | undefined, params?: LuaTable | undefined): number | undefined;
	/**
	 * Shows rewarded ads for next network
	 */
	export function show_rewarded(this: void, callback?: ads_callback | undefined, params?: LuaTable | undefined): number | undefined;
	/**
	 * Loads interstitial ads for next network
	 */
	export function load_interstitial(this: void, callback?: ads_callback | undefined, params?: LuaTable | undefined): number | undefined;
	/**
	 * Shows interstitial ads for next network
	 */
	export function show_interstitial(this: void, callback?: ads_callback | undefined, params?: LuaTable | undefined): number | undefined;
	/**
	 * Loads banner for for next network.
	 */
	export function load_banner(this: void, callback?: ads_callback | undefined, params?: LuaTable | undefined): number | undefined;
	/**
	 * Shows setup banner for next network. Hides the previous banner if it was displayed.
	 */
	export function show_banner(this: void, callback?: ads_callback | undefined, params?: LuaTable | undefined): number | undefined;
	/**
	 * Hides setup banner for current network
	 */
	export function hide_banner(this: void, callback?: ads_callback | undefined, params?: LuaTable | undefined): void;
	/**
	 * Unloads banner for current networks.
	 */
	export function unload_banner(this: void, callback?: ads_callback | undefined, params?: LuaTable | undefined): void;
	/**
	 * Check if the banner mediator is set up
	 */
	export function is_banner_setup(this: void): boolean;
	/**
	 * Check if the interstitial and rewarded video mediator is set up
	 */
	export function is_video_setup(this: void): boolean;
	/**
	 * Check if wrapper is initiailzed
	 */
	export function is_initialized(this: void): boolean;
	/**
	 * Check if the interstitial video is loaded.
	 * Default checks the `next` network in mediator.
	 */
	export function is_interstitial_loaded(this: void, check_current?: boolean | undefined, params?: LuaTable | undefined): boolean;
	/**
	 * Check if the rewarded video is loaded.
	 * Default checks the `next` network in mediator.
	 */
	export function is_rewarded_loaded(this: void, check_current?: boolean | undefined, params?: LuaTable | undefined): boolean;
	/**
	 * Check if the banner is loaded.
	 * Default checks the `next` network in mediator.
	 */
	export function is_banner_loaded(this: void, check_current?: boolean | undefined, params?: LuaTable | undefined): boolean;
	/**
	 * Returns the current network pointed to by mediator
	 * Default returns for the video mediator
	 */
	export function get_current_network(this: void, check_banner?: boolean | undefined): ads_network | undefined;
	/**
	 * Returns the next network pointed to by mediator
	 * Default returns for the video mediator
	 */
	export function get_next_network(this: void, check_banner?: boolean | undefined): ads_network | undefined;
	/**
	 * Cancel execution
	 */
	export function cancel(this: void, id: number): void;
}
