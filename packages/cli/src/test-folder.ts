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
