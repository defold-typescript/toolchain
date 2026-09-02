import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import {
  buildSceneAddressDeclaration,
  buildSceneCollectionRoles,
  buildSceneComponentIndex,
  buildSceneObjectPathIndex,
  buildScriptNamingContexts,
  COLLECTION_REFERENCE_EXTENSIONS,
  computeOutputRel,
  displayPathOf,
  GAME_PROJECT_DOCUMENT,
  GUI_EXTENSIONS,
  guiScriptResourcesOf,
  isExcludedProjectPath,
  type NamingContext,
  PROJECT_EXTENSIONS,
  readSceneDocuments,
  type SceneComponentIndex,
  type SceneReadHost,
} from "@defold-typescript/transpiler";
import { readBuildConfig } from "./build-output";
import { MATERIALIZED_ROOT } from "./materialize";

/** Where the declaration lands, project-relative — beside the materialized surfaces. */
export const SCENE_ADDRESSES_DECLARATION = path.posix.join(
  MATERIALIZED_ROOT,
  "scene-addresses.d.ts",
);

export interface SceneTypesResult {
  /** The declaration's project-relative path, whether or not this run wrote it. */
  readonly declaration: string;
  readonly wrote: boolean;
  /**
   * Every hole in the address universe: what the walk could not read, then what
   * the world classification could not settle. The strings are already phrased
   * for a reader, so a second wording layer here would be a duplicate model of
   * what each step decided.
   */
  readonly incomplete: readonly string[];
  /**
   * The subset of `incomplete` the *walk* produced — the files and dependencies
   * it could not read. Only these can hide a component id, so only these
   * suppress the build's `#fragment` reachability check: an unreadable
   * `game.project`, or a collection no world opens, leaves every component id
   * the walk did read provably present.
   */
  readonly unread: readonly string[];
  /**
   * The component-id universe the same walk read, for a consumer that has to
   * decide whether an address can resolve. Its own `incomplete` records only
   * what the *parse* could not read; a caller wanting the whole hole composes
   * it with `incomplete` above, which records what the *walk* could not reach.
   */
  readonly index: SceneComponentIndex;
  /** Whether the walk read any `.go`/`.collection` at all. */
  readonly hasScenes: boolean;
  /**
   * Every naming context each script resource runs in, keyed by the resource a
   * scene names — the world-qualified object path a relative address continues,
   * and the proxy socket that object lives behind.
   */
  readonly scriptNamingContexts: ReadonlyMap<string, readonly NamingContext[]>;
}

/**
 * A reporter that names each hole once. `watch` regenerates the declaration on
 * every scene save, and a project that never resolves its dependencies would
 * otherwise repeat the same reason on every keystroke; a reason that goes away
 * and comes back is genuinely new information, so it is reported again.
 */
export function createIncompleteReporter(): (incomplete: readonly string[]) => string[] {
  let seen: ReadonlySet<string> = new Set();
  return (incomplete: readonly string[]): string[] => {
    const fresh = incomplete.filter((reason) => !seen.has(reason));
    seen = new Set(incomplete);
    return fresh;
  };
}

// The same `SceneReadHost` the editor plugin satisfies, backed by the real
// filesystem. Excluded directories are pruned during the walk rather than
// filtered afterwards: `readSceneDocuments` would drop a `node_modules` hit by
// display path anyway, but only after descending a dependency tree that dwarfs
// the project.
function fsSceneReadHost(): SceneReadHost {
  return {
    readDirectory(root: string, extensions?: readonly string[]): string[] {
      const found: string[] = [];
      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const filePath = path.join(dir, entry.name);
          if (isExcludedProjectPath(displayPathOf(root, filePath))) continue;
          if (entry.isDirectory()) {
            walk(filePath);
          } else if (
            extensions === undefined ||
            extensions.some((extension) => entry.name.endsWith(extension))
          ) {
            found.push(filePath);
          }
        }
      };
      walk(root);
      return found;
    },
    readFile(filePath: string): string | undefined {
      try {
        return readFileSync(filePath, "utf8");
      } catch {
        return undefined;
      }
    },
  };
}

// Byte-identical content is not rewritten: `watch` regenerates on every scene
// save, and a touched file re-checks the whole program in the editor even when
// nothing about it changed. The write itself goes through a temp file and a
// rename so a reader never observes a half-written declaration.
function writeIfChanged(target: string, contents: string): boolean {
  let existing: string | undefined;
  try {
    existing = readFileSync(target, "utf8");
  } catch {
    existing = undefined;
  }
  if (existing === contents) return false;

  mkdirSync(path.dirname(target), { recursive: true });
  const staged = `${target}.${process.pid}.tmp`;
  try {
    writeFileSync(staged, contents);
    renameSync(staged, target);
  } catch (err) {
    rmSync(staged, { force: true });
    throw err;
  }
  return true;
}

/**
 * Read the project's scenes and write the game-object/component address
 * declaration the editor completes against.
 *
 * Never an error path for a project with no scenes: an empty declaration is
 * exactly the behavior of not running the generator at all, because the aliases
 * in `@defold-typescript/types` stay widened.
 */
