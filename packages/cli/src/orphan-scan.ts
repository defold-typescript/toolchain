import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  type BuildConfig,
  GENERATED_BANNER,
  lualibBundleRel,
  outputRelsForSource,
  stripIncludeBase,
  timersModuleRel,
} from "./build-output";
import { scanFilesSync } from "./scan";

// Generated component outputs carry the `.ts.` infix (e.g. `foo.ts.script`),
// which no hand-authored Defold component path has. The optional `.map` lets
// the source-map sibling match too.
const COMPONENT_OUTPUT_RE = /\.ts\.(script|gui_script|render_script)(\.map)?$/;

// Vendored trees never hold this project's outputs. `build` is deliberately
// absent: an `outDir` of `build`/`build/lua` is common, so skipping it would
// blind the scan to the very directory the outputs live in.
const SCAN_SKIP_SEGMENTS = new Set(["node_modules", ".defold-types", ".git"]);

function isScanSkipped(rel: string): boolean {
  return rel.split(/[/\\]/).some((segment) => SCAN_SKIP_SEGMENTS.has(segment));
}

// In outDir mode every output lands under outDir; in along-side mode they sit
// next to their sources under each include root.
function outputScanRoots(config: BuildConfig): string[] {
  const { outDir, include } = config;
  if (outDir !== undefined && outDir !== "" && outDir !== ".") {
    return [outDir.endsWith("/") ? outDir : `${outDir}/`];
  }
  const roots = new Set<string>();
  for (const pattern of include) {
    roots.add(stripIncludeBase(pattern));
  }
  return [...roots];
}

function hasGeneratedBanner(cwd: string, rel: string): boolean {
  let content: string;
  try {
    content = readFileSync(path.join(cwd, rel), "utf8");
  } catch {
    return false;
  }
  return content.split("\n").some((line) => line.trim() === GENERATED_BANNER);
}

// The source whose absence orphaned this output, used in the restore hint.
function restoreSourceFor(rel: string): string {
  const base = rel.endsWith(".map") ? rel.slice(0, -4) : rel;
  const infix = base.indexOf(".ts.");
  if (infix !== -1) {
    return base.slice(0, infix + 3);
  }
  if (base.endsWith(".lua")) {
    return `${base.slice(0, -4)}.ts`;
  }
  return base;
}

// Find generated outputs with no live `.ts` source. Component outputs are keyed
// by their `.ts.` infix; bare `.lua` only counts when it carries the banner, so
// hand-authored Lua never trips a warning. Warn-only: a sourceless `.lua` can
// not be proven tool-generated strongly enough to auto-delete.
export function scanOrphanOutputs(
  cwd: string,
  liveSources: readonly string[],
  config: BuildConfig,
): string[] {
  const explained = new Set<string>();
  for (const src of liveSources) {
    for (const out of outputRelsForSource(src, config)) {
      explained.add(out);
    }
  }
  for (const rel of [lualibBundleRel(config), timersModuleRel(config)]) {
    explained.add(rel);
    explained.add(`${rel}.map`);
  }

  const candidates = new Set<string>();
  for (const root of outputScanRoots(config)) {
    const pattern = root === "" ? "**/*" : `${root}**/*`;
    let matches: string[];
    try {
      matches = scanFilesSync(cwd, pattern);
    } catch {
      continue;
    }
    for (const rel of matches) {
      if (isScanSkipped(rel)) {
        continue;
      }
      if (COMPONENT_OUTPUT_RE.test(rel)) {
        candidates.add(rel);
      } else if (rel.endsWith(".lua") && hasGeneratedBanner(cwd, rel)) {
        candidates.add(rel);
      } else if (rel.endsWith(".lua.map") && hasGeneratedBanner(cwd, rel.slice(0, -4))) {
        candidates.add(rel);
      }
    }
  }

  return [...candidates]
    .filter((rel) => !explained.has(rel))
    .sort()
    .map(
      (rel) =>
        `stale output ${rel} has no TypeScript source (delete it or restore ${restoreSourceFor(rel)})`,
    );
}
