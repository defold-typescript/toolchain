import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { extractApiDoc } from "./extract-api-doc";

/**
 * The curated native-extension lane. A native extension ships C++ and no
 * `.script_api`, so its declaration is hand-authored at
 * `generated/native/<namespace>.d.ts` as a `declare global { namespace <ns> }`
 * ambient, and `resolve` copies it into a project verbatim. The only artifact
 * derived here is the `api-doc/native/<namespace>.json` the docs-site renders.
 */
export interface NativeTarget {
  repo: string;
  ref: string;
  license: string;
  namespace: string;
  manifestDir: string;
  declaration: string;
  /** The vendored C++ file that registers the module, under `fixtures/upstream-native/`. */
  upstreamSource: string;
}

export function readNativeTargets(packageRoot: string): NativeTarget[] {
  const { targets } = JSON.parse(
    readFileSync(join(packageRoot, "native-targets.json"), "utf8"),
  ) as { targets: NativeTarget[] };
  return targets;
}

export function nativeApiDocPath(target: NativeTarget): string {
  return `api-doc/native/${target.namespace}.json`;
}

interface ApiDocElement {
  name: string;
  global?: boolean;
  [key: string]: unknown;
}

/**
 * `extractApiDoc`'s ambient lane qualifies every member as
 * `global.<namespace>.<name>` and marks it `global`. A native page is the
 * namespace itself, which the page already presents as a global called with no
 * import, so each member is named bare and carries no per-member marker.
 */
export function lowerNativeApiDoc(packageRoot: string, target: NativeTarget): string {
  const source = readFileSync(join(packageRoot, target.declaration), "utf8");
  const doc = extractApiDoc(source, target.namespace) as Record<string, unknown> & {
    elements: ApiDocElement[];
  };
  const prefix = `global.${target.namespace}.`;
  const elements = doc.elements.map(({ global: _global, ...element }) => ({
    ...element,
    name: element.name.startsWith(prefix) ? element.name.slice(prefix.length) : element.name,
  }));
  return `${JSON.stringify({ ...doc, elements }, null, 2)}\n`;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  if (process.argv.slice(2).includes("--api-doc")) {
    for (const target of readNativeTargets(root)) {
      const dest = join(root, nativeApiDocPath(target));
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, lowerNativeApiDoc(root, target));
      console.log(`lowered ${target.namespace} -> ${nativeApiDocPath(target)}`);
    }
  }
}
