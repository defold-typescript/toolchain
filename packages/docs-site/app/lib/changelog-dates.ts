// Renders `/changelog` per-patch section dates from the git tag map so the tag is
// the single source of truth: a `## vX.Y.Z` heading with a matching tag gets its
// date, an untagged one renders as `- Unreleased`. Rolled-up minors (`## v0.20.x`)
// and the literal `## Unreleased` staging heading are not versions and pass through.

const VERSION_HEADING = /^## (v\d+\.\d+\.\d+)(?: - .*)?$/;

export function applyChangelogTagDates(body: string, tagDates: Record<string, string>): string {
  return body
    .split("\n")
    .map((line) => {
      const match = line.match(VERSION_HEADING);
      if (!match) {
        return line;
      }
      const version = match[1] as string;
      const date = version in tagDates ? tagDates[version] : "Unreleased";
      return `## ${version} - ${date}`;
    })
    .join("\n");
}
