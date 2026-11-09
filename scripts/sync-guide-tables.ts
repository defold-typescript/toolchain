import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LIBRARY_DATA_DIR } from "../packages/cli/src/library/package-root.ts";
import {
  type NativeTarget,
  readNativeTargets,
} from "../packages/cli/src/library/sync-native-types.ts";
import { LIBRARY_DOCS_URL } from "../packages/docs-render/src/base.ts";
import { libraryApiRoute } from "../packages/docs-render/src/library-routes.ts";

// Guide tables that list one row per shipped target. Each lives in a marked
// region of its guide page and is rewritten from the registry the toolchain
// ships, so adding a target needs one sync instead of a hand-edited row.

const REPO_ROOT = join(import.meta.dir, "..");

export const RESOLVE_GUIDE = join(REPO_ROOT, "packages/docs/guide/resolve.md");

export const CURATED_NATIVE_START = "<!-- curated-native-extensions:start -->";
export const CURATED_NATIVE_END = "<!-- curated-native-extensions:end -->";

// No pin column: `library update` moves pins in data-only PRs, and the guide
// deploys only on release. Each namespace's library page names the pin instead.
export type CuratedNativeRow = Pick<NativeTarget, "repo" | "namespace" | "manifestDir">;

function repoSlug(repo: string): string {
  return new URL(repo).pathname.replace(/^\/+|\/+$/g, "");
}

export function curatedNativeTable(targets: readonly CuratedNativeRow[]): string {
  const rows = targets.map(
    (target) =>
      `| [${repoSlug(target.repo)}](${target.repo}) | [\`${target.namespace}\`](${LIBRARY_DOCS_URL}${libraryApiRoute(target.repo, target.namespace)}) | \`${target.manifestDir}/ext.manifest\` |`,
  );
  return [
    "| Extension | Namespace | Confirmed by        |",
    "| --------- | --------- | ------------------- |",
    ...rows,
  ].join("\n");
}

// The blank lines keep the markers out of the table: markdown-it reads a
// comment line directly under a table row as another row.
function replaceRegion(text: string, start: string, end: string, body: string): string {
  const lines = text.split("\n");
  const startIndex = lines.indexOf(start);
  if (startIndex === -1) throw new Error(`missing marker ${start}`);
  const endIndex = lines.indexOf(end, startIndex + 1);
  if (endIndex === -1) throw new Error(`missing marker ${end}`);
  return [...lines.slice(0, startIndex + 1), "", body, "", ...lines.slice(endIndex)].join("\n");
}

export function syncGuideTables(text: string, targets: readonly CuratedNativeRow[]): string {
  return replaceRegion(text, CURATED_NATIVE_START, CURATED_NATIVE_END, curatedNativeTable(targets));
}

if (import.meta.main) {
  const write = process.argv.includes("--write");
  const committed = readFileSync(RESOLVE_GUIDE, "utf8");
  const fresh = syncGuideTables(committed, readNativeTargets(LIBRARY_DATA_DIR));

  if (write) {
    if (fresh !== committed) writeFileSync(RESOLVE_GUIDE, fresh);
    console.log("packages/docs/guide/resolve.md native table synced");
    process.exit(0);
  }

  if (fresh !== committed) {
    console.error(
      "packages/docs/guide/resolve.md is stale. Run: bun scripts/sync-guide-tables.ts --write",
    );
    process.exit(1);
  }
  console.log("packages/docs/guide/resolve.md native table is in sync");
}
