// Editor scripts are loaded by the Defold *editor*, not the runtime engine: the
// editor `require`s the emitted chunk and reads the hooks table it returns. That
// makes them a fourth, disjoint script kind — lowered to a chunk-level
// `return <hooks table>` rather than the runtime kinds' flat top-level globals.
//
// The typed `editor.*` global (`get`/`transact`/`command`) and the walled
// `@defold-typescript/types/editor-script` entrypoint ship alongside this file,
// as do the editor VM's own `http`/`json`/`zip`/`zlib`/`tilemap.tiles`
// libraries. Still a later slice: `editor.ui.*` and `editor.prefs.*`.

import type { Opaque } from "./core-types";

/**
 * What the editor addresses a node by: either a resource path (e.g.
 * `"/main/game.script"`) or an internal node id the editor hands to the script.
 * This is the argument `editor.get` and the `editor.tx.*` builders take.
 */
export type EditorNode = string | Opaque<"userdata">;

/**
 * Declares a command's context: what the editor resolves before calling the
 * command's hooks, and therefore which members its opts bag carries. Both keys
 * are optional; a command that declares neither receives an empty bag.
 */
export interface EditorCommandQuery {
  /**
   * The current selection. `type` picks the selection source, `cardinality`
   * picks between the first selected item and all of them.
   */
  selection?: { type: "resource" | "outline"; cardinality: "one" | "many" };
  /** Requests the command argument. Declared as an empty table. */
  argument?: Record<string, never>;
}

/**
 * The opts bag the editor populates for a command whose query is `Q` — exactly
 * the members `Q` declared, and no others.
 *
 * Each half branches on *key presence* (`"selection" extends keyof Q`) rather
 * than on the property type: an optional property is still in `keyof`, so
 * presence is what separates a declared query from the erased one. The
 * cardinality test is wrapped in a one-tuple so a union (or `never`) does not
 * distribute across the conditional.
 */
export type EditorCommandOpts<Q extends EditorCommandQuery> = ("selection" extends keyof Q
  ? {
      selection: [NonNullable<Q["selection"]>["cardinality"]] extends ["many"]
        ? EditorNode[]
        : EditorNode;
    }
  : Record<never, never>) &
  ("argument" extends keyof Q ? { argument: Record<string, unknown> } : Record<never, never>);

/**
 * A single command an editor script contributes: a label, the editor UI
 * locations it appears in (e.g. `"Edit"`, `"Assets"`, `"Outline"`, `"View"`),
 * and optional `active`/`run` hooks the editor calls with the context bag its
 * own `query` declared.
 *
 * The editor calls `active`/`run` as plain functions, so they must emit no
 * leading self parameter. `@noSelf` has to sit here, on the enclosing
 * interface: TSTL resolves a hook's self context from its contextual signature,
 * and the property-signature branch consults only this interface — it returns
 * before `noImplicitSelf` or a file-level `@noSelfInFile` is ever considered.
 *
 * @noSelf
 */
export interface EditorCommand<Q extends EditorCommandQuery = EditorCommandQuery> {
  /** Menu/label text shown for the command. */
  label: string;
  /** Editor UI locations the command is offered in. */
  locations: string[];
  /**
   * Declares the command's context arguments; the editor passes the resolved
   * values to `active`/`run` as exactly the matching opts members.
   */
  query?: Q;
  /**
   * Called to decide whether the command is currently enabled. Omit to always
   * enable. Should be fast — the editor may call it on key/mouse events.
   */
  active?: (opts: EditorCommandOpts<Q>) => boolean;
  /** Called when the user invokes the command. */
  run?: (opts: EditorCommandOpts<Q>) => void;
}

/**
 * A command as it sits in a `get_commands` list: the same shape with its query
 * erased. The hooks take `never`, the one parameter type every concrete opts
 * bag is assignable *from* under parameter contravariance — so a `"one"` and a
 * `"many"` command coexist in a single array while each keeps its own precise
 * typing at its `defineEditorCommand` call site.
 */
export interface EditorCommandEntry {
  /** Menu/label text shown for the command. */
  label: string;
  /** Editor UI locations the command is offered in. */
  locations: string[];
  /** Declares the command's context arguments. */
  query?: EditorCommandQuery;
  /** Called to decide whether the command is currently enabled. */
  active?: (opts: never) => boolean;
  /** Called when the user invokes the command. */
  run?: (opts: never) => void;
}

/**
 * Type a single editor command so its `active`/`run` hooks receive exactly the
 * opts members its own `query` declared. At runtime this is an identity
 * function — it returns `command` unchanged; its only job is typing, and the
 * transpiler emits the table literal it wraps.
 *
 * @param command - the command to type and return.
 * @returns the same `command`, typed as a query-erased list entry.
 * @example
 * ```ts
 * export default defineEditorScript({
 *   get_commands: () => [
 *     defineEditorCommand({
 *       label: "Git History",
 *       locations: ["Assets"],
 *       query: { selection: { type: "resource", cardinality: "one" } },
 *       run: (opts) => print(editor.get(opts.selection, "path")),
 *     }),
 *   ],
 * });
 * ```
 */
// The `Record<never, never>` default (not `Record<string, never>`, whose `keyof`
// is `string` and would match every presence test) gives a command that declares
// no query an empty opts bag.
export function defineEditorCommand<const Q extends EditorCommandQuery = Record<never, never>>(
  command: EditorCommand<Q>,
): EditorCommandEntry {
  return command as EditorCommandEntry;
}

/**
 * The hooks table an editor script returns. Every hook is optional; the editor
 * calls the ones present. Only the keystone hooks are typed here.
 */
export interface EditorScriptModule {
  /** Returns the commands this script contributes to the editor. */
  get_commands?: () => EditorCommandEntry[];
  /** Returns language-server descriptors this script contributes. */
  get_language_servers?: () => unknown[];
}

/**
 * Type an editor script's hooks table. At runtime this is an identity function —
 * it returns `module` unchanged; its only job is typing. The transpiler's
 * `editor-script-erasure` pass rewrites the top-level `export default
 * defineEditorScript({...})` into a chunk-level `return { ... }` (the shape the
 * editor loads) and erases this import — zero runtime cost.
 *
 * @param module - the editor-script hooks table to type and return.
 * @returns the same `module` object, now typed (identity at runtime).
 * @example
 * ```ts
 * export default defineEditorScript({
 *   get_commands: () => [
 *     { label: "Say Hi", locations: ["Edit"], run: () => print("hi") },
 *   ],
 * });
 * ```
 */
export function defineEditorScript<T extends EditorScriptModule>(
  // Intersecting the non-module keys with `never` rejects an unknown hook key on
  // a fresh object literal, while the `T` return keeps the call an identity over
  // its exact argument type (a bare `<T extends ...>` would silently absorb the
  // extra key into `T` and accept it).
  module: T & Record<Exclude<keyof T, keyof EditorScriptModule>, never>,
): T {
  return module;
}
