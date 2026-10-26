/** @noResolution */
declare module 'ads_wrapper.ads_networks.unity' {
	import type { ads_callback, ads_response } from 'ads_wrapper.ads_wrapper';
	/**
	 * Api setup
	 */
	export function setup(this: void, params: LuaTable): void;
	/**
	 * Initializes `unityads` sdk.
	 */
	export function init(this: void, callback?: ads_callback | undefined): void;
	/**
	 * Requests IDFA
	 */
	export function request_idfa(this: void, callback?: ads_callback | undefined): void;
	/**
	 * Check if the environment supports unity ads api
	 */
	export function is_supported(this: void): boolean;
	/**
	 * Check if the unity ads is initialized
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
	 * Sets banner position.
	 * Possible positions:
	 * `unityads.BANNER_POSITION_TOP_LEFT`
	 * `unityads.BANNER_POSITION_TOP_CENTER`
	 * `unityads.BANNER_POSITION_TOP_RIGHT`
	 * `unityads.BANNER_POSITION_BOTTOM_LEFT`
	 * `unityads.BANNER_POSITION_BOTTOM_CENTER`
	 * `unityads.BANNER_POSITION_BOTTOM_RIGHT`
	 * `unityads.BANNER_POSITION_CENTER`
	 */
	export function set_banner_position(this: void, position: number): ads_response;
	/**
	 * Sets banner size. It is imperative to reload the banner again after this function.
	 */
	export function set_banner_size(this: void, size: LuaTable): ads_response;
	/**
	 * Check if the banner is showed
	 */
	export function is_banner_showed(this: void): boolean;
}
