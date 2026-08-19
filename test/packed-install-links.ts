import { beforeAll } from "bun:test";
import { existsSync, mkdirSync, readdirSync, realpathSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";

export const REPO_ROOT = path.resolve(import.meta.dir, "..");

export function packageDir(pkg: string): string {
  return path.join(REPO_ROOT, "packages", pkg);
}

export type LinkedDependencyRoot = {
  specifier: string;
  link: string;
  target: string;
  installed: string;
};

// A real `npm install` places each package's own third-party deps beside it, so
// mirror the workspace's nested ones into the extracted tree. `@defold-typescript`
// is deliberately excluded: those must stay real extracted directories, because
// it is the workspace symlink — whose realpath escapes `node_modules` — that
// hides this defect from the in-repo suite.
//
// Every link points at a realpath: a scope directory is not a package, and its
// children are relative symlinks into `node_modules/.bun/` that re-interpret
// from wherever the link is traversed. Linking the leaf's realpath keeps the
// packed tree self-contained on a host that traverses links in place.
export function linkThirdPartyDeps(pkg: string, into: string): LinkedDependencyRoot[] {
  const source = path.join(packageDir(pkg), "node_modules");
  if (!existsSync(source)) return [];
  const target = path.join(into, "node_modules");
  mkdirSync(target, { recursive: true });
  const linked: LinkedDependencyRoot[] = [];
  for (const entry of readdirSync(source)) {
    if (entry === "@defold-typescript" || entry === ".bin") continue;
    const specifiers = entry.startsWith("@")
      ? readdirSync(path.join(source, entry)).map((leaf) => `${entry}/${leaf}`)
      : [entry];
    for (const specifier of specifiers) {
      const resolved = realpathSync(path.join(source, specifier));
      const link = path.join(target, specifier);
      mkdirSync(path.dirname(link), { recursive: true });
      // "junction" is correct on Windows for a real directory target and inert
      // on POSIX; the defect this guards was the target, not the link type.
      symlinkSync(resolved, link, "junction");
      linked.push({ specifier, link, target: resolved, installed: into });
    }
  }
  return linked;
}

export function verifyLinkedDependencies(roots: LinkedDependencyRoot[]): void {
  // A scan that recorded nothing would green every assertion below.
  if (roots.length === 0) throw new Error("no linked dependency was recorded to verify");

  for (const root of roots) {
    const describeLink = `${root.specifier}: ${root.link} -> ${root.target}`;

    let traversed: string;
    try {
      traversed = realpathSync(path.join(root.link, "package.json"));
    } catch (cause) {
      throw new Error(`the packed link does not traverse — ${describeLink}`, { cause });
    }

    const from = createRequire(path.join(root.installed, "package.json"));
    let resolved: string;
    try {
      resolved = from.resolve(`${root.specifier}/package.json`);
    } catch (cause) {
      throw new Error(
        `${root.specifier} does not resolve from ${root.installed} — ${describeLink}`,
        { cause },
      );
    }

    const resolvedReal = realpathSync(resolved);
    if (resolvedReal !== traversed) {
      throw new Error(`${describeLink} resolved to ${resolvedReal}, expected ${traversed}`);
    }
  }
}

// A prerequisite, not a test: a throw here aborts every test in the enclosing
// describe before any body runs, so a broken link is reported by name instead of
// surfacing as a downstream module-not-found from a spawned process.
export function installLinkPreflight(roots: LinkedDependencyRoot[]): void {
  beforeAll(() => verifyLinkedDependencies(roots));
}
