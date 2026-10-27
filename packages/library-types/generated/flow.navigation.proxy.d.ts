/** @noResolution */
declare module 'flow.navigation.proxy' {
	import type { Flow_Navigation, Flow_ProxyAttachOptions } from 'flow.types';
	/**
	 * Attach the collection proxy runtime to a navigation instance.
	 * Registers "preload" and "changed" event listeners so proxies are
	 * managed automatically as screens are navigated.
	 *
	 * When opts.sync_existing is true (the default), immediately preloads
	 * all already-registered screens with preload=true, and syncs the current
	 * active proxy if a screen is already on the stack.
	 */
	export function attach(this: void, nav?: Flow_Navigation | undefined, opts?: Flow_ProxyAttachOptions | undefined): LuaTable;
	/**
	 * Remove all navigation event listeners and clean up the runtime.
	 * Call this in your bootstrap script's final() function to prevent
	 * leaked listeners after the script is destroyed.
	 */
	export function detach(this: void, self: LuaMap<string, unknown> | Record<string, unknown>): void;
}
