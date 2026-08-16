// The `<section>.<key>` ids the project's `game.project` declares — the whole
// universe `sys.get_config_string` can resolve, since a key the file never
// writes answers the reader's default instead.
//
// Deliberately a line reader rather than a parse of the scene text format:
// `game.project` is a flat INI the editor writes, the same shape
// `readExtensionDependencies` already walks. A key may carry a `#`
// (`dependencies#0`), which is part of its name here and never a fragment.

function sectionNameOf(line: string): string | undefined {
  const match = line.trim().match(/^\[(.+)\]$/);
  return match?.[1];
}

export function buildConfigKeyIndex(gameProjectText: string): ReadonlySet<string> {
  const keys = new Set<string>();
  let section: string | undefined;
  for (const line of gameProjectText.split("\n")) {
    const header = sectionNameOf(line);
    if (header !== undefined) {
      section = header;
      continue;
    }
    // A line before the first header belongs to no section, so it names nothing
    // a reader could ask for.
    if (section === undefined) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    if (key === "") continue;
    keys.add(`${section}.${key}`);
  }
  return keys;
}
