import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

// Whether the folder the tests write to treats names differing only in case
// as one file, observed rather than assumed from the platform: macOS and
// Windows runners fold case by default, ubuntu does not.
export const TMP_FOLDS_CASE = (() => {
  const dir = mkdtempSync(path.join(tmpdir(), "dt-case-probe-"));
  try {
    writeFileSync(path.join(dir, "CASE"), "");
    return existsSync(path.join(dir, "case"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
})();
