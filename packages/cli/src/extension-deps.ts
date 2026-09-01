// Pure resolver core for the `[dependencies]`-driven extension typing pipeline.
// The `game.project` reader itself now lives in `@defold-typescript/transpiler`
// (`library-dependencies.ts`), where the scene walk can reach it too; it is
// re-exported here under its shipped name so this module stays the CLI's entry
// to it. The archive-location half stays pure by taking an already-listed set of
// entry paths.

import {
  type ExtensionDependency,
  readGameProjectDependencies,
} from "@defold-typescript/transpiler";

export type { ExtensionDependency };
export const readExtensionDependencies = readGameProjectDependencies;

export function locateScriptApis(entryPaths: readonly string[]): string[] {
  return entryPaths.filter((entry) => /\.script_api$/i.test(entry)).sort();
}

export interface ResolvedExtension {
  readonly url: string;
  readonly scriptApis: string[];
  readonly assetOnly: boolean;
}

export function classifyExtension(url: string, entryPaths: readonly string[]): ResolvedExtension {
  const scriptApis = locateScriptApis(entryPaths);
  return { url, scriptApis, assetOnly: scriptApis.length === 0 };
}
