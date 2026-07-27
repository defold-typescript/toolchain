/** @noResolution */
declare module 'immutable.immutable' {
	interface Immutable {
	}
	/**
	 * Checks if a given table `table_to_check` is immutable
	 */
	export function is_immutable(this: void, table_to_check: LuaTable | Immutable): boolean;
	/**
	 * Makes a given table immutable, including nested tables
	 */
	export function make(this: void, original_table: LuaTable | Immutable): Immutable;
}
