/** @noResolution */
declare module 'ads_wrapper.ads_networks.poki_legacy' {
	import type { ads_callback, ads_response } from 'ads_wrapper.ads_wrapper';
	interface rewarded_params {
		size: string;
		start_callback: (...args: any[]) => unknown;
	}
	interface interstitial_params {
		start_callback: (...args: any[]) => unknown;
	}
	export function setup(this: void, params: LuaTable): void;
	export function init(this: void, callback?: ads_callback | undefined): void;
	/**
	 * Check if the environment supports poki sdk
	 */
	export function is_supported(this: void): boolean;
	/**
	 * Check if the poki is initialized
	 */
	export function is_initialized(this: void): boolean;
	export function show_rewarded(this: void, callback?: ads_callback | undefined, params?: rewarded_params | undefined): void;
	export function load_rewarded(this: void, callback?: ads_callback | undefined): void;
	export function is_rewarded_loaded(this: void): boolean;
	export function show_interstitial(this: void, callback?: ads_callback | undefined, params?: interstitial_params | undefined): void;
	export function load_interstitial(this: void, callback?: ads_callback | undefined): void;
	export function is_interstitial_loaded(this: void): boolean;
	/**
	 * Not supported. Always `false`
	 */
	export function is_banner_setup(this: void): boolean;
	/**
	 * Not supported.
	 */
	export function load_banner(this: void, callback?: ads_callback | undefined): void;
	/**
	 * Not supported.
	 */
	export function unload_banner(this: void, callback?: ads_callback | undefined): void;
	/**
	 * Not supported. Always `false`
	 */
	export function is_banner_loaded(this: void): boolean;
	/**
	 * Not supported.
	 */
	export function show_banner(this: void, callback?: ads_callback | undefined): void;
	/**
	 * Not supported.
	 */
	export function hide_banner(this: void, callback?: ads_callback | undefined): void;
	/**
	 * Not supported.
	 */
	export function set_banner_position(this: void, position: unknown): ads_response;
	/**
	 * Not supported.
	 */
	export function set_banner_size(this: void, size: unknown): ads_response;
	/**
	 * Not supported. Always `false`
	 */
	export function is_banner_showed(this: void): boolean;
}
