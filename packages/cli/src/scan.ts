import {
  type Dirent,
  globSync,
  lstatSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  type Stats,
  statSync,
} from "node:fs";
import * as path from "node:path";
import { compileIncludeGlob, type IncludeGlob } from "./include-glob";
import { isUnderLinkRoot, LinkEscapeError, linkEscapeMessage, readLinkRoots } from "./link-roots";

export function normalizeScannedPath(rel: string): string {
  return rel.split(/[/\\]/).join("/");
}

function isFileAt(cwd: string, rel: string): boolean {
  try {
    return statSync(path.join(cwd, rel)).isFile();
  } catch {
    return false;
  }
}

function statOrUndefined(abs: string, follow: boolean): Stats | undefined {
  try {
    return follow ? statSync(abs) : lstatSync(abs);
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

const GLOB_METACHARACTER_RE = /[*?[\]{}]/;

interface LinkGuard {
  /** The real target of the link at `rel`, or undefined when it dangles; throws when it escapes. */
  follow(rel: string): string | undefined;
  /** Checks every link among the existing components of `rel`; true when there is one. */
  checkPath(rel: string): boolean;
}

function createLinkGuard(cwd: string, roots: readonly string[]): LinkGuard {
  const linkByPrefix = new Map<string, boolean>();

  function follow(rel: string): string | undefined {
    const abs = path.join(cwd, rel);
    const real = realpathOrUndefined(abs);
    if (real !== undefined && !isUnderLinkRoot(roots, real)) {
      throw new LinkEscapeError(linkEscapeMessage(cwd, roots, rel, readlinkSync(abs)));
    }
    return real;
  }

  function checkPath(rel: string): boolean {
    const parts = rel.split("/").filter((part) => part !== "" && part !== ".");
    let sawLink = false;
    for (let i = 0; i < parts.length; i++) {
      const prefix = parts.slice(0, i + 1).join("/");
      let isLink = linkByPrefix.get(prefix);
      if (isLink === undefined) {
        const stat = statOrUndefined(path.join(cwd, prefix), false);
        if (stat === undefined) {
          return sawLink;
        }
        isLink = stat.isSymbolicLink();
        linkByPrefix.set(prefix, isLink);
        if (isLink) {
          follow(prefix);
        }
      }
      sawLink ||= isLink;
    }
    return sawLink;
  }

  return { follow, checkPath };
}

/**
 * The files under `baseRel` that only a symbolic link reaches, keyed by the
 * link path. Each chain of links carries the real folders it entered, so a
 * cycle stops at its first repeat while a file two different links reach is
 * still listed under both paths, for `discoverSources` to report.
 */
function filesThroughLinks(
  cwd: string,
  baseRel: string,
  baseIsLinked: boolean,
  glob: IncludeGlob,
  guard: LinkGuard,
): string[] {
  const found: string[] = [];
  const walk = (dirRel: string, viaLink: boolean, chain: ReadonlySet<string>): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(path.join(cwd, dirRel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const name = String(entry.name);
      if (name.startsWith(".") || name === "node_modules") {
        continue;
      }
      const rel = dirRel === "" ? name : `${dirRel}/${name}`;
      // A Windows junction can read as a folder entry, so a folder is confirmed with `lstat`.
      const isLink =
        entry.isSymbolicLink() ||
        (entry.isDirectory() &&
          statOrUndefined(path.join(cwd, rel), false)?.isSymbolicLink() === true);
      if (isLink) {
        const target = statOrUndefined(path.join(cwd, rel), true);
        if (target?.isDirectory()) {
          if (glob.mayContain(rel)) {
            const real = guard.follow(rel);
            if (real !== undefined && !chain.has(real)) {
              walk(rel, true, new Set(chain).add(real));
            }
          }
        } else if (target?.isFile() && glob.matches(rel)) {
          guard.follow(rel);
          if (viaLink) {
            found.push(rel);
          }
        }
      } else if (entry.isDirectory()) {
        if (glob.mayContain(rel)) {
          walk(rel, viaLink, chain);
        }
      } else if (viaLink && entry.isFile() && glob.matches(rel)) {
        found.push(rel);
      }
    }
  };
  walk(baseRel, baseIsLinked, new Set());
  return found;
}

// `Bun.Glob` is undefined when the published bin runs under plain node, so the
// scaffold/build path must use the cross-runtime `node:fs` glob instead. Bun's
// `globSync` does not support `withFileTypes`, so directories are filtered out
// with a stat to preserve the original `onlyFiles` contract.
//
// A wildcard-free pattern is resolved by stat instead of by glob: bun's
// `globSync` never descends a dot-directory and ignores `dot: true`, while
// node's matches one by default, so an exact entry such as
// `.defold-types/scene-addresses.d.ts` would otherwise reach the compiler on
// one runtime and not the other. A stat also answers the exact question the
// pattern asks, so the two runtimes cannot disagree.
//
// Neither runtime's `globSync` descends a folder link under `**`, so the glob
// result is the real tree and the files reached through links are added after
// it. Every link the pattern reaches must lead inside one of `roots`.
export function scanFilesSync(
  cwd: string,
  pattern: string,
  roots: readonly string[] = readLinkRoots(cwd),
): string[] {
  const rel = normalizeScannedPath(pattern);
  const guard = createLinkGuard(cwd, roots);
  if (!GLOB_METACHARACTER_RE.test(rel)) {
    guard.checkPath(rel);
    return isFileAt(cwd, rel) ? [rel] : [];
  }
  const matches = globSync(pattern, { cwd })
    .map(normalizeScannedPath)
    .filter((match) => isFileAt(cwd, match));
  const glob = compileIncludeGlob(rel);
  const baseIsLinked = guard.checkPath(glob.walkBase);
  for (const match of matches) {
    guard.checkPath(match);
  }
  const seen = new Set(matches);
  const linked = filesThroughLinks(cwd, glob.walkBase, baseIsLinked, glob, guard).filter(
    (candidate) => {
      if (seen.has(candidate)) {
        return false;
      }
      seen.add(candidate);
      return true;
    },
  );
  return [...matches, ...linked];
}

/**
 * The project's sources: every file an `include` pattern reaches, links
 * followed, sorted. One file reached under two paths fails, since it would be
 * compiled twice under two module names.
 */
export function discoverSources(cwd: string, include: readonly string[]): string[] {
  const roots = readLinkRoots(cwd);
  const rels = new Set<string>();
  for (const pattern of include) {
    for (const match of scanFilesSync(cwd, pattern, roots)) {
      rels.add(match);
    }
  }
  const sources = [...rels].sort();
  const relByReal = new Map<string, string>();
  for (const source of sources) {
    const real = realpathSync.native(path.join(cwd, source));
    const first = relByReal.get(real);
    if (first !== undefined) {
      throw new Error(
        `${first} and ${source} are the same file reached through a symbolic link; include it once.`,
      );
    }
    relByReal.set(real, source);
  }
  return sources;
}
