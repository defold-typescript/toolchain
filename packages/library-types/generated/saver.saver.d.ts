/** @noResolution */
declare module 'saver.saver' {
	/**
	 * Persist data between game sessions
	 */
	interface saver_state {
		storage: LuaTable<string, unknown>;
		version: number;
		last_game_version: string;
		migration_version: number;
	}
	/**
	 * Whole game state. Add your fields here to inspect all fields
	 */
	interface saver_game_state {
		saver: saver_state;
		storage: saver_storage_state;
	}
	/**
	 * Configuration table for `saver.init` to setup all things you can in game.project file
	 */
	interface saver_config {
		save_folder?: string | undefined;
		save_name?: string | undefined;
		saver_key?: string | undefined;
		storage_key?: string | undefined;
		autosave_timer?: number | undefined;
		lua_require_as_string?: boolean | undefined;
	}
	/**
	 * Logger interface
	 */
	interface saver_logger {
		trace: (logger: saver_logger, message: string, data: unknown | undefined) => void;
		debug: (logger: saver_logger, message: string, data: unknown | undefined) => void;
		info: (logger: saver_logger, message: string, data: unknown | undefined) => void;
		warn: (logger: saver_logger, message: string, data: unknown | undefined) => void;
		error: (logger: saver_logger, message: string, data: unknown | undefined) => void;
	}
	interface saver {
	}
	/**
	 * Persist data between game sessions
	 */
	interface saver_storage_state {
		storage: LuaTable<string, saver_storage_value>;
	}
	/**
	 * One of the values in the storage
	 */
	interface saver_storage_value {
		s_value?: string | undefined;
		i_value?: number | undefined;
		b_value?: boolean | undefined;
	}
	interface saver_storage {
	}
	/**
	 * File format enum (mirrors saver_internal.FORMAT)
	 * Customize the logging mechanism used by Defold Saver.
	 * You can use Defold Log library or provide a custom logger.
	 * local log = require("log.log")
	 * local saver = require("saver.saver")
	 *
	 * saver.set_logger(log.get_logger("saver"))
	 */
	export function set_logger(this: void, logger_instance?: saver_logger | LuaTable | undefined): void;
	/**
	 * Initialize the Saver module. Should be called at the start of your game to set up the module.
	 * Call it after saver.set_migrations if you are using migrations.
	 * This function loads the game state from a file and starts the autosave timer.
	 * If the game state file does not exist, a new game state is created.
	 * saver.init()
	 */
	export function init(this: void, config?: saver_config | undefined): void;
	/**
	 * Save the current game state to a file. If no file name is provided, the default file name specified in the game.project file is used.
	 * -- Save the game with default name
	 * saver.save_game_state()
	 *
	 * -- Save the game with custom name
	 * saver.save_game_state("custom_save")
	 */
	export function save_game_state(this: void, save_name?: string | undefined): boolean;
	/**
	 * Load the game state from a file. If no file name is provided, the default file name specified in the game.project file is used.
	 * local is_loaded = saver.load_game_state() -- Load the game state with default name
	 * local is_loaded = saver.load_game_state("custom_save") -- Load the game state with custom name
	 */
	export function load_game_state(this: void, save_name?: string | undefined): boolean;
	/**
	 * Delete the game state file. Doesn't affect the current game state.
	 * If autosave is enabled, it will be rescheduled, so probably you want to immediately restart the game.
	 * -- Delete the game state with default name
	 * saver.delete_game_state()
	 *
	 * -- Delete the game state with custom name
	 * saver.delete_game_state("custom_save")
	 */
	export function delete_game_state(this: void, save_name?: string | undefined): boolean;
	/**
	 * Returns the current game state.
	 * local game_state = saver.get_game_state()
	 * pprint(game_state)
	 */
	export function get_game_state(this: void): saver_game_state;
	/**
	 * Sets the current game state to the specified state.
	 * local game_state = saver.get_game_state()
	 * game_state.game.level = 5
	 * saver.set_game_state(game_state)
	 */
	export function set_game_state(this: void, data: LuaTable): boolean;
	/**
	 * Binds a table reference as a part of the game state. When the game state is saved, all table references will be saved.
	 * This is a main function to use to save your game state. You can bind multiple tables to different parts of the game state.
	 * After binding, the table_reference will be updated with the saved data if it exists.
	 * local game_state = {
	 * level = 1,
	 * money = 100
	 * }
	 *
	 * saver.bind_save_state("game", game_state)
	 *
	 * -- If we have previously saved game state, the game_state will be changed to the saved data
	 * print(game_state.level) -- 5 (if it was saved before)
	 */
	export function bind_save_state(this: void, table_key_id: string, table_reference: LuaTable): LuaTable;
	/**
	 * Saves the specified data to a file at the specified path. The data format is chosen by file path extension.
	 * local data = {
	 * score = 100,
	 * level = 1
	 * }
	 *
	 * -- Get project path works on build from the Defold Editor only
	 * local project_path = saver.get_current_game_project_folder()
	 * -- Use path to the resources folder
	 * local file_path = saver.get_save_path(project_path .. "/resources/data.json")
	 * saver.save_file_by_path(data, file_path)
	 */
	export function save_file_by_path(this: void, data: LuaTable, path: string, format?: string | undefined): boolean;
	/**
	 * Saves the specified data to a file at the specified path. The data format is binary.
	 */
	export function save_binary_by_path(this: void, data: string, path: string): boolean;
	/**
	 * Loads the data from a file at the specified path.
	 * -- Get project path works on build from the Defold Editor only
	 * local project_path = saver.get_current_game_project_folder()
	 * -- Use path to the resources folder
	 * local file_path = saver.get_save_path(project_path .. "/resources/data.json")
	 * local data = saver.load_file_by_path(file_path)
	 * pprint(data)
	 * NOTE: For binary data like images, use `saver.load_binary_by_path` instead.
	 */
	export function load_file_by_path(this: void, path: string, format?: string | undefined): LuaTable | undefined;
	/**
	 * Loads the binary data from a file at the specified path.
	 */
	export function load_binary_by_path(this: void, path: string): string | undefined;
	/**
	 * Deletes the file at the specified path.
	 */
	export function delete_file_by_path(this: void, path: string): boolean;
	/**
	 * Checks if the file exists at the specified path.
	 * local is_project_file_exists = saver.is_file_exists_by_path(absolute_path_to_file)
	 */
	export function is_file_exists_by_path(this: void, path: string): boolean;
	/**
	 * Saves the specified data to a file with the specified name. The file is saved in the game save folder. Filename supports subfolders.
	 * local data = {
	 * score = 100,
	 * level = 1
	 * }
	 *
	 * -- Save the data to the game save folder
	 * saver.save_file_by_name(data, "data.json")
	 */
	export function save_file_by_name(this: void, data: LuaTable, filename: string, format?: string | undefined): boolean;
	/**
	 * Saves the specified data to a file with the specified name. The data format is binary.
	 */
	export function save_binary_by_name(this: void, data: string, filename: string): boolean;
	/**
	 * Loads the data from a file with the specified name. The file is loaded from the game save folder. Filename supports subfolders.
	 * local data = saver.load_file_by_name("data.json")
	 * pprint(data)
	 * NOTE: For binary data like images, use saver.load_binary_by_name instead.
	 */
	export function load_file_by_name(this: void, filename: string, format?: string | undefined): LuaTable | undefined;
	/**
	 * Loads the binary data from a file with the specified name. The file is loaded from the game save folder. Filename supports subfolders.
	 */
	export function load_binary_by_name(this: void, filename: string): string | undefined;
	/**
	 * Deletes the file with the specified name. The file is deleted from the game save folder. Filename supports subfolders.
	 * saver.delete_file_by_name("data.json")
	 */
	export function delete_file_by_name(this: void, filename: string): boolean;
	/**
	 * Checks if the file exists with the specified name. The file is checked in the game save folder. Filename supports subfolders.
	 */
	export function is_file_exists_by_name(this: void, filename: string): boolean;
	/**
	 * Returns the absolute path to the game save folder. If a file name is provided, the path to the file in the game save folder is returned. Filename supports subfolders.
	 * local folder_path = saver.get_save_path()
	 * print(folder_path) -- "/Users/user/Library/Application Support/Defold Saver/"
	 *
	 * local file_path = saver.get_save_path("data.json")
	 * print(file_path) -- "/Users/user/Library/Application Support/Defold Saver/data.json"
	 *
	 * local file_path_2 = saver.get_save_path("profiles/profile1.json")
	 * print(file_path_2) -- "/Users/user/Library/Application Support/Defold Saver/profiles/profile1.json"
	 */
	export function get_save_path(this: void, filename?: string | undefined): string;
	/**
	 * Returns the current save version of the game state. The save version is used to check if the game state is older than the current version. The save version increments when the game state is saved.
	 * local save_version = saver.get_save_version()
	 * print(save_version)
	 */
	export function get_save_version(this: void): number;
	/**
	 * Sets the autosave timer to the specified number of seconds. The autosave timer is used to automatically save the game state at regular intervals.
	 * Use 0 to disable autosave.
	 * saver.set_autosave_timer(5) -- Autosave every 5 seconds
	 * saver.set_autosave_timer(0) -- Disable autosave
	 */
	export function set_autosave_timer(this: void, timer: number): void;
	/**
	 * Returns the current autosave timer.
	 */
	export function get_autosave_timer(this: void): number;
	/**
	 * Returns the absolute path to the current game project folder. It is useful when you need to save or load files from the game project folder at development.
	 * Returns nil if the game project folder is not found. Used only at desktop platforms and if game started from the Defold Editor.
	 * local project_folder = saver.get_current_game_project_folder()
	 * print(project_folder) -- "/Users/user/projects/my_game"
	 */
	export function get_current_game_project_folder(this: void): string | undefined;
	/**
	 * Sets the list of migrations to apply after loading the game state manually with saver.apply_migrations() function.
	 * Migrations are used to update the game state in case of changes to the game state structure.
	 * Migrations are applied in order. Each migration should be a function that takes the game state as a parameter and returns the updated game state.
	 * local migrations = {
	 * -- Migration 1
	 * function(game_state, logger)
	 * -- Assume we have new level_data field in the game state and we need to move level and score to it
	 * game_state.game.level_data = {
	 * level = game_state.game.level,
	 * score = game_state.game.score
	 * }
	 * game_state.game.level = nil
	 * game_state.game.score = nil
	 * return game_state
	 * },
	 * -- Migration 2
	 * function(game_state, logger)
	 * -- Just an example, multiply the score by 1000. For example we changed our score system
	 * game_state.game.level_data.score = game_state.game.level_data.score * 1000
	 * return game_state
	 * }
	 * }
	 *
	 * saver.set_migrations(migrations)
	 * saver.init()
	 * saver.bind_save_state("game", game_state)
	 * saver.apply_migrations()
	 */
	export function set_migrations(this: void, migrations_table: ((game_state: saver_game_state, logger: saver_logger) => undefined)[]): void;
	/**
	 * Applies the migrations set by saver.set_migrations function. It should be called after loading the game state manually with saver.init() function.
	 * saver.apply_migrations()
	 */
	export function apply_migrations(this: void): void;
	/**
	 * Gets the value from the saver storage. If the value does not exist, it will return the default value.
	 */
	export function get_value<T>(this: void, key_id: string, default_value?: T | undefined): T;
	/**
	 * Sets the value in the saver storage.
	 */
	export function set_value(this: void, key_id: string, value: unknown): void;
	/**
	 * Checks if the value exists in the saver storage.
	 */
	export function is_value_exists(this: void, key_id: string): boolean;
}
