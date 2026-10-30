import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { extractApiDoc } from "./extract-api-doc";
import { readLibraryData } from "./library-data";
import { LIBRARY_DATA_DIR, LIBRARY_TYPES_ROOT } from "./package-root";
import type { RefKind } from "./sync-defold-extensions";

/**
 * The curated native-extension lane. A native extension ships C++ and no
 * `.script_api`, so its declaration is hand-authored at
 * `<library>/fork/<namespace>.d.ts` as a `@globalTable` `declare module "<ns>"`
 * a project imports, and `resolve` copies it into a project verbatim. The only
 * artifact derived here is the `api-doc/native/<namespace>.json` the docs-site
 * renders.
 */
/** Why the declaration is right to disagree with the annotation about a member's
 * parameter count. `reason` cites upstream's own file and line — the C++ that reads the
 * argument and the stub that mis-declares it — so the entry can be re-checked against
 * the pin rather than taken on trust. */
export interface NativeArityExceptionEntry {
  name: string;
  reason: string;
}

export interface NativeTarget {
  repo: string;
  ref: string;
  /** What `ref` names upstream. Absent means `release`. */
  refKind?: RefKind;
  license: string;
  namespace: string;
  manifestDir: string;
  declaration: string;
  /** The vendored C++ file that registers the module, under the library's `source/`. */
  upstreamSource: string;
  /** Vendored headers, under the library's `source/`, whose `#define`s the
   * registration in `upstreamSource` resolves its module name through. Their text is
   * prepended to the source text before parsing, so calls are still found only in the
   * source. Absent where the source names its module itself. */
  upstreamHeaders?: string[];
  /** Vendored C++ files, under the library's `source/`, whose nameless
   * `luaL_register` calls fill the metatables of the userdata the module returns.
   * Absent where every metatable is filled in `upstreamSource`. */
  upstreamMethodSources?: string[];
  /** Each metatable the C++ fills, mapped to the declared interfaces whose method
   * signatures it provides. Parity measures each metatable against the union of its
   * interfaces, so every registered metatable and every declared type with methods
   * must appear here. */
  methodTables?: Record<string, string[]>;
  /** The vendored LuaLS annotation upstream ships, under the library's `source/`.
   * The registration table carries names only, so parameter lists come from here.
   * Absent where upstream ships no annotation, or ships one in a form this reader does
   * not accept — in which case the target's arity axis reads as unmeasured rather than
   * as agreeing. */
  upstreamAnnotation?: string;
  /** Members whose annotation stub contradicts the C++ that runs. Kept on the target
   * rather than in a manifest of its own: an entry is meaningless away from the pin
   * pair it reconciles, and both paths are named right here. */
  annotationArityExceptions?: NativeArityExceptionEntry[];
}

export function readNativeTargets(dataDir: string): NativeTarget[] {
  return readLibraryData(dataDir).flatMap((library) => library.native);
}

export function nativeApiDocPath(target: NativeTarget): string {
  return `api-doc/native/${target.namespace}.json`;
}

/**
 * A curated declaration is a `@globalTable` module, which `extractApiDoc` lowers
 * the way the extension's global namespace publishes: members named bare, with
 * no per-member marker.
 */
export function lowerNativeApiDoc(
  packageRoot: string,
  target: NativeTarget,
  source: string = readFileSync(join(packageRoot, target.declaration), "utf8"),
): string {
  return `${JSON.stringify(extractApiDoc(source, target.namespace), null, 2)}\n`;
}

if (import.meta.main) {
  const root = LIBRARY_TYPES_ROOT;
  if (process.argv.slice(2).includes("--api-doc")) {
    for (const target of readNativeTargets(LIBRARY_DATA_DIR)) {
      const dest = join(root, nativeApiDocPath(target));
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, lowerNativeApiDoc(LIBRARY_DATA_DIR, target));
      console.log(`lowered ${target.namespace} -> ${nativeApiDocPath(target)}`);
    }
  }
}
