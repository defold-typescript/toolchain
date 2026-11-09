/** @noSelfInFile */

/**
 * This is a definition stub with incomplete or untested signatures.
 * Contributions to improve the accuracy of these types are welcome.
 * @see {@link https://github.com/britzl/defold-input|Github Source}
 * @noResolution
 */
declare module 'in.mapper' {
	/**
	 * @param gamepad - Gamepad index to bind the trigger to. **0️⃣ 0-based; passed to `in.mapper` unchanged.**
	 */
	export function bind(
		trigger: {},
		action: {},
		player?: any,
		gamepad?: any,
	): unknown;
	export function unbind(trigger: {}, player?: any): void;
	export function unbind_all(player?: any): void;
	/**
	 * @param gamepad - Gamepad index the trigger came from, `action.gamepad`. **0️⃣ 0-based; passed to `in.mapper` unchanged.**
	 */
	export function on_input(
		trigger: {},
		player?: any,
		gamepad?: any,
	): {} | undefined;
}
