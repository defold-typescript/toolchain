/** @noResolution */
declare module 'ads_wrapper.ads_networks.vk' {
	import type { ads_callback, ads_response } from 'ads_wrapper.ads_wrapper';
	/**
	 * Sets vkbridge extention
	 */
	export function set_vkbridge_extention(this: void, _vkbridge: unknown): void;
	export function setup(this: void, params: LuaTable): void;
	export function init(this: void, callback?: ads_callback | undefined): void;
	/**
	 * Check if the environment supports vk api
	 */
	export function is_supported(this: void): boolean;
	/**
	 * Check if the vk is initialized
	 */
	export function is_initialized(this: void): boolean;
	export function show_rewarded(this: void, callback?: ads_callback | undefined): void;
	export function load_rewarded(this: void, callback?: ads_callback | undefined): void;
	export function is_rewarded_loaded(this: void): boolean;
	export function show_interstitial(this: void, callback?: ads_callback | undefined): void;
	export function load_interstitial(this: void, callback?: ads_callback | undefined): void;
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
	 * Sets banner count.
	 */
	export function set_banner_count(this: void, count: number): ads_response;
	/**
	 * Sets banner position.
	 */
	export function set_banner_position(this: void, position: string): ads_response;
	/**
	 * Check if the banner is showed
	 */
	export function is_banner_showed(this: void): boolean;
}
