/** @noResolution */
declare module 'immutable.immutable' {
	interface Immutable_Immutable_class_to_convert_any_table_into_runtime_read_only_table {
	}
	/**
	 * Checks if a given table `table_to_check` is immutable
	 */
	export function is_immutable(this: void, table_to_check: LuaTable | unknown): boolean;
	/**
	 * Makes a given table immutable, including nested tables
	 */
	export function make(this: void, original_table: LuaTable | unknown): unknown;
}
