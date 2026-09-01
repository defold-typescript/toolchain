import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import {
  buildSceneAddressDeclaration,
  displayPathOf,
  isExcludedProjectPath,
  readSceneDocuments,
  type SceneReadHost,
} from "@defold-typescript/transpiler";
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
   * Every hole the walk found in the address universe, verbatim from
   * `readSceneDocuments`. The strings are already phrased for a reader, so a
   * second wording layer here would be a duplicate model of what the walk
   * decided.
   */
  readonly incomplete: readonly string[];
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
  const { documents, unreadable } = readSceneDocuments(fsSceneReadHost(), opts.cwd);
  const wrote = writeIfChanged(
    path.join(opts.cwd, SCENE_ADDRESSES_DECLARATION),
    buildSceneAddressDeclaration(documents),
  );
  return { declaration: SCENE_ADDRESSES_DECLARATION, wrote, incomplete: unreadable };
}
