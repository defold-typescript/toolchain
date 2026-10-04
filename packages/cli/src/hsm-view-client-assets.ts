import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ClientAssets } from "./hsm-view-page";

const BUILD_COMMAND = "bun run --cwd packages/cli build:hsm-view-client";

// The module URL, never `import.meta.dir`, so the bundled `dist/index.js` under node
// still lands on the package root.
function defaultClientDir(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "hsm-view-client");
}

/** The built viewer client, read from `dir` (by default the package's `dist/hsm-view-client`). */
export function loadClientAssets(dir: string = defaultClientDir()): ClientAssets {
  try {
    return {
      js: readFileSync(path.join(dir, "main.js"), "utf8"),
      css: readFileSync(path.join(dir, "styles.css"), "utf8"),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `the hsm-view client is not built in ${dir} (${reason}); run \`${BUILD_COMMAND}\``,
    );
  }
}
