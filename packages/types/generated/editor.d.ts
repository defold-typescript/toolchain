/** @noSelfInFile */
import type { Opaque } from "../src/core-types";

declare global {
  /**
   * Editor scripting documentation
   */
  namespace editor {
    type command = Opaque<"command">;
    type component = Opaque<"component">;
    type image = Opaque<"editor.image">;
    type message = Opaque<"message">;
    type schema = Opaque<"editor.schema">;
    type tiles = Opaque<"editor.tiles">;
    type transaction_step = Opaque<"transaction_step">;
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
    const platform: "x86_64-win32" | "x86_64-macos" | "arm64-macos" | "x86_64-linux";
    /**
     * A string, version name of Defold
     */
    const version: unknown;
    /**
     * Run bob the builder program
     * For the full documentation of the available commands and options, see the bob manual.
     *
     * @param options - table of command line options for bob, without the leading dashes (`--`). You can use snake_case instead of kebab-case for option keys. Only long option names are supported (i.e. `output`, not `o`). Supported value types are strings, integers and booleans. If an option takes no arguments, use a boolean (i.e. `true`). If an option may be repeated, you can use an array of values.
     * @param args - bob commands, e.g. `"resolve"` or `"build"`
     * @example
     * Print help in the console:
     * ```ts
     * editor.bob({ help: true });
     * ```
     * @example
     * Bundle the game for the host platform:
     * ```ts
     * const opts = { archive: true, platform: editor.platform };
     * editor.bob(opts, "distclean", "resolve", "build", "bundle");
     * ```
     * @example
     * Using snake_cased and repeated options:
     * ```ts
     * const opts = {
     *   archive: true,
     *   platform: editor.platform,
     *   build_server: "https://build.my-company.com",
     *   settings: ["test.ini", "headless.ini"],
     * };
     * editor.bob(opts, "distclean", "resolve", "build");
     * ```
     */
    function bob(options?: LuaMap<string, string | number | boolean | (string | number | boolean)[]> | Record<string, string | number | boolean | (string | number | boolean)[]>, ...args: string[]): void;
    /**
     * Open a URL in the default browser or a registered application
     *
     * @param url - http(s) or file URL
     */
    function browse(url: string): void;
    /**
     * Check whether this list property supports add, clear, and remove operations on the supplied node.
     *
     * @param node - Either resource path (e.g. `"/main/game.script"`), or internal node id passed to the script by the editor
     * @param property - Either `"path"`, `"text"`, or a property from the Outline view (hover the label to see its editor script name)
     */
    function can_add(node: string | Opaque<"userdata">, property: string): boolean;
    /**
     * Check whether this property is exposed for reading on the supplied node or resource.
     *
     * @param node - Either resource path (e.g. `"/main/game.script"`), or internal node id passed to the script by the editor
     * @param property - Either `"path"`, `"text"`, or a property from the Outline view (hover the label to see its editor script name)
     */
    function can_get(node: string | Opaque<"userdata">, property: string): boolean;
    /**
     * Check whether this list property supports reordering on the supplied node.
     *
     * @param node - Either resource path (e.g. `"/main/game.script"`), or internal node id passed to the script by the editor
     * @param property - Either `"path"`, `"text"`, or a property from the Outline view (hover the label to see its editor script name)
     */
    function can_reorder(node: string | Opaque<"userdata">, property: string): boolean;
    /**
     * Check whether this property supports reset on the supplied node.
     *
     * @param node - Either resource path (e.g. `"/main/game.script"`), or internal node id passed to the script by the editor
     * @param property - Either `"path"`, `"text"`, or a property from the Outline view (hover the label to see its editor script name)
     */
    function can_reset(node: string | Opaque<"userdata">, property: string): boolean;
    /**
     * Check whether this property is exposed for setting on the supplied node.
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
     * @param resources - resource paths (strings starting with `/`) or pairs containing a resource path and optional content
     * @example
     * Create a single resource from template:
     * ```ts
     * editor.create_resources(["/npc.go"]);
     * ```
     * @example
     * Create multiple resources:
     * ```ts
     * editor.create_resources(["/npc.go", "/levels/1.collection", "/levels/2.collection"]);
     * ```
     * @example
     * Create a resource with custom content:
     * ```ts
     * editor.create_resources([{ 1: "/npc.script", 2: "go.property('hp', 100)" }]);
     * ```
     */
    function create_resources(resources: (string | editor.create_resources.resource)[]): void;
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
     * @param options - execution options
     * @returns If `out` option is set to `"capture"`, returns the output as string with trimmed trailing newlines. Otherwise, returns `nil`.
     * @example
     * Make a directory with spaces in it:
     * ```ts
     * editor.execute("mkdir", "new dir");
     * ```
     * @example
     * Read the git status:
     * ```ts
     * const status = editor.execute("git", "status", "--porcelain", {
     *   reload_resources: false,
     *   out: "capture",
     * });
     * ```
     */
    function execute(command: string, ...args: (string | editor.execute.options)[]): undefined | string;
    /**
     * Query information about file system path
     *
     * @param path - External file path, resolved against project root if relative
     * @returns external file attributes
     */
    function external_file_attributes(path: string): editor.external_file_attributes.result;
    /**
     * Download the latest version of the project library dependencies and reload library-provided editor scripts.
     * This function may replace library-provided editor commands, hooks, routes, and UI contributed by editor scripts, so it should typically be the last operation performed by a command.
     */
    function fetch_libraries(): void;
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
     * @returns sorted unique editor property names available in the current context
     */
    function properties(node: string | Opaque<"userdata">): string[];
    /**
     * Query information about a project resource
     *
     * @param resource_path - Resource path (starting with `/`)
     * @returns resource attributes
     */
    function resource_attributes(resource_path: string): editor.resource_attributes.result;
    /**
     * Persist any unsaved changes to disk
     */
    function save(): void;
    /**
     * Change the editor state in a single, undoable transaction
     *
     * @param txs - An array of transaction steps created using `editor.tx.*` functions
     */
    function transact(txs: Opaque<"transaction_step">[]): void;
    namespace command {
      /**
       * Context provided to editor command handler functions
       */
      interface context {
        /**
         * current selection, populated when requested by the command query
         */
        selection?: string | Opaque<"userdata"> | (string | Opaque<"userdata">)[];
        /**
         * current active editor view, populated when requested by the command query
         */
        active_view?: Opaque<"userdata">;
        /**
         * command argument, populated when requested by the command query
         */
        argument?: unknown;
      }
      type location = "Assets" | "Bundle" | "Code" | "Debug" | "Edit" | "Help" | "Outline" | "Project" | "Scene" | "View";
      /**
       * Options used to create an editor command
       */
      interface options {
        /**
         * user-visible command name, either a string or a localization message
         */
        label: string | Opaque<"message">;
        /**
         * non-empty list of locations where the command is displayed
         */
        locations: editor.command.location[];
        /**
         * query that controls command availability and provides context to its handler functions
         */
        query?: editor.command.query;
        /**
         * keyword identifier that may be used for assigning a shortcut to a command; should be a dot-separated identifier string, e.g. `"my-extension.do-stuff"`
         */
        id?: string;
        /**
         * function that additionally checks if a command is active in the current context; should be fast to execute since the editor might invoke it in response to UI interactions
         */
        active?: (opts: editor.command.context) => boolean;
        /**
         * function that is invoked when the user decides to execute the command
         */
        run?: (opts: editor.command.context) => unknown;
      }
      /**
       * A query that controls command availability and provides context to its handler functions
       */
      interface query {
        /**
         * current selection request
         */
        selection?: editor.command.query.selection;
        /**
         * current active editor view request
         */
        active_view?: editor.command.query.active_view;
        /**
         * set to true to provide the command argument to the handler functions
         */
        argument?: true;
      }
      namespace query {
        /**
         * Active editor view requested by an editor command
         */
        interface active_view {
          /**
           * active editor view type
           */
          type: "code" | "scene" | "html" | "form";
        }
        /**
         * Selection requested by an editor command
         */
        interface selection {
          /**
           * selection type
           */
          type: "resource" | "outline" | "scene";
          /**
           * either the first selected item or all selected items
           */
          cardinality: "one" | "many";
        }
      }
    }
    namespace create_resources {
      type resource = { 1: string; 2?: string };
    }
    namespace execute {
      /**
       * Options for editor.execute
       */
      interface options {
        /**
         * whether the editor reloads resources from disk after the command is executed; defaults to true
         */
        reload_resources?: boolean;
        /**
         * standard output mode; defaults to `"pipe"`
         */
        out?: "pipe" | "capture" | "discard";
        /**
         * standard error output mode; defaults to `"pipe"`
         */
        err?: "pipe" | "stdout" | "discard";
      }
    }
    namespace external_file_attributes {
      /**
       * External file attributes
       */
      interface result {
        /**
         * resolved file path
         */
        path: string;
        /**
         * whether there is a file system entry at the path
         */
        exists: boolean;
        /**
         * whether the path corresponds to a file
         */
        is_file: boolean;
        /**
         * whether the path corresponds to a directory
         */
        is_directory: boolean;
      }
    }
    namespace prefs {
      type SCOPE = typeof editor.prefs.SCOPE.GLOBAL | typeof editor.prefs.SCOPE.PROJECT;
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
         * @param opts - schema options
         * @returns Prefs schema
         */
        export function array(opts: editor.prefs.schema.array.options): editor.schema;
        /**
         * boolean schema
         *
         * @param opts - schema options
         * @returns Prefs schema
         */
        export function boolean(opts?: editor.prefs.schema.boolean.options): editor.schema;
        /**
         * enum value schema
         *
         * @param opts - schema options
         * @returns Prefs schema
         */
        function _enum(opts: editor.prefs.schema.enum.options): editor.schema;
        /**
         * integer schema
         *
         * @param opts - schema options
         * @returns Prefs schema
         */
        export function integer(opts?: editor.prefs.schema.integer.options): editor.schema;
        /**
         * keyword schema
         * A keyword is a short string that is interned within the editor runtime, useful e.g. for identifiers
         *
         * @param opts - schema options
         * @returns Prefs schema
         */
        export function keyword(opts?: editor.prefs.schema.keyword.options): editor.schema;
        /**
         * floating-point number schema
         *
         * @param opts - schema options
         * @returns Prefs schema
         */
        export function number(opts?: editor.prefs.schema.number.options): editor.schema;
        /**
         * heterogeneous object schema
         *
         * @param opts - schema options
         * @returns Prefs schema
         */
        export function object(opts: editor.prefs.schema.object.options): editor.schema;
        /**
         * homogeneous object schema
         *
         * @param opts - schema options
         * @returns Prefs schema
         */
        export function object_of(opts: editor.prefs.schema.object_of.options): editor.schema;
        /**
         * one of schema
         *
         * @param opts - schema options
         * @returns Prefs schema
         */
        export function one_of(opts: editor.prefs.schema.one_of.options): editor.schema;
        /**
         * password schema
         * A password is a string that is encrypted when stored in a preference file
         *
         * @param opts - schema options
         * @returns Prefs schema
         */
        export function password(opts?: editor.prefs.schema.password.options): editor.schema;
        /**
         * set schema
         * Set is represented as a lua table with `true` values
         *
         * @param opts - schema options
         * @returns Prefs schema
         */
        export function set(opts: editor.prefs.schema.set.options): editor.schema;
        /**
         * string schema
         *
         * @param opts - schema options
         * @returns Prefs schema
         */
        export function string(opts?: editor.prefs.schema.string.options): editor.schema;
        /**
         * tuple schema
         * A tuple is a fixed-length array where each item has its own defined type
         *
         * @param opts - schema options
         * @returns Prefs schema
         */
        export function tuple(opts: editor.prefs.schema.tuple.options): editor.schema;
        export { _enum as enum };
        export namespace array {
          /**
           * Options for editor.prefs.schema.array
           */
          interface options {
            /**
             * array item schema
             */
            item: editor.schema;
            /**
             * default value
             */
            default?: unknown[];
            /**
             * preference scope; global values are shared by every project on this computer, while project values are stored separately per project
             */
            scope?: editor.prefs.SCOPE;
          }
        }
        export namespace boolean {
          /**
           * Options for editor.prefs.schema.boolean
           */
          interface options {
            /**
             * default value
             */
            default?: boolean;
            /**
             * preference scope; global values are shared by every project on this computer, while project values are stored separately per project
             */
            scope?: editor.prefs.SCOPE;
          }
        }
        namespace _enum {
          /**
           * Options for editor.prefs.schema.enum
           */
          interface options {
            /**
             * allowed values, must be scalar (nil, boolean, number or string)
             */
            values: (undefined | boolean | number | string)[];
            /**
             * default value
             */
            default?: unknown;
            /**
             * preference scope; global values are shared by every project on this computer, while project values are stored separately per project
             */
            scope?: editor.prefs.SCOPE;
          }
        }
        export namespace integer {
          /**
           * Options for editor.prefs.schema.integer
           */
          interface options {
            /**
             * default value
             */
            default?: number;
            /**
             * preference scope; global values are shared by every project on this computer, while project values are stored separately per project
             */
            scope?: editor.prefs.SCOPE;
          }
        }
        export namespace keyword {
          /**
           * Options for editor.prefs.schema.keyword
           */
          interface options {
            /**
             * default value
             */
            default?: string;
            /**
             * preference scope; global values are shared by every project on this computer, while project values are stored separately per project
             */
            scope?: editor.prefs.SCOPE;
          }
        }
        export namespace number {
          /**
           * Options for editor.prefs.schema.number
           */
          interface options {
            /**
             * default value
             */
            default?: number;
            /**
             * preference scope; global values are shared by every project on this computer, while project values are stored separately per project
             */
            scope?: editor.prefs.SCOPE;
          }
        }
        export namespace object {
          /**
           * Options for editor.prefs.schema.object
           */
          interface options {
            /**
             * a table from property key (string) to value schema
             */
            properties: LuaTable<string, editor.schema>;
            /**
             * default value
             */
            default?: LuaTable<string, unknown>;
            /**
             * preference scope; global values are shared by every project on this computer, while project values are stored separately per project
             */
            scope?: editor.prefs.SCOPE;
          }
        }
        export namespace object_of {
          /**
           * Options for editor.prefs.schema.object_of
           */
          interface options {
            /**
             * table key schema
             */
            key: editor.schema;
            /**
             * table value schema
             */
            val: editor.schema;
            /**
             * default value
             */
            default?: LuaTable<AnyNotNil, unknown>;
            /**
             * preference scope; global values are shared by every project on this computer, while project values are stored separately per project
             */
            scope?: editor.prefs.SCOPE;
          }
        }
        export namespace one_of {
          /**
           * Options for editor.prefs.schema.one_of
           */
          interface options {
            /**
             * alternative schemas
             */
            schemas: editor.schema[];
            /**
             * default value
             */
            default?: unknown;
            /**
             * preference scope; global values are shared by every project on this computer, while project values are stored separately per project
             */
            scope?: editor.prefs.SCOPE;
          }
        }
        export namespace password {
          /**
           * Options for editor.prefs.schema.password
           */
          interface options {
            /**
             * default value
             */
            default?: string;
            /**
             * preference scope; global values are shared by every project on this computer, while project values are stored separately per project
             */
            scope?: editor.prefs.SCOPE;
          }
        }
        export namespace set {
          /**
           * Options for editor.prefs.schema.set
           */
          interface options {
            /**
             * set item schema
             */
            item: editor.schema;
            /**
             * default value
             */
            default?: LuaTable<AnyNotNil, true>;
            /**
             * preference scope; global values are shared by every project on this computer, while project values are stored separately per project
             */
            scope?: editor.prefs.SCOPE;
          }
        }
        export namespace string {
          /**
           * Options for editor.prefs.schema.string
           */
          interface options {
            /**
             * default value
             */
            default?: string;
            /**
             * preference scope; global values are shared by every project on this computer, while project values are stored separately per project
             */
            scope?: editor.prefs.SCOPE;
          }
        }
        export namespace tuple {
          /**
           * Options for editor.prefs.schema.tuple
           */
          interface options {
            /**
             * schemas for the items
             */
            items: editor.schema[];
            /**
             * default value
             */
            default?: unknown[];
            /**
             * preference scope; global values are shared by every project on this computer, while project values are stored separately per project
             */
            scope?: editor.prefs.SCOPE;
          }
        }
      }
      namespace SCOPE {
        /**
         * `"global"`
         */
        const GLOBAL: string & { readonly __brand: "editor.prefs.SCOPE.GLOBAL" };
        /**
         * `"project"`
         */
        const PROJECT: string & { readonly __brand: "editor.prefs.SCOPE.PROJECT" };
      }
    }
    namespace resource_attributes {
      /**
       * Project resource attributes
       */
      interface result {
        /**
         * whether a resource identified by the path exists in the project
         */
        exists: boolean;
        /**
         * whether the resource represents a file with some content
         */
        is_file: boolean;
        /**
         * whether the resource represents a directory
         */
        is_directory: boolean;
      }
    }
    namespace tx {
      /**
       * Create a transaction step that will add a child item to a node's list property when transacted with `editor.transact()`.
       *
       * @param node - Either resource path (e.g. `"/main/game.script"`), or internal node id passed to the script by the editor
       * @param property - Either `"path"`, `"text"`, or a property from the Outline view (hover the label to see its editor script name)
       * @param value - Added item for the property, a table from property key to either a valid `editor.tx.set()`-able value, or an array of valid `editor.tx.add()`-able values
       * @returns A transaction step
       */
      function add(node: string | Opaque<"userdata">, property: string, value: LuaMap<string, unknown> | Record<string, unknown>): Opaque<"transaction_step">;
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
      function reorder(node: string | Opaque<"userdata">, property: string, child_nodes: unknown[]): Opaque<"transaction_step">;
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
       * External file dialog filter
       */
      interface external_file_filter {
        /**
         * text explaining the filter, either a literal string like `"Text files (*.txt)"` or a localization message
         */
        description: string | Opaque<"message">;
        /**
         * file extension patterns, e.g. `"*.txt"`, `"*.*"`, or `"game.project"`
         */
        extensions: string[];
      }
      /**
       * Issue associated with an input component
       */
      interface issue {
        /**
         * issue severity
         */
        severity: editor.ui.ISSUE_SEVERITY;
        /**
         * issue message shown in a tooltip, either a string or a localization message
         */
        message: string | Opaque<"message">;
      }
      type ALIGNMENT = typeof editor.ui.ALIGNMENT.TOP_LEFT | typeof editor.ui.ALIGNMENT.TOP | typeof editor.ui.ALIGNMENT.TOP_RIGHT | typeof editor.ui.ALIGNMENT.LEFT | typeof editor.ui.ALIGNMENT.CENTER | typeof editor.ui.ALIGNMENT.RIGHT | typeof editor.ui.ALIGNMENT.BOTTOM_LEFT | typeof editor.ui.ALIGNMENT.BOTTOM | typeof editor.ui.ALIGNMENT.BOTTOM_RIGHT;
      type COLOR = typeof editor.ui.COLOR.TEXT | typeof editor.ui.COLOR.HINT | typeof editor.ui.COLOR.OVERRIDE | typeof editor.ui.COLOR.WARNING | typeof editor.ui.COLOR.ERROR;
      type HEADING_STYLE = typeof editor.ui.HEADING_STYLE.H1 | typeof editor.ui.HEADING_STYLE.H2 | typeof editor.ui.HEADING_STYLE.H3 | typeof editor.ui.HEADING_STYLE.H4 | typeof editor.ui.HEADING_STYLE.H5 | typeof editor.ui.HEADING_STYLE.H6 | typeof editor.ui.HEADING_STYLE.DIALOG | typeof editor.ui.HEADING_STYLE.FORM;
      type ICON = typeof editor.ui.ICON.OPEN_RESOURCE | typeof editor.ui.ICON.PLUS | typeof editor.ui.ICON.MINUS | typeof editor.ui.ICON.CLEAR;
      type ISSUE_SEVERITY = typeof editor.ui.ISSUE_SEVERITY.WARNING | typeof editor.ui.ISSUE_SEVERITY.ERROR;
      type ORIENTATION = typeof editor.ui.ORIENTATION.VERTICAL | typeof editor.ui.ORIENTATION.HORIZONTAL;
      type PADDING = typeof editor.ui.PADDING.NONE | typeof editor.ui.PADDING.SMALL | typeof editor.ui.PADDING.MEDIUM | typeof editor.ui.PADDING.LARGE;
      type SPACING = typeof editor.ui.SPACING.NONE | typeof editor.ui.SPACING.SMALL | typeof editor.ui.SPACING.MEDIUM | typeof editor.ui.SPACING.LARGE;
      type TEXT_ALIGNMENT = typeof editor.ui.TEXT_ALIGNMENT.LEFT | typeof editor.ui.TEXT_ALIGNMENT.CENTER | typeof editor.ui.TEXT_ALIGNMENT.RIGHT | typeof editor.ui.TEXT_ALIGNMENT.JUSTIFY;
      /**
       * Button with a label and/or an icon
       *
       * @param props - component properties
       * @returns UI component
       */
      function button(props: editor.ui.button.props): Opaque<"component">;
      /**
       * Check box with a label
       *
       * @param props - component properties
       * @returns UI component
       */
      function check_box(props: editor.ui.check_box.props): Opaque<"component">;
      /**
       * Convert a function to a UI component.
       * The wrapped function may call any hooks functions (`editor.ui.use_*`), but on any function invocation, the hooks calls must be the same, and in the same order. This means that hooks should not be used inside loops and conditions or after a conditional return statement.
       * The `grow`, `row_span`, and `column_span` props are supported automatically.
       *
       * @param fn - function, will receive a single table of props when called
       * @returns decorated component function that may be invoked with a props table to create a component
       */
      function component(fn: (props: unknown) => Opaque<"component">): (props: unknown) => Opaque<"component">;
      /**
       * Dialog component, a top-level window component that can't be used as a child of other components
       *
       * @param props - component properties
       * @returns UI component
       */
      function dialog(props: editor.ui.dialog.props): Opaque<"component">;
      /**
       * Dialog button shown in the footer of a dialog
       *
       * @param props - component properties
       * @returns UI component
       */
      function dialog_button(props: editor.ui.dialog_button.props): Opaque<"component">;
      /**
       * Input component for selecting files from the file system
       *
       * @param props - component properties
       * @returns UI component
       */
      function external_file_field(props: editor.ui.external_file_field.props): Opaque<"component">;
      /**
       * Layout container that places its children in a 2D grid
       *
       * @param props - component properties
       * @returns UI component
       */
      function grid(props: editor.ui.grid.props): Opaque<"component">;
      /**
       * A text heading
       *
       * @param props - component properties
       * @returns UI component
       */
      function heading(props: editor.ui.heading.props): Opaque<"component">;
      /**
       * Layout container that places its children in a horizontal row one after another
       *
       * @param props - component properties
       * @returns UI component
       */
      function horizontal(props: editor.ui.horizontal.props): Opaque<"component">;
      /**
       * An icon from a predefined set
       *
       * @param props - component properties
       * @returns UI component
       */
      function icon(props: editor.ui.icon.props): Opaque<"component">;
      /**
       * An image
       *
       * @param props - component properties
       * @returns UI component
       */
      function image(props: editor.ui.image.props): Opaque<"component">;
      /**
       * Integer input component based on a text field, reports changes on commit (`Enter` or focus loss)
       *
       * @param props - component properties
       * @returns UI component
       */
      function integer_field(props: editor.ui.integer_field.props): Opaque<"component">;
      /**
       * Label intended for use with input components
       *
       * @param props - component properties
       * @returns UI component
       */
      function label(props: editor.ui.label.props): Opaque<"component">;
      /**
       * Number input component based on a text field, reports changes on commit (`Enter` or focus loss)
       *
       * @param props - component properties
       * @returns UI component
       */
      function number_field(props: editor.ui.number_field.props): Opaque<"component">;
      /**
       * Open a resource using its primary or selected view, either in the editor or in a third-party app. Code and Text views accept a one-based cursor or range in `args`: `{line = 42}`, `{line = 42, column = 12}`, or `{from = {line = 42, column = 12}, to = {line = 43, column = 4}}`
       *
       * @param resource_path - Resource path (starting with `/`)
       * @param view - View to open: `"code"`, `"text"`, `"scene"`, `"html"`, or `"form"`
       * @param args - View-specific open arguments; requires `view`. Currently supported by Code and Text views. **⚠️ 1-based; passed to Defold unchanged.**
       */
      function open_resource(resource_path: string, view?: string, args?: unknown): void;
      /**
       * A paragraph of text
       *
       * @param props - component properties
       * @returns UI component
       */
      function paragraph(props: editor.ui.paragraph.props): Opaque<"component">;
      /**
       * Input component for selecting project resources
       *
       * @param props - component properties
       * @returns UI component
       */
      function resource_field(props: editor.ui.resource_field.props): Opaque<"component">;
      /**
       * Layout container that optionally shows scroll bars if child contents overflow the assigned bounds
       *
       * @param props - component properties
       * @returns UI component
       */
      function scroll(props: editor.ui.scroll.props): Opaque<"component">;
      /**
       * Dropdown select box with an array of options
       *
       * @param props - component properties
       * @returns UI component
       */
      function select_box(props: editor.ui.select_box.props): Opaque<"component">;
      /**
       * Thin line for visual content separation, by default horizontal and aligned to center
       *
       * @param props - component properties
       * @returns UI component
       */
      function separator(props: editor.ui.separator.props): Opaque<"component">;
      /**
       * Show a dialog and await a result
       *
       * @param dialog - a component that resolves to `editor.ui.dialog(...)`
       * @returns dialog result, the value used as a `result` prop in a `editor.ui.dialog_button({...})` selected by the user, or `nil` if the dialog was closed and there was no `cancel = true` dialog button with `result` prop set
       */
      function show_dialog(dialog: Opaque<"component">): unknown;
      /**
       * Show a modal OS directory selection dialog and await a result
       *
       * @param opts - dialog options
       * @returns either absolute directory path or nil if user canceled directory selection
       */
      function show_external_directory_dialog(opts?: editor.ui.show_external_directory_dialog.options): string | undefined;
      /**
       * Show a modal OS file selection dialog and await a result
       *
       * @param opts - dialog options
       * @returns either absolute file path or nil if user canceled file selection
       */
      function show_external_file_dialog(opts?: editor.ui.show_external_file_dialog.options): string | undefined;
      /**
       * Show a modal resource selection dialog and await a result
       *
       * @param opts - dialog options
       * @returns if user made no selection, returns `nil`. Otherwise, if selection mode is `"single"`, returns selected resource path; otherwise returns a non-empty array of selected resource paths.
       */
      function show_resource_dialog(opts?: editor.ui.show_resource_dialog.options): string | string[] | undefined;
      /**
       * String input component based on a text field, reports changes on commit (`Enter` or focus loss)
       *
       * @param props - component properties
       * @returns UI component
       */
      function string_field(props: editor.ui.string_field.props): Opaque<"component">;
      /**
       * Tab used in the `tabs` prop of `editor.ui.tabs(...)`
       *
       * @param props - component properties
       * @returns UI component
       */
      function tab(props: editor.ui.tab.props): Opaque<"component">;
      /**
       * Layout container that shows one selected tab content at a time
       *
       * @param props - component properties
       * @returns UI component
       */
      function tabs(props: editor.ui.tabs.props): Opaque<"component">;
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
       *   const onPressed = editor.ui.use_memo(makeListener, setCount) as () => void;
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
       * @param props - component properties
       * @returns UI component
       */
      function vertical(props: editor.ui.vertical.props): Opaque<"component">;
      namespace ALIGNMENT {
        /**
         * `"bottom"`
         */
        const BOTTOM: string & { readonly __brand: "editor.ui.ALIGNMENT.BOTTOM" };
        /**
         * `"bottom-left"`
         */
        const BOTTOM_LEFT: string & { readonly __brand: "editor.ui.ALIGNMENT.BOTTOM_LEFT" };
        /**
         * `"bottom-right"`
         */
        const BOTTOM_RIGHT: string & { readonly __brand: "editor.ui.ALIGNMENT.BOTTOM_RIGHT" };
        /**
         * `"center"`
         */
        const CENTER: string & { readonly __brand: "editor.ui.ALIGNMENT.CENTER" };
        /**
         * `"left"`
         */
        const LEFT: string & { readonly __brand: "editor.ui.ALIGNMENT.LEFT" };
        /**
         * `"right"`
         */
        const RIGHT: string & { readonly __brand: "editor.ui.ALIGNMENT.RIGHT" };
        /**
         * `"top"`
         */
        const TOP: string & { readonly __brand: "editor.ui.ALIGNMENT.TOP" };
        /**
         * `"top-left"`
         */
        const TOP_LEFT: string & { readonly __brand: "editor.ui.ALIGNMENT.TOP_LEFT" };
        /**
         * `"top-right"`
         */
        const TOP_RIGHT: string & { readonly __brand: "editor.ui.ALIGNMENT.TOP_RIGHT" };
      }
      namespace button {
        /**
         * Properties for editor.ui.button
         */
        interface props {
          /**
           * button press callback, will be invoked without arguments when the user presses the button
           */
          on_pressed?: (...args: unknown[]) => unknown;
          /**
           * the text, either a string or a localization message
           */
          text?: string | Opaque<"message">;
          /**
           * text alignment within paragraph bounds
           */
          text_alignment?: editor.ui.TEXT_ALIGNMENT;
          /**
           * predefined icon name
           */
          icon?: editor.ui.ICON;
          /**
           * determines if the input component can be interacted with
           */
          enabled?: boolean;
          /**
           * alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`
           */
          alignment?: editor.ui.ALIGNMENT;
          /**
           * determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container
           */
          grow?: boolean;
          /**
           * how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          row_span?: number;
          /**
           * how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          column_span?: number;
        }
      }
      namespace check_box {
        /**
         * Properties for editor.ui.check_box
         */
        interface props {
          /**
           * determines if the checkbox should appear checked
           */
          value?: boolean;
          /**
           * change callback, will receive the new value
           */
          on_value_changed?: (...args: unknown[]) => unknown;
          /**
           * determines if the checkbox should appear in the mixed state
           */
          indeterminate?: boolean;
          /**
           * the text, either a string or a localization message
           */
          text?: string | Opaque<"message">;
          /**
           * text alignment within paragraph bounds
           */
          text_alignment?: editor.ui.TEXT_ALIGNMENT;
          /**
           * issue related to the input, or false if there is no issue
           */
          issue?: editor.ui.issue | false;
          /**
           * tooltip message shown on hover; either a string or a localization message
           */
          tooltip?: string | Opaque<"message">;
          /**
           * determines if the input component can be interacted with
           */
          enabled?: boolean;
          /**
           * alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`
           */
          alignment?: editor.ui.ALIGNMENT;
          /**
           * determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container
           */
          grow?: boolean;
          /**
           * how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          row_span?: number;
          /**
           * how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          column_span?: number;
        }
      }
      namespace COLOR {
        /**
         * `"error"`
         */
        const ERROR: string & { readonly __brand: "editor.ui.COLOR.ERROR" };
        /**
         * `"hint"`
         */
        const HINT: string & { readonly __brand: "editor.ui.COLOR.HINT" };
        /**
         * `"override"`
         */
        const OVERRIDE: string & { readonly __brand: "editor.ui.COLOR.OVERRIDE" };
        /**
         * `"text"`
         */
        const TEXT: string & { readonly __brand: "editor.ui.COLOR.TEXT" };
        /**
         * `"warning"`
         */
        const WARNING: string & { readonly __brand: "editor.ui.COLOR.WARNING" };
      }
      namespace dialog {
        /**
         * Properties for editor.ui.dialog
         */
        interface props {
          /**
           * OS dialog window title, either a string or a localization message
           */
          title: string | Opaque<"message">;
          /**
           * top part of the dialog, defaults to `editor.ui.heading({text = props.title})`
           */
          header?: Opaque<"component"> | false;
          /**
           * content of the dialog
           */
          content?: Opaque<"component"> | false;
          /**
           * initial width of the dialog window in pixels
           */
          width?: number;
          /**
           * initial height of the dialog window in pixels
           */
          height?: number;
          /**
           * determines if the dialog window can be resized by the user
           */
          resizable?: boolean;
          /**
           * array of `editor.ui.dialog_button(...)` components, footer of the dialog. Defaults to a single Close button
           */
          buttons?: (Opaque<"component"> | false)[];
          /**
           * if set to `false`, the dialog window stays on top but does not block interaction with the editor
           */
          modal?: boolean;
        }
      }
      namespace dialog_button {
        /**
         * Properties for editor.ui.dialog_button
         */
        interface props {
          /**
           * button text, either a string or a localization message
           */
          text: string | Opaque<"message">;
          /**
           * value returned by `editor.ui.show_dialog(...)` if this button is pressed
           */
          result?: unknown;
          /**
           * if set, pressing `Enter` in the dialog will trigger this button
           */
          default?: boolean;
          /**
           * if set, pressing `Escape` in the dialog will trigger this button
           */
          cancel?: boolean;
          /**
           * determines if the button can be interacted with
           */
          enabled?: boolean;
        }
      }
      namespace external_file_field {
        /**
         * Properties for editor.ui.external_file_field
         */
        interface props {
          /**
           * file or directory path; resolved against project root if relative
           */
          value?: string;
          /**
           * value change callback, will receive the absolute path of a selected file/folder or nil if the field was cleared; even though the selector dialog allows selecting only files, it's possible to receive directories and non-existent file system entries using text field input
           */
          on_value_changed?: (...args: unknown[]) => unknown;
          /**
           * OS window title, either a string or a localization message
           */
          title?: string | Opaque<"message">;
          /**
           * File filters
           */
          filters?: editor.ui.external_file_filter[];
          /**
           * issue related to the input, or false if there is no issue
           */
          issue?: editor.ui.issue | false;
          /**
           * tooltip message shown on hover; either a string or a localization message
           */
          tooltip?: string | Opaque<"message">;
          /**
           * determines if the input component can be interacted with
           */
          enabled?: boolean;
          /**
           * alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`
           */
          alignment?: editor.ui.ALIGNMENT;
          /**
           * determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container
           */
          grow?: boolean;
          /**
           * how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          row_span?: number;
          /**
           * how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          column_span?: number;
        }
      }
      namespace grid {
        /**
         * Grid row or column constraint
         */
        interface constraint {
          /**
           * whether the row or column should grow to fill available space
           */
          grow?: boolean;
        }
        /**
         * Properties for editor.ui.grid
         */
        interface props {
          /**
           * array of arrays of child components
           */
          children?: ((Opaque<"component"> | false)[] | false)[];
          /**
           * separate configuration for each row
           */
          rows?: (editor.ui.grid.constraint | false)[];
          /**
           * separate configuration for each column
           */
          columns?: (editor.ui.grid.constraint | false)[];
          /**
           * empty space from the edges of the container to its children, either a predefined padding value or a non-negative number of pixels
           */
          padding?: editor.ui.PADDING | number;
          /**
           * empty space between child components, either a predefined spacing value or a non-negative number of pixels; defaults to `editor.ui.SPACING.MEDIUM`
           */
          spacing?: editor.ui.SPACING | number;
          /**
           * alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`
           */
          alignment?: editor.ui.ALIGNMENT;
          /**
           * determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container
           */
          grow?: boolean;
          /**
           * how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          row_span?: number;
          /**
           * how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          column_span?: number;
        }
      }
      namespace heading {
        /**
         * Properties for editor.ui.heading
         */
        interface props {
          /**
           * the text, either a string or a localization message
           */
          text?: string | Opaque<"message">;
          /**
           * text alignment within paragraph bounds
           */
          text_alignment?: editor.ui.TEXT_ALIGNMENT;
          /**
           * semantic color, defaults to `editor.ui.COLOR.TEXT`
           */
          color?: editor.ui.COLOR;
          /**
           * determines if the lines of text are word-wrapped when they don't fit in the assigned bounds, defaults to true
           */
          word_wrap?: boolean;
          /**
           * heading style, defaults to `editor.ui.HEADING_STYLE.H3`
           */
          style?: editor.ui.HEADING_STYLE;
          /**
           * alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`
           */
          alignment?: editor.ui.ALIGNMENT;
          /**
           * determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container
           */
          grow?: boolean;
          /**
           * how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          row_span?: number;
          /**
           * how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          column_span?: number;
        }
      }
      namespace HEADING_STYLE {
        /**
         * `"dialog"`
         */
        const DIALOG: string & { readonly __brand: "editor.ui.HEADING_STYLE.DIALOG" };
        /**
         * `"form"`
         */
        const FORM: string & { readonly __brand: "editor.ui.HEADING_STYLE.FORM" };
        /**
         * `"h1"`
         */
        const H1: string & { readonly __brand: "editor.ui.HEADING_STYLE.H1" };
        /**
         * `"h2"`
         */
        const H2: string & { readonly __brand: "editor.ui.HEADING_STYLE.H2" };
        /**
         * `"h3"`
         */
        const H3: string & { readonly __brand: "editor.ui.HEADING_STYLE.H3" };
        /**
         * `"h4"`
         */
        const H4: string & { readonly __brand: "editor.ui.HEADING_STYLE.H4" };
        /**
         * `"h5"`
         */
        const H5: string & { readonly __brand: "editor.ui.HEADING_STYLE.H5" };
        /**
         * `"h6"`
         */
        const H6: string & { readonly __brand: "editor.ui.HEADING_STYLE.H6" };
      }
      namespace horizontal {
        /**
         * Properties for editor.ui.horizontal
         */
        interface props {
          /**
           * array of child components
           */
          children?: (Opaque<"component"> | false)[];
          /**
           * empty space from the edges of the container to its children, either a predefined padding value or a non-negative number of pixels
           */
          padding?: editor.ui.PADDING | number;
          /**
           * empty space between child components, either a predefined spacing value or a non-negative number of pixels; defaults to `editor.ui.SPACING.MEDIUM`
           */
          spacing?: editor.ui.SPACING | number;
          /**
           * alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`
           */
          alignment?: editor.ui.ALIGNMENT;
          /**
           * determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container
           */
          grow?: boolean;
          /**
           * how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          row_span?: number;
          /**
           * how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          column_span?: number;
        }
      }
      namespace icon {
        /**
         * Properties for editor.ui.icon
         */
        interface props {
          /**
           * predefined icon name
           */
          icon: editor.ui.ICON;
          /**
           * alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`
           */
          alignment?: editor.ui.ALIGNMENT;
          /**
           * determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container
           */
          grow?: boolean;
          /**
           * how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          row_span?: number;
          /**
           * how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          column_span?: number;
        }
      }
      namespace ICON {
        /**
         * `"clear"`
         */
        const CLEAR: string & { readonly __brand: "editor.ui.ICON.CLEAR" };
        /**
         * `"minus"`
         */
        const MINUS: string & { readonly __brand: "editor.ui.ICON.MINUS" };
        /**
         * `"open-resource"`
         */
        const OPEN_RESOURCE: string & { readonly __brand: "editor.ui.ICON.OPEN_RESOURCE" };
        /**
         * `"plus"`
         */
        const PLUS: string & { readonly __brand: "editor.ui.ICON.PLUS" };
      }
      namespace image {
        /**
         * Properties for editor.ui.image
         */
        interface props {
          /**
           * either a resource path (starts with `/`), or an URL
           */
          image: string;
          /**
           * width of the image view, the image will be fit inside it while preserving its aspect ratio
           */
          width?: number;
          /**
           * height of the image view, the image will be fit inside it while preserving its aspect ratio
           */
          height?: number;
          /**
           * alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`
           */
          alignment?: editor.ui.ALIGNMENT;
          /**
           * determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container
           */
          grow?: boolean;
          /**
           * how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          row_span?: number;
          /**
           * how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          column_span?: number;
        }
      }
      namespace integer_field {
        /**
         * Properties for editor.ui.integer_field
         */
        interface props {
          /**
           * value
           */
          value?: unknown;
          /**
           * value change callback, will receive the new value
           */
          on_value_changed?: (...args: unknown[]) => unknown;
          /**
           * issue related to the input, or false if there is no issue
           */
          issue?: editor.ui.issue | false;
          /**
           * tooltip message shown on hover; either a string or a localization message
           */
          tooltip?: string | Opaque<"message">;
          /**
           * determines if the input component can be interacted with
           */
          enabled?: boolean;
          /**
           * alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`
           */
          alignment?: editor.ui.ALIGNMENT;
          /**
           * determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container
           */
          grow?: boolean;
          /**
           * how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          row_span?: number;
          /**
           * how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          column_span?: number;
        }
      }
      namespace ISSUE_SEVERITY {
        /**
         * `"error"`
         */
        const ERROR: string & { readonly __brand: "editor.ui.ISSUE_SEVERITY.ERROR" };
        /**
         * `"warning"`
         */
        const WARNING: string & { readonly __brand: "editor.ui.ISSUE_SEVERITY.WARNING" };
      }
      namespace label {
        /**
         * Properties for editor.ui.label
         */
        interface props {
          /**
           * the text, either a string or a localization message
           */
          text?: string | Opaque<"message">;
          /**
           * text alignment within paragraph bounds
           */
          text_alignment?: editor.ui.TEXT_ALIGNMENT;
          /**
           * semantic color, defaults to `editor.ui.COLOR.TEXT`
           */
          color?: editor.ui.COLOR;
          /**
           * tooltip message shown on hover; either a string or a localization message
           */
          tooltip?: string | Opaque<"message">;
          /**
           * alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`
           */
          alignment?: editor.ui.ALIGNMENT;
          /**
           * determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container
           */
          grow?: boolean;
          /**
           * how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          row_span?: number;
          /**
           * how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          column_span?: number;
        }
      }
      namespace number_field {
        /**
         * Properties for editor.ui.number_field
         */
        interface props {
          /**
           * value
           */
          value?: unknown;
          /**
           * value change callback, will receive the new value
           */
          on_value_changed?: (...args: unknown[]) => unknown;
          /**
           * issue related to the input, or false if there is no issue
           */
          issue?: editor.ui.issue | false;
          /**
           * tooltip message shown on hover; either a string or a localization message
           */
          tooltip?: string | Opaque<"message">;
          /**
           * determines if the input component can be interacted with
           */
          enabled?: boolean;
          /**
           * alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`
           */
          alignment?: editor.ui.ALIGNMENT;
          /**
           * determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container
           */
          grow?: boolean;
          /**
           * how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          row_span?: number;
          /**
           * how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          column_span?: number;
        }
      }
      namespace ORIENTATION {
        /**
         * `"horizontal"`
         */
        const HORIZONTAL: string & { readonly __brand: "editor.ui.ORIENTATION.HORIZONTAL" };
        /**
         * `"vertical"`
         */
        const VERTICAL: string & { readonly __brand: "editor.ui.ORIENTATION.VERTICAL" };
      }
      namespace PADDING {
        /**
         * `"large"`
         */
        const LARGE: string & { readonly __brand: "editor.ui.PADDING.LARGE" };
        /**
         * `"medium"`
         */
        const MEDIUM: string & { readonly __brand: "editor.ui.PADDING.MEDIUM" };
        /**
         * `"none"`
         */
        const NONE: string & { readonly __brand: "editor.ui.PADDING.NONE" };
        /**
         * `"small"`
         */
        const SMALL: string & { readonly __brand: "editor.ui.PADDING.SMALL" };
      }
      namespace paragraph {
        /**
         * Properties for editor.ui.paragraph
         */
        interface props {
          /**
           * the text, either a string or a localization message
           */
          text?: string | Opaque<"message">;
          /**
           * text alignment within paragraph bounds
           */
          text_alignment?: editor.ui.TEXT_ALIGNMENT;
          /**
           * semantic color, defaults to `editor.ui.COLOR.TEXT`
           */
          color?: editor.ui.COLOR;
          /**
           * determines if the lines of text are word-wrapped when they don't fit in the assigned bounds, defaults to true
           */
          word_wrap?: boolean;
          /**
           * alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`
           */
          alignment?: editor.ui.ALIGNMENT;
          /**
           * determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container
           */
          grow?: boolean;
          /**
           * how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          row_span?: number;
          /**
           * how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          column_span?: number;
        }
      }
      namespace resource_field {
        /**
         * Properties for editor.ui.resource_field
         */
        interface props {
          /**
           * resource path (must start with `/`)
           */
          value?: string;
          /**
           * value change callback, will receive either resource path of a selected resource or nil when the field is cleared; even though the resource selector dialog allows filtering on resource extensions, it's possible to receive resources with other extensions and non-existent resources using text field input
           */
          on_value_changed?: (...args: unknown[]) => unknown;
          /**
           * dialog title, either a string or a localization message, defaults to `localization.message("dialog.select-resource.title")`
           */
          title?: string | Opaque<"message">;
          /**
           * if specified, restricts selectable resources in the dialog to specified file extensions; e.g. `{"collection", "go"}`
           */
          extensions?: string[];
          /**
           * issue related to the input, or false if there is no issue
           */
          issue?: editor.ui.issue | false;
          /**
           * tooltip message shown on hover; either a string or a localization message
           */
          tooltip?: string | Opaque<"message">;
          /**
           * determines if the input component can be interacted with
           */
          enabled?: boolean;
          /**
           * alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`
           */
          alignment?: editor.ui.ALIGNMENT;
          /**
           * determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container
           */
          grow?: boolean;
          /**
           * how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          row_span?: number;
          /**
           * how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          column_span?: number;
        }
      }
      namespace scroll {
        /**
         * Properties for editor.ui.scroll
         */
        interface props {
          /**
           * content component
           */
          content: Opaque<"component">;
          /**
           * determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container
           */
          grow?: boolean;
          /**
           * how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          row_span?: number;
          /**
           * how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          column_span?: number;
        }
      }
      namespace select_box {
        /**
         * Properties for editor.ui.select_box
         */
        interface props {
          /**
           * selected value
           */
          value?: unknown;
          /**
           * change callback, will receive the selected value
           */
          on_value_changed?: (...args: unknown[]) => unknown;
          /**
           * array of selectable options
           */
          options?: unknown[];
          /**
           * function that converts an item to a string (or a localization message); defaults to `tostring`
           */
          to_string?: (...args: unknown[]) => unknown;
          /**
           * issue related to the input, or false if there is no issue
           */
          issue?: editor.ui.issue | false;
          /**
           * tooltip message shown on hover; either a string or a localization message
           */
          tooltip?: string | Opaque<"message">;
          /**
           * determines if the input component can be interacted with
           */
          enabled?: boolean;
          /**
           * alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`
           */
          alignment?: editor.ui.ALIGNMENT;
          /**
           * determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container
           */
          grow?: boolean;
          /**
           * how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          row_span?: number;
          /**
           * how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          column_span?: number;
        }
      }
      namespace separator {
        /**
         * Properties for editor.ui.separator
         */
        interface props {
          /**
           * separator line orientation, `editor.ui.ORIENTATION.VERTICAL` or `editor.ui.ORIENTATION.HORIZONTAL`
           */
          orientation?: editor.ui.ORIENTATION;
          /**
           * alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`
           */
          alignment?: editor.ui.ALIGNMENT;
          /**
           * determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container
           */
          grow?: boolean;
          /**
           * how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          row_span?: number;
          /**
           * how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          column_span?: number;
        }
      }
      namespace show_external_directory_dialog {
        /**
         * Options for editor.ui.show_external_directory_dialog
         */
        interface options {
          /**
           * initial file or directory path; resolved against project root if relative
           */
          path?: string;
          /**
           * OS window title, either a string or a localization message
           */
          title?: string | Opaque<"message">;
        }
      }
      namespace show_external_file_dialog {
        /**
         * Options for editor.ui.show_external_file_dialog
         */
        interface options {
          /**
           * initial file or directory path; resolved against project root if relative
           */
          path?: string;
          /**
           * OS window title, either a string or a localization message
           */
          title?: string | Opaque<"message">;
          /**
           * File filters
           */
          filters?: editor.ui.external_file_filter[];
        }
      }
      namespace show_resource_dialog {
        /**
         * Options for editor.ui.show_resource_dialog
         */
        interface options {
          /**
           * if specified, restricts selectable resources in the dialog to specified file extensions; e.g. `{"collection", "go"}`
           */
          extensions?: string[];
          /**
           * selection mode, defaults to `"single"`
           */
          selection?: "single" | "multiple";
          /**
           * dialog title, either a string or a localization message, defaults to `localization.message("dialog.select-resource.title")`
           */
          title?: string | Opaque<"message">;
        }
      }
      namespace SPACING {
        /**
         * `"large"`
         */
        const LARGE: string & { readonly __brand: "editor.ui.SPACING.LARGE" };
        /**
         * `"medium"`
         */
        const MEDIUM: string & { readonly __brand: "editor.ui.SPACING.MEDIUM" };
        /**
         * `"none"`
         */
        const NONE: string & { readonly __brand: "editor.ui.SPACING.NONE" };
        /**
         * `"small"`
         */
        const SMALL: string & { readonly __brand: "editor.ui.SPACING.SMALL" };
      }
      namespace string_field {
        /**
         * Properties for editor.ui.string_field
         */
        interface props {
          /**
           * value
           */
          value?: unknown;
          /**
           * value change callback, will receive the new value
           */
          on_value_changed?: (...args: unknown[]) => unknown;
          /**
           * issue related to the input, or false if there is no issue
           */
          issue?: editor.ui.issue | false;
          /**
           * tooltip message shown on hover; either a string or a localization message
           */
          tooltip?: string | Opaque<"message">;
          /**
           * determines if the input component can be interacted with
           */
          enabled?: boolean;
          /**
           * alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`
           */
          alignment?: editor.ui.ALIGNMENT;
          /**
           * determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container
           */
          grow?: boolean;
          /**
           * how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          row_span?: number;
          /**
           * how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          column_span?: number;
        }
      }
      namespace tab {
        /**
         * Properties for editor.ui.tab
         */
        interface props {
          /**
           * tab header text, either a string or a localization message
           */
          text: string | Opaque<"message">;
          /**
           * tab content component
           */
          content?: Opaque<"component">;
          /**
           * tab header icon component
           */
          icon?: Opaque<"component">;
          /**
           * determines if the tab can be selected
           */
          enabled?: boolean;
        }
      }
      namespace tabs {
        /**
         * Properties for editor.ui.tabs
         */
        interface props {
          /**
           * array of `editor.ui.tab(...)` components
           */
          tabs?: (Opaque<"component"> | false)[];
          /**
           * determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container
           */
          grow?: boolean;
          /**
           * how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          row_span?: number;
          /**
           * how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          column_span?: number;
        }
      }
      namespace TEXT_ALIGNMENT {
        /**
         * `"center"`
         */
        const CENTER: string & { readonly __brand: "editor.ui.TEXT_ALIGNMENT.CENTER" };
        /**
         * `"justify"`
         */
        const JUSTIFY: string & { readonly __brand: "editor.ui.TEXT_ALIGNMENT.JUSTIFY" };
        /**
         * `"left"`
         */
        const LEFT: string & { readonly __brand: "editor.ui.TEXT_ALIGNMENT.LEFT" };
        /**
         * `"right"`
         */
        const RIGHT: string & { readonly __brand: "editor.ui.TEXT_ALIGNMENT.RIGHT" };
      }
      namespace vertical {
        /**
         * Properties for editor.ui.vertical
         */
        interface props {
          /**
           * array of child components
           */
          children?: (Opaque<"component"> | false)[];
          /**
           * empty space from the edges of the container to its children, either a predefined padding value or a non-negative number of pixels
           */
          padding?: editor.ui.PADDING | number;
          /**
           * empty space between child components, either a predefined spacing value or a non-negative number of pixels; defaults to `editor.ui.SPACING.MEDIUM`
           */
          spacing?: editor.ui.SPACING | number;
          /**
           * alignment of the component content within its assigned bounds, defaults to `editor.ui.ALIGNMENT.TOP_LEFT`
           */
          alignment?: editor.ui.ALIGNMENT;
          /**
           * determines if the component should grow to fill available space in a `horizontal` or `vertical` layout container
           */
          grow?: boolean;
          /**
           * how many rows the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          row_span?: number;
          /**
           * how many columns the component spans inside a grid container, must be positive. This prop is only useful for components inside a `grid` container.
           */
          column_span?: number;
        }
      }
    }
  }
}

export {};
