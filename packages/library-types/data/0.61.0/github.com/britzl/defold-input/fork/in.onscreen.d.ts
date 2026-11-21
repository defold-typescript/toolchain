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

	/** What a control's callback receives (`onscreen.lua:32`): the touch position, the
	 * control's node id, and whether it is pressed or was just released. */
	type ControlData = {
		x: number;
		y: number;
		id: Hash;
		pressed: boolean;
		released?: boolean;
	};

	type ControlCallback = (action: Hash, node: Opaque<"node">, data: ControlData) => void;

	type OnscreenInstance = {
		reset: () => void;
		register_button: (
			node: Opaque<"node">,
			settings: object | undefined,
			fn: ControlCallback,
		) => void;
		register_analog: (
			node: Opaque<"node">,
			settings: { radius?: number; threshold?: number } | undefined,
			fn: ControlCallback,
		) => void;
		on_input: (
			action_id: Hash | undefined,
			action: Partial<go.on_input.Action>,
		) => boolean;
	};

	/**
	 * Create an instance of the onscreen controls.
	 * @param config Optional settings. `touch` is the action id bound to single touch.
	 * @returns The instance the register and input functions operate on.
	 */
	function create(config?: { touch: Hash }): OnscreenInstance;

	export function reset(instance?: OnscreenInstance): void;

	export function register_button(
		node: Opaque<"node">,
		settings: object | undefined,
		fn: ControlCallback,
		instance?: OnscreenInstance,
	): void;

	export function register_analog(
		node: Opaque<"node">,
		settings: { radius?: number; threshold?: number } | undefined,
		fn: ControlCallback,
		instance?: OnscreenInstance,
	): void;

	export function on_input(
		action_id: Hash | undefined,
		action: Partial<go.on_input.Action>,
		instance?: OnscreenInstance,
	): boolean;
}
