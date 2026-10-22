import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  apiJson,
  apiJsonOrNull,
  gitHubToken,
  libraryIncludeDirs,
  type RefKind,
  request,
  selectPin,
} from "./sync-defold-extensions";

/**
 * The Defold Asset Portal intake: every `defold/asset-portal` entry, pinned to
 * the portal commit, with the GitHub repo it names classified by what a
 * dependency on it installs. Evidence is counted only inside the repo's
 * `[library] include_dirs` at its pin, because files elsewhere in the tree
 * (samples, editor tooling) never reach a project that adds the dependency.
 * Nothing at runtime reads the manifest; coverage reports and docs listings do.
 */

const PORTAL_REPO = "defold/asset-portal";

export type PortalKind =
  | "no-source"
  | "not-a-dependency"
  | "script-api"
  | "native-untyped"
  | "pure-lua-annotated"
  | "pure-lua"
  | "no-lua-api";

/** The fields of an `assets/<id>.json` portal entry the sync reads. */
export interface PortalAsset {
  id?: string;
  name: string;
  description: string;
  tags: string[];
  project_url: string;
  library_url: string;
  isDefoldLibrary: boolean;
}

export interface PortalRepo {
  full_name: string;
  archived: boolean;
  fork: boolean;
  pushed_at: string;
  stargazers_count: number;
  default_branch: string;
  license: { spdx_id: string | null } | null;
}

/**
 * The portal's own listing at one commit: entry file names under `assets/`
 * and their contents. A seam for offline tests.
 */
export interface PortalHead {
  head(): Promise<string>;
  entryFiles(sha: string): Promise<string[]>;
  entry(sha: string, file: string): Promise<PortalAsset>;
}

/**
 * The portal and GitHub surface the sync reads; a seam for offline tests.
 * Repo-scoped calls take `owner/repo`, so any owner the portal names is
 * reachable.
 */
export interface PortalSource {
  head(): Promise<string>;
  entries(sha: string): Promise<{ file: string; json: PortalAsset }[]>;
  repo(ownerRepo: string): Promise<PortalRepo | null>;
  latestRelease(fullName: string): Promise<{ tag_name: string } | null>;
  tags(fullName: string): Promise<{ name: string }[]>;
  headSha(fullName: string, branch: string): Promise<string>;
  tree(fullName: string, ref: string): Promise<string[]>;
  fetchText(url: string): Promise<string>;
}

export interface PortalEntry {
  id: string;
  name: string;
  description: string;
  tags: string[];
  portalLibrary: boolean;
  repo: string | null;
  reason?: "no-github-url" | "not-found";
  archived: boolean | null;
  fork: boolean | null;
  pushedAt: string | null;
  stars: number | null;
  ref: string | null;
  refKind: RefKind | null;
  includeDirs: string[];
  scriptApi: number;
  extManifest: number;
  lua: number;
  luaSampled: number;
  luaAnnotated: number;
  kind: PortalKind;
}

export interface AssetPortalManifest {
  source: { repo: string; commit: string; syncedAt: string };
  entries: PortalEntry[];
}

export interface IncludedEvidence {
  scriptApi: number;
  extManifest: number;
  lua: number;
  luaSample: string[];
}

const LUA_SAMPLE_SIZE = 4;
const NON_API_DIRS = new Set(["example", "examples", "test", "tests", "demo", "sample", "samples"]);
const LUALS_ANNOTATION = /^\s*---@(class|param|return|field)\b/m;

function isUnder(path: string, dirs: readonly string[]): boolean {
  return dirs.some((dir) => path.startsWith(`${dir}/`));
}

/**
 * The `.script_api` files under `dirs`, sorted: what the classifier counts and
 * what the portal pages convert, so the two cannot disagree.
 */
export function includedScriptApiPaths(
  paths: readonly string[],
  dirs: readonly string[],
): string[] {
  return paths.filter((path) => isUnder(path, dirs) && path.endsWith(".script_api")).sort();
}

/**
 * Count the `.script_api`, `ext.manifest` and `.lua` files under `dirs`, and
 * pick the Lua sample: the first four sorted paths outside any example, test,
 * demo or sample directory.
 */
