/** @noResolution */
declare module 'ads_wrapper.ads_networks.applovin_max' {
	import type { ads_callback, ads_response } from 'ads_wrapper.ads_wrapper';
	/**
	 * Bottom-center banner position, passed to `set_banner_position`.
	 */
	export const POS_BOTTOM_CENTER: string;
	/**
	 * Bottom-left banner position, passed to `set_banner_position`.
	 */
	export const POS_BOTTOM_LEFT: string;
	/**
	 * Bottom-right banner position, passed to `set_banner_position`.
	 */
	export const POS_BOTTOM_RIGHT: string;
	/**
	 * The `maxsdk.POS_NONE` banner position, passed to `set_banner_position`.
	 */
	export const POS_NONE: string;
	/**
	 * Top-left banner position, passed to `set_banner_position`.
	 */
	export const POS_TOP_LEFT: string;
	/**
	 * Top-center banner position, passed to `set_banner_position`.
	 */
	export const POS_TOP_CENTER: string;
	/**
	 * Top-right banner position, passed to `set_banner_position`.
	 */
	export const POS_TOP_RIGHT: string;
	/**
	 * Centered banner position, passed to `set_banner_position`.
	 */
	export const POS_CENTER: string;
	/**
	 * Standard banner size, passed to `set_banner_size`; the default.
	 */
	export const SIZE_BANNER: string;
	/**
	 * Leaderboard banner size, passed to `set_banner_size`.
	 */
	export const SIZE_LEADER: string;
	/**
	 * Medium-rectangle banner size, passed to `set_banner_size`.
	 */
	export const SIZE_MREC: string;
	/**
	 * Api setup
	 */
	export function setup(this: void, params: LuaTable): void;
	/**
	 * Initializes `applovin_max` sdk.
	 */
	export function init(this: void, callback?: ads_callback | undefined): void;
	/**
	 * Check if the environment supports applovin_max api
	 */
	export function is_supported(this: void): boolean;
	/**
	 * Check if the applovin max is initialized
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
	 * Sets banner position. It is imperative to hide and show the banner again after this function.
	 * Possible positions:
	 * `applovin_max.POS_TOP_CENTER`(default)
	 * `applovin_max.POS_BOTTOM_CENTER`
	 * `applovin_max.POS_BOTTOM_LEFT`
	 * `applovin_max.POS_BOTTOM_RIGHT`
	 * `applovin_max.POS_NONE`
	 * `applovin_max.POS_TOP_LEFT`
	 * `applovin_max.POS_TOP_RIGHT`
	 * `applovin_max.POS_CENTER`
	 */
	export function set_banner_position(this: void, position: string): ads_response;
	/**
	 * Sets banner size. It is imperative to reload the banner again after this function.
	 * Possible sizes:
	 * `applovin_max.SIZE_BANNER`(default)
	 * `applovin_max.SIZE_LEADER`
	 * `applovin_max.SIZE_MREC`
	 */
	export function set_banner_size(this: void, size: string): ads_response;
	/**
	 * Check if the banner is showed
	 */
	export function is_banner_showed(this: void): boolean;
}
