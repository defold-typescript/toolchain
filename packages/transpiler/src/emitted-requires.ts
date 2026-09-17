import { scanEmittedRequires } from "./lua-require-scan";
import { TIMERS_REQUIRE_NAME } from "./timers-runtime";

export const LUALIB_REQUIRE_NAME = "lualib_bundle";

// Written unconditionally by both build paths and backed by no TypeScript
// source, so a require of either can never be unresolvable.
const GENERATED_RUNTIME_REQUIRES: ReadonlySet<string> = new Set([
  LUALIB_REQUIRE_NAME,
  TIMERS_REQUIRE_NAME,
]);

/**
 * The distinct string-literal module paths an emitted Lua chunk requires, in
 * source order. The two generated runtimes are skipped, as is any require whose
 * argument is not a string literal — neither can name a source the build owns.
 */
export function findEmittedRequires(lua: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  for (const { path } of scanEmittedRequires(lua)) {
    if (GENERATED_RUNTIME_REQUIRES.has(path) || seen.has(path)) {
      continue;
    }
    seen.add(path);
    found.push(path);
  }

  return found;
}
