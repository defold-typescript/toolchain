/** @noResolution */
declare module 'ads_wrapper.ads_networks.yandex' {
	import type { ads_callback, ads_response } from 'ads_wrapper.ads_wrapper';
	/**
	 * Sets yandex extention
	 */
	export function set_yandex_extention(this: void, ex_yagames: unknown): void;
	/**
	 * Asks the `player` sdk to save data
	 */
	export function get_player(this: void, callback?: ads_callback | undefined): void;
	export function setup(this: void, params: LuaTable): void;
	export function init(this: void, callback?: ads_callback | undefined): void;
	/**
	 * Check if the environment supports yandex api
	 */
	export function is_supported(this: void): boolean;
	/**
	 * Returns Yandex.Games interface language in ISO 639-1 format.
	 */
	export function get_lang(this: void): string | undefined;
	/**
	 * Check if the yandex is initialized
	 */
	export function is_initialized(this: void): boolean;
	export function show_rewarded(this: void, callback?: ads_callback | undefined): void;
	export function load_rewarded(this: void, callback?: ads_callback | undefined): void;
	export function is_rewarded_loaded(this: void): boolean;
	export function show_interstitial(this: void, callback?: ads_callback | undefined): void;
	export function load_interstitial(this: void, callback?: ads_callback | undefined): void;
	export function is_interstitial_loaded(this: void): boolean;
	/**
	 * Check if the yandex supports safe storage
	 */
	export function is_storage_supported(this: void): boolean;
	/**
	 * Check if the yandex player is authorized
	 */
	export function is_player_authorized(this: void): boolean;
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
	 */
	export function set_banner_position(this: void, position: LuaTable): ads_response;
	/**
	 * Sets banner size.
	 */
	export function set_banner_size(this: void, size: LuaTable): ads_response;
	/**
	 * Check if the banner is showed
	 */
	export function is_banner_showed(this: void): boolean;
}
