/** @noSelfInFile */

/**
 * This is a definition stub with incomplete or untested signatures.
 * Contributions to improve the accuracy of these types are welcome.
 * @see {@link https://github.com/britzl/defold-input|Github Source}
 * @noResolution
 */
declare module 'in.mapper' {
	/**
	 * The in-game action a trigger is bound to, as given: any value `assert(action)`
	 * accepts, a table included, stored and returned unread.
	 */
	type MappedAction = Hash | string | number | true | object;

	/**
	 * @param gamepad - Gamepad index to bind the trigger to. **0️⃣ 0-based; passed to `in.mapper` unchanged.**
	 */
	export function bind(
		trigger: Hash,
		action: MappedAction,
		player?: any,
		gamepad?: any,
	): MappedAction | undefined;
	export function unbind(trigger: Hash, player?: any): void;
	export function unbind_all(player?: any): void;
	/**
	 * @param gamepad - Gamepad index the trigger came from, `action.gamepad`. **0️⃣ 0-based; passed to `in.mapper` unchanged.**
	 */
	export function on_input(
		trigger: Hash | undefined,
		player?: any,
		gamepad?: any,
	): MappedAction | undefined;
}
