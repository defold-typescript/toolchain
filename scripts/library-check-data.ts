import { dirname } from "node:path";
import { type DispatchIo, dispatch } from "../packages/cli/src/dispatch.ts";
import { LIBRARY_DATA_DIR as NEWEST_DATA_FOLDER } from "../packages/cli/src/library/package-root.ts";

// Runs `library check` with this working tree's CLI over this repo's library data,
// the data a release publishes. The release gate and the nightly run both call it.

export const LIBRARY_DATA_DIR = dirname(NEWEST_DATA_FOLDER);

export type LibraryCheckRunner = (
  args: readonly string[],
  io: DispatchIo,
) => number | Promise<number>;

const runCli: LibraryCheckRunner = (args, io) => dispatch([...args], io);

export interface LibraryDataCheckOptions {
  readonly dataDir?: string;
  readonly run?: LibraryCheckRunner;
  readonly io: DispatchIo;
}

export async function runLibraryDataCheck(opts: LibraryDataCheckOptions): Promise<number> {
  const { dataDir = LIBRARY_DATA_DIR, run = runCli, io } = opts;
  return run(["library", "check", "--data", dataDir], io);
}

if (import.meta.main) {
  process.exit(
    await runLibraryDataCheck({ io: { stdout: process.stdout, stderr: process.stderr } }),
  );
}
