/** @noSelfInFile */
import type { Opaque } from "../src/core-types";

declare global {
  /**
   * Editor scripting documentation
   */
  namespace editor {
    /**
     * A string, SHA1 of Defold editor
     */
    const editor_sha1: unknown;
    /**
     * A string, SHA1 of Defold engine
     */
    const engine_sha1: unknown;
    /**
     * Editor platform id.
     * A `string`, either:
     * - `"x86_64-win32"`
     * - `"x86_64-macos"`
     * - `"arm64-macos"`
     * - `"x86_64-linux"`
     */
    const platform: unknown;
    /**
     * A string, version name of Defold
     */
    const version: unknown;
    /**
     * Run bob the builder program
     * For the full documentation of the available commands and options, see the bob manual.
     *
     * @param options - table of command line options for bob, without the leading dashes (`--`). You can use snake_case instead of kebab-case for option keys. Only long option names are supported (i.e. `output`, not `o`). Supported value types are strings, integers and booleans. If an option takes no arguments, use a boolean (i.e. `true`). If an option may be repeated, you can use an array of values.
     * @param commands - bob commands, e.g. `"resolve"` or `"build"`
     * @example
     * ```ts
     * // Print help in the console:
     * editor.bob({ help: true });
     *
     * // Bundle the game for the host platform:
     * const opts = { archive: true, platform: editor.platform };
     * editor.bob(opts, "distclean", "resolve", "build", "bundle");
     *
     * // Using snake_cased and repeated options:
     * const bundleOpts = {
     *   archive: true,
     *   platform: editor.platform,
     *   build_server: "https://build.my-company.com",
     *   settings: ["test.ini", "headless.ini"],
     * };
     * editor.bob(bundleOpts, "distclean", "resolve", "build");
     * ```
     */
    function bob(options?: Record<string | number, unknown>, ...commands: string[]): void;
    /**
     * Open a URL in the default browser or a registered application
     *
     * @param url - http(s) or file URL
     */
    function browse(url: string): void;
    /**
     * Check if `editor.tx.add()` (as well as `editor.tx.clear()` and `editor.tx.remove()`) transaction with this property won't throw an error
     *
     * @param node - Either resource path (e.g. `"/main/game.script"`), or internal node id passed to the script by the editor
     * @param property - Either `"path"`, `"text"`, or a property from the Outline view (hover the label to see its editor script name)
     */
    function can_add(node: string | Opaque<"userdata">, property: string): boolean;
    /**
     * Check if you can get this property so `editor.get()` won't throw an error
     *
     * @param node - Either resource path (e.g. `"/main/game.script"`), or internal node id passed to the script by the editor
     * @param property - Either `"path"`, `"text"`, or a property from the Outline view (hover the label to see its editor script name)
     */
    function can_get(node: string | Opaque<"userdata">, property: string): boolean;
    /**
     * Check if `editor.tx.reorder()` transaction with this property won't throw an error
     *
     * @param node - Either resource path (e.g. `"/main/game.script"`), or internal node id passed to the script by the editor
     * @param property - Either `"path"`, `"text"`, or a property from the Outline view (hover the label to see its editor script name)
     */
    function can_reorder(node: string | Opaque<"userdata">, property: string): boolean;
    /**
     * Check if `editor.tx.reset()` transaction with this property won't throw an error
     *
     * @param node - Either resource path (e.g. `"/main/game.script"`), or internal node id passed to the script by the editor
     * @param property - Either `"path"`, `"text"`, or a property from the Outline view (hover the label to see its editor script name)
     */
    function can_reset(node: string | Opaque<"userdata">, property: string): boolean;
    /**
     * Check if `editor.tx.set()` transaction with this property won't throw an error
     *
     * @param node - Either resource path (e.g. `"/main/game.script"`), or internal node id passed to the script by the editor
     * @param property - Either `"path"`, `"text"`, or a property from the Outline view (hover the label to see its editor script name)
     */
    function can_set(node: string | Opaque<"userdata">, property: string): boolean;
    /**
     * Create an editor command
     *
     * @param opts - A table with the following keys:`label string, message`required, user-visible command name, either a string or a localization message`locations string[]`required, a non-empty list of locations where the command is displayed in the editor, values are either `"Edit"`, `"View"`, `"Project"`, `"Debug"` (the editor menubar), `"Assets"` (the assets pane), or `"Outline"` (the outline pane)`query table`optional, a query that both controls the command availability and provides additional information to the command handler functions; a table with the following keys:`selection table`current selection, a table with the following keys:`type string`either `"resource"` (selected resource) or `"outline"` (selected outline node)`cardinality string`either `"one"` (will use first selected item) or `"many"` (will use all selected items)`argument table`the command argument`id string`optional, keyword identifier that may be used for assigning a shortcut to a command; should be a dot-separated identifier string, e.g. `"my-extension.do-stuff"``active function`optional function that additionally checks if a command is active in the current context; will receive opts table with values populated by the query; should be fast to execute since the editor might invoke it in response to UI interactions (on key typed, mouse clicked)`run function`optional function that is invoked when the user decides to execute the command; will receive opts table with values populated by the query
     * @example
     * ```ts
     * // Print Git history for a file:
     * editor.command({
     *   label: "Git History",
     *   query: { selection: { type: "resource", cardinality: "one" } },
     *   run: (opts) => {
     *     editor.execute("git", "log", "--follow", `.${editor.get(opts.selection, "path")}`, {
     *       reload_resources: false,
     *     });
     *   },
     * });
     * ```
     */
    function command(opts: Record<string | number, unknown>): Opaque<"command">;
    /**
     * Create a directory if it does not exist, and all non-existent parent directories.
     * Throws an error if the directory can't be created.
     *
     * @param resource_path - Resource path (starting with `/`)
     * @example
     * ```ts
     * editor.create_directory("/assets/gen");
     * ```
     */
    function create_directory(resource_path: string): void;
    /**
     * Create resources (including non-existent parent directories).
     * Throws an error if any of the provided resource paths already exist
     *
     * @param resources - ] Array of resource paths (strings starting with `/`) or resource definitions, lua tables with the following keys:`1 string`required, resource path (starting with `/`)`2 string`optional, created resource content
     * @example
     * ```ts
     * // Create a single resource from template:
     * editor.create_resources(["/npc.go"]);
     *
     * // Create multiple resources:
     * editor.create_resources(["/npc.go", "/levels/1.collection", "/levels/2.collection"]);
     *
     * // Create a resource with custom content:
     * editor.create_resources([["/npc.script", "go.property('hp', 100)"]]);
     * ```
     */
    function create_resources(resources: unknown): void;
    /**
     * Delete a directory if it exists, and all existent child directories and files.
     * Throws an error if the directory can't be deleted.
     *
     * @param resource_path - Resource path (starting with `/`)
     * @example
     * ```ts
     * editor.delete_directory("/assets/gen");
     * ```
     */
    function delete_directory(resource_path: string): void;
    /**
     * Execute a shell command.
     * Any shell command arguments should be provided as separate argument strings to this function. If the exit code of the process is not zero, this function throws error. By default, the function returns `nil`, but it can be configured to capture the output of the shell command as string and return it — set `out` option to `"capture"` to do it.
     * By default, after this shell command is executed, the editor will reload resources from disk.
     *
     * @param command - Shell command name to execute
     * @param args - Optional shell command arguments
     * @param options - Optional options table. Supported entries:
     * - boolean `reload_resources`: make the editor reload the resources from disk after the command is executed, default `true`
     * - string `out`: standard output mode, either:
     * - `"pipe"`: the output is piped to the editor console (this is the default behavior).
     * - `"capture"`: capture and return the output to the editor script with trailing newlines trimmed.
     * - `"discard"`: the output is discarded completely.
     * - string `err`: standard error output mode, either:
     * - `"pipe"`: the error output is piped to the editor console (this is the default behavior).
     * - `"stdout"`: the error output is redirected to the standard output of the process.
     * - `"discard"`: the error output is discarded completely.
     * @returns If `out` option is set to `"capture"`, returns the output as string with trimmed trailing newlines. Otherwise, returns `nil`.
     * @example
     * ```ts
     * // Make a directory with spaces in it:
     * editor.execute("mkdir", "new dir");
     *
     * // Read the git status:
     * const status = editor.execute("git", "status", "--porcelain", {
     *   reload_resources: false,
     *   out: "capture",
     * });
     * ```
     */
    function execute(command: string, ...args: (string | { reload_resources?: boolean; out?: string; err?: string })[]): undefined | string;
    /**
     * Query information about file system path
     *
     * @param path - External file path, resolved against project root if relative
     * @returns A table with the following keys: `path string` resolved file path `exists boolean` whether there is a file system entry at the path `is_file boolean` whether the path corresponds to a file `is_directory boolean` whether the path corresponds to a directory
     */
    function external_file_attributes(path: string): Record<string | number, unknown>;
    /**
     * Get a value of a node property inside the editor.
     * Some properties might be read-only, and some might be unavailable in different contexts, so you should use `editor.can_get()` before reading them and `editor.can_set()` before making the editor set them.
     *
     * @param node - Either resource path (e.g. `"/main/game.script"`), or internal node id passed to the script by the editor
     * @param property - Either `"path"`, `"text"`, or a property from the Outline view (hover the label to see its editor script name)
     * @returns property value
     */
    function get(node: string | Opaque<"userdata">, property: string): unknown;
    /**
     * Open a file in a registered application
     *
     * @param path - file path
     */
    function open_external_file(path: string): void;
    /**
     * List property names for a node.
     * The result is context-sensitive and can vary by node/resource type and editor state. Returned names are readable with `editor.get(node, property)`. Mutating capabilities are per-property; use `editor.can_set()`, `editor.can_reset()`, `editor.can_add()`, and `editor.can_reorder()` to check which operations are supported.
     *
     * @param node - Either resource path (e.g. `"/main/game.script"`), or internal node id passed to the script by the editor
     * @returns ] sorted unique editor property names available in the current context
     */
    function properties(node: string | Opaque<"userdata">): unknown;
    /**
     * Query information about a project resource
     *
     * @param resource_path - Resource path (starting with `/`)
     * @returns A table with the following keys:`exists boolean`whether a resource identified by the path exists in the project`is_file boolean`whether the resource represents a file with some content`is_directory boolean`whether the resource represents a directory
     */
    function resource_attributes(resource_path: string): Record<string | number, unknown>;
    /**
     * Persist any unsaved changes to disk
     */
    function save(): void;
    /**
     * Change the editor state in a single, undoable transaction
     *
     * @param txs - ] An array of transaction steps created using `editor.tx.*` functions
     */
    function transact(txs: Opaque<"transaction_step">[]): void;
    namespace tx {
      /**
       * Create a transaction step that will add a child item to a node's list property when transacted with `editor.transact()`.
       *
       * @param node - Either resource path (e.g. `"/main/game.script"`), or internal node id passed to the script by the editor
       * @param property - Either `"path"`, `"text"`, or a property from the Outline view (hover the label to see its editor script name)
       * @param value - Added item for the property, a table from property key to either a valid `editor.tx.set()`-able value, or an array of valid `editor.tx.add()`-able values
       */
      function add(node: string | Opaque<"userdata">, property: string, value: unknown): Opaque<"transaction_step">;
      /**
       * Create a transaction step that will remove all items from node's list property when transacted with `editor.transact()`.
       *
       * @param node - Either resource path (e.g. `"/main/game.script"`), or internal node id passed to the script by the editor
       * @param property - Either `"path"`, `"text"`, or a property from the Outline view (hover the label to see its editor script name)
       * @returns A transaction step
       */
      function clear(node: string | Opaque<"userdata">, property: string): Opaque<"transaction_step">;
      /**
       * Create a transaction step that will remove a child node from the node's list property when transacted with `editor.transact()`.
       *
       * @param node - Either resource path (e.g. `"/main/game.script"`), or internal node id passed to the script by the editor
       * @param property - Either `"path"`, `"text"`, or a property from the Outline view (hover the label to see its editor script name)
       * @param child_node - Either resource path (e.g. `"/main/game.script"`), or internal node id passed to the script by the editor
       * @returns A transaction step
       */
      function remove(node: string | Opaque<"userdata">, property: string, child_node: string | Opaque<"userdata">): Opaque<"transaction_step">;
      /**
       * Create a transaction step that reorders child nodes in a node list defined by the property if supported (see `editor.can_reorder()`)
       *
       * @param node - Either resource path (e.g. `"/main/game.script"`), or internal node id passed to the script by the editor
       * @param property - Either `"path"`, `"text"`, or a property from the Outline view (hover the label to see its editor script name)
       * @param child_nodes - array of child nodes (the same as returned by `editor.get(node, property)`) in new order
       * @returns A transaction step
       */
      function reorder(node: string | Opaque<"userdata">, property: string, child_nodes: Record<string | number, unknown>): Opaque<"transaction_step">;
      /**
       * Create a transaction step that will reset an overridden property to its default value when transacted with `editor.transact()`.
       *
       * @param node - Either resource path (e.g. `"/main/game.script"`), or internal node id passed to the script by the editor
       * @param property - Either `"path"`, `"text"`, or a property from the Outline view (hover the label to see its editor script name)
       * @returns A transaction step
       */
      function reset(node: string | Opaque<"userdata">, property: string): Opaque<"transaction_step">;
      /**
       * Create transaction step that will set the node's property to a supplied value when transacted with `editor.transact()`.
       *
       * @param node - Either resource path (e.g. `"/main/game.script"`), or internal node id passed to the script by the editor
       * @param property - Either `"path"`, `"text"`, or a property from the Outline view (hover the label to see its editor script name)
       * @param value - A new value for the property
       * @returns A transaction step
       */
      function set(node: string | Opaque<"userdata">, property: string, value: unknown): Opaque<"transaction_step">;
    }
  }
}

export {};
