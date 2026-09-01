// The scene-source half of the dependency pipeline: it unpacks each resolved
// dependency's shared `[library] include_dirs` files into the gitignored sibling
// surface `.defold-types/dependencies/<archive key>/`, at the resource path a
// depending project addresses them by.
//
// `resolve` does this rather than the scene walk because the shipped zip seam is
// `Bun.spawnSync("unzip")`, which cannot run inside `tsserver` where the editor
// plugin's walk is synchronous node. `/.defold-types` is defignored, so bob never
// sees the copies and cannot double-load a library scene. These are resources,
// not types, so nothing points tsconfig at them.

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { isContainedResourcePath } from "@defold-typescript/transpiler";
import { extensionArchiveKey } from "./extension-archive";
import { formatJsonLikeBiome } from "./format-json";
import { MATERIALIZED_ROOT } from "./materialize";

const DEPENDENCIES_DIR = "dependencies";
const MANIFEST_FILE = "dependencies.json";

export interface LibrarySceneBundle {
  readonly url: string;
  readonly sceneSources: readonly { path: string; text: string }[];
}

export interface MaterializeLibrarySceneSourcesOptions {
  readonly cwd: string;
  readonly bundles: readonly LibrarySceneBundle[];
}

export interface MaterializeLibrarySceneSourcesResult {
  readonly materializedDir: string | null;
  readonly counts: Map<string, number>;
}

export function materializeLibrarySceneSources(
  opts: MaterializeLibrarySceneSourcesOptions,
): MaterializeLibrarySceneSourcesResult {
  const { cwd, bundles } = opts;

  const counts = new Map<string, number>();
  // Every resolved dependency is listed, sharing or not. The scene walk that
  // reads this manifest has no other way to tell a dependency that shares no
  // scenes from one the last resolve never reached, and reporting the first as
  // an unresolved hole would mark the address universe incomplete — which
  // suppresses the reachability report — for every project whose only
  // dependencies are native extensions.
  const resolved: {
    key: string;
    url: string;
    sources: readonly { path: string; text: string }[];
  }[] = [];
  for (const bundle of bundles) {
    counts.set(bundle.url, bundle.sceneSources.length);
    resolved.push({
      key: extensionArchiveKey(bundle.url),
      url: bundle.url,
      sources: bundle.sceneSources,
    });
  }
  resolved.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const relDir = path.posix.join(MATERIALIZED_ROOT, DEPENDENCIES_DIR);
  const absDir = path.join(cwd, MATERIALIZED_ROOT, DEPENDENCIES_DIR);

  // Up front, before the first mkdir or rm: the reader already refuses these
  // paths, so one reaching here means the two rules disagree — a defect to
  // surface rather than a data condition to absorb. Checking every source of
  // every bundle first is what keeps a violation from leaving the surface
  // half-reconciled. The traversal test is segment-shaped, not a string prefix:
  // a leading `..` only leaves the key directory when a separator follows it,
  // so `..assets` is an ordinary directory name to both rules.
  for (const { key, url, sources } of resolved) {
    const keyDir = path.join(absDir, key);
    for (const { path: rel } of sources) {
      const relative = path.relative(keyDir, path.join(keyDir, ...rel.split("/")));
      if (
        !isContainedResourcePath(rel) ||
        path.isAbsolute(relative) ||
        relative === ".." ||
        relative.startsWith(`..${path.sep}`)
      ) {
        throw new Error(`refusing unsafe scene path from ${url}: ${rel}`);
      }
    }
  }

  // An empty dependency set reconciles the surface to zero rather than leaving a
  // stale library declaring ids for good.
  if (resolved.length === 0) {
    if (existsSync(absDir)) {
      rmSync(absDir, { recursive: true, force: true });
    }
    return { materializedDir: null, counts };
  }

  mkdirSync(absDir, { recursive: true });

  const wanted = new Set(
    resolved.filter((entry) => entry.sources.length > 0).map((entry) => entry.key),
  );
  for (const existing of readdirSync(absDir)) {
    if (existing !== MANIFEST_FILE && !wanted.has(existing)) {
      rmSync(path.join(absDir, existing), { recursive: true, force: true });
    }
  }

  for (const { key, sources } of resolved) {
    if (sources.length === 0) continue;
    const keyDir = path.join(absDir, key);
    rmSync(keyDir, { recursive: true, force: true });
    for (const { path: rel, text } of sources) {
      const target = path.join(keyDir, ...rel.split("/"));
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, text);
    }
  }

  writeFileSync(
    path.join(absDir, MANIFEST_FILE),
    `${formatJsonLikeBiome({
      dependencies: resolved.map(({ key, url }) => ({ key, url })),
    })}\n`,
  );

  return { materializedDir: relDir, counts };
}
