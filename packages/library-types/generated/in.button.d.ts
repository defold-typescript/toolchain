/** @noSelfInFile */

/**
 * @see {@link https://github.com/britzl/defold-input|Github Source}
 * @noResolution
 */
declare module 'in.button' {
	export const TOUCH: Hash;

	export function acquire(): void;
	export function release(): void;
	export function register(
		node_or_string: Opaque<"node"> | string,
		callback: () => void,
	): Opaque<"node">;
	export function unregister(node_or_string?: Opaque<"node"> | string): void;
	export function dump(): void;
	export function effect(node: Opaque<"node">, initial_scale: Vector3): void;
	export function on_input(action_id: Hash, action: {}): boolean;
}
