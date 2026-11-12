import { realpathSync } from "node:fs";
import * as os from "node:os";
import { repositoryRoot } from "./link-roots";

// A project with no `.git` at or above it can only be made where the temp
// folder itself sits outside every checkout. Under CI the case always runs, so
// a runner that cannot hold it fails instead of skipping.
export const skipWithoutGitFreeTemp =
  !process.env.CI && repositoryRoot(realpathSync.native(os.tmpdir())) !== undefined;