export function includedEvidence(
  paths: readonly string[],
  dirs: readonly string[],
): IncludedEvidence {
  const included = paths.filter((path) => isUnder(path, dirs));
  const lua = included.filter((path) => path.endsWith(".lua"));
  return {
    scriptApi: includedScriptApiPaths(paths, dirs).length,
    extManifest: included.filter((path) => path.split("/").at(-1) === "ext.manifest").length,
    lua: lua.length,
    luaSample: lua
      .filter(
        (path) =>
          !path
            .split("/")
            .slice(0, -1)
            .some((dir) => NON_API_DIRS.has(dir)),
      )
      .sort()
      .slice(0, LUA_SAMPLE_SIZE),
  };
}

/**
 * First match wins. A `.script_api` outranks an `ext.manifest` because `resolve`
 * already types an extension that ships one; only an extension without it needs
 * the native curated lane.
 */
export function portalEntryKind(evidence: {
  readable: boolean;
  includeDirs: readonly string[];
  scriptApi: number;
  extManifest: number;
  lua: number;
  luaAnnotated: number;
}): PortalKind {
  if (!evidence.readable) return "no-source";
  if (evidence.includeDirs.length === 0) return "not-a-dependency";
  if (evidence.scriptApi > 0) return "script-api";
  if (evidence.extManifest > 0) return "native-untyped";
  if (evidence.lua > 0) return evidence.luaAnnotated > 0 ? "pure-lua-annotated" : "pure-lua";
  return "no-lua-api";
}

// The portal keys an entry by its file name; an `id` field, where present,
// is not always the same.
export function portalEntryId(file: string): string {
  return file.replace(/\.json$/, "");
}

function githubOwnerRepo(projectUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(projectUrl);
  } catch {
    return null;
  }
  if (!/^(www\.)?github\.com$/i.test(url.hostname)) return null;
  const [owner, repo] = url.pathname.split("/").filter(Boolean);
  if (!owner || !repo) return null;
  return `${owner}/${repo.replace(/\.git$/, "")}`;
}

export function rawUrl(fullName: string, ref: string, path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${fullName}/${ref}/${encoded}`;
}

const UNREADABLE = {
  archived: null,
  fork: null,
  pushedAt: null,
  stars: null,
  ref: null,
  refKind: null,
  includeDirs: [],
  scriptApi: 0,
  extManifest: 0,
  lua: 0,
  luaSampled: 0,
  luaAnnotated: 0,
  kind: "no-source",
} as const satisfies Partial<PortalEntry>;

async function classifyEntry(
  source: PortalSource,
  file: string,
  json: PortalAsset,
): Promise<PortalEntry> {
  const portal = {
    id: portalEntryId(file),
    name: json.name,
    description: json.description,
    tags: json.tags,
    portalLibrary: json.isDefoldLibrary,
  };
  const ownerRepo = githubOwnerRepo(json.project_url);
  if (!ownerRepo) return { ...portal, repo: null, reason: "no-github-url", ...UNREADABLE };
  const meta = await source.repo(ownerRepo);
  if (!meta) {
    return {
      ...portal,
      repo: `https://github.com/${ownerRepo}`,
      reason: "not-found",
      ...UNREADABLE,
    };
  }

  const fullName = meta.full_name;
  const [latestRelease, tags] = await Promise.all([
    source.latestRelease(fullName),
    source.tags(fullName),
  ]);
  const headSha =
    latestRelease || tags.length > 0 ? "" : await source.headSha(fullName, meta.default_branch);
  const pin = selectPin({ latestRelease, tags, headSha });

  const paths = await source.tree(fullName, pin.ref);
  const includeDirs = paths.includes("game.project")
    ? libraryIncludeDirs(await source.fetchText(rawUrl(fullName, pin.ref, "game.project")))
    : [];
  const evidence = includedEvidence(paths, includeDirs);
  let luaAnnotated = 0;
  for (const path of evidence.luaSample) {
    const text = await source.fetchText(rawUrl(fullName, pin.ref, path));
    if (LUALS_ANNOTATION.test(text)) luaAnnotated++;
  }

  return {
    ...portal,
    repo: `https://github.com/${fullName}`,
    archived: meta.archived,
    fork: meta.fork,
    pushedAt: meta.pushed_at,
    stars: meta.stargazers_count,
    ref: pin.ref,
    refKind: pin.refKind,
    includeDirs,
    scriptApi: evidence.scriptApi,
    extManifest: evidence.extManifest,
    lua: evidence.lua,
    luaSampled: evidence.luaSample.length,
    luaAnnotated,
    kind: portalEntryKind({ readable: true, includeDirs, ...evidence, luaAnnotated }),
  };
}

