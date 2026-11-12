import { mkdtempSync, rmdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

/**
 * A folder link at `at` leading to `target`, which is resolved against the
 * link's folder when relative. Windows needs no privilege for a junction, which
 * a directory symlink does require, so every host can run the folder-link cases.
 * A junction stores an absolute target, so it is resolved here rather than left
 * to the runtime.
 */
export function linkDir(target: string, at: string): void {
  if (process.platform === "win32") {
    symlinkSync(path.resolve(path.dirname(at), target), at, "junction");
  } else {
    symlinkSync(target, at, "dir");
  }
}

/** Removes a folder link made by `linkDir`, leaving its target alone; a junction is removed as a folder. */
export function unlinkDir(at: string): void {
  if (process.platform === "win32") {
    rmdirSync(at);
  } else {
    unlinkSync(at);
  }
}

// A Windows symlink does not resolve a forward-slash relative target.
export function linkFile(target: string, at: string): void {
  symlinkSync(process.platform === "win32" ? target.replace(/\//g, "\\") : target, at, "file");
}

// Windows refuses a file symlink without Developer Mode or elevation, so the
// cases that need one skip there instead of failing on setup.
function probeFileLinks(): boolean {
  const dir = mkdtempSync(path.join(tmpdir(), "dt-link-probe-"));
  try {
    writeFileSync(path.join(dir, "target.txt"), "");
    linkFile("target.txt", path.join(dir, "link.txt"));
    return true;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export const canLinkFiles = probeFileLinks();
