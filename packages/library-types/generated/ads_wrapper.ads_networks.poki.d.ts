/** @noResolution */
declare module 'ads_wrapper.ads_networks.poki' {
	import type { ads_callback, ads_response } from 'ads_wrapper.ads_wrapper';
	interface poki_rewarded_params {
		size?: string | undefined;
		start_callback?: ((...args: any[]) => unknown) | undefined;
	}
	interface poki_interstitial_params {
		start_callback?: ((...args: any[]) => unknown) | undefined;
	}
	interface poki_operation {
		callback?: ads_callback | undefined;
		params: LuaTable;
	}
	export function is_supported(this: void): boolean;
	export function setup(this: void, params?: LuaTable | undefined): void;
	export function init(this: void, callback?: ads_callback | undefined): void;
	export function is_initialized(this: void): boolean;
	export function show_rewarded(this: void, callback?: ads_callback | undefined, params?: poki_rewarded_params | undefined): void;
	export function load_rewarded(this: void, callback?: ads_callback | undefined): void;
	export function is_rewarded_loaded(this: void): boolean;
	export function cancel_rewarded(this: void, operation?: string | undefined, reason?: string | undefined): void;
	export function show_interstitial(this: void, callback?: ads_callback | undefined, params?: poki_interstitial_params | undefined): void;
	export function load_interstitial(this: void, callback?: ads_callback | undefined): void;
	export function is_interstitial_loaded(this: void): boolean;
	export function cancel_interstitial(this: void, operation?: string | undefined, reason?: string | undefined): void;
	export function is_banner_setup(this: void): boolean;
	export function load_banner(this: void, callback?: ads_callback | undefined): void;
	export function unload_banner(this: void, callback?: ads_callback | undefined): void;
	export function is_banner_loaded(this: void): boolean;
	export function show_banner(this: void, callback?: ads_callback | undefined): void;
	export function hide_banner(this: void, callback?: ads_callback | undefined): void;
	export function is_banner_showed(this: void): boolean;
}
