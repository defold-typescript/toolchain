import {
  excludedModulesForKind,
  type ScriptKind,
  selectDirectoryWalls,
  selectScriptKindEntrypoint,
} from "./script-kind";

export interface DirectoryWall {
  readonly dir: string;
  readonly kind: ScriptKind;
  readonly excludedModules: Set<string>;
  readonly typesEntrypoint: string;
}

export function planDirectoryWalls(cwd: string): DirectoryWall[] {
  return [...selectDirectoryWalls(cwd)]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dir, kind]) => ({
      dir,
      kind,
      excludedModules: excludedModulesForKind(kind),
      typesEntrypoint: selectScriptKindEntrypoint(new Set([kind])),
    }));
}
