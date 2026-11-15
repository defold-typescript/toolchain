const BUN_TEST_NAME_RE = /[._](test|spec)\.(ts|tsx|cts|mts)$/;

/**
 * Whether `bun test` runs the file at `path`: a `*.test.*`, `*_test.*`,
 * `*.spec.*` or `*_spec.*` name over a transpiler source extension. The build,
 * `watch` and the editor plugin skip such a file, so a test can sit next to the
 * module it tests. A declaration file never matches.
 */
export function isBunTestSource(path: string): boolean {
  const posix = path.replaceAll("\\", "/");
  const basename = posix.slice(posix.lastIndexOf("/") + 1);
  return BUN_TEST_NAME_RE.test(basename);
}
