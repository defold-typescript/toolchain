// Library repos live on more than one forge, and the forges disagree on the page
// that browses a repo at a ref: GitHub serves `/tree/<ref>`, while Codeberg
// (Forgejo) serves `/src/commit/<ref>` for a commit and a tag alike.
export type ForgeName = "GitHub" | "Codeberg";

const FORGE_BY_HOST: Readonly<Record<string, ForgeName>> = {
  "github.com": "GitHub",
  "codeberg.org": "Codeberg",
};

/** The forge a repo URL points at; `undefined` for an empty URL or an unknown host. */
export function forgeOf(repoUrl: string): ForgeName | undefined {
  const host = /^https?:\/\/([^/]+)/i.exec(repoUrl)?.[1]?.toLowerCase();
  return host === undefined ? undefined : FORGE_BY_HOST[host];
}

/** The page that browses `repoUrl` at `ref`. */
export function repoTreeUrl(repoUrl: string, ref: string): string {
  const base = repoUrl.replace(/\/$/, "");
  return forgeOf(base) === "Codeberg" ? `${base}/src/commit/${ref}` : `${base}/tree/${ref}`;
}
