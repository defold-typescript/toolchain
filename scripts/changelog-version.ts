// Read the projected next version from the curated changelog body: the topmost
// `## vX.Y.Z` heading is the version the accumulated changes project, and it must
// be strictly greater than the latest release tag. Pure and offline — the caller
// passes the changelog body string and the latest tag; no git, no fs. This is the
// read/guard primitive the verbless `release` slice consumes to decide the tag.

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const VERSION_HEADING = /^## (v\d+\.\d+\.\d+)(?: - .*)?$/;

export function compareSemver(a: string, b: string): number {
  const pa = SEMVER.exec(a);
  const pb = SEMVER.exec(b);
  if (!pa) throw new Error(`not a plain x.y.z version: ${a}`);
  if (!pb) throw new Error(`not a plain x.y.z version: ${b}`);
  return (
    Number(pa[1]) - Number(pb[1]) || Number(pa[2]) - Number(pb[2]) || Number(pa[3]) - Number(pb[3])
  );
}

export function parseTopChangelogVersion(body: string): string | null {
  for (const line of body.split("\n")) {
    const match = VERSION_HEADING.exec(line);
    if (match) {
      return (match[1] as string).slice(1);
    }
  }
  return null;
}

export function projectedReleaseVersion(body: string, latestTag: string): string {
  const top = parseTopChangelogVersion(body);
  if (top === null) {
    throw new Error("no ## vX.Y.Z version heading found in the changelog body");
  }
  const latest = latestTag.startsWith("v") ? latestTag.slice(1) : latestTag;
  if (compareSemver(top, latest) <= 0) {
    throw new Error(
      `changelog top heading v${top} must be strictly greater than the latest tag v${latest}`,
    );
  }
  return top;
}
