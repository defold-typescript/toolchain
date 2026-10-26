/** @noResolution */
declare module 'ads_wrapper.ads_networks.ironsource' {
	import type { ads_callback, ads_response } from 'ads_wrapper.ads_wrapper';
	interface ironsource_params {
		user_id?: string | undefined;
		consent_GDPR?: boolean | undefined;
		adapters_debug?: boolean | undefined;
		metadata?: LuaTable<string, unknown> | undefined;
		app_key: LuaTable<Opaque<"userdata">, string>;
		rew_placement_name?: string | undefined;
		int_placement_name?: string | undefined;
	}
	/**
	 * Api setup
	 */
	export function setup(this: void, params: ironsource_params): void;
	/**
	 * Initializes `ironsource` sdk.
	 */
	export function init(this: void, callback?: ads_callback | undefined): void;
	/**
	 * Check if the environment supports ironsource api
	 */
	export function is_supported(this: void): boolean;
	/**
	 * Check if the ironsource is initialized
	 */
	export function is_initialized(this: void): boolean;
	/**
	 * Shows rewarded ads.
	 */
	export function show_rewarded(this: void, callback?: ads_callback | undefined): void;
	/**
	 * Loads rewarded ads
	 */
	export function load_rewarded(this: void, callback?: ads_callback | undefined): void;
	/**
	 * Check if the rewarded ads is loaded
	 */
	export function is_rewarded_loaded(this: void): boolean;
	/**
	 * Shows interstitial ads.
	 */
	export function show_interstitial(this: void, callback?: ads_callback | undefined): void;
	/**
	 * Loads interstitial ads
	 */
	export function load_interstitial(this: void, callback?: ads_callback | undefined): void;
	/**
	 * Check if the interstitial ads is loaded
	 */
	export function is_interstitial_loaded(this: void): boolean;
	/**
	 * Check if the banner is set up
	 */
	export function is_banner_setup(this: void): boolean;
	/**
	 * Loads banner. Use `ads.T_BANNER` parameter.
	 */
	export function load_banner(this: void, callback?: ads_callback | undefined): void;
	/**
	 * Unloads active banner.
	 */
	export function unload_banner(this: void, callback?: ads_callback | undefined): void;
	/**
	 * Check if the banner is loaded
	 */
	export function is_banner_loaded(this: void): boolean;
	/**
	 * Shows loaded banner.
	 */
	export function show_banner(this: void, callback?: ads_callback | undefined): void;
	/**
	 * Hides loaded banner.
	 */
	export function hide_banner(this: void, callback?: ads_callback | undefined): void;
	/**
	 * Check if the banner is showed
	 */
	export function is_banner_showed(this: void): boolean;
}
