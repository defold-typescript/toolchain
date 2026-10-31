import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  includedEvidence,
  LUALS_ANNOTATION,
  type PortalKind,
  portalEntryKind,
} from "./library-evidence";
import { LIBRARY_TYPES_ROOT } from "./package-root";
import {
  apiJson,
  apiJsonOrNull,
  gitHubToken,
  libraryIncludeDirs,
  type PinDating,
  pinDate,
  type RefKind,
  request,
  selectPin,
  withRefDate,
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
export interface PortalSource extends PinDating {
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
  // When a release or tag pin was cut (ISO 8601); a commit pin has none.
  refDate?: string;
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

/** Portal entry id -> the tracked repo URL its library moved to. */
export type PortalAliases = Readonly<Record<string, string>>;

const PACKAGE_ROOT = LIBRARY_TYPES_ROOT;

export function readAssetPortalManifest(packageRoot: string = PACKAGE_ROOT): AssetPortalManifest {
  return JSON.parse(readFileSync(join(packageRoot, "asset-portal.json"), "utf8"));
}

export function readPortalAliases(packageRoot: string = PACKAGE_ROOT): PortalAliases {
  const file = join(packageRoot, "asset-portal-aliases.json");
  return (JSON.parse(readFileSync(file, "utf8")) as { aliases: PortalAliases }).aliases;
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

/**
 * Date every release and tag pin in the committed `asset-portal.json` at its
 * recorded ref, by the rule the Defold pass uses. Pins are read, never chosen,
 * and every date is looked up before the manifest is written, so a failed
 * lookup leaves it untouched.
 */
export async function syncAssetPortalDates(
  packageRoot: string,
  source: PinDating,
): Promise<{ pins: number }> {
  const manifest = readAssetPortalManifest(packageRoot);
  let pins = 0;
  const entries: PortalEntry[] = [];
  for (const entry of manifest.entries) {
    if (entry.repo === null || entry.ref === null || entry.refKind === null) {
      entries.push(entry);
      continue;
    }
    const fullName = entry.repo.replace(/^https:\/\/github\.com\//, "");
    let refDate: string | undefined;
    try {
      refDate = await pinDate(source, fullName, { ref: entry.ref, refKind: entry.refKind });
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      throw new Error(
        `asset-portal: cannot date ${entry.id} at ${fullName}@${entry.ref} (${cause}); re-sync with --fetch`,
      );
    }
    entries.push(withRefDate(entry, refDate));
    if (refDate !== undefined) pins++;
  }
  writeFileSync(
    join(packageRoot, "asset-portal.json"),
    `${JSON.stringify({ ...manifest, entries }, null, 2)}\n`,
  );
  return { pins };
}

/** The `--fetch` path: reclassify the portal, then date the pins it chose. */
export async function fetchAssetPortal(
  packageRoot: string,
  source: PortalSource,
  syncedAt: string,
): Promise<AssetPortalManifest> {
  await syncAssetPortal(packageRoot, source, syncedAt);
  await syncAssetPortalDates(packageRoot, source);
  return readAssetPortalManifest(packageRoot);
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
    releaseByTag: (fullName, tag) =>
      apiJsonOrNull<{ published_at: string | null }>(`repos/${fullName}/releases/tags/${tag}`),
    async commitDate(fullName, ref) {
      const commit = await apiJson<{ commit: { committer: { date: string } } }>(
        `repos/${fullName}/commits/${ref}`,
      );
      return commit.commit.committer.date;
    },
  };
}

if (import.meta.main && process.argv.includes("--fetch")) {
  const manifest = await fetchAssetPortal(
    LIBRARY_TYPES_ROOT,
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

if (import.meta.main && process.argv.includes("--dates")) {
  const { pins } = await syncAssetPortalDates(LIBRARY_TYPES_ROOT, livePortalSource());
  console.log(`dated ${pins} Asset Portal pins`);
}
