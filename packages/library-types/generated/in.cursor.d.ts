/** @noSelfInFile */

/**
 * @see {@link https://github.com/britzl/defold-input|Github Source}
 * @noResolution
 */
declare module 'in.cursor' {
	export const OVER: Hash;
	export const OUT: Hash;
	export const PRESSED: Hash;
	export const RELEASED: Hash;
	export const DRAG: Hash;
	export const DRAG_END: Hash;
	export const DRAG_START: Hash;
	export const CLICKED: Hash;
	export const RESET: Hash;
	export const START_DRAGGING: Hash;
	export const DRAG_MODE_HORIZONTAL: Hash;
	export const DRAG_MODE_VERTICAL: Hash;
	export const DRAG_MODE_FREE: Hash;

	type ListenerFunction = (message_id: Hash | string, message: {}) => boolean;

	export function trigger(message_id: Hash | string, message: {}): boolean;
	export function listen(
		cursor_url: Url,
		message_id: Hash,
		fn: ListenerFunction,
	): void;
	export function init(): void;
	export function final(): void;
	export function reset(cursor_url?: Url): void;
}
