/** @noSelfInFile */

// The named types the hand-authored editor VM overloads take. They live outside
// `src/editor-vm-globals.d.ts` on purpose: the parity test compares that file's
// declared set to the set the emit leaves behind, exactly, and a type alias
// declared there would count as an extra declaration with no upstream member to
// answer for it.

/**
 * One entry in a `zip.pack` archive: a source path, a `[source, target]` pair
 * that relocates it inside the archive, or a table carrying per-entry
 * compression options alongside those positions.
 */
export type ZipEntry = string | readonly string[] | Record<string | number, unknown>;

/**
 * What `zip.pack` compresses: a single relative path, or a list of entries.
 */
export type ZipEntries = string | readonly ZipEntry[];

/**
 * Archive-wide compression options for `zip.pack`.
 */
export interface ZipPackOptions {
  /** Compression method, either `zip.METHOD.DEFLATED` (default) or `zip.METHOD.STORED`. */
  readonly method?: string;
  /** Compression level, 0 to 9; only useful with `zip.METHOD.DEFLATED`, defaults to 6. */
  readonly level?: number;
}

/**
 * Extraction options for `zip.unpack`. Every key is optional, which is what lets
 * TypeScript tell this table apart from the paths list that shares its slot.
 */
export interface ZipUnpackOptions {
  /** Conflict resolution strategy, defaults to `zip.ON_CONFLICT.ERROR`. */
  readonly on_conflict?: string;
}

/**
 * A `http.server.route` handler. Left at the looseness the emit gave it: typing
 * the request table is a separate slice.
 */
export type HttpRouteHandler = (...args: unknown[]) => unknown;
