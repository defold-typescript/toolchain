// What a `[project] dependencies#N` URL can be held to. Only a commit URL is fixed;
// a branch moves on its own and a tag can be moved, and each of those two has a
// commit URL in the same repo. The commit itself is never taken from here: it comes
// from the archive the ref served, so a rewrite cannot introduce a commit the ref did
// not name.

export { rewriteGameProjectDependency } from "@defold-typescript/transpiler";

export type DependencyUrlKind = "commit" | "tag" | "branch" | "release" | "unknown";

// Keeps the scheme and authority as written, so a `__TOKEN__@` placeholder survives.
// This reads the text alone; `readRepoUrl` holds that text to what a fetch would request.
const GITHUB_REPO_URL = /^([a-z][a-z0-9+.-]*:\/\/(?:[^/@]+@)?github\.com\/([^/]+\/[^/]+))\/(.+)$/i;
const ARCHIVE_NAME = /^archive\/([^?#]+)\.zip$/;
const RELEASE_ASSET = /^releases\/(?:latest\/)?download\//;
const COMMIT_NAME = /^[0-9a-f]{40}$/i;
// A bare `archive/<name>.zip` does not say which it is, so this reads the name.
// Either answer rewrites the same way.
const VERSION_NAME = /^v?\d/;

function kindOfArchiveName(name: string): DependencyUrlKind {
  if (name.startsWith("refs/tags/")) {
    return "tag";
  }
  if (name.startsWith("refs/heads/")) {
    return "branch";
  }
  if (COMMIT_NAME.test(name)) {
    return "commit";
  }
  return VERSION_NAME.test(name) ? "tag" : "branch";
}

// Only these escapes, and not `decodeURIComponent`, which throws on the stray `%` a ref
// may hold. A URL parser drops a tab, so `.<tab>.` reads as `..` too.
function withoutEscapes(text: string): string {
  let current = text;
  let previous: string;
  do {
    previous = current;
    current = previous
      .replace(/%25/g, "%")
      .replace(/%2e/gi, ".")
      .replace(/%2f/gi, "/")
      .replace(/%5c/gi, "\\")
      .replaceAll("\t", "");
  } while (current !== previous);
  return current;
}

// The repo and the rest of `url`, or undefined when a fetch of it could land anywhere
// but where its text says: on another host, in another repo, or through a dot segment.
function readRepoUrl(url: string): { repo: string; rest: string } | undefined {
  const [, repo, path, rest] = GITHUB_REPO_URL.exec(url) ?? [];
  if (repo === undefined || path === undefined || rest === undefined || !URL.canParse(url)) {
    return undefined;
  }
  const { hostname, pathname } = new URL(url);
  if (hostname.toLowerCase() !== "github.com" || !pathname.startsWith(`/${path}/`)) {
    return undefined;
  }
  const segments = withoutEscapes(`${path}/${rest}`).split(/[/\\]/);
  return segments.includes(".") || segments.includes("..") ? undefined : { repo, rest };
}

export function classifyDependencyUrl(url: string): DependencyUrlKind {
  const rest = readRepoUrl(url)?.rest;
  if (rest === undefined) {
    return "unknown";
  }
  if (RELEASE_ASSET.test(rest)) {
    return "release";
  }
  const name = ARCHIVE_NAME.exec(rest)?.[1];
  return name === undefined ? "unknown" : kindOfArchiveName(name);
}

function repoOf(url: string): string | undefined {
  return readRepoUrl(url)?.repo;
}

export function commitUrlFor(url: string, commit: string): string | null {
  const kind = classifyDependencyUrl(url);
  if (kind === "release" || kind === "unknown") {
    return null;
  }
  return `${repoOf(url)}/archive/${commit}.zip`;
}

// Whether a lockfile may name `follows` as the ref behind `url`. `--update` rewrites
// `game.project` from this value, so a ref in another repo would let a lockfile edit
// point the project at that repo's code. Both kinds are known here, so both URLs fetch
// from the repo their text names, and comparing that text also holds the scheme and
// credentials to the pinned URL's.
export function canFollow(url: string, follows: string): boolean {
  const kind = classifyDependencyUrl(follows);
  return (
    classifyDependencyUrl(url) === "commit" &&
    (kind === "branch" || kind === "tag") &&
    repoOf(url) === repoOf(follows)
  );
}
