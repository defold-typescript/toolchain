import { resolve } from "node:path";
import { selectDataFolder } from "./library/data-folder";

// `--library-data <dir>` and `library check --data <dir>` name a directory of
// version-named data folders, read by the same rule as the installed package's
// `data/`. `flag` names the flag in the error (`resolve: --library-data`).
export function libraryDataFromFlag(
  flag: string,
  dir: string,
  cwd: string,
  cliVersion: string,
): { dir: string } | { error: string } {
  const base = resolve(cwd, dir);
  const selected = selectDataFolder(base, cliVersion);
  if (selected === null) {
    return {
      error: `defold-typescript ${flag} ${base} holds no data folder for CLI version ${cliVersion}`,
    };
  }
  return { dir: selected };
}
