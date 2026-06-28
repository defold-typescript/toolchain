// Show the currently-published npm version of each publishable workspace package.
//
// Reads PACKAGES (the single source of truth for the publishable set, shared
// with release.ts) so this listing can never drift from what the Release
// workflow actually publishes. A package absent from npm prints "(unpublished)".
//
// Usage:
//   mise run current-version
//   bun scripts/current-version.ts

import { spawnSync } from "node:child_process";
import { PACKAGES } from "./release-pack-proof.ts";

for (const short of PACKAGES) {
  const pkg = `@defold-typescript/${short}`;
  const proc = spawnSync("bun", ["pm", "view", pkg, "version"], { encoding: "utf8" });
  const version = proc.status === 0 ? (proc.stdout ?? "").trim() : "";
  process.stdout.write(`${pkg}\t${version || "(unpublished)"}\n`);
}
