import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LIBRARY_DATA_DIR, LIBRARY_TYPES_ROOT } from "./package-root";

/**
 * The Defold-org extension survey: every library the `defold` GitHub org
 * publishes, pinned to a release, tag, or commit, with each `.script_api` doc it
 * ships lowered to ref-doc JSON. The output is read by the docs site only — a
 * native extension is an ambient global `resolve` already types from the
 * archive, so this manifest never feeds `script-api-targets.json` or the
 * library registry.
 */

const ORG = "defold";
const ENGINE_REPO = "defold";

export interface GitHubRepo {
  name: string;
  archived: boolean;
  fork: boolean;
  description: string | null;
  license: { spdx_id: string | null } | null;
  default_branch: string;
}

export type RefKind = "release" | "tag" | "commit";

export interface Pin {
  ref: string;
  refKind: RefKind;
}

export interface DefoldExtensionDoc {
  path: string;
  namespace: string;
  page: string;
}

export interface DefoldExtensionEntry {
  repo: string;
  ref: string;
  refKind: RefKind;
  // When a release or tag pin was cut (ISO 8601); a commit pin has none.
  refDate?: string;
  license: string;
  description: string;
  docs: DefoldExtensionDoc[];
}

export interface DefoldExtensionsManifest {
  libraries: DefoldExtensionEntry[];
}

export interface DefoldEngineRelease {
  version: string;
  date: string;
}

/** The GitHub REST + raw-content surface the sync reads; a seam for offline tests. */
export interface DefoldGitHub {
  listRepos(): Promise<GitHubRepo[]>;
  gameProject(name: string, branch: string): Promise<string | null>;
  latestRelease(name: string): Promise<{ tag_name: string } | null>;
  tags(name: string): Promise<{ name: string }[]>;
  headSha(name: string, branch: string): Promise<string>;
  tree(name: string, ref: string): Promise<string[]>;
  fetchText(url: string): Promise<string>;
  releaseByTag(name: string, tag: string): Promise<{ published_at: string | null } | null>;
  commitDate(name: string, ref: string): Promise<string>;
  engineTags(): Promise<string[]>;
}

/** The two lookups that date a pin; both the Defold and the Asset Portal syncs implement it. */
export type PinDating = Pick<DefoldGitHub, "releaseByTag" | "commitDate">;

export interface ReservedNamespaces {
  // Every engine namespace any tracked Defold version documents.
  engineNamespaces: ReadonlySet<string>;
  // Namespaces a vendored library page already routes at `/api/<namespace>`.
  libraryNamespaces: ReadonlySet<string>;
}

/**
 * The latest release wins, then the first tag GitHub lists (its tags endpoint
 * orders newest first), then the default-branch HEAD. Which version a project
 * depends on stays the user's choice; the pin only fixes what the docs show.
 */
export function selectPin(input: {
  latestRelease: { tag_name: string } | null;
  tags: { name: string }[];
  headSha: string;
}): Pin {
  if (input.latestRelease) return { ref: input.latestRelease.tag_name, refKind: "release" };
  const newest = input.tags[0];
  if (newest) return { ref: newest.name, refKind: "tag" };
  return { ref: input.headSha, refKind: "commit" };
}

const NON_LIBRARY_PREFIXES = [
  "sample-",
  "template-",
  "tutorial-",
  "example-",
  "game-",
  "test-",
  "demo-",
];

/**
 * The directories a `game.project` shares with projects that depend on it: the
 * `[library] include_dirs` value split on commas and whitespace, with leading
 * and trailing slashes stripped. Both the Defold-org survey and the Asset Portal
 * sync read "exports a library" through this one definition.
 */
export function libraryIncludeDirs(gameProject: string): string[] {
  let section = "";
  for (const raw of gameProject.split(/\r?\n/)) {
    const line = raw.trim();
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header?.[1]) {
      section = header[1].trim();
      continue;
    }
    if (section !== "library") continue;
    const match = /^include_dirs\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const dirs = (match[1] ?? "")
      .split(/[\s,]+/)
      .map((dir) => dir.replace(/^\/+|\/+$/g, ""))
      .filter((dir) => dir !== "");
    if (dirs.length > 0) return dirs;
  }
  return [];
}

function declaresLibraryIncludeDirs(gameProject: string): boolean {
  return libraryIncludeDirs(gameProject).length > 0;
}

