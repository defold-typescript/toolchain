// Build the tutorial slide deck (docs/tutorial) and open it in the browser.
//
// Replaces the unix-only bash heredoc mise task: stock Windows has neither
// `bash` nor `open`/`xdg-open`, so the opener is a pure, per-platform argv
// builder mirroring the `targetPlatform` pattern in packages/cli.
//
// Usage:
//   mise run dev:slides
//   bun scripts/dev-slides.ts

import { spawnSync } from "node:child_process";
import path from "node:path";

export function openCommand(platform: string, target: string): [string, ...string[]] {
  if (platform === "darwin") return ["open", target];
  // The empty "" is start's window-title placeholder, so a quoted path is not
  // consumed as the title.
  if (platform === "win32") return ["cmd", "/c", "start", "", target];
  return ["xdg-open", target];
}

function main(): void {
  const tutorialDir = path.resolve(import.meta.dir, "..", "docs", "tutorial");
  const build = spawnSync("bun", ["run", "build"], { cwd: tutorialDir, stdio: "inherit" });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
  const [cmd, ...rest] = openCommand(
    process.platform,
    path.join(tutorialDir, "dist", "index.html"),
  );
  spawnSync(cmd, rest, { stdio: "inherit" });
}

if (import.meta.main) {
  main();
}
