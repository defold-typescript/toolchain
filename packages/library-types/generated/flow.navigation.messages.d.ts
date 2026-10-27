/** @noResolution */
declare module 'flow.navigation.messages' {
	/**
	 * Map of all supported message ids keyed by operation name.
	 * Message id for navigation.push — payload: {id, params?, options?}
	 * Message id for navigation.pop — payload: {result?, options?}
	 * Message id for navigation.replace — payload: {id, params?, options?}
	 * Message id for navigation.reset — payload: {id, params?, options?}
	 * Message id for navigation.back — payload: {result?, options?}
	 * Message id for navigation.invalidate — no payload required
	 * Handle an incoming Defold message and dispatch it to the navigation module.
	 * Returns true when the message was a recognized navigation message and was handled.
	 * Returns false for all other messages so callers can chain additional handlers.
	 *
	 * Supported message payloads:
	 * PUSH/REPLACE/RESET: { id = "screen_id", params = {}, options = {} }
	 * POP/BACK:           { result = {}, options = {} }
	 * INVALIDATE:         no payload needed
	 */
	export function on_message(this: void, message_id: Hash | string, message?: LuaMap<string, unknown> | Record<string, unknown>): boolean;
}
