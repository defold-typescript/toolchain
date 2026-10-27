/** @noResolution */
declare module 'flow.navigation.runtime' {
	import type { Flow_RuntimeConfig } from 'flow.types';
	/**
	 * Initialize navigation for a non-GUI script.
	 * Registers screens, optionally attaches the collection proxy runtime,
	 * and navigates to the initial screen if specified.
	 *
	 * Stores state in self.navigation and self.navigation_runtime so it can be
	 * accessed from on_message() and cleaned up in final().
	 */
	export function init(this: void, self: LuaMap<string, unknown> | Record<string, unknown>, config?: Flow_RuntimeConfig): LuaTable;
	/**
	 * Clean up the navigation runtime for a non-GUI script.
	 * Detaches the proxy runtime (if any) to remove event listeners.
	 * Call this from the .script final() lifecycle function.
	 */
	export function final(this: void, self: LuaMap<string, unknown> | Record<string, unknown>): void;
	/**
	 * Handle an incoming Defold message and route it to navigation.
	 * Delegates to navigation_messages.on_message() which dispatches
	 * push/pop/replace/reset/back/invalidate messages.
	 * Returns true when the message was consumed by navigation.
	 */
	export function on_message(this: void, self: LuaMap<string, unknown> | Record<string, unknown>, message_id: Hash | string, message?: LuaMap<string, unknown> | Record<string, unknown>, sender?: Url): boolean;
}
