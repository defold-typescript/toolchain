import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import * as path from "node:path";

const LINK_ROOTS_SETTING = 'package.json "defold-typescript"."link-roots"';

/** A symbolic link whose real target lies outside every folder a link may reach. */
export class LinkEscapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinkEscapeError";
  }
}

/**
 * The nearest folder at or above `realProjectRoot` holding a `.git` folder or
 * file: what `git rev-parse --show-toplevel` answers for a checkout, a worktree
 * and a submodule. No `git` is spawned, so a host without it, or a checkout that
 * `safe.directory` refuses, resolves the same way.
 */
export function repositoryRoot(realProjectRoot: string): string | undefined {
  for (let dir = realProjectRoot; ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, ".git"))) {
      return dir;
    }
    if (path.dirname(dir) === dir) {
      return undefined;
    }
  }
}

function readLinkRootEntries(cwd: string): readonly string[] {
  let pkg: unknown;
  try {
    pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));
  } catch {
    return [];
  }
  if (typeof pkg !== "object" || pkg === null) {
    return [];
  }
  const namespace = (pkg as Record<string, unknown>)["defold-typescript"];
  if (typeof namespace !== "object" || namespace === null || !("link-roots" in namespace)) {
    return [];
  }
  const value = (namespace as Record<string, unknown>)["link-roots"];
  if (!Array.isArray(value)) {
    throw new Error(
      `defold-typescript: ${LINK_ROOTS_SETTING} is ${JSON.stringify(value)}; it must be a list of folders, each relative to the project.`,
    );
  }
  for (const entry of value) {
    if (typeof entry !== "string" || entry === "") {
      throw new Error(
        `defold-typescript: ${LINK_ROOTS_SETTING} entry ${JSON.stringify(entry)} is not a folder; each entry names a folder relative to the project.`,
      );
    }
  }
  return value as string[];
}

function resolveLinkRoot(realProject: string, entry: string): string {
  const abs = path.resolve(realProject, entry);
  let real: string;
  try {
    real = realpathSync.native(abs);
  } catch {
    real = "";
  }
  if (real === "" || !statSync(real).isDirectory()) {
    throw new Error(
      `defold-typescript: ${LINK_ROOTS_SETTING} entry ${JSON.stringify(entry)} names no folder (${abs.split(path.sep).join("/")}).`,
    );
  }
  return real;
}

/**
 * The real folders a symbolic link under the project may lead into: the
 * repository root, else the project itself, then each `link-roots` entry,
 * resolved against the project.
 */
export function readLinkRoots(cwd: string): string[] {
  const realProject = realpathSync.native(cwd);
  return [
    repositoryRoot(realProject) ?? realProject,
    ...readLinkRootEntries(cwd).map((entry) => resolveLinkRoot(realProject, entry)),
  ];
}

export function isUnderLinkRoot(roots: readonly string[], real: string): boolean {
  return roots.some((root) => {
    const rel = path.relative(root, real);
    return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
  });
}

/** The escape message for `linkRel`, a link under `cwd` whose text is `text`. */
export function linkEscapeMessage(
  cwd: string,
  roots: readonly string[],
  linkRel: string,
  text: string,
): string {
  const realProject = realpathSync.native(cwd);
  const fix = `List its folder in ${LINK_ROOTS_SETTING} to compile it.`;
  // `readLinkRoots` falls back to the project when no repository encloses it,
  // and that fallback reads the same as a repository root at the project.
  if (repositoryRoot(realProject) === undefined) {
    return `${linkRel} is a symbolic link to ${text}, which leads outside the project (no .git at or above it marks a repository). ${fix}`;
  }
  const repository = roots[0] ?? cwd;
  const shown = path.relative(realProject, repository).split(path.sep).join("/");
  return `${linkRel} is a symbolic link to ${text}, which leads outside the repository (${shown === "" ? "." : shown}). ${fix}`;
}