/**
 * Classify every entry at the portal head through `source`, then write
 * `asset-portal.json` (sorted by id) under `packageRoot`. An entry whose repo
 * is gone or off GitHub is recorded as `no-source` and the sync carries on.
 */
export async function syncAssetPortal(
  packageRoot: string,
  source: PortalSource,
  syncedAt: string,
): Promise<AssetPortalManifest> {
  const commit = await source.head();
  const entries: PortalEntry[] = [];
  for (const { file, json } of await source.entries(commit)) {
    entries.push(await classifyEntry(source, file, json));
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));

  const manifest: AssetPortalManifest = {
    source: { repo: `https://github.com/${PORTAL_REPO}`, commit, syncedAt },
    entries,
  };
  writeFileSync(join(packageRoot, "asset-portal.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function fetchText(url: string): Promise<string> {
  const res = await request(url, "text/plain");
  if (!res.ok) throw new Error(`fetch failed: ${url} -> ${res.status} ${res.statusText}`);
  return res.text();
}

async function tree(fullName: string, ref: string): Promise<string[]> {
  const result = await apiJson<{ tree: { path: string; type: string }[]; truncated: boolean }>(
    `repos/${fullName}/git/trees/${ref}?recursive=1`,
  );
  if (result.truncated) throw new Error(`git tree for ${fullName}@${ref} is truncated`);
  return result.tree.filter((node) => node.type === "blob").map((node) => node.path);
}

const ENTRY_DIR = "assets/";

/**
 * Two API calls list the head; entry contents come from raw.githubusercontent,
 * which the API rate limit does not count, so this works without a token.
 */
export function livePortalHead(): PortalHead {
  return {
    async head() {
      return (await apiJson<{ sha: string }>(`repos/${PORTAL_REPO}/commits/HEAD`)).sha;
    },
    async entryFiles(sha) {
      return (await tree(PORTAL_REPO, sha))
        .filter((path) => /^assets\/[^/]+\.json$/.test(path))
        .map((path) => path.slice(ENTRY_DIR.length));
    },
    async entry(sha, file) {
      return JSON.parse(await fetchText(rawUrl(PORTAL_REPO, sha, `${ENTRY_DIR}${file}`)));
    },
  };
}

/**
 * About five GitHub API calls per entry exhaust the unauthenticated 60/hour
 * limit within the first dozen entries, so the live source refuses to start
 * without a token.
 */
export function livePortalSource(): PortalSource {
  if (!gitHubToken()) {
    throw new Error("asset-portal: set GITHUB_TOKEN or GH_TOKEN before syncing the Asset Portal.");
  }
  const portal = livePortalHead();
  return {
    head: () => portal.head(),
    async entries(sha) {
      const entries: { file: string; json: PortalAsset }[] = [];
      for (const file of await portal.entryFiles(sha)) {
        entries.push({ file, json: await portal.entry(sha, file) });
      }
      return entries;
    },
    repo: (ownerRepo) => apiJsonOrNull<PortalRepo>(`repos/${ownerRepo}`),
    latestRelease: (fullName) =>
      apiJsonOrNull<{ tag_name: string }>(`repos/${fullName}/releases/latest`),
    tags: async (fullName) =>
      (await apiJsonOrNull<{ name: string }[]>(`repos/${fullName}/tags?per_page=1`)) ?? [],
    async headSha(fullName, branch) {
      return (await apiJson<{ sha: string }>(`repos/${fullName}/commits/${branch}`)).sha;
    },
    tree,
    fetchText,
  };
}

if (import.meta.main && process.argv.includes("--fetch")) {
  const manifest = await syncAssetPortal(
    join(import.meta.dir, ".."),
    livePortalSource(),
    new Date().toISOString(),
  );
  const byKind = new Map<PortalKind, number>();
  for (const entry of manifest.entries) byKind.set(entry.kind, (byKind.get(entry.kind) ?? 0) + 1);
  const counts = [...byKind].map(([kind, n]) => `${kind} ${n}`).join(", ");
  console.log(
    `classified ${manifest.entries.length} Asset Portal entries at ${manifest.source.commit}: ${counts}`,
  );
}
