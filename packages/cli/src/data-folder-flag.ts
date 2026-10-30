import { resolve } from "node:path";
import { selectDataFolder } from "./library/data-folder";

// `--library-data <dir>` names a directory of version-named data folders, read by
// the same rule as the installed package's `data/`.
export function libraryDataFromFlag(
  dir: string,
  cwd: string,
  cliVersion: string,
): { dir: string } | { error: string } {
  const base = resolve(cwd, dir);
  const selected = selectDataFolder(base, cliVersion);
  if (selected === null) {
    return {
      error: `defold-typescript resolve: --library-data ${base} holds no data folder for CLI version ${cliVersion}`,
    };
  }
  return { dir: selected };
}
