/** @noResolution */
declare module 'ads_wrapper.ads_networks.game_distribution' {
	import type { ads_callback, ads_response } from 'ads_wrapper.ads_wrapper';
	/**
	 * Params key for a `function(self, message_id, message)` listener that receives every GameDistribution message.
	 */
	export const LISTENER: Hash;
	/**
	 * Banner `size` option that sets no fixed size.
	 */
	export const SIZE_NONE: number;
	/**
	 * Banner `size` option for a 336x280 banner; the default.
	 */
	export const SIZE_336x280: number;
	/**
	 * Banner `size` option for a 300x250 banner.
	 */
	export const SIZE_300x250: number;
	/**
	 * Banner `size` option for a 970x250 banner.
	 */
	export const SIZE_970x250: number;
	/**
	 * Banner `size` option for a 728x90 banner.
	 */
	export const SIZE_728x90: number;
	/**
	 * Banner `size` option for a 120x600 banner.
	 */
	export const SIZE_120x600: number;
	/**
	 * Banner `size` option for a 160x600 banner.
	 */
	export const SIZE_160x600: number;
	/**
	 * Api setup
	 */
	export function setup(this: void, params: LuaTable): void;
	/**
	 * Initializes `GameDistribution` sdk.
	 */
	export function init(this: void, callback?: ads_callback | undefined): void;
	/**
	 * Check if the environment supports GameDistribution api
	 */
	export function is_supported(this: void): boolean;
	/**
	 * Check if the GameDistribution is initialized
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
	 * Loads banner
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
