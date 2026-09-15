import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The Defold-org extension survey: every library the `defold` GitHub org
 * publishes, pinned to a release, tag, or commit, with each `.script_api` doc it
 * ships lowered to ref-doc JSON. The output is read by the docs site only — a
 * native extension is an ambient global `resolve` already types from the
 * archive, so this manifest never feeds `script-api-targets.json` or the
 * library registry.
 */

const ORG = "defold";

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
  license: string;
  description: string;
  docs: DefoldExtensionDoc[];
}

export interface DefoldExtensionsManifest {
  libraries: DefoldExtensionEntry[];
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
}

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

function declaresLibraryIncludeDirs(gameProject: string): boolean {
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
    if (match && (match[1] ?? "").trim() !== "") return true;
  }
  return false;
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

function repoStem(name: string): string {
  return name.replace(/^extension-/, "");
}

/**
 * A declared namespace cannot be the page key on its own: four repos declare
 * `firebase`, `extension-camera` declares the live engine `camera`, and
 * `extension-proto` declares the vendored `proto` library. Each doc keeps its
 * declared namespace unless that shadows an engine page the extension does not
 * replace or a vendored library page, or another repo declares it too. A shadowing doc becomes
 * `<stem>.<namespace>` (`spine.gui`), or the full repo name when the stem is the
 * namespace itself (`extension-camera`); within a shared namespace the repo whose
 * stem matches keeps it and the rest take their stem (`firebase-analytics`).
 * Keys that still collide throw, naming both docs.
 */
export function assignPageKeys(
  entries: { repo: string; docs: { path: string; namespace: string }[] }[],
  reserved: ReservedNamespaces,
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

      const owner = `${name}/${doc.path} (${doc.namespace})`;
      const previous = claimed.get(page);
      if (previous) {
        throw new Error(
          `defold-extensions: page key "${page}" is claimed by both ${previous} and ${owner}.`,
        );
      }
      claimed.set(page, owner);
      return { ...doc, page };
    });
    return { repo: entry.repo, docs };
  });
}

interface SyncApiDocsModule {
  scriptApiToDocsJson: (text: string) => string;
}

// Loaded by resolved path from the sibling types package, mirroring
// `sync-script-api-types.ts`: a repo-only build script, never shipped with the
// types it reads.
async function loadSyncApiDocs(packageRoot: string): Promise<SyncApiDocsModule> {
  return (await import(
    join(packageRoot, "..", "types", "scripts", "sync-api-docs.ts")
  )) as SyncApiDocsModule;
}

export async function loadReservedNamespaces(packageRoot: string): Promise<ReservedNamespaces> {
  const { targets } = JSON.parse(
    readFileSync(join(packageRoot, "..", "types", "api-targets.json"), "utf8"),
  ) as { targets: { modules: { namespace: string }[] }[] };
  const libraryNamespaces = readdirSync(join(packageRoot, "api-doc"))
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .filter((namespace) => existsSync(join(packageRoot, "generated", `${namespace}.d.ts`)));
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

interface ApiDocJson {
  info: { namespace: string };
}

// Lower every top-level table in one fetched `.script_api` to docs JSON,
// skipping chunks that declare no table and naming the URL on any other error.
function convertChunks(
  text: string,
  url: string,
  toDocsJson: SyncApiDocsModule["scriptApiToDocsJson"],
): ApiDocJson[] {
  const docs: ApiDocJson[] = [];
  for (const chunk of splitTopLevelEntries(text)) {
    try {
      docs.push(JSON.parse(toDocsJson(chunk)));
    } catch (error) {
      if (/no top-level `type: table`/.test((error as Error).message)) continue;
      throw new Error(`defold-extensions: ${url}: ${(error as Error).message}`);
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
  const { scriptApiToDocsJson } = await loadSyncApiDocs(join(import.meta.dir, ".."));

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
      for (const doc of convertChunks(text, url, scriptApiToDocsJson)) {
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
  const { scriptApiToDocsJson } = await loadSyncApiDocs(join(import.meta.dir, ".."));
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
        chunks = convertChunks(await fetchText(url), url, scriptApiToDocsJson);
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

function gitHubToken(): string | undefined {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
}

async function request(url: string, accept = "application/vnd.github+json"): Promise<Response> {
  const token = gitHubToken();
  const headers: Record<string, string> = { Accept: accept };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(url, { headers });
}

async function apiJson<T>(path: string): Promise<T> {
  const res = await request(`https://api.github.com/${path}`);
  if (!res.ok) throw new Error(`GitHub API ${path} -> ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

async function apiJsonOrNull<T>(path: string): Promise<T | null> {
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
};

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  if (process.argv.includes("--fetch")) {
    const manifest = await syncDefoldExtensions(
      root,
      liveGitHub,
      await loadReservedNamespaces(root),
    );
    const docs = manifest.libraries.reduce((sum, entry) => sum + entry.docs.length, 0);
    console.log(`surveyed ${manifest.libraries.length} Defold libraries, ${docs} docs`);
  } else if (process.argv.includes("--reconvert")) {
    const written = await reconvertDefoldExtensions(root, liveGitHub.fetchText);
    console.log(`reconverted ${written} Defold library docs at their pinned refs`);
  }
}
