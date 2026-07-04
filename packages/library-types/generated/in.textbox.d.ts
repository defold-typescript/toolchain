/** @noSelfInFile */

/**
 * @see {@link https://github.com/britzl/defold-input|Github Source}
 * @noResolution
 */
declare module 'in.textbox' {
	export const TOUCH: Hash;
	export const TYPE: Hash;
	export const BACKSPACE: Hash;

	export function acquire(): void;
	export function release(): void;
	export function register(
		box_node_or_string: Opaque<"node"> | string,
		text_node_or_string: Opaque<"node"> | string,
		is_masked?: boolean,
	): Opaque<"node">;
	export function unregister(node_or_string?: Opaque<"node"> | string): void;
	export function effect(node: Opaque<"node">, scale: { x: number; y: number }): void;
	export function text(
		node_or_string: Opaque<"node"> | string,
		text?: string,
	): string | undefined;
	export function on_input(action_id: Hash, action: {}): boolean;
}
