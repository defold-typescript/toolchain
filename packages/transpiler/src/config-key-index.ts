// The `<section>.<key>` ids the project's `game.project` declares — the whole
// universe `sys.get_config_string` can resolve, since a key the file never
// writes answers the reader's default instead.
//
// Deliberately a line reader rather than a parse of the scene text format:
// `game.project` is a flat INI the editor writes, the same shape
// `readGameProjectDependencies` (library-dependencies.ts) already walks. A key
// may carry a `#` (`dependencies#0`), which is part of its name here and never a
// fragment.

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

// One declared value, read the same way `buildConfigKeyIndex` reads the whole
// file. The section is matched in full rather than as a prefix, so a
// `main_collection_backup` beside `main_collection` answers neither.
export function readGameProjectSetting(
  gameProjectText: string,
  section: string,
  key: string,
): string | undefined {
  let current: string | undefined;
  for (const line of gameProjectText.split("\n")) {
    const header = sectionNameOf(line);
    if (header !== undefined) {
      current = header;
      continue;
    }
    if (current !== section) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    if (line.slice(0, separator).trim() !== key) continue;
    const value = line.slice(separator + 1).trim();
    if (value !== "") return value;
  }
  return undefined;
}
