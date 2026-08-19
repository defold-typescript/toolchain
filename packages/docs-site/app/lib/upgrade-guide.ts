/**
 * The upgrade guide is one evergreen page: a version-agnostic runbook followed
 * by one section per release, each opened by a `<!-- release: <version> -->`
 * marker. Both the docs-site tests and the release-readiness gate read a single
 * release's material through here, so a heading that documents an older release
 * can never stand in as evidence for the current one.
 */
export interface ReleaseSection {
  /** The version named by the marker, e.g. `1.13.0`. */
  version: string;
  /** Everything after the marker line up to the next marker, or end of file. */
  body: string;
}

const MARKER_RE = /^[ \t]*<!--[ \t]*release:[ \t]*(\S+?)[ \t]*-->[ \t]*$/gm;

/** Split a guide body into its per-release sections, in document order. */
export function releaseSections(markdown: string): ReleaseSection[] {
  const starts: { version: string; from: number; markerAt: number }[] = [];
  MARKER_RE.lastIndex = 0;
  for (const match of markdown.matchAll(MARKER_RE)) {
    const at = match.index ?? 0;
    starts.push({ version: match[1] ?? "", from: at + match[0].length, markerAt: at });
  }
  return starts.map((start, i) => ({
    version: start.version,
    body: markdown.slice(start.from, starts[i + 1]?.markerAt ?? markdown.length),
  }));
}

/** The body of one release's section, or `null` when the page has no such marker. */
export function releaseSection(markdown: string, version: string): string | null {
  return releaseSections(markdown).find((s) => s.version === version)?.body ?? null;
}
