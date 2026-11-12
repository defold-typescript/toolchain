import {
  lstatSync,
  mkdirSync,
  type RmOptions,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  type Stats,
  writeFileSync,
} from "node:fs";
import * as path from "node:path";

/** A path the build refused to write or remove, with the reason as its message. */
export class ContainedPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContainedPathError";
  }
}

export interface LinkOnPath {
  /** The link's path under the root, with forward slashes. */
  readonly linkRel: string;
  /** What the link itself says it points at, as `readlink` reports it. */
  readonly text: string;
}

interface ResolvedTarget {
  readonly rootAbs: string;
  /** The path to read, write or remove: exactly the file the check inspects. */
  readonly abs: string;
  /** The components under the root, split on the host's own separator. */
  readonly parts: readonly string[];
  /** The components joined with forward slashes, for messages and the outside test. */
  readonly rel: string;
}

// Split on the host separator only: on macOS and Linux a backslash is part of
// a name, and a check that splits on it walks a different path than the write.
function resolveTarget(root: string, target: string): ResolvedTarget {
  const rootAbs = path.resolve(root);
  const hostRel = path.relative(rootAbs, path.resolve(rootAbs, target));
  const parts = hostRel === "" ? [] : hostRel.split(path.sep);
  return { rootAbs, abs: path.join(rootAbs, ...parts), parts, rel: parts.join("/") };
}

// Checked on the posix spelling rather than with `path.isAbsolute`, which only
// knows the host's own forms: a drive path is relative on posix, and would
// otherwise be taken for a folder named `C:` under the project.
function isOutsideRel(rel: string): boolean {
  return rel === ".." || rel.startsWith("../") || rel.startsWith("/") || /^[A-Za-z]:/.test(rel);
}

/** Whether a project-relative path, in any slash or drive spelling, reaches outside the project. */
export function escapesProject(rel: string): boolean {
  return isOutsideRel(path.posix.normalize(rel.replace(/\\/g, "/")));
}

function isInside(realRoot: string, real: string): boolean {
  const rel = path.relative(realRoot, real);
  return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function lstatOrUndefined(abs: string): Stats | undefined {
  try {
    return lstatSync(abs);
  } catch {
    return undefined;
  }
}

function realpathOrUndefined(abs: string): string | undefined {
  try {
    return realpathSync.native(abs);
  } catch {
    return undefined;
  }
}

interface PathComponent {
  readonly rel: string;
  readonly abs: string;
  readonly stat: Stats;
  readonly isLast: boolean;
}

/** Each existing component of the target, root first, up to the first missing one. */
function* existingComponents(resolved: ResolvedTarget): Generator<PathComponent> {
  const { rootAbs, parts } = resolved;
  for (let i = 0; i < parts.length; i++) {
    const componentRel = parts.slice(0, i + 1).join("/");
    const abs = path.join(rootAbs, ...parts.slice(0, i + 1));
    const stat = lstatOrUndefined(abs);
    if (stat === undefined) {
      return;
    }
    yield { rel: componentRel, abs, stat, isLast: i === parts.length - 1 };
  }
}

/** The first symbolic link among the components of `rel`, root first. */
export function firstLinkOnPath(root: string, rel: string): LinkOnPath | undefined {
  for (const component of existingComponents(resolveTarget(root, rel))) {
    if (component.stat.isSymbolicLink()) {
      return { linkRel: component.rel, text: readlinkSync(component.abs) };
    }
  }
  return undefined;
}

/**
 * Why the build may not write or remove `target`, or undefined when it may.
 *
 * The destination itself must not be a link, dangling or not: writing follows
 * it, and the link's target is not the build's to change. A folder link on the
 * way is followed only while it resolves inside the project's real root. The
 * deepest existing folder is resolved last, which also covers a Windows junction
 * that `lstat` does not report as a link.
 */
export function containmentProblem(root: string, target: string): string | undefined {
  return problemOf(resolveTarget(root, target), target);
}

function problemOf(resolved: ResolvedTarget, target: string): string | undefined {
  const { rel, rootAbs } = resolved;
  if (isOutsideRel(rel)) {
    return `${target.replace(/\\/g, "/")} is outside the project folder; the build writes only inside it.`;
  }
  if (rel === "") {
    return undefined;
  }
  const realRoot = realpathSync.native(rootAbs);
  let deepestDir = { rel: ".", abs: rootAbs };
  for (const component of existingComponents(resolved)) {
    if (component.stat.isSymbolicLink()) {
      const text = readlinkSync(component.abs);
      if (component.isLast) {
        return `${rel} is a symbolic link to ${text}; the build does not write through links. Remove the link.`;
      }
      const real = realpathOrUndefined(component.abs);
      if (real === undefined) {
        return `${rel} would be written through ${component.rel}, a symbolic link to ${text} whose target does not exist.`;
      }
      if (!isInside(realRoot, real)) {
        return `${rel} would be written through ${component.rel}, a symbolic link to ${text} that leads outside the project folder.`;
      }
      deepestDir = component;
    } else if (component.stat.isDirectory()) {
      deepestDir = component;
    }
  }
  const realDir = realpathOrUndefined(deepestDir.abs);
  if (realDir === undefined || !isInside(realRoot, realDir)) {
    return `${rel} would be written into ${deepestDir.rel}, which leads outside the project folder.`;
  }
  return undefined;
}

/** The absolute path of `target` under `root`, once it is contained; act on this path and no other. */
export function assertContained(root: string, target: string): string {
  const resolved = resolveTarget(root, target);
  const problem = problemOf(resolved, target);
  if (problem !== undefined) {
    throw new ContainedPathError(problem);
  }
  return resolved.abs;
}

// An output's modification time moves only with its content: the debug
// launcher reads a compiled copy older than its output as a stale engine build.
// A direct write rather than a temp-file rename, which would briefly put a
// `.tmp` file in the game's resource folders. Resolves whether the file was
// created or its bytes changed.
function writeIfChanged(abs: string, text: string): boolean {
  let current: string | undefined;
  try {
    current = readFileSync(abs, "utf8");
  } catch {
    current = undefined;
  }
  if (current === text) {
    return false;
  }
  writeFileSync(abs, text);
  return true;
}

/**
 * Write `text` to `target` under `root`, creating its folders, once the path is
 * contained. Resolves whether the file was created or its bytes changed.
 */
export function writeContainedFile(root: string, target: string, text: string): boolean {
  const abs = assertContained(root, target);
  mkdirSync(path.dirname(abs), { recursive: true });
  return writeIfChanged(abs, text);
}

/** Remove `target` under `root`, a missing path included, once the path is contained. */
export function removeContained(
  root: string,
  target: string,
  opts: Omit<RmOptions, "force"> = {},
): void {
  rmSync(assertContained(root, target), { force: true, ...opts });
}

/** Create the folder `target` under `root` and its parents, once the path is contained. */
export function ensureContainedDir(root: string, target: string): void {
  mkdirSync(assertContained(root, target), { recursive: true });
}

/** Move `from` to `to`, both under `root`, once both paths are contained. */
export function renameContained(root: string, from: string, to: string): void {
  const fromAbs = assertContained(root, from);
  renameSync(fromAbs, assertContained(root, to));
}
