/** @noSelfInFile **/

/**
 * @see {@link https://github.com/Klaleus/defold-checkpoint|Github Source}
 * @noResolution
 * @example `import * as checkpoint from 'checkpoint.checkpoint'`
 */
declare module 'checkpoint.checkpoint' {
	/**
	 * The `project.title` from game.project, read once when the module loads. It is
	 * the name the save directory is derived from.
	 */
	const project_title: string;

	/**
	 * The absolute path of the project's save directory, resolved once when the
	 * module loads. Every path the other members take is relative to it, and `list`
	 * returns paths relative to it. Ends with a separator, e.g.
	 * `/home/klaleus/.local/share/defold-checkpoint/`.
	 */
	const project_save_path: string;

	/**
	 * Loads a saved file. A path ending in `.json` is read as text and decoded with
	 * `json.decode`; anything else is loaded with `sys.load`. On success the loaded
	 * value is returned alone, so the error slot is absent; on any failure — the file
	 * missing, unreadable, or holding invalid content — the first value is `false` and
	 * the second is the error string. Name the saved shape through the type parameter
	 * to avoid casting at the call site.
	 * @param path Path relative to `project_save_path`.
	 * @returns The loaded value, or `false` and the error that stopped it.
	 */
	function read<T = unknown>(path: string): LuaMultiReturn<[T | false, string | undefined]>;

	/**
	 * Saves a value, creating any missing directories along the path first. A path
	 * ending in `.json` is encoded with `json.encode` and written as text and flushed
	 * immediately; anything else is written with `sys.save`. Creating the directories
	 * goes through `lfs`, so the project needs `britzl/defold-lfs` as a dependency;
	 * this corpus does not type it.
	 * @param path Path relative to `project_save_path`.
	 * @param data The value to save.
	 * @returns `true`, or `false` and the error that stopped it.
	 */
	function write(path: string, data: unknown): LuaMultiReturn<[boolean, string | undefined]>;

	/**
	 * Whether a saved file exists. Returns a real boolean rather than the underlying
	 * file attributes, so it reads directly as a condition. Goes through `lfs`, so the
	 * project needs `britzl/defold-lfs` as a dependency.
	 * @param path Path relative to `project_save_path`.
	 */
	function exists(path: string): boolean;

	/**
	 * Every saved file, found by walking the save directory breadth-first. Directories
	 * are descended into rather than listed. Goes through `lfs`, so the project needs
	 * `britzl/defold-lfs` as a dependency.
	 * @returns The file paths, relative to `project_save_path`.
	 */
	function list(): string[];
}
