// The reads a library's upstream forge answers, for the CLI's `library update` and
// the repo's upstream checks alike.

/** `https://github.com/owner/repo` -> `owner/repo`. */
export function repoSlug(repo: string): string {
  const parts = repo
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);
  return parts.slice(-2).join("/");
}

/** One file directly inside a repo's `types/` folder; `name` is relative to it. */
export interface TypesFolderFile {
  readonly name: string;
  readonly contents: string;
}

export interface ForgeReads {
  readonly listTags: (repo: string) => Promise<Array<{ name: string; sha: string }>>;
  readonly readCommit: (repo: string, sha: string) => Promise<{ sha: string; date: string }>;
  readonly readRepo: (repo: string) => Promise<{ defaultBranch: string }>;
  readonly compareRefs: (
    repo: string,
    base: string,
    head: string,
  ) => Promise<{ aheadBy: number; files: string[] }>;
  /** The commit `branch` points at. A Codeberg archive may name no commit, so this asks the forge. */
  readonly headCommit: (repo: string, branch: string) => Promise<string>;
  /** `null` when the repo has no `types/` folder at `ref`. */
  readonly listTypesFolder: (repo: string, ref: string) => Promise<TypesFolderFile[] | null>;
}

export type ForgeFetch = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<Response>;

// A repo may publish two unrelated tag series — `Insality/panthera` ships
// `runtime.*` beside a busier, newer `editor.*` — so "the newest tag" is only
// meaningful within the pin's own series. Everything before the first digit is
// that series: `runtime.` for `runtime.8`, `v` for `v3.21.1`, empty for `1.2.5`.
export function tagSeries(name: string): string {
  const firstDigit = name.search(/\d/);
  return firstDigit === -1 ? name : name.slice(0, firstDigit);
}

/** Resolve each tag to its commit date; the listing's own order is not recency. */
export async function datedTags(
  repo: string,
  io: Pick<ForgeReads, "listTags" | "readCommit">,
): Promise<Array<{ name: string; sha: string; date: number }>> {
  const tags = await io.listTags(repo);
  const dates = new Map<string, string>();
  for (const tag of tags) {
    if (dates.has(tag.sha)) continue;
    dates.set(tag.sha, (await io.readCommit(repo, tag.sha)).date);
  }
  return tags.map((tag) => ({
    name: tag.name,
    sha: tag.sha,
    date: Date.parse(dates.get(tag.sha) ?? ""),
  }));
}

async function getJson(
  fetchImpl: ForgeFetch,
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const response = await fetchImpl(url, { headers });
  if (!response.ok) throw new Error(`GET ${url} responded ${response.status}`);
  return response.json();
}

// Reads both forges' `Link` forms: GitHub separates entries with ", ", Codeberg
// with a bare ",".
const NEXT_LINK = /<([^>]+)>\s*;\s*rel="next"/;

// Follows `rel="next"` rather than stopping on a short page: Codeberg caps
// `limit` at 50 whatever is asked and still links the rest.
async function readJsonPages(
  fetchImpl: ForgeFetch,
  url: string,
  headers: Record<string, string>,
): Promise<unknown[]> {
  const origin = new URL(url).origin;
  const items: unknown[] = [];
  let next: string | undefined = url;
  while (next !== undefined) {
    // Each GitHub page carries the token, so it never leaves the first origin.
    if (new URL(next).origin !== origin) {
      throw new Error(`GET ${url} links its next page to another origin: ${next}`);
    }
    const response = await fetchImpl(next, { headers });
    if (!response.ok) throw new Error(`GET ${next} responded ${response.status}`);
    items.push(...((await response.json()) as unknown[]));
    next = response.headers.get("link")?.match(NEXT_LINK)?.[1];
  }
  return items;
}

async function getText(fetchImpl: ForgeFetch, url: string): Promise<string> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`GET ${url} responded ${response.status}`);
  return response.text();
}

interface ContentsEntry {
  readonly name: string;
  readonly type: string;
  readonly download_url: string | null;
}

