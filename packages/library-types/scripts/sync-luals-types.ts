import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { emitLibraryDeclarations } from "./emit-library-dts";
import { lowerLibraryModel } from "./lower-api-doc";
import { buildFidelityReport, type FidelityReport } from "./luals-fidelity";
import { type LibraryModel, mergeLibraryModels, parseLualsSource } from "./parse-luals";

/**
 * The LuaLS ingestion front-end pins its source per-entry: a druid-style library
 * ships no `.d.ts`, only inline LuaLS `---@` annotations, and each such library
 * lives in its own repo at its own tag. So every target carries its own
 * `repo`/`ref`, unlike the ts-defold front-end's single shared `source`.
 */
export interface LualsTarget {
  repo: string;
  ref: string;
  sourceGlobs: string[];
  moduleId: string;
  namespace: string;
  typeRenames: Record<string, string>;
  ignore: string[];
  // SPDX-style license id, surfaced by the docs-site provenance block. Optional
  // in the config; the docs-site defaults an absent value to "".
  license?: string;
}

export interface LualsTargets {
  targets: LualsTarget[];
}

const REQUIRED_FIELDS = ["repo", "ref", "sourceGlobs", "moduleId", "namespace"] as const;

/**
 * Read `luals-targets.json`, validate every required field per entry, and fill
 * optional defaults (`typeRenames` → `{}`, `ignore` → `[]`). Throws on the first
 * missing field naming both the field and the offending entry (its `moduleId`,
 * or its index when `moduleId` itself is absent) — the loud-fail discipline the
 * ts-defold `regenerate` uses for unmapped references. No network.
 */
export function readLualsTargets(packageRoot: string): LualsTarget[] {
  const parsed = JSON.parse(readFileSync(join(packageRoot, "luals-targets.json"), "utf8")) as {
    targets: Partial<LualsTarget>[];
  };
  return parsed.targets.map((entry, index) => {
    const label = typeof entry.moduleId === "string" ? entry.moduleId : `index ${index}`;
    for (const field of REQUIRED_FIELDS) {
      if (entry[field] === undefined) {
        throw new Error(`luals-targets.json: entry ${label} is missing required field "${field}".`);
      }
    }
    return {
      repo: entry.repo as string,
      ref: entry.ref as string,
      sourceGlobs: entry.sourceGlobs as string[],
      moduleId: entry.moduleId as string,
      namespace: entry.namespace as string,
      typeRenames: entry.typeRenames ?? {},
      ignore: entry.ignore ?? [],
      ...(entry.license !== undefined ? { license: entry.license } : {}),
    };
  });
}

/**
 * Compile a glob to an anchored RegExp — mirrors `globToRegex` in
 * `packages/cli/src/build-output.ts` rather than importing across packages
 * (library-types must not depend on the cli package). A `**` path segment spans
 * any number of segments, a bare `**` spans the rest, `*` a non-slash run, `?`
 * one non-slash.
 */