/**
 * A repo is a Defold library when it is live, not a fork, not a sample-style
 * project, and either an `extension-*` repo or a project whose root
 * `game.project` exports `include_dirs` under `[library]`. `loadGameProject` is
 * only called for the non-extension case.
 */
export async function isDefoldLibrary(
  repo: GitHubRepo,
  loadGameProject: () => Promise<string | null>,
): Promise<boolean> {
  if (repo.archived || repo.fork) return false;
  if (NON_LIBRARY_PREFIXES.some((prefix) => repo.name.startsWith(prefix))) return false;
  if (repo.name.startsWith("extension-")) return true;
  const gameProject = await loadGameProject();
  return gameProject !== null && declaresLibraryIncludeDirs(gameProject);
}

function repoName(repoUrl: string): string {
  return repoUrl.replace(/\/$/, "").split("/").at(-1) ?? repoUrl;
}

// A `defold-` prefix goes too: `/api/defold-<version>` is the version route
// family, so no page key may start with it.
function repoStem(name: string): string {
  return name.replace(/^(extension|defold)-/, "");
}

// `owner/repo`, so two owners' same-named repos stay apart in an error.
function repoPath(repoUrl: string): string {
  return repoUrl.replace(/^https?:\/\/[^/]+\//, "").replace(/\/$/, "");
}

const WINDOWS_DEVICE_STEM = /^(?:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)/i;

/**
 * One `/api/<page>` route segment that is also one portable file name: ASCII
 * letters, digits, `_`, `.` and `-`, starting and ending with a letter, digit or
 * `_`. An allowlist, so `/`, `\`, `..`, `%`, `?`, `#`, whitespace, control
 * characters, non-ASCII and a trailing `.` (which Windows drops) all fail.
 * Windows opens a device for any name whose part before the first `.` is one,
 * in any letter case, so `CON` and `nul.gui` fail too.
 */
export function isSafePageKey(page: string): boolean {
  return (
    /^[A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_])?$/.test(page) && !WINDOWS_DEVICE_STEM.test(page)
  );
}

/**
 * A declared namespace cannot be the page key on its own: four repos declare
 * `firebase`, `extension-camera` declares the live engine `camera`, and
 * `extension-proto` declares the vendored `proto` library. Each doc keeps its
 * declared namespace unless that shadows an engine page the extension does not
 * replace or a vendored library page, or another repo declares it too. A shadowing doc becomes
 * `<stem>.<namespace>` (`spine.gui`), or the full repo name when the stem is the
 * namespace itself (`extension-camera`); within a shared namespace the repo whose
 * stem matches keeps it and the rest take their stem (`firebase-analytics`). The
 * stem drops a leading `extension-` or `defold-`. Keys that still collide, or
 * that would start with `defold-`, throw, naming the docs and the `label` of
 * the manifest being keyed. A key that fails `isSafePageKey` throws too, before
 * any caller deletes or writes a file under it.
 */
export function assignPageKeys(
  entries: { repo: string; docs: { path: string; namespace: string }[] }[],
  reserved: ReservedNamespaces,
  label = "defold-extensions",
): { repo: string; docs: DefoldExtensionDoc[] }[] {
  const declaringRepos = new Map<string, Set<string>>();
  for (const entry of entries) {
    for (const doc of entry.docs) {
      const repos = declaringRepos.get(doc.namespace) ?? new Set<string>();
      repos.add(entry.repo);
      declaringRepos.set(doc.namespace, repos);
    }
  }

  const claimed = new Map<string, string>();
  return entries.map((entry) => {
    const name = repoName(entry.repo);
    const stem = repoStem(name);
    const docs = entry.docs.map((doc) => {
      const shadowsPage =
        reserved.engineNamespaces.has(doc.namespace) ||
        reserved.libraryNamespaces.has(doc.namespace);
      const shared = (declaringRepos.get(doc.namespace)?.size ?? 0) > 1;
      let page = doc.namespace;
      if (shadowsPage) page = stem === doc.namespace ? name : `${stem}.${doc.namespace}`;
      else if (shared && stem !== doc.namespace) page = stem;

      if (!isSafePageKey(page)) {
        throw new Error(
          `${label}: page key ${JSON.stringify(page)} from ${repoPath(entry.repo)}/${doc.path} is not one safe /api/<page> route and file-name segment.`,
        );
      }
      const owner = `${repoPath(entry.repo)}/${doc.path} (${doc.namespace})`;
      if (page.startsWith("defold-")) {
        throw new Error(
          `${label}: page key "${page}" from ${owner} would sit among the /api/defold-<version> routes.`,
        );
      }
      const previous = claimed.get(page);
      if (previous) {
        throw new Error(
          `${label}: page key "${page}" is claimed by both ${previous} and ${owner}.`,
        );
      }
      claimed.set(page, owner);
      return { ...doc, page };
    });
    return { repo: entry.repo, docs };
  });
}

