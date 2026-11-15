import { spawnSync } from "node:child_process";

/** The Bun that runs a project's tests: the one running this CLI, else the one on PATH, else `null`. */
export function detectInstalledBun(): string | null {
  if (process.versions.bun !== undefined) {
    return process.versions.bun;
  }
  try {
    const result = spawnSync("bun", ["--version"], { encoding: "utf8" });
    const version = result.status === 0 ? result.stdout.trim() : "";
    return version === "" ? null : version;
  } catch {
    return null;
  }
}