export function runSceneTypes(opts: { cwd: string }): SceneTypesResult {
  const host = fsSceneReadHost();
  const { documents, unreadable } = readSceneDocuments(host, opts.cwd);
  // The proxy and factory documents are read as their own walk rather than
  // folded into `SCENE_EXTENSIONS`, which would feed non-scene text to
  // `buildSceneComponentIndex`.
  const references = readSceneDocuments(host, opts.cwd, COLLECTION_REFERENCE_EXTENSIONS);
  // A second walk over the same project repeats every dependency-level reason
  // the first already gave, so only a reason this walk alone found is new.
  for (const reason of references.unreadable) {
    if (!unreadable.includes(reason)) unreadable.push(reason);
  }
  const roles = buildSceneCollectionRoles({
    documents,
    references: references.documents,
    gameProject: readSceneDocuments(host, opts.cwd, PROJECT_EXTENSIONS).documents.get(
      GAME_PROJECT_DOCUMENT,
    ),
  });
  // A `.gui` is the only way a gui script reaches an object, and it declares no
  // component ids, so it is its own walk for the reason the reference walk is:
  // folding it into `SCENE_EXTENSIONS` would feed gui text to
  // `buildSceneComponentIndex`. Its dependency-level reasons repeat the first
  // walk's, so only a reason this walk alone found is new.
  const gui = readSceneDocuments(host, opts.cwd, GUI_EXTENSIONS);
  for (const reason of gui.unreadable) {
    if (!unreadable.includes(reason)) unreadable.push(reason);
  }
  const wrote = writeIfChanged(
    path.join(opts.cwd, SCENE_ADDRESSES_DECLARATION),
    buildSceneAddressDeclaration(documents, roles),
  );
  return {
    declaration: SCENE_ADDRESSES_DECLARATION,
    wrote,
    incomplete: [...unreadable, ...roles.incomplete],
    unread: unreadable,
    index: buildSceneComponentIndex(documents),
    hasScenes: documents.size > 0,
    scriptNamingContexts: buildScriptNamingContexts(
      buildSceneObjectPathIndex(documents, roles),
      guiScriptResourcesOf(gui.documents),
    ),
  };
}

/**
 * The index `build` checks `#fragment` addresses against, or `undefined` when
 * there is nothing to check.
 *
 * Two decisions live here rather than at the call sites, so both build branches
 * and `watch` cannot drift apart:
 *
 * - the whole hole is one index — what the parse could not read plus what the
 *   walk could not reach — so a fragment declared only by an unresolved library
 *   reports the check as suppressed rather than the fragment as unreachable,
 *   reusing the check's own suppression rule instead of adding a second one;
 * - only what the *walk* could not read suppresses the check. A hole in the
 *   world classification — an unreadable `game.project`, a collection no world
 *   opens — changes which addresses are offered, not which component ids were
 *   read, so it is reported to the user without silencing the check;
 * - a project with no scene sources at all *and no walk failure* is not reported
 *   as suppressed. It has no address universe to speak of, so there is nothing a
 *   reader could act on, and saying so on every build would be noise — the same
 *   posture `runSceneTypes` already takes by writing an empty declaration
 *   instead of failing. A project whose scenes are missing *because* its
 *   dependency is missing does have something to act on, so it reports the check
 *   as suppressed like any other hole.
 */
export function sceneIndexForBuild(result: SceneTypesResult): SceneComponentIndex | undefined {
  if (!result.hasScenes && result.unread.length === 0) return undefined;
  return {
    ids: result.index.ids,
    incomplete: [...result.index.incomplete, ...result.unread],
  };
}

/**
 * Which worlds each program file's script runs in, or `undefined` when the walk
 * found no script hosted anywhere — the same posture `sceneIndexForBuild` takes,
 * so a caller that read no scenes gets the build it always got.
 *
 * The file is mapped *forward* to the script resource a scene would name, the
 * direction the editor plugin's relative universe takes: an output path cannot
 * say which include base produced it, so a reverse guess would miss every
 * project with an `outDir`. Both script kinds are resolved and their sockets
 * unioned, because a `.ts` is named as a `.script` by a game object and as a
 * `.gui_script` by a `.gui`, and nothing in the file itself says which.
 *
 * An empty answer is the honest unknown: a script no scene hosts runs in no
 * world this project can prove, and the cross-world check reports nothing for it.
 */
export function scriptWorldsForBuild(
  result: SceneTypesResult,
  cwd: string,
): ((fileName: string) => readonly (string | undefined)[]) | undefined {
  if (result.scriptNamingContexts.size === 0) return undefined;
  const config = readBuildConfig(cwd);
  return (fileName: string): readonly (string | undefined)[] => {
    const rel = displayPathOf(cwd, fileName);
    const sockets = new Set<string | undefined>();
    for (const kind of ["script", "gui-script"] as const) {
      for (const context of result.scriptNamingContexts.get(computeOutputRel(rel, config, kind)) ??
        []) {
        sockets.add(context.socket);
      }
    }
    return [...sockets];
  };
}
