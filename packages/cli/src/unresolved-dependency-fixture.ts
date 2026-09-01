import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";

/** The library archive the fixture project declares and never materializes. */
export const UNRESOLVED_DEPENDENCY_URL =
  "https://github.com/Insality/druid/archive/refs/tags/16.zip";

function write(cwd: string, rel: string, contents: string): void {
  const target = path.join(cwd, rel);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

/**
 * The `game.project` half on its own, so a caller can have the declared-but-
 * unresolved dependency without the scene files: a project whose scenes are
 * missing *because* the dependency is missing is its own state, and one source
 * of the manifest text keeps the two fixtures from drifting apart.
 */
export function scaffoldUnresolvedDependencyManifest(cwd: string): void {
  write(
    cwd,
    "game.project",
    `[bootstrap]\nmain_collection = /game/game.collectionc\n\n[project]\ntitle = demo\ndependencies#0 = ${UNRESOLVED_DEPENDENCY_URL}\n`,
  );
}

/**
 * A project that declares a dependency the last `resolve` never materialized:
 * `game.project` names the URL and nothing under the dependency root answers
 * for it. This is the hole `readSceneDocuments` names and the CLI has to
 * report.
 */
export function scaffoldUnresolvedDependency(cwd: string): void {
  write(
    cwd,
    "game/game.collection",
    'collection_instances {\n  id: "player"\n  collection: "/game/player.collection"\n}\n',
  );
  write(
    cwd,
    "game/player.collection",
    'instances {\n  id: "player"\n  prototype: "/game/player.go"\n}\n',
  );
  write(
    cwd,
    "game/player.go",
    'components {\n  id: "controller"\n  component: "/game/player.script"\n}\n',
  );
  scaffoldUnresolvedDependencyManifest(cwd);
}
