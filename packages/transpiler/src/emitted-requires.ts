import { bundledModuleOfRequire } from "./bundled-libraries";
import { scanEmittedRequires } from "./lua-require-scan";
import { TIMERS_REQUIRE_NAME } from "./timers-runtime";

export const LUALIB_REQUIRE_NAME = "lualib_bundle";

// Written by both build paths whenever a chunk requires them and backed by no
// TypeScript source, so a require of one can never be unresolvable. The bundled
// library modules join them through `bundledModuleOfRequire`.
const GENERATED_RUNTIME_REQUIRES: ReadonlySet<string> = new Set([
  LUALIB_REQUIRE_NAME,
  TIMERS_REQUIRE_NAME,
]);

/**
 * The distinct string-literal module paths an emitted Lua chunk requires, in
 * source order. The generated runtimes and bundled library modules are skipped,
 * as is any require whose argument is not a string literal — neither can name a
 * source the build owns.
 */
export function findEmittedRequires(lua: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  for (const { path } of scanEmittedRequires(lua)) {
    if (
      GENERATED_RUNTIME_REQUIRES.has(path) ||
      bundledModuleOfRequire(path) !== undefined ||
      seen.has(path)
    ) {
      continue;
    }
    seen.add(path);
    found.push(path);
  }

  return found;
}
