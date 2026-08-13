/** @noSelfInFile */

import type { Opaque } from "./core-types";
import type { EditorCommand, EditorCommandQuery } from "./editor";

declare global {
  namespace editor {
    /**
     * Create an editor command
     *
     * @param opts - A table with the following keys:`label string, message`required, user-visible command name, either a string or a localization message`locations string[]`required, a non-empty list of locations where the command is displayed in the editor, values are either `"Edit"`, `"View"`, `"Project"`, `"Debug"` (the editor menubar), `"Assets"` (the assets pane), or `"Outline"` (the outline pane)`query table`optional, a query that both controls the command availability and provides additional information to the command handler functions; a table with the following keys:`selection table`current selection, a table with the following keys:`type string`either `"resource"` (selected resource) or `"outline"` (selected outline node)`cardinality string`either `"one"` (will use first selected item) or `"many"` (will use all selected items)`argument table`the command argument`id string`optional, keyword identifier that may be used for assigning a shortcut to a command; should be a dot-separated identifier string, e.g. `"my-extension.do-stuff"``active function`optional function that additionally checks if a command is active in the current context; will receive opts table with values populated by the query; should be fast to execute since the editor might invoke it in response to UI interactions (on key typed, mouse clicked)`run function`optional function that is invoked when the user decides to execute the command; will receive opts table with values populated by the query
     * @example
     * ```ts
     * // Print Git history for a file:
     * // (`locations` is added here: upstream's own example omits it, but its
     * // prose declares the key required.)
     * editor.command({
     *   label: "Git History",
     *   locations: ["Assets"],
     *   query: { selection: { type: "resource", cardinality: "one" } },
     *   run: (opts) => {
     *     editor.execute("git", "log", "--follow", `.${editor.get(opts.selection, "path")}`, {
     *       reload_resources: false,
     *     });
     *   },
     * });
     * ```
     */
    function command<const Q extends EditorCommandQuery = Record<never, never>>(
      opts: EditorCommand<Q>,
    ): Opaque<"command">;
  }
}
