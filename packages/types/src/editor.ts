// Editor scripts are loaded by the Defold *editor*, not the runtime engine: the
// editor `require`s the emitted chunk and reads the hooks table it returns. That
// makes them a fourth, disjoint script kind — lowered to a chunk-level
// `return <hooks table>` rather than the runtime kinds' flat top-level globals.
//
// This is the keystone surface only. The full typed `editor.*` global
// (`get`/`transact`/`command` + the editor-VM `http`/`json`/`zip`) and the
// per-kind API walls are a later slice, so a command's `run`/`active` receive a
// loosely-typed opts bag for now.

/**
 * A single command an editor script contributes: a label, the editor UI
 * locations it appears in (e.g. `"Edit"`, `"Assets"`, `"Outline"`, `"View"`),
 * and optional `active`/`run` hooks the editor calls with a command-context bag.
 */
export interface EditorCommand {
  /** Menu/label text shown for the command. */
  label: string;
  /** Editor UI locations the command is offered in. */
  locations: string[];
  /**
   * Declares the command's context arguments; the editor passes the resolved
   * values to `active`/`run`. Loosely typed until the `editor.*` slice lands.
   */
  query?: Record<string, unknown>;
  /**
   * Called to decide whether the command is currently enabled. Omit to always
   * enable. The opts bag is loosely typed until the `editor.*` slice lands.
   */
  active?: (opts: Record<string, unknown>) => boolean;
  /**
   * Called when the command is invoked. The opts bag is loosely typed until the
   * `editor.*` slice lands.
   */
  run?: (opts: Record<string, unknown>) => void;
}

/**
 * The hooks table an editor script returns. Every hook is optional; the editor
 * calls the ones present. Only the keystone hooks are typed here.
 */
export interface EditorScriptModule {
  /** Returns the commands this script contributes to the editor. */
  get_commands?: () => EditorCommand[];
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