export interface SyncApiDocsModule {
  scriptApiToFixtureJson: (text: string) => string;
}

// Loaded by resolved path from the sibling types package, mirroring
// `sync-script-api-types.ts`: a repo-only build script, never shipped with the
// types it reads.
async function loadSyncApiDocs(packageRoot: string): Promise<SyncApiDocsModule> {
  return (await import(
    join(packageRoot, "..", "types", "scripts", "sync-api-docs.ts")
  )) as SyncApiDocsModule;
}

// The api-doc paths a library target names: a LuaLS target publishes
// `api-doc/<namespace>.json`, and every other lane names its file in `apiDoc`.
// The served lanes' registries sit in the library data folder, the markdown and
// openapi registries at the package root.
function targetApiDocs(dataDir: string, packageRoot: string): Set<string> {
  const targets = (dir: string, file: string): { namespace: string; apiDoc?: string }[] => {
    const path = join(dir, file);
    if (!existsSync(path)) return [];
    return (
      JSON.parse(readFileSync(path, "utf8")) as {
        targets: { namespace: string; apiDoc?: string }[];
      }
    ).targets;
  };
  const apiDocs = new Set(
    targets(dataDir, "luals-targets.json").map(({ namespace }) => `api-doc/${namespace}.json`),
  );
  for (const [dir, file] of [
    [dataDir, "script-api-targets.json"],
    [dataDir, "authored-targets.json"],
    [packageRoot, "openapi-targets.json"],
    [packageRoot, "markdown-targets.json"],
  ] as const) {
    for (const { apiDoc } of targets(dir, file)) if (apiDoc !== undefined) apiDocs.add(apiDoc);
  }
  return apiDocs;
}

export async function loadReservedNamespaces(
  dataDir: string,
  packageRoot: string,
): Promise<ReservedNamespaces> {
  const { targets } = JSON.parse(
    readFileSync(join(packageRoot, "..", "types", "api-targets.json"), "utf8"),
  ) as { targets: { modules: { namespace: string }[] }[] };
  const named = targetApiDocs(dataDir, packageRoot);
  const libraryNamespaces = readdirSync(join(packageRoot, "api-doc"))
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .filter((namespace) => named.has(`api-doc/${namespace}.json`));
  return {
    engineNamespaces: new Set(targets.flatMap((t) => t.modules.map((m) => m.namespace))),
    libraryNamespaces: new Set(libraryNamespaces),
  };
}

function docKey(repoUrl: string, path: string, namespace: string): string {
  return `${repoUrl}#${path}#${namespace}`;
}

/**
 * One `.script_api` may declare several top-level tables (`extension-rive`
 * ships `rive` and `rive.cmd` in one file), which the shared ref-doc parser
 * rejects. Each column-0 list item is split into its own one-entry document so
 * every table becomes its own page, as `b2d` and `b2d.body` are.
 */
export function splitTopLevelEntries(text: string): string[] {
  const chunks: string[][] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("- ") || chunks.length === 0) chunks.push([]);
    chunks.at(-1)?.push(line);
  }
  return chunks.map((lines) => lines.join("\n")).filter((chunk) => /^- /m.test(chunk));
}

function rawUrl(name: string, ref: string, path: string): string {
  return `https://raw.githubusercontent.com/${ORG}/${name}/${ref}/${path}`;
}

export interface ApiDocJson {
  info: { namespace: string };
}

// Lower every top-level table in one fetched `.script_api` to ref-doc JSON,
// skipping chunks that declare no table and naming the `label` and URL on any
// other error.
export function convertChunks(
  text: string,
  url: string,
  toFixtureJson: SyncApiDocsModule["scriptApiToFixtureJson"],
  label = "defold-extensions",
): ApiDocJson[] {
  const docs: ApiDocJson[] = [];
  for (const chunk of splitTopLevelEntries(text)) {
    try {
      docs.push(JSON.parse(toFixtureJson(chunk)));
    } catch (error) {
      if (/no top-level `type: table`/.test((error as Error).message)) continue;
      throw new Error(`${label}: ${url}: ${(error as Error).message}`);
    }
  }
  return docs;
}