// GitHub and Forgejo answer a contents read alike: 404 for a missing path, an
// array for a folder, a single object for a file.
async function readTypesFolder(
  fetchImpl: ForgeFetch,
  url: string,
  headers: Record<string, string>,
): Promise<TypesFolderFile[] | null> {
  const response = await fetchImpl(url, { headers });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET ${url} responded ${response.status}`);
  const listing = (await response.json()) as ContentsEntry[] | ContentsEntry;
  if (!Array.isArray(listing)) return null;
  const files: TypesFolderFile[] = [];
  for (const entry of listing) {
    if (entry.type !== "file" || entry.download_url === null) continue;
    files.push({ name: entry.name, contents: await getText(fetchImpl, entry.download_url) });
  }
  return files;
}

const GITHUB_API = "https://api.github.com";

function githubHeaders(): Record<string, string> {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  return {
    accept: "application/vnd.github+json",
    ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
  };
}

function githubReads(fetchImpl: ForgeFetch): ForgeReads {
  const githubJson = (path: string) => getJson(fetchImpl, `${GITHUB_API}${path}`, githubHeaders());
  return {
    listTags: async (repo) => {
      const tags = (await readJsonPages(
        fetchImpl,
        `${GITHUB_API}/repos/${repoSlug(repo)}/tags?per_page=100`,
        githubHeaders(),
      )) as Array<{ name: string; commit: { sha: string } }>;
      return tags.map((tag) => ({ name: tag.name, sha: tag.commit.sha }));
    },
    readCommit: async (repo, sha) => {
      const commit = (await githubJson(`/repos/${repoSlug(repo)}/commits/${sha}`)) as {
        sha: string;
        commit: { committer: { date: string } };
      };
      return { sha: commit.sha, date: commit.commit.committer.date };
    },
    readRepo: async (repo) => {
      const meta = (await githubJson(`/repos/${repoSlug(repo)}`)) as { default_branch: string };
      return { defaultBranch: meta.default_branch };
    },
    compareRefs: async (repo, base, head) => {
      const compare = (await githubJson(`/repos/${repoSlug(repo)}/compare/${base}...${head}`)) as {
        ahead_by: number;
        files?: Array<{ filename: string }>;
      };
      return {
        aheadBy: compare.ahead_by,
        files: (compare.files ?? []).map((file) => file.filename),
      };
    },
    headCommit: async (repo, branch) => {
      const head = (await githubJson(
        `/repos/${repoSlug(repo)}/branches/${encodeURIComponent(branch)}`,
      )) as { commit: { sha: string } };
      return head.commit.sha;
    },
    listTypesFolder: (repo, ref) =>
      readTypesFolder(
        fetchImpl,
        `${GITHUB_API}/repos/${repoSlug(repo)}/contents/types?ref=${encodeURIComponent(ref)}`,
        githubHeaders(),
      ),
  };
}

// Codeberg runs Forgejo. Its routes differ from GitHub's in the commit path, the
// page-size parameter and the compare count, and it never receives the GitHub
// token.
const CODEBERG_API = "https://codeberg.org/api/v1";

const CODEBERG_HEADERS = { accept: "application/json" };

function codebergReads(fetchImpl: ForgeFetch): ForgeReads {
  const codebergJson = (path: string) =>
    getJson(fetchImpl, `${CODEBERG_API}${path}`, CODEBERG_HEADERS);
  return {
    listTags: async (repo) => {
      const tags = (await readJsonPages(
        fetchImpl,
        `${CODEBERG_API}/repos/${repoSlug(repo)}/tags?limit=50`,
        CODEBERG_HEADERS,
      )) as Array<{ name: string; commit: { sha: string } }>;
      return tags.map((tag) => ({ name: tag.name, sha: tag.commit.sha }));
    },
    readCommit: async (repo, sha) => {
      const commit = (await codebergJson(
        `/repos/${repoSlug(repo)}/git/commits/${sha}?stat=false&files=false&verification=false`,
      )) as { sha: string; commit: { committer: { date: string } } };
      return { sha: commit.sha, date: commit.commit.committer.date };
    },
    readRepo: async (repo) => {
      const meta = (await codebergJson(`/repos/${repoSlug(repo)}`)) as { default_branch: string };
      return { defaultBranch: meta.default_branch };
    },
    compareRefs: async (repo, base, head) => {
      const compare = (await codebergJson(
        `/repos/${repoSlug(repo)}/compare/${base}...${head}`,
      )) as {
        total_commits: number;
        files?: Array<{ filename: string }>;
      };
      return {
        aheadBy: compare.total_commits,
        files: (compare.files ?? []).map((file) => file.filename),
      };
    },
    headCommit: async (repo, branch) => {
      const head = (await codebergJson(
        `/repos/${repoSlug(repo)}/branches/${encodeURIComponent(branch)}`,
      )) as { commit: { id: string } };
      return head.commit.id;
    },
    listTypesFolder: (repo, ref) =>
      readTypesFolder(
        fetchImpl,
        `${CODEBERG_API}/repos/${repoSlug(repo)}/contents/types?ref=${encodeURIComponent(ref)}`,
        CODEBERG_HEADERS,
      ),
  };
}

export type ForgeId = "github" | "codeberg";

const FORGE_HOSTS: Readonly<Record<string, ForgeId>> = {
  "github.com": "github",
  "codeberg.org": "codeberg",
};

const FORGE_READS: Readonly<Record<ForgeId, (fetchImpl: ForgeFetch) => ForgeReads>> = {
  github: githubReads,
  codeberg: codebergReads,
};

/**
 * The forge whose API answers for a repo URL. A host with no known API throws,
 * so a pin moved somewhere new reports `unknown` instead of being skipped.
 */
export function forgeFor(repo: string): ForgeId {
  const host = new URL(repo).hostname.toLowerCase();
  const forge = FORGE_HOSTS[host];
  if (forge === undefined) throw new Error(`no forge API is known for ${host}`);
  return forge;
}

export function forgeReadsFor(
  repo: string,
  fetchImpl: ForgeFetch = (url, init) => fetch(url, init),
): ForgeReads {
  return FORGE_READS[forgeFor(repo)](fetchImpl);
}
