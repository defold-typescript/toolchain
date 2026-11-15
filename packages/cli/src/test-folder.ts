/** The project's folder for tests and helpers that need Bun's runtime. */
export const TEST_FOLDER_REL = "src/test";

/**
 * Whether the project-relative `rel` sits under `src/test/`. The build,
 * `watch` and wall planning skip such a file: it writes no Lua and joins no
 * program the build type-checks.
 */
export function isTestFolderSource(rel: string): boolean {
  const posix = rel.replaceAll("\\", "/");
  const bare = posix.startsWith("./") ? posix.slice(2) : posix;
  return bare.startsWith(`${TEST_FOLDER_REL}/`);
}

/**
 * Whether a `tsconfig.json` `exclude` entry names the `src/test` folder itself,
 * in any path spelling: backslashes count as `/`, and leading `./` and trailing
 * `/` are ignored. A glob such as `src/test/**` or a subfolder entry is not the
 * folder name.
 */
export function namesTestFolder(entry: string): boolean {
  const posix = entry.replaceAll("\\", "/");
  const bare = posix.replace(/^(\.\/)+/, "").replace(/\/+$/, "");
  return bare === TEST_FOLDER_REL;
}

/** The package that types Bun for the project's tests and the debug launcher. */
export const BUN_TYPES_PACKAGE = "bun-types";

/** The first line of a `bun:test` file next to its module: `bun:test` alone, no Bun globals. */
export const COLOCATED_TEST_REFERENCE = `/// <reference types="${BUN_TYPES_PACKAGE}/test" />`;
