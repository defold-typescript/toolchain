/** @noSelfInFile **/

/**
 * Save and load config and user data persistently between a Defold project's sessions
 * @see {@link https://github.com/subsoap/defsave|Github Source}
 * @noResolution
 */
declare module "defsave.defsave" {
  /**
   * Set to true to autosave all loaded files that are changed on a timer
   */
  export let autosave: boolean;

  /**
   * Amount of seconds between autosaves if changes have been made
   */
  export let autosave_timer: number;

  /**
   * Current timer value, only increases if autosave is enabled
   */
  export let timer: number;

  /**
   * Locally used but can be useful to have exposed
   */
  export let changed: boolean;

  /**
   * If true then more information will be printed, such as autosaves
   */
  export let verbose: boolean;

  /**
   * If true then files already loaded will never be overwritten with a reload
   */
  export let block_reloading: boolean;

  /**
   * Determines part of the path for saving files to
   */
  export let appname: string;

  /**
   * List of files currently loaded
   */
  export let loaded: LuaMap<string, unknown>;

  /**
   * System information captured at module load
   */
  export let sysinfo: ReturnType<typeof sys.get_sys_info>;

  /**
   * If true will attempt to load default data from the default_data table when loading an empty file
   */
  export let use_default_data: boolean;

  /**
   * If true then all data saved and loaded will be encrypted with AES - SLOWER
   */
  export let enable_encryption: boolean;

  /**
   * Pick an encryption key to use if you're using encryption
   */
  export let encryption_key: string;

  /**
   * If true then all data saved and loaded will be XOR obfuscated - FASTER
   */
  export let enable_obfuscation: boolean;

  /**
   * Pick an obfuscation key to use if you're using obfuscation; the longer the key the better
   */
  export let obfuscation_key: string;

  /**
   * If true then data is serialized with sys.serialize rather than encoded as JSON
   */
  export let use_serialize: boolean;

  /**
   * Default data to set files to if any cannot be loaded
   */
  export let default_data: LuaMap<string, unknown>;

  export function set_appname(name: string): void;

  /**
   * XOR the input against a key, cycling the key as needed. Defaults to obfuscation_key.
   */
  export function obfuscate(input: string, key?: string): string;

  /**
   * The save path a file resolves to, or nil when no file was given
   */
  export function get_file_path(file: string): string | undefined;

  export function load(file: string): boolean | undefined;

  export function get(file: string, key: string): unknown;

  export function set(file: string, key: string, value: any): boolean | undefined;

  export function save(file: string, force?: boolean): boolean | undefined;

  /**
   * You can save all files at once. By default, it will only actually save files with changes, but you can force saving all files by setting the force flag to true.
   * @param force false only saves changed files and true saves all files
   */
  export function save_all(force?: boolean): void;

  /**
   * Whether a key is set on a loaded file. Returns nil when the file is loaded but the key is absent.
   */
  export function key_exists(file: string, key: string): boolean | undefined;

  /**
   * Alias of key_exists
   */
  export function isset(file: string, key: string): boolean | undefined;

  /**
   * Reset a file to its default_data entry, or to empty when it has none
   */
  export function reset_to_default(file: string): boolean | undefined;

  /**
   * Whether a file is currently in the loaded list
   */
  export function is_loaded(file: string): boolean;

  /**
   * In your update, if you want autosave to be enabled, you will need to include
   */
  export function update(dt: number): void;

  /**
   * Save all loaded files; call from your script's final
   */
  export function final(): void;
}