function writeApiDoc(packageRoot: string, page: string, doc: unknown): void {
  writeFileSync(
    join(packageRoot, "defold-extensions", "api-doc", `${page}.json`),
    `${JSON.stringify(doc, null, 2)}\n`,
  );
}

/**
 * Survey the org through `github`, then write `defold-extensions.json` (sorted by
 * repo) and `defold-extensions/api-doc/<page>.json` under `packageRoot`. A
 * library with no `.script_api` stays listed with `docs: []`.
 */
export async function syncDefoldExtensions(
  packageRoot: string,
  github: DefoldGitHub,
  reserved: ReservedNamespaces,
): Promise<DefoldExtensionsManifest> {
  const { scriptApiToFixtureJson } = await loadSyncApiDocs(LIBRARY_TYPES_ROOT);

  const surveyed: (Omit<DefoldExtensionEntry, "docs"> & {
    docs: { path: string; namespace: string }[];
  })[] = [];
  const docJson = new Map<string, unknown>();

  for (const repo of await github.listRepos()) {
    const library = await isDefoldLibrary(repo, () =>
      github.gameProject(repo.name, repo.default_branch),
    );
    if (!library) continue;

    const [latestRelease, tags] = await Promise.all([
      github.latestRelease(repo.name),
      github.tags(repo.name),
    ]);
    const headSha =
      latestRelease || tags.length > 0 ? "" : await github.headSha(repo.name, repo.default_branch);
    const pin = selectPin({ latestRelease, tags, headSha });
    const repoUrl = `https://github.com/${ORG}/${repo.name}`;

    const docs: { path: string; namespace: string }[] = [];
    const paths = (await github.tree(repo.name, pin.ref)).filter((p) => p.endsWith(".script_api"));
    for (const path of paths.sort()) {
      const url = rawUrl(repo.name, pin.ref, path);
      const text = await github.fetchText(url);
      for (const doc of convertChunks(text, url, scriptApiToFixtureJson)) {
        docs.push({ path, namespace: doc.info.namespace });
        docJson.set(docKey(repoUrl, path, doc.info.namespace), doc);
      }
    }

    surveyed.push({
      repo: repoUrl,
      ...pin,
      license: repo.license?.spdx_id ?? "",
      description: repo.description ?? "",
      docs,
    });
  }

  surveyed.sort((a, b) => a.repo.localeCompare(b.repo));
  const keyed = assignPageKeys(surveyed, reserved);
  const libraries = surveyed.map((entry, index) => ({
    ...entry,
    docs: keyed[index]?.docs ?? [],
  }));

  const apiDocDir = join(packageRoot, "defold-extensions", "api-doc");
  rmSync(apiDocDir, { recursive: true, force: true });
  mkdirSync(apiDocDir, { recursive: true });
  for (const entry of libraries) {
    for (const doc of entry.docs) {
      writeApiDoc(packageRoot, doc.page, docJson.get(docKey(entry.repo, doc.path, doc.namespace)));
    }
  }

  const manifest: DefoldExtensionsManifest = { libraries };
  writeFileSync(
    join(packageRoot, "defold-extensions.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

/**
 * Regenerate `defold-extensions/api-doc/<page>.json` from the committed manifest
 * without resurveying: each doc is fetched at its recorded pin, so converter
 * changes reach the pages while every pin and the manifest stay as they are.
 */
export async function reconvertDefoldExtensions(
  packageRoot: string,
  fetchText: (url: string) => Promise<string>,
): Promise<number> {
  const { scriptApiToFixtureJson } = await loadSyncApiDocs(LIBRARY_TYPES_ROOT);
  const { libraries } = JSON.parse(
    readFileSync(join(packageRoot, "defold-extensions.json"), "utf8"),
  ) as DefoldExtensionsManifest;

  let written = 0;
  for (const entry of libraries) {
    const name = repoName(entry.repo);
    const converted = new Map<string, ApiDocJson[]>();
    for (const doc of entry.docs) {
      let chunks = converted.get(doc.path);
      if (!chunks) {
        const url = rawUrl(name, entry.ref, doc.path);
        chunks = convertChunks(await fetchText(url), url, scriptApiToFixtureJson);
        converted.set(doc.path, chunks);
      }
      const json = chunks.find((chunk) => chunk.info.namespace === doc.namespace);
      if (!json) {
        throw new Error(
          `defold-extensions: ${name}@${entry.ref} ${doc.path} no longer declares namespace "${doc.namespace}".`,
        );
      }
      writeApiDoc(packageRoot, doc.page, json);
      written++;
    }
  }
  return written;
}

/**
 * The earliest of the given ISO 8601 dates, as written. A GitHub release's
 * `published_at` runs late when it was backfilled (`1.2.163`-`1.2.167` were
 * published in April 2020) and a tagged commit's date runs late when the tag
 * was moved after publishing (`1.14.0`), so the earlier one is the cut date.
 */
export function earliestDate(...dates: (string | null | undefined)[]): string | undefined {
  let earliest: string | undefined;
  for (const date of dates) {
    if (!date) continue;
    if (earliest === undefined || Date.parse(date) < Date.parse(earliest)) earliest = date;
  }
  return earliest;
}

async function cutDate(github: PinDating, name: string, tag: string): Promise<string> {
  const [release, committed] = await Promise.all([
    github.releaseByTag(name, tag),
    github.commitDate(name, tag),
  ]);
  return earliestDate(release?.published_at, committed) ?? committed;
}

/**
 * When `pin` was cut: a release pin by the earlier of its publish and commit
 * dates, a tag pin by its tagged commit's date alone, a commit pin not at all.
 */
export async function pinDate(
  github: PinDating,
  name: string,
  pin: Pin,
): Promise<string | undefined> {
  if (pin.refKind === "commit") return undefined;
  if (pin.refKind === "release") return cutDate(github, name, pin.ref);
  return github.commitDate(name, pin.ref);
}

/** `entry` with `refDate` replaced, placed directly after `refKind`, or dropped when undefined. */
export function withRefDate<T extends { refKind: unknown; refDate?: string }>(
  entry: T,
  refDate: string | undefined,
): T {
  const dated: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (key === "refDate") continue;
    dated[key] = value;
    if (key === "refKind" && refDate !== undefined) dated.refDate = refDate;
  }
  return dated as T;
}

function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Date every release and tag pin in the committed `defold-extensions.json` at
 * its recorded ref -- a release pin by the earlier of its publish and commit
 * dates, a tag pin by its tagged commit's date alone -- and write
 * `defold-engine-releases.json` with every `X.Y.Z` tag of the engine repo,
 * newest first. Pins are read, never chosen, and no
 * api-doc is touched; the docs site compares the two to name the Defold
 * version that was current when a pin was cut.
 */
export async function syncDefoldReleaseDates(
  packageRoot: string,
  github: DefoldGitHub,
): Promise<{ pins: number; releases: DefoldEngineRelease[] }> {
  const manifestPath = join(packageRoot, "defold-extensions.json");
  const { libraries } = JSON.parse(readFileSync(manifestPath, "utf8")) as DefoldExtensionsManifest;

  let pins = 0;
  const dated: DefoldExtensionEntry[] = [];
  for (const entry of libraries) {
    const refDate = await pinDate(github, repoName(entry.repo), entry);
    dated.push(withRefDate(entry, refDate));
    if (refDate !== undefined) pins++;
  }
  const manifest: DefoldExtensionsManifest = { libraries: dated };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const versions = (await github.engineTags()).filter((tag) => /^\d+\.\d+\.\d+$/.test(tag));
  const releases: DefoldEngineRelease[] = [];
  for (const version of versions) {
    releases.push({ version, date: await cutDate(github, ENGINE_REPO, version) });
  }
  releases.sort(
    (a, b) => Date.parse(b.date) - Date.parse(a.date) || compareVersions(b.version, a.version),
  );
  writeFileSync(
    join(packageRoot, "defold-engine-releases.json"),
    `${JSON.stringify({ releases }, null, 2)}\n`,
  );
  return { pins, releases };
}

/** The `--fetch` path: resurvey the org, then date the pins it chose. */
export async function fetchDefoldExtensions(
  packageRoot: string,
  github: DefoldGitHub,
  reserved: ReservedNamespaces,
): Promise<DefoldExtensionsManifest> {
  await syncDefoldExtensions(packageRoot, github, reserved);
  await syncDefoldReleaseDates(packageRoot, github);
  return JSON.parse(
    readFileSync(join(packageRoot, "defold-extensions.json"), "utf8"),
  ) as DefoldExtensionsManifest;
}

export function gitHubToken(): string | undefined {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
}

export async function request(
  url: string,
  accept = "application/vnd.github+json",
): Promise<Response> {
  const token = gitHubToken();
  const headers: Record<string, string> = { Accept: accept };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(url, { headers });
}

export async function apiJson<T>(path: string): Promise<T> {
  const res = await request(`https://api.github.com/${path}`);
  if (!res.ok) throw new Error(`GitHub API ${path} -> ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function apiJsonOrNull<T>(path: string): Promise<T | null> {
  const res = await request(`https://api.github.com/${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API ${path} -> ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

const liveGitHub: DefoldGitHub = {
  async listRepos() {
    const repos: GitHubRepo[] = [];
    for (let page = 1; ; page++) {
      const batch = await apiJson<GitHubRepo[]>(`orgs/${ORG}/repos?per_page=100&page=${page}`);
      repos.push(...batch);
      if (batch.length < 100) return repos;
    }
  },
  async gameProject(name, branch) {
    const res = await request(rawUrl(name, branch, "game.project"), "text/plain");
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`game.project ${name} -> ${res.status} ${res.statusText}`);
    return res.text();
  },
  latestRelease: (name) =>
    apiJsonOrNull<{ tag_name: string }>(`repos/${ORG}/${name}/releases/latest`),
  tags: async (name) =>
    (await apiJsonOrNull<{ name: string }[]>(`repos/${ORG}/${name}/tags?per_page=1`)) ?? [],
  async headSha(name, branch) {
    return (await apiJson<{ sha: string }>(`repos/${ORG}/${name}/commits/${branch}`)).sha;
  },
  async tree(name, ref) {
    const tree = await apiJson<{ tree: { path: string; type: string }[]; truncated: boolean }>(
      `repos/${ORG}/${name}/git/trees/${ref}?recursive=1`,
    );
    if (tree.truncated) throw new Error(`git tree for ${name}@${ref} is truncated`);
    return tree.tree.filter((node) => node.type === "blob").map((node) => node.path);
  },
  async fetchText(url) {
    const res = await request(url, "text/plain");
    if (!res.ok) throw new Error(`fetch failed: ${url} -> ${res.status} ${res.statusText}`);
    return res.text();
  },
  releaseByTag: (name, tag) =>
    apiJsonOrNull<{ published_at: string | null }>(`repos/${ORG}/${name}/releases/tags/${tag}`),
  async commitDate(name, ref) {
    const commit = await apiJson<{ commit: { committer: { date: string } } }>(
      `repos/${ORG}/${name}/commits/${ref}`,
    );
    return commit.commit.committer.date;
  },
  async engineTags() {
    const names: string[] = [];
    for (let page = 1; ; page++) {
      const batch = await apiJson<{ name: string }[]>(
        `repos/${ORG}/${ENGINE_REPO}/tags?per_page=100&page=${page}`,
      );
      names.push(...batch.map((tag) => tag.name));
      if (batch.length < 100) return names;
    }
  },
};

function requireGitHubToken(flag: string): void {
  if (gitHubToken()) return;
  console.error(
    `${flag} dates every pin and Defold engine tag (several hundred GitHub API calls): set GITHUB_TOKEN or GH_TOKEN, e.g. GITHUB_TOKEN="$(gh auth token)".`,
  );
  process.exit(1);
}

if (import.meta.main) {
  const root = LIBRARY_TYPES_ROOT;
  if (process.argv.includes("--fetch")) {
    requireGitHubToken("--fetch");
    const manifest = await fetchDefoldExtensions(
      root,
      liveGitHub,
      await loadReservedNamespaces(LIBRARY_DATA_DIR, root),
    );
    const docs = manifest.libraries.reduce((sum, entry) => sum + entry.docs.length, 0);
    console.log(`surveyed ${manifest.libraries.length} Defold libraries, ${docs} docs`);
  } else if (process.argv.includes("--dates")) {
    requireGitHubToken("--dates");
    const { pins, releases } = await syncDefoldReleaseDates(root, liveGitHub);
    console.log(`dated ${pins} Defold library pins and ${releases.length} Defold engine versions`);
  } else if (process.argv.includes("--reconvert")) {
    const written = await reconvertDefoldExtensions(root, liveGitHub.fetchText);
    console.log(`reconverted ${written} Defold library docs at their pinned refs`);
  }
}
