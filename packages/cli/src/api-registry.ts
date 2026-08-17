import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";

export interface RegistryTargetSource {
  readonly kind: string;
  readonly version: string;
}

export interface RegistryTargetModule {
  readonly namespace: string;
  readonly fixture: string;
  readonly outFile: string;
  readonly skipFunctions?: readonly string[];
  readonly mapType?: string;
}

export interface RegistryTarget {
  readonly id: string;
  readonly default?: boolean;
  readonly coreTypesImport?: string;
  readonly source?: RegistryTargetSource | null;
  // Present only on a target that ships an editor-scripting document; absence is
  // the registry's own statement that it ships none.
  readonly editorModules?: readonly RegistryTargetModule[];
  readonly [key: string]: unknown;
}

function findPackageRoot(start: string): string | null {
  let dir = start;
  for (;;) {
    if (existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

export function resolveTypesPackageRoot(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const entry = require.resolve("@defold-typescript/types");
    return findPackageRoot(path.dirname(entry));
  } catch {
    return null;
  }
}

export function loadApiTargetsRegistry(): RegistryTarget[] {
  const root = resolveTypesPackageRoot();
  if (root === null) {
    return [];
  }
  const registryPath = path.join(root, "api-targets.json");
  if (!existsSync(registryPath)) {
    return [];
  }
  try {
    const { targets } = JSON.parse(readFileSync(registryPath, "utf8")) as {
      targets: RegistryTarget[];
    };
    return targets;
  } catch {
    return [];
  }
}

export function findRefDocTarget(version: string): RegistryTarget | undefined {
  return loadApiTargetsRegistry().find(
    (target) => target.source?.kind === "ref-doc" && target.source.version === version,
  );
}