function globToRegex(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        i++;
        if (pattern[i + 1] === "/") {
          i++;
          out += "(?:[^/]+/)*";
        } else {
          out += ".*";
        }
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else {
      out += (c as string).replace(/[.+^$(){}|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}

/**
 * A path is selected iff at least one `sourceGlob` matches and no `ignore` glob
 * matches. Returns the sorted, deduped subset — the fixture set the vendor step
 * snapshots.
 */
export function selectLualsSources(
  paths: string[],
  target: { sourceGlobs: string[]; ignore: string[] },
): string[] {
  const includes = target.sourceGlobs.map(globToRegex);
  const excludes = target.ignore.map(globToRegex);
  const selected = paths.filter(
    (p) => includes.some((re) => re.test(p)) && !excludes.some((re) => re.test(p)),
  );
  return [...new Set(selected)].sort();
}

/** Enumerate the pinned tree of a LuaLS library repo at its ref. Network seam. */
export type ListLualsTree = (repo: string, ref: string) => Promise<string[]>;

/** Fetch the raw text at a URL. Network seam — mirrors `sync-library-types.ts`. */
export type FetchText = (url: string) => Promise<string>;

/** Recursively enumerate a fixture directory's entries. Filesystem seam. */
export type ReadFixtureDir = (root: string) => string[];

/**
 * A GitHub repo URL reduced to the bare `<owner>/<repo>` slug used to address
 * raw content. Mirrors `repoSlug` in the ts-defold front-end.
 */
function repoSlug(repo: string): string {
  return repo
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
}

function rawUrl(target: LualsTarget, path: string): string {
  return `https://raw.githubusercontent.com/${repoSlug(target.repo)}/${target.ref}/${path}`;
}

/**
 * List the pinned tree, select the matching sources, fetch each via raw-content
 * URL, and write it under `fixtures/luals/<namespace>/<relpath>` preserving tree
 * shape. Snapshot only — no codemod. The `listTree`/`fetchText` seams keep the
 * pass offline-testable; only the CLI `--fetch` arm wires the real network.
 */
export async function fetchLualsFixtures(
  packageRoot: string,
  target: LualsTarget,
  seams: { listTree: ListLualsTree; fetchText: FetchText },
): Promise<void> {
  const paths = selectLualsSources(await seams.listTree(target.repo, target.ref), target);
  for (const path of paths) {
    const text = await seams.fetchText(rawUrl(target, path));
    const dest = join(packageRoot, "fixtures/luals", target.namespace, path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, text);
  }
}

/**
 * Parse and merge a target's committed fixtures, then build its fidelity report.
 * Reads only `fixtures/luals/<namespace>/**` from disk — zero network — so both
 * the `--fidelity` CLI arm and its round-trip test drive the exact same path and
 * agree byte-for-byte. Fixture files are read in sorted order for determinism,
 * mirroring the parse snapshot.
 *
 * Interfaces and aliases come from the full merge — the module's own signatures
 * reference cross-file classes — but module functions are scoped to the module's
 * own `.lua` file (`moduleId` dotted to a path, e.g. `druid.druid` →
 * `druid/druid.lua`). Merging every file's free functions would export every
 * library file's functions from the one module. A `moduleId` with no matching
 * fixture is a loud misconfiguration, not a silently empty surface.
 */
export function buildTargetModel(
  packageRoot: string,
  target: LualsTarget,
  seams: { readDir?: ReadFixtureDir } = {},
): LibraryModel {
  const readDir = seams.readDir ?? ((r) => readdirSync(r, { recursive: true }).map(String));
  const root = join(packageRoot, "fixtures/luals", target.namespace);
  const files = readDir(root)
    .map((entry) => entry.replace(/\\/g, "/"))
    .filter((entry) => entry.endsWith(".lua"))
    .sort();
  const ownFile = `${target.moduleId.replace(/\./g, "/")}.lua`;
  if (!files.includes(ownFile)) {
    throw new Error(
      `buildTargetModel: module "${target.moduleId}" expects fixture "${ownFile}" under fixtures/luals/${target.namespace}, but it is not among the ${files.length} fixture .lua files.`,
    );
  }
  const parsed = new Map<string, LibraryModel>();
  for (const rel of files) parsed.set(rel, parseLualsSource(readFileSync(join(root, rel), "utf8")));
  const merged = mergeLibraryModels([...parsed.values()]);
  return { ...merged, moduleFunctions: parsed.get(ownFile)?.moduleFunctions ?? [] };
}

export function buildTargetFidelity(packageRoot: string, target: LualsTarget): FidelityReport {
  return buildFidelityReport(
    target.namespace,
    buildTargetModel(packageRoot, target),
    target.typeRenames,
  );
}

/**
 * A druid-style corpus member: a LuaLS-sourced pure-Lua library, distinct from
 * the ts-defold hand-written modules. Standalone registry — the docs-site and
 * CLI wirings belong to later slices, not this one.
 */
export interface LualsCorpusEntry {
  moduleId: string;
  namespace: string;
  classification: "pure-lua";
  source: "luals";
}

export function lualsCorpusTargets(packageRoot: string): LualsCorpusEntry[] {
  return readLualsTargets(packageRoot).map((target) => ({
    moduleId: target.moduleId,
    namespace: target.namespace,
    classification: "pure-lua",
    source: "luals",
  }));
}

interface GithubTreeResponse {
  tree?: { path: string }[];
}

const githubHeaders = (): Record<string, string> => {
  const token = process.env.GITHUB_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const defaultListTree: ListLualsTree = async (repo, ref) => {
  const url = `https://api.github.com/repos/${repoSlug(repo)}/git/trees/${ref}?recursive=1`;
  const res = await fetch(url, { headers: githubHeaders() });
  if (!res.ok) {
    throw new Error(`git-trees fetch failed: ${url} -> ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as GithubTreeResponse;
  return (body.tree ?? []).map((e) => e.path);
};

const defaultFetchText: FetchText = async (url) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch failed: ${url} -> ${res.status} ${res.statusText}`);
  }
  return res.text();
};

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const argv = process.argv.slice(2);
  if (argv.includes("--fetch")) {
    const targets = readLualsTargets(root);
    for (const target of targets) {
      await fetchLualsFixtures(root, target, {
        listTree: defaultListTree,
        fetchText: defaultFetchText,
      });
      console.log(`snapshotted ${target.moduleId} from ${repoSlug(target.repo)}@${target.ref}`);
    }
  }
  if (argv.includes("--fidelity")) {
    const targets = readLualsTargets(root);
    for (const target of targets) {
      const report = buildTargetFidelity(root, target);
      const dest = join(root, "fidelity", `${target.namespace}.json`);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, `${JSON.stringify(report, null, 2)}\n`);
      console.log(
        `${target.moduleId}: coverage ${(report.coverage * 100).toFixed(1)}% (${report.unknownFallbacks} unknown, ${report.undocumentedMembers} undocumented)`,
      );
    }
  }
  if (argv.includes("--emit")) {
    const targets = readLualsTargets(root);
    for (const target of targets) {
      const model = buildTargetModel(root, target);
      const declarations = emitLibraryDeclarations(model, {
        moduleId: target.moduleId,
        typeRenames: target.typeRenames,
      });
      const dest = join(root, "generated", `${target.namespace}.d.ts`);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, declarations);
      console.log(`emitted ${target.moduleId} -> generated/${target.namespace}.d.ts`);
    }
  }
  if (argv.includes("--api-doc")) {
    const targets = readLualsTargets(root);
    for (const target of targets) {
      const model = buildTargetModel(root, target);
      const lowered = lowerLibraryModel(model, { namespace: target.namespace });
      const dest = join(root, "api-doc", `${target.namespace}.json`);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, `${JSON.stringify(lowered, null, 2)}\n`);
      console.log(`lowered ${target.moduleId} -> api-doc/${target.namespace}.json`);
    }
  }
}
