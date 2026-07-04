/** @noSelfInFile */

/**
 * @see {@link https://github.com/britzl/defold-input|Github Source}
 * @noResolution
 */
declare module 'in.onscreen' {
	export const BUTTON: Hash;
	export const ANALOG: Hash;
	export const BUTTON_PRESSED: Hash;
	export const BUTTON_RELEASED: Hash;
	export const ANALOG_PRESSED: Hash;
	export const ANALOG_RELEASED: Hash;
	export const ANALOG_MOVED: Hash;
	export const ANALOG_LEFT: Hash;
	export const ANALOG_RIGHT: Hash;
	export const ANALOG_UP: Hash;
	export const ANALOG_DOWN: Hash;

	type OnscreenInstance = {
		reset: () => void;
		register_button: (
			node: Opaque<"node">,
			settings: {} | undefined,
			fn: (action: Hash, node: Opaque<"node">, touch: {}) => void,
		) => void;
		register_analog: (
			node: Opaque<"node">,
			settings: { radius?: number; threshold?: number } | undefined,
			fn: (action: Hash, node: Opaque<"node">, touch: {}) => void,
		) => void;
		on_input: (action_id: Hash, action: {}) => boolean;
	};

	function create(config?: { touch: Hash }): OnscreenInstance;

	export function reset(instance?: OnscreenInstance): void;

	export function register_button(
		node: Opaque<"node">,
		settings: {} | undefined,
		fn: (action: Hash, node: Opaque<"node">, touch: {}) => void,
		instance?: OnscreenInstance,
	): void;

	export function register_analog(
		node: Opaque<"node">,
		settings: { radius?: number; threshold?: number } | undefined,
		fn: (action: Hash, node: Opaque<"node">, touch: {}) => void,
		instance?: OnscreenInstance,
	): void;

	export function on_input(
		action_id: Hash,
		action: {},
		instance?: OnscreenInstance,
	): boolean;
}
