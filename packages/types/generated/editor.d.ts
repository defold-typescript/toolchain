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
    namespace prefs {
      /**
       * Get preference value
       * The schema for the preference value should be defined beforehand.
       *
       * @param key - dot-separated preference key path
       * @returns current pref value or default if a schema for the key path exists, nil otherwise
       */
      function get(key: string): unknown;
      /**
       * Check if preference value is explicitly set
       * The schema for the preference value should be defined beforehand.
       *
       * @param key - dot-separated preference key path
       * @returns flag indicating if the value is explicitly set
       */
      function is_set(key: string): boolean;
      /**
       * Set preference value
       * The schema for the preference value should be defined beforehand.
       *
       * @param key - dot-separated preference key path
       * @param value - new pref value to set
       */
      function set(key: string, value: unknown): void;
      namespace schema {
        /**
         * array schema
         *
         * @param opts - Required opts: `item schema`array item schema Optional opts: `default item[]`default value`scope string`preference scope; either:
         * - `editor.prefs.SCOPE.GLOBAL`: same preference value is used in every project on this computer
         * - `editor.prefs.SCOPE.PROJECT`: a separate preference value per project
         * @returns Prefs schema
         */
        export function array(opts: Record<string | number, unknown>): unknown;
        /**
         * boolean schema
         *
         * @param opts - Optional opts: `default boolean`default value`scope string`preference scope; either:
         * - `editor.prefs.SCOPE.GLOBAL`: same preference value is used in every project on this computer
         * - `editor.prefs.SCOPE.PROJECT`: a separate preference value per project
         * @returns Prefs schema
         */
        export function boolean(opts?: Record<string | number, unknown>): unknown;
        /**
         * enum value schema
         *
         * @param opts - Required opts: `values any[]`allowed values, must be scalar (nil, boolean, number or string) Optional opts: `default any`default value`scope string`preference scope; either:
         * - `editor.prefs.SCOPE.GLOBAL`: same preference value is used in every project on this computer
         * - `editor.prefs.SCOPE.PROJECT`: a separate preference value per project
         * @returns Prefs schema
         */
        function _enum(opts: Record<string | number, unknown>): unknown;
        /**
         * integer schema
         *
         * @param opts - Optional opts: `default integer`default value`scope string`preference scope; either:
         * - `editor.prefs.SCOPE.GLOBAL`: same preference value is used in every project on this computer
         * - `editor.prefs.SCOPE.PROJECT`: a separate preference value per project
         * @returns Prefs schema
         */
        export function integer(opts?: Record<string | number, unknown>): unknown;
        /**
         * keyword schema
         * A keyword is a short string that is interned within the editor runtime, useful e.g. for identifiers
         *
         * @param opts - Optional opts: `default string`default value`scope string`preference scope; either:
         * - `editor.prefs.SCOPE.GLOBAL`: same preference value is used in every project on this computer
         * - `editor.prefs.SCOPE.PROJECT`: a separate preference value per project
         * @returns Prefs schema
         */
        export function keyword(opts?: Record<string | number, unknown>): unknown;
        /**
         * floating-point number schema
         *
         * @param opts - Optional opts: `default number`default value`scope string`preference scope; either:
         * - `editor.prefs.SCOPE.GLOBAL`: same preference value is used in every project on this computer
         * - `editor.prefs.SCOPE.PROJECT`: a separate preference value per project
         * @returns Prefs schema
         */
        export function number(opts?: Record<string | number, unknown>): unknown;
        /**
         * heterogeneous object schema
         *
         * @param opts - Required opts: `properties table<string, schema>`a table from property key (string) to value schema Optional opts: `default table`default value`scope string`preference scope; either:
         * - `editor.prefs.SCOPE.GLOBAL`: same preference value is used in every project on this computer
         * - `editor.prefs.SCOPE.PROJECT`: a separate preference value per project
         * @returns Prefs schema
         */
        export function object(opts: Record<string | number, unknown>): unknown;
        /**
         * homogeneous object schema
         *
         * @param opts - Required opts: `key schema`table key schema`val schema`table value schema Optional opts: `default table`default value`scope string`preference scope; either:
         * - `editor.prefs.SCOPE.GLOBAL`: same preference value is used in every project on this computer
         * - `editor.prefs.SCOPE.PROJECT`: a separate preference value per project
         * @returns Prefs schema
         */
        export function object_of(opts: Record<string | number, unknown>): unknown;
        /**
         * one of schema
         *
         * @param opts - Required opts: `schemas schema[]`alternative schemas Optional opts: `default any`default value`scope string`preference scope; either:
         * - `editor.prefs.SCOPE.GLOBAL`: same preference value is used in every project on this computer
         * - `editor.prefs.SCOPE.PROJECT`: a separate preference value per project
         * @returns Prefs schema
         */
        export function one_of(opts: Record<string | number, unknown>): unknown;
        /**
         * password schema
         * A password is a string that is encrypted when stored in a preference file
         *
         * @param opts - Optional opts: `default string`default value`scope string`preference scope; either:
         * - `editor.prefs.SCOPE.GLOBAL`: same preference value is used in every project on this computer
         * - `editor.prefs.SCOPE.PROJECT`: a separate preference value per project
         * @returns Prefs schema
         */
        export function password(opts?: Record<string | number, unknown>): unknown;
        /**
         * set schema
         * Set is represented as a lua table with `true` values
         *
         * @param opts - Required opts: `item schema`set item schema Optional opts: `default table<item, true>`default value`scope string`preference scope; either:
         * - `editor.prefs.SCOPE.GLOBAL`: same preference value is used in every project on this computer
         * - `editor.prefs.SCOPE.PROJECT`: a separate preference value per project
         * @returns Prefs schema
         */
        export function set(opts: Record<string | number, unknown>): unknown;
        /**
         * string schema
         *
         * @param opts - Optional opts: `default string`default value`scope string`preference scope; either:
         * - `editor.prefs.SCOPE.GLOBAL`: same preference value is used in every project on this computer
         * - `editor.prefs.SCOPE.PROJECT`: a separate preference value per project
         * @returns Prefs schema
         */
        export function string(opts?: Record<string | number, unknown>): unknown;
        /**
         * tuple schema
         * A tuple is a fixed-length array where each item has its own defined type
         *
         * @param opts - Required opts: `items schema[]`schemas for the items Optional opts: `default any[]`default value`scope string`preference scope; either:
         * - `editor.prefs.SCOPE.GLOBAL`: same preference value is used in every project on this computer
         * - `editor.prefs.SCOPE.PROJECT`: a separate preference value per project
         * @returns Prefs schema
         */
        export function tuple(opts: Record<string | number, unknown>): unknown;
        export { _enum as enum };
      }
      namespace SCOPE {
        /**
         * `"global"`
         */
        const GLOBAL: unknown;
        /**
         * `"project"`
         */
        const PROJECT: unknown;
      }
    }
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
    namespace ui {
      /**
       * Button with a label and/or an icon
       *
       * @param props - Optional props: `on_pressed function`button press callback, will be invoked without arguments when the user presses the button`text string, message`the text, either a string or a localization message`text_alignment string`text alignment within paragraph bounds; either:
       * - `editor.ui.TEXT_ALIGNMENT.LEFT`
       * - `editor.ui.TEXT_ALIGNMENT.CENTER`
       * - `editor.ui.TEXT_ALIGNMENT.RIGHT`
       * - `editor.ui.TEXT_ALIGNMENT.JUSTIFY``icon string`predefined icon name; either:
       * - `editor.ui.ICON.OPEN_RESOURCE`
       * - `editor.ui.ICON.PLUS`
       * - `editor.ui.ICON.MINUS`
       * - `editor.ui.ICON.CLEAR``enabled boolean`determines if the input component can be interacted with`alignment string`alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`; either:
       * - `editor.ui.ALIGNMENT.TOP_LEFT`
       * - `editor.ui.ALIGNMENT.TOP`
       * - `editor.ui.ALIGNMENT.TOP_RIGHT`
       * - `editor.ui.ALIGNMENT.LEFT`
       * - `editor.ui.ALIGNMENT.CENTER`
       * - `editor.ui.ALIGNMENT.RIGHT`
       * - `editor.ui.ALIGNMENT.BOTTOM_LEFT`
       * - `editor.ui.ALIGNMENT.BOTTOM`
       * - `editor.ui.ALIGNMENT.BOTTOM_RIGHT``grow boolean`determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container`row_span integer`how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.`column_span integer`how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
       * @returns UI component
       */
      function button(props: Record<string | number, unknown>): Opaque<"component">;
      /**
       * Check box with a label
       *
       * @param props - Optional props: `value boolean`determines if the checkbox should appear checked`on_value_changed function`change callback, will receive the new value`text string, message`the text, either a string or a localization message`text_alignment string`text alignment within paragraph bounds; either:
       * - `editor.ui.TEXT_ALIGNMENT.LEFT`
       * - `editor.ui.TEXT_ALIGNMENT.CENTER`
       * - `editor.ui.TEXT_ALIGNMENT.RIGHT`
       * - `editor.ui.TEXT_ALIGNMENT.JUSTIFY``issue table`issue related to the input; table with the following keys (all required):`severity string`either `editor.ui.ISSUE_SEVERITY.WARNING` or `editor.ui.ISSUE_SEVERITY.ERROR``message string, message`issue message that will be shown in a tooltip; either a string or a localization message`tooltip string, message`tooltip message shown on hover; either a string or a localization message`enabled boolean`determines if the input component can be interacted with`alignment string`alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`; either:
       * - `editor.ui.ALIGNMENT.TOP_LEFT`
       * - `editor.ui.ALIGNMENT.TOP`
       * - `editor.ui.ALIGNMENT.TOP_RIGHT`
       * - `editor.ui.ALIGNMENT.LEFT`
       * - `editor.ui.ALIGNMENT.CENTER`
       * - `editor.ui.ALIGNMENT.RIGHT`
       * - `editor.ui.ALIGNMENT.BOTTOM_LEFT`
       * - `editor.ui.ALIGNMENT.BOTTOM`
       * - `editor.ui.ALIGNMENT.BOTTOM_RIGHT``grow boolean`determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container`row_span integer`how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.`column_span integer`how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
       * @returns UI component
       */
      function check_box(props: Record<string | number, unknown>): Opaque<"component">;
      /**
       * Convert a function to a UI component.
       * The wrapped function may call any hooks functions (`editor.ui.use_*`), but on any function invocation, the hooks calls must be the same, and in the same order. This means that hooks should not be used inside loops and conditions or after a conditional return statement.
       * The following props are supported automatically:`grow boolean`determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container`row_span integer`how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.`column_span integer`how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
       *
       * @param fn - function, will receive a single table of props when called
       * @returns decorated component function that may be invoked with a props table create component
       */
      function component(fn: (...args: unknown[]) => unknown): (...args: unknown[]) => unknown;
      /**
       * Dialog component, a top-level window component that can't be used as a child of other components
       *
       * @param props - Required props: `title string, message`OS dialog window title, either a string or a localization message Optional props: `header component`top part of the dialog, defaults to `editor.ui.heading({text = props.title})``content component`content of the dialog`buttons component[]`array of `editor.ui.dialog_button(...)` components, footer of the dialog. Defaults to a single Close button
       * @returns UI component
       */
      function dialog(props: Record<string | number, unknown>): Opaque<"component">;
      /**
       * Dialog button shown in the footer of a dialog
       *
       * @param props - Required props: `text string, message`button text, either a string or a localization message Optional props: `result any`value returned by `editor.ui.show_dialog(...)` if this button is pressed`default boolean`if set, pressing `Enter` in the dialog will trigger this button`cancel boolean`if set, pressing `Escape` in the dialog will trigger this button`enabled boolean`determines if the button can be interacted with
       * @returns UI component
       */
      function dialog_button(props: Record<string | number, unknown>): Opaque<"component">;
      /**
       * Input component for selecting files from the file system
       *
       * @param props - Optional props: `value string`file or directory path; resolved against project root if relative`on_value_changed function`value change callback, will receive the absolute path of a selected file/folder or nil if the field was cleared; even though the selector dialog allows selecting only files, it's possible to receive directories and non-existent file system entries using text field input`title string, message`OS window title, either a string or a localization message`filters table[]`File filters, an array of filter tables, where each filter has following keys:`description string, message`text explaining the filter, either a literal string like `"Text files (*.txt)"` or a localization message`extensions string[]`array of file extension patterns, e.g. `"*.txt"`, `"*.*"` or `"game.project"``issue table`issue related to the input; table with the following keys (all required):`severity string`either `editor.ui.ISSUE_SEVERITY.WARNING` or `editor.ui.ISSUE_SEVERITY.ERROR``message string, message`issue message that will be shown in a tooltip; either a string or a localization message`tooltip string, message`tooltip message shown on hover; either a string or a localization message`enabled boolean`determines if the input component can be interacted with`alignment string`alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`; either:
       * - `editor.ui.ALIGNMENT.TOP_LEFT`
       * - `editor.ui.ALIGNMENT.TOP`
       * - `editor.ui.ALIGNMENT.TOP_RIGHT`
       * - `editor.ui.ALIGNMENT.LEFT`
       * - `editor.ui.ALIGNMENT.CENTER`
       * - `editor.ui.ALIGNMENT.RIGHT`
       * - `editor.ui.ALIGNMENT.BOTTOM_LEFT`
       * - `editor.ui.ALIGNMENT.BOTTOM`
       * - `editor.ui.ALIGNMENT.BOTTOM_RIGHT``grow boolean`determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container`row_span integer`how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.`column_span integer`how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
       * @returns UI component
       */
      function external_file_field(props: Record<string | number, unknown>): Opaque<"component">;
      /**
       * Layout container that places its children in a 2D grid
       *
       * @param props - Optional props: `children component[][]`array of arrays of child components`rows table[]`array of row option tables, separate configuration for each row:`grow boolean`determines if the row should grow to fill available space`columns table[]`array of column option tables, separate configuration for each column:`grow boolean`determines if the column should grow to fill available space`padding string, number`empty space from the edges of the container to its children; either:
       * - `editor.ui.PADDING.NONE`
       * - `editor.ui.PADDING.SMALL`
       * - `editor.ui.PADDING.MEDIUM`
       * - `editor.ui.PADDING.LARGE`
       * - non-negative number, pixels`spacing string, number`empty space between child components, defaults to `editor.ui.SPACING.MEDIUM`; either:
       * - `editor.ui.SPACING.NONE`
       * - `editor.ui.SPACING.SMALL`
       * - `editor.ui.SPACING.MEDIUM`
       * - `editor.ui.SPACING.LARGE`
       * - non-negative number, pixels`alignment string`alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`; either:
       * - `editor.ui.ALIGNMENT.TOP_LEFT`
       * - `editor.ui.ALIGNMENT.TOP`
       * - `editor.ui.ALIGNMENT.TOP_RIGHT`
       * - `editor.ui.ALIGNMENT.LEFT`
       * - `editor.ui.ALIGNMENT.CENTER`
       * - `editor.ui.ALIGNMENT.RIGHT`
       * - `editor.ui.ALIGNMENT.BOTTOM_LEFT`
       * - `editor.ui.ALIGNMENT.BOTTOM`
       * - `editor.ui.ALIGNMENT.BOTTOM_RIGHT``grow boolean`determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container`row_span integer`how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.`column_span integer`how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
       * @returns UI component
       */
      function grid(props: Record<string | number, unknown>): Opaque<"component">;
      /**
       * A text heading
       *
       * @param props - Optional props: `text string, message`the text, either a string or a localization message`text_alignment string`text alignment within paragraph bounds; either:
       * - `editor.ui.TEXT_ALIGNMENT.LEFT`
       * - `editor.ui.TEXT_ALIGNMENT.CENTER`
       * - `editor.ui.TEXT_ALIGNMENT.RIGHT`
       * - `editor.ui.TEXT_ALIGNMENT.JUSTIFY``color string`semantic color, defaults to `editor.ui.COLOR.TEXT`; either:
       * - `editor.ui.COLOR.TEXT`
       * - `editor.ui.COLOR.HINT`
       * - `editor.ui.COLOR.OVERRIDE`
       * - `editor.ui.COLOR.WARNING`
       * - `editor.ui.COLOR.ERROR``word_wrap boolean`determines if the lines of text are word-wrapped when they don't fit in the assigned bounds, defaults to true`style string`heading style, defaults to `editor.ui.HEADING_STYLE.H3`; either:
       * - `editor.ui.HEADING_STYLE.H1`
       * - `editor.ui.HEADING_STYLE.H2`
       * - `editor.ui.HEADING_STYLE.H3`
       * - `editor.ui.HEADING_STYLE.H4`
       * - `editor.ui.HEADING_STYLE.H5`
       * - `editor.ui.HEADING_STYLE.H6`
       * - `editor.ui.HEADING_STYLE.DIALOG`
       * - `editor.ui.HEADING_STYLE.FORM``alignment string`alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`; either:
       * - `editor.ui.ALIGNMENT.TOP_LEFT`
       * - `editor.ui.ALIGNMENT.TOP`
       * - `editor.ui.ALIGNMENT.TOP_RIGHT`
       * - `editor.ui.ALIGNMENT.LEFT`
       * - `editor.ui.ALIGNMENT.CENTER`
       * - `editor.ui.ALIGNMENT.RIGHT`
       * - `editor.ui.ALIGNMENT.BOTTOM_LEFT`
       * - `editor.ui.ALIGNMENT.BOTTOM`
       * - `editor.ui.ALIGNMENT.BOTTOM_RIGHT``grow boolean`determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container`row_span integer`how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.`column_span integer`how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
       * @returns UI component
       */
      function heading(props: Record<string | number, unknown>): Opaque<"component">;
      /**
       * Layout container that places its children in a horizontal row one after another
       *
       * @param props - Optional props: `children component[]`array of child components`padding string, number`empty space from the edges of the container to its children; either:
       * - `editor.ui.PADDING.NONE`
       * - `editor.ui.PADDING.SMALL`
       * - `editor.ui.PADDING.MEDIUM`
       * - `editor.ui.PADDING.LARGE`
       * - non-negative number, pixels`spacing string, number`empty space between child components, defaults to `editor.ui.SPACING.MEDIUM`; either:
       * - `editor.ui.SPACING.NONE`
       * - `editor.ui.SPACING.SMALL`
       * - `editor.ui.SPACING.MEDIUM`
       * - `editor.ui.SPACING.LARGE`
       * - non-negative number, pixels`alignment string`alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`; either:
       * - `editor.ui.ALIGNMENT.TOP_LEFT`
       * - `editor.ui.ALIGNMENT.TOP`
       * - `editor.ui.ALIGNMENT.TOP_RIGHT`
       * - `editor.ui.ALIGNMENT.LEFT`
       * - `editor.ui.ALIGNMENT.CENTER`
       * - `editor.ui.ALIGNMENT.RIGHT`
       * - `editor.ui.ALIGNMENT.BOTTOM_LEFT`
       * - `editor.ui.ALIGNMENT.BOTTOM`
       * - `editor.ui.ALIGNMENT.BOTTOM_RIGHT``grow boolean`determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container`row_span integer`how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.`column_span integer`how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
       * @returns UI component
       */
      function horizontal(props: Record<string | number, unknown>): Opaque<"component">;
      /**
       * An icon from a predefined set
       *
       * @param props - Required props: `icon string`predefined icon name; either:
       * - `editor.ui.ICON.OPEN_RESOURCE`
       * - `editor.ui.ICON.PLUS`
       * - `editor.ui.ICON.MINUS`
       * - `editor.ui.ICON.CLEAR` Optional props: `alignment string`alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`; either:
       * - `editor.ui.ALIGNMENT.TOP_LEFT`
       * - `editor.ui.ALIGNMENT.TOP`
       * - `editor.ui.ALIGNMENT.TOP_RIGHT`
       * - `editor.ui.ALIGNMENT.LEFT`
       * - `editor.ui.ALIGNMENT.CENTER`
       * - `editor.ui.ALIGNMENT.RIGHT`
       * - `editor.ui.ALIGNMENT.BOTTOM_LEFT`
       * - `editor.ui.ALIGNMENT.BOTTOM`
       * - `editor.ui.ALIGNMENT.BOTTOM_RIGHT``grow boolean`determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container`row_span integer`how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.`column_span integer`how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
       * @returns UI component
       */
      function icon(props: Record<string | number, unknown>): Opaque<"component">;
      /**
       * An image
       *
       * @param props - Required props: `image string`either a resource path (starts with `/`), or an URL Optional props: `width number`width of the image view, the image will be fit inside it while preserving its aspect ratio`height number`height of the image view, the image will be fit inside it while preserving its aspect ratio`alignment string`alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`; either:
       * - `editor.ui.ALIGNMENT.TOP_LEFT`
       * - `editor.ui.ALIGNMENT.TOP`
       * - `editor.ui.ALIGNMENT.TOP_RIGHT`
       * - `editor.ui.ALIGNMENT.LEFT`
       * - `editor.ui.ALIGNMENT.CENTER`
       * - `editor.ui.ALIGNMENT.RIGHT`
       * - `editor.ui.ALIGNMENT.BOTTOM_LEFT`
       * - `editor.ui.ALIGNMENT.BOTTOM`
       * - `editor.ui.ALIGNMENT.BOTTOM_RIGHT``grow boolean`determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container`row_span integer`how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.`column_span integer`how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
       * @returns UI component
       */
      function image(props: Record<string | number, unknown>): Opaque<"component">;
      /**
       * Integer input component based on a text field, reports changes on commit (`Enter` or focus loss)
       *
       * @param props - Optional props: `value any`value`on_value_changed function`value change callback, will receive the new value`issue table`issue related to the input; table with the following keys (all required):`severity string`either `editor.ui.ISSUE_SEVERITY.WARNING` or `editor.ui.ISSUE_SEVERITY.ERROR``message string, message`issue message that will be shown in a tooltip; either a string or a localization message`tooltip string, message`tooltip message shown on hover; either a string or a localization message`enabled boolean`determines if the input component can be interacted with`alignment string`alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`; either:
       * - `editor.ui.ALIGNMENT.TOP_LEFT`
       * - `editor.ui.ALIGNMENT.TOP`
       * - `editor.ui.ALIGNMENT.TOP_RIGHT`
       * - `editor.ui.ALIGNMENT.LEFT`
       * - `editor.ui.ALIGNMENT.CENTER`
       * - `editor.ui.ALIGNMENT.RIGHT`
       * - `editor.ui.ALIGNMENT.BOTTOM_LEFT`
       * - `editor.ui.ALIGNMENT.BOTTOM`
       * - `editor.ui.ALIGNMENT.BOTTOM_RIGHT``grow boolean`determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container`row_span integer`how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.`column_span integer`how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
       * @returns UI component
       */
      function integer_field(props: Record<string | number, unknown>): Opaque<"component">;
      /**
       * Label intended for use with input components
       *
       * @param props - Optional props: `text string, message`the text, either a string or a localization message`text_alignment string`text alignment within paragraph bounds; either:
       * - `editor.ui.TEXT_ALIGNMENT.LEFT`
       * - `editor.ui.TEXT_ALIGNMENT.CENTER`
       * - `editor.ui.TEXT_ALIGNMENT.RIGHT`
       * - `editor.ui.TEXT_ALIGNMENT.JUSTIFY``color string`semantic color, defaults to `editor.ui.COLOR.TEXT`; either:
       * - `editor.ui.COLOR.TEXT`
       * - `editor.ui.COLOR.HINT`
       * - `editor.ui.COLOR.OVERRIDE`
       * - `editor.ui.COLOR.WARNING`
       * - `editor.ui.COLOR.ERROR``tooltip string, message`tooltip message shown on hover; either a string or a localization message`alignment string`alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`; either:
       * - `editor.ui.ALIGNMENT.TOP_LEFT`
       * - `editor.ui.ALIGNMENT.TOP`
       * - `editor.ui.ALIGNMENT.TOP_RIGHT`
       * - `editor.ui.ALIGNMENT.LEFT`
       * - `editor.ui.ALIGNMENT.CENTER`
       * - `editor.ui.ALIGNMENT.RIGHT`
       * - `editor.ui.ALIGNMENT.BOTTOM_LEFT`
       * - `editor.ui.ALIGNMENT.BOTTOM`
       * - `editor.ui.ALIGNMENT.BOTTOM_RIGHT``grow boolean`determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container`row_span integer`how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.`column_span integer`how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
       * @returns UI component
       */
      function label(props: Record<string | number, unknown>): Opaque<"component">;
      /**
       * Number input component based on a text field, reports changes on commit (`Enter` or focus loss)
       *
       * @param props - Optional props: `value any`value`on_value_changed function`value change callback, will receive the new value`issue table`issue related to the input; table with the following keys (all required):`severity string`either `editor.ui.ISSUE_SEVERITY.WARNING` or `editor.ui.ISSUE_SEVERITY.ERROR``message string, message`issue message that will be shown in a tooltip; either a string or a localization message`tooltip string, message`tooltip message shown on hover; either a string or a localization message`enabled boolean`determines if the input component can be interacted with`alignment string`alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`; either:
       * - `editor.ui.ALIGNMENT.TOP_LEFT`
       * - `editor.ui.ALIGNMENT.TOP`
       * - `editor.ui.ALIGNMENT.TOP_RIGHT`
       * - `editor.ui.ALIGNMENT.LEFT`
       * - `editor.ui.ALIGNMENT.CENTER`
       * - `editor.ui.ALIGNMENT.RIGHT`
       * - `editor.ui.ALIGNMENT.BOTTOM_LEFT`
       * - `editor.ui.ALIGNMENT.BOTTOM`
       * - `editor.ui.ALIGNMENT.BOTTOM_RIGHT``grow boolean`determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container`row_span integer`how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.`column_span integer`how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
       * @returns UI component
       */
      function number_field(props: Record<string | number, unknown>): Opaque<"component">;
      /**
       * Open a resource, either in the editor or in a third-party app
       *
       * @param resource_path - Resource path (starting with `/`)
       */
      function open_resource(resource_path: string): void;
      /**
       * A paragraph of text
       *
       * @param props - Optional props: `text string, message`the text, either a string or a localization message`text_alignment string`text alignment within paragraph bounds; either:
       * - `editor.ui.TEXT_ALIGNMENT.LEFT`
       * - `editor.ui.TEXT_ALIGNMENT.CENTER`
       * - `editor.ui.TEXT_ALIGNMENT.RIGHT`
       * - `editor.ui.TEXT_ALIGNMENT.JUSTIFY``color string`semantic color, defaults to `editor.ui.COLOR.TEXT`; either:
       * - `editor.ui.COLOR.TEXT`
       * - `editor.ui.COLOR.HINT`
       * - `editor.ui.COLOR.OVERRIDE`
       * - `editor.ui.COLOR.WARNING`
       * - `editor.ui.COLOR.ERROR``word_wrap boolean`determines if the lines of text are word-wrapped when they don't fit in the assigned bounds, defaults to true`alignment string`alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`; either:
       * - `editor.ui.ALIGNMENT.TOP_LEFT`
       * - `editor.ui.ALIGNMENT.TOP`
       * - `editor.ui.ALIGNMENT.TOP_RIGHT`
       * - `editor.ui.ALIGNMENT.LEFT`
       * - `editor.ui.ALIGNMENT.CENTER`
       * - `editor.ui.ALIGNMENT.RIGHT`
       * - `editor.ui.ALIGNMENT.BOTTOM_LEFT`
       * - `editor.ui.ALIGNMENT.BOTTOM`
       * - `editor.ui.ALIGNMENT.BOTTOM_RIGHT``grow boolean`determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container`row_span integer`how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.`column_span integer`how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
       * @returns UI component
       */
      function paragraph(props: Record<string | number, unknown>): Opaque<"component">;
      /**
       * Input component for selecting project resources
       *
       * @param props - Optional props: `value string`resource path (must start with `/`)`on_value_changed function`value change callback, will receive either resource path of a selected resource or nil when the field is cleared; even though the resource selector dialog allows filtering on resource extensions, it's possible to receive resources with other extensions and non-existent resources using text field input`title string, message`dialog title, either a string or a localization message, defaults to `localization.message("dialog.select-resource.title")``extensions string[]`if specified, restricts selectable resources in the dialog to specified file extensions; e.g. `{"collection", "go"}``issue table`issue related to the input; table with the following keys (all required):`severity string`either `editor.ui.ISSUE_SEVERITY.WARNING` or `editor.ui.ISSUE_SEVERITY.ERROR``message string, message`issue message that will be shown in a tooltip; either a string or a localization message`tooltip string, message`tooltip message shown on hover; either a string or a localization message`enabled boolean`determines if the input component can be interacted with`alignment string`alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`; either:
       * - `editor.ui.ALIGNMENT.TOP_LEFT`
       * - `editor.ui.ALIGNMENT.TOP`
       * - `editor.ui.ALIGNMENT.TOP_RIGHT`
       * - `editor.ui.ALIGNMENT.LEFT`
       * - `editor.ui.ALIGNMENT.CENTER`
       * - `editor.ui.ALIGNMENT.RIGHT`
       * - `editor.ui.ALIGNMENT.BOTTOM_LEFT`
       * - `editor.ui.ALIGNMENT.BOTTOM`
       * - `editor.ui.ALIGNMENT.BOTTOM_RIGHT``grow boolean`determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container`row_span integer`how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.`column_span integer`how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
       * @returns UI component
       */
      function resource_field(props: Record<string | number, unknown>): Opaque<"component">;
      /**
       * Layout container that optionally shows scroll bars if child contents overflow the assigned bounds
       *
       * @param props - Required props: `content component`content component Optional props: `grow boolean`determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container`row_span integer`how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.`column_span integer`how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
       * @returns UI component
       */
      function scroll(props: Record<string | number, unknown>): Opaque<"component">;
      /**
       * Dropdown select box with an array of options
       *
       * @param props - Optional props: `value any`selected value`on_value_changed function`change callback, will receive the selected value`options any[]`array of selectable options`to_string function`function that converts an item to a string (or a localization message); defaults to `tostring``issue table`issue related to the input; table with the following keys (all required):`severity string`either `editor.ui.ISSUE_SEVERITY.WARNING` or `editor.ui.ISSUE_SEVERITY.ERROR``message string, message`issue message that will be shown in a tooltip; either a string or a localization message`tooltip string, message`tooltip message shown on hover; either a string or a localization message`enabled boolean`determines if the input component can be interacted with`alignment string`alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`; either:
       * - `editor.ui.ALIGNMENT.TOP_LEFT`
       * - `editor.ui.ALIGNMENT.TOP`
       * - `editor.ui.ALIGNMENT.TOP_RIGHT`
       * - `editor.ui.ALIGNMENT.LEFT`
       * - `editor.ui.ALIGNMENT.CENTER`
       * - `editor.ui.ALIGNMENT.RIGHT`
       * - `editor.ui.ALIGNMENT.BOTTOM_LEFT`
       * - `editor.ui.ALIGNMENT.BOTTOM`
       * - `editor.ui.ALIGNMENT.BOTTOM_RIGHT``grow boolean`determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container`row_span integer`how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.`column_span integer`how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
       * @returns UI component
       */
      function select_box(props: Record<string | number, unknown>): Opaque<"component">;
      /**
       * Thin line for visual content separation, by default horizontal and aligned to center
       *
       * @param props - Optional props: `orientation string`separator line orientation, `editor.ui.ORIENTATION.VERTICAL` or `editor.ui.ORIENTATION.HORIZONTAL`; either:
       * - `editor.ui.ORIENTATION.VERTICAL`
       * - `editor.ui.ORIENTATION.HORIZONTAL``alignment string`alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`; either:
       * - `editor.ui.ALIGNMENT.TOP_LEFT`
       * - `editor.ui.ALIGNMENT.TOP`
       * - `editor.ui.ALIGNMENT.TOP_RIGHT`
       * - `editor.ui.ALIGNMENT.LEFT`
       * - `editor.ui.ALIGNMENT.CENTER`
       * - `editor.ui.ALIGNMENT.RIGHT`
       * - `editor.ui.ALIGNMENT.BOTTOM_LEFT`
       * - `editor.ui.ALIGNMENT.BOTTOM`
       * - `editor.ui.ALIGNMENT.BOTTOM_RIGHT``grow boolean`determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container`row_span integer`how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.`column_span integer`how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
       * @returns UI component
       */
      function separator(props: Record<string | number, unknown>): Opaque<"component">;
      /**
       * Show a modal dialog and await a result
       *
       * @param dialog - a component that resolves to `editor.ui.dialog(...)`
       * @returns dialog result, the value used as a `result` prop in a `editor.ui.dialog_button({...})` selected by the user, or `nil` if the dialog was closed and there was no `cancel = true` dialog button with `result` prop set
       */
      function show_dialog(dialog: Opaque<"component">): unknown;
      /**
       * Show a modal OS directory selection dialog and await a result
       *
       * @param opts - `path string`initial file or directory path used by the dialog; resolved against project root if relative`title string, message`OS window title, either a string or a localization message
       * @returns either absolute directory path or nil if user canceled directory selection
       */
      function show_external_directory_dialog(opts?: Record<string | number, unknown>): string | undefined;
      /**
       * Show a modal OS file selection dialog and await a result
       *
       * @param opts - `path string`initial file or directory path used by the dialog; resolved against project root if relative`title string, message`OS window title, either a string or a localization message`filters table[]`File filters, an array of filter tables, where each filter has following keys:`description string, message`text explaining the filter, either a literal string like `"Text files (*.txt)"` or a localization message`extensions string[]`array of file extension patterns, e.g. `"*.txt"`, `"*.*"` or `"game.project"`
       * @returns either absolute file path or nil if user canceled file selection
       */
      function show_external_file_dialog(opts?: Record<string | number, unknown>): string | undefined;
      /**
       * Show a modal resource selection dialog and await a result
       *
       * @param opts - `extensions string[]`if specified, restricts selectable resources in the dialog to specified file extensions; e.g. `{"collection", "go"}``selection string`either `"single"` or `"multiple"`, defaults to `"single"``title string, message`dialog title, either a string or a localization message, defaults to `localization.message("dialog.select-resource.title")`
       * @returns |nil] if user made no selection, returns `nil`. Otherwise, if selection mode is `"single"`, returns selected resource path; otherwise returns a non-empty array of selected resource paths.
       */
      function show_resource_dialog(opts?: Record<string | number, unknown>): unknown;
      /**
       * String input component based on a text field, reports changes on commit (`Enter` or focus loss)
       *
       * @param props - Optional props: `value any`value`on_value_changed function`value change callback, will receive the new value`issue table`issue related to the input; table with the following keys (all required):`severity string`either `editor.ui.ISSUE_SEVERITY.WARNING` or `editor.ui.ISSUE_SEVERITY.ERROR``message string, message`issue message that will be shown in a tooltip; either a string or a localization message`tooltip string, message`tooltip message shown on hover; either a string or a localization message`enabled boolean`determines if the input component can be interacted with`alignment string`alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`; either:
       * - `editor.ui.ALIGNMENT.TOP_LEFT`
       * - `editor.ui.ALIGNMENT.TOP`
       * - `editor.ui.ALIGNMENT.TOP_RIGHT`
       * - `editor.ui.ALIGNMENT.LEFT`
       * - `editor.ui.ALIGNMENT.CENTER`
       * - `editor.ui.ALIGNMENT.RIGHT`
       * - `editor.ui.ALIGNMENT.BOTTOM_LEFT`
       * - `editor.ui.ALIGNMENT.BOTTOM`
       * - `editor.ui.ALIGNMENT.BOTTOM_RIGHT``grow boolean`determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container`row_span integer`how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.`column_span integer`how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
       * @returns UI component
       */
      function string_field(props: Record<string | number, unknown>): Opaque<"component">;
      /**
       * A hook that caches the result of a computation between re-renders.
       * See `editor.ui.component` for hooks caveats and rules. If any of the arguments to `use_memo` change during a component refresh (checked with `==`), the value will be recomputed.
       *
       * @param compute - function that will be used to compute the cached value
       * @param args - args to the computation function
       * @returns all returned values of the compute function
       * @example
       * ```ts
       * function increment(n: unknown): number {
       *   return (n as number) + 1;
       * }
       *
       * function makeListener(setCount: unknown) {
       *   return () => {
       *     (setCount as (update: unknown) => unknown)(increment);
       *   };
       * }
       *
       * const counterButton = editor.ui.component((props) => {
       *   const [count, setCount] = editor.ui.use_state((props as { count: unknown }).count);
       *   const onPressed = editor.ui.use_memo(makeListener, setCount);
       *   return editor.ui.button({
       *     text: tostring(count),
       *     on_pressed: onPressed,
       *   });
       * });
       * ```
       */
      function use_memo(compute: (...args: unknown[]) => unknown, ...args: unknown[]): unknown;
      /**
       * A hook that adds local state to the component.
       * See `editor.ui.component` for hooks caveats and rules. If any of the arguments to `use_state` change during a component refresh (checked with `==`), the current state will be reset to the initial one.
       *
       * @param init - local state initializer, either initial data structure or function that produces the data structure
       * @param args - used when `init` is a function, the args are passed to the initializer function
       * @example
       * ```ts
       * function increment(n: unknown): number {
       *   return (n as number) + 1;
       * }
       *
       * const counterButton = editor.ui.component((props) => {
       *   const [count, setCount] = editor.ui.use_state((props as { count: unknown }).count);
       *   return editor.ui.button({
       *     text: tostring(count),
       *     on_pressed: () => {
       *       setCount(increment);
       *     },
       *   });
       * });
       * ```
       */
      function use_state(init: unknown, ...args: unknown[]): LuaMultiReturn<[unknown, (...args: unknown[]) => unknown]>;
      /**
       * Layout container that places its children in a vertical column one after another
       *
       * @param props - Optional props: `children component[]`array of child components`padding string, number`empty space from the edges of the container to its children; either:
       * - `editor.ui.PADDING.NONE`
       * - `editor.ui.PADDING.SMALL`
       * - `editor.ui.PADDING.MEDIUM`
       * - `editor.ui.PADDING.LARGE`
       * - non-negative number, pixels`spacing string, number`empty space between child components, defaults to `editor.ui.SPACING.MEDIUM`; either:
       * - `editor.ui.SPACING.NONE`
       * - `editor.ui.SPACING.SMALL`
       * - `editor.ui.SPACING.MEDIUM`
       * - `editor.ui.SPACING.LARGE`
       * - non-negative number, pixels`alignment string`alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`; either:
       * - `editor.ui.ALIGNMENT.TOP_LEFT`
       * - `editor.ui.ALIGNMENT.TOP`
       * - `editor.ui.ALIGNMENT.TOP_RIGHT`
       * - `editor.ui.ALIGNMENT.LEFT`
       * - `editor.ui.ALIGNMENT.CENTER`
       * - `editor.ui.ALIGNMENT.RIGHT`
       * - `editor.ui.ALIGNMENT.BOTTOM_LEFT`
       * - `editor.ui.ALIGNMENT.BOTTOM`
       * - `editor.ui.ALIGNMENT.BOTTOM_RIGHT``grow boolean`determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container`row_span integer`how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.`column_span integer`how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
       * @returns UI component
       */
      function vertical(props: Record<string | number, unknown>): Opaque<"component">;
      namespace ALIGNMENT {
        /**
         * `"bottom"`
         */
        const BOTTOM: unknown;
        /**
         * `"bottom-left"`
         */
        const BOTTOM_LEFT: unknown;
        /**
         * `"bottom-right"`
         */
        const BOTTOM_RIGHT: unknown;
        /**
         * `"center"`
         */
        const CENTER: unknown;
        /**
         * `"left"`
         */
        const LEFT: unknown;
        /**
         * `"right"`
         */
        const RIGHT: unknown;
        /**
         * `"top"`
         */
        const TOP: unknown;
        /**
         * `"top-left"`
         */
        const TOP_LEFT: unknown;
        /**
         * `"top-right"`
         */
        const TOP_RIGHT: unknown;
      }
      namespace COLOR {
        /**
         * `"error"`
         */
        const ERROR: unknown;
        /**
         * `"hint"`
         */
        const HINT: unknown;
        /**
         * `"override"`
         */
        const OVERRIDE: unknown;
        /**
         * `"text"`
         */
        const TEXT: unknown;
        /**
         * `"warning"`
         */
        const WARNING: unknown;
      }
      namespace HEADING_STYLE {
        /**
         * `"dialog"`
         */
        const DIALOG: unknown;
        /**
         * `"form"`
         */
        const FORM: unknown;
        /**
         * `"h1"`
         */
        const H1: unknown;
        /**
         * `"h2"`
         */
        const H2: unknown;
        /**
         * `"h3"`
         */
        const H3: unknown;
        /**
         * `"h4"`
         */
        const H4: unknown;
        /**
         * `"h5"`
         */
        const H5: unknown;
        /**
         * `"h6"`
         */
        const H6: unknown;
      }
      namespace ICON {
        /**
         * `"clear"`
         */
        const CLEAR: unknown;
        /**
         * `"minus"`
         */
        const MINUS: unknown;
        /**
         * `"open-resource"`
         */
        const OPEN_RESOURCE: unknown;
        /**
         * `"plus"`
         */
        const PLUS: unknown;
      }
      namespace ISSUE_SEVERITY {
        /**
         * `"error"`
         */
        const ERROR: unknown;
        /**
         * `"warning"`
         */
        const WARNING: unknown;
      }
      namespace ORIENTATION {
        /**
         * `"horizontal"`
         */
        const HORIZONTAL: unknown;
        /**
         * `"vertical"`
         */
        const VERTICAL: unknown;
      }
      namespace PADDING {
        /**
         * `"large"`
         */
        const LARGE: unknown;
        /**
         * `"medium"`
         */
        const MEDIUM: unknown;
        /**
         * `"none"`
         */
        const NONE: unknown;
        /**
         * `"small"`
         */
        const SMALL: unknown;
      }
      namespace SPACING {
        /**
         * `"large"`
         */
        const LARGE: unknown;
        /**
         * `"medium"`
         */
        const MEDIUM: unknown;
        /**
         * `"none"`
         */
        const NONE: unknown;
        /**
         * `"small"`
         */
        const SMALL: unknown;
      }
      namespace TEXT_ALIGNMENT {
        /**
         * `"center"`
         */
        const CENTER: unknown;
        /**
         * `"justify"`
         */
        const JUSTIFY: unknown;
        /**
         * `"left"`
         */
        const LEFT: unknown;
        /**
         * `"right"`
         */
        const RIGHT: unknown;
      }
    }
  }
}

export {};
