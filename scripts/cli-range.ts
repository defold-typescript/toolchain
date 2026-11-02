import { readdirSync } from "node:fs";
import { LIBRARY_DATA_DIR } from "./library-check-data.ts";

// Prints the published CLI releases that read this repo's library data folders,
// for the nightly check to run each one over them.

type Triple = readonly [number, number, number];
type Scope = "ends" | "all";

const RELEASE = /^(\d+)\.(\d+)\.(\d+)$/;
const REGISTRY_URL = "https://registry.npmjs.org/@defold-typescript%2fcli";
const USAGE = "usage: cli-range.ts --ends | --all";

function parseRelease(version: string): Triple | null {
  const match = RELEASE.exec(version);
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareTriples(a: Triple, b: Triple): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function ascending(names: string[]): { name: string; triple: Triple }[] {
  return names
    .flatMap((name) => {
      const triple = parseRelease(name);
      return triple === null ? [] : [{ name, triple }];
    })
    .sort((a, b) => compareTriples(a.triple, b.triple));
}

// A release reads the highest folder at or below its version. A folder no release
// reads yet has no entry, so a new folder can land before its CLI ships.
export function readersOf(folders: string[], versions: string[]): Map<string, string[]> {
  const sortedFolders = ascending(folders);
  const readers = new Map<string, string[]>();
  for (const { name: folder } of sortedFolders) readers.set(folder, []);
  for (const { name: version, triple } of ascending(versions)) {
    let read: string | undefined;
    for (const folder of sortedFolders) {
      if (compareTriples(folder.triple, triple) <= 0) read = folder.name;
    }
    if (read !== undefined) readers.get(read)?.push(version);
  }
  for (const [folder, versionsOfFolder] of readers) {
    if (versionsOfFolder.length === 0) readers.delete(folder);
  }
  return readers;
}

export function checkedVersions(readers: Map<string, string[]>, scope: Scope): string[] {
  const picked = [...readers.values()].flatMap((versions) =>
    scope === "all"
      ? versions
      : versions.filter((_, index) => index === 0 || index === versions.length - 1),
  );
  if (picked.length === 0) throw new Error("no published CLI reads any data folder");
  return [...new Set(picked)];
}

export function parseScope(args: string[]): Scope {
  if (args.length === 1 && args[0] === "--ends") return "ends";
  if (args.length === 1 && args[0] === "--all") return "all";
  throw new Error(USAGE);
}

async function publishedVersions(): Promise<string[]> {
  const response = await fetch(REGISTRY_URL);
  if (!response.ok) throw new Error(`${REGISTRY_URL} answered ${response.status}`);
  const body = (await response.json()) as { versions: Record<string, unknown> };
  return Object.keys(body.versions);
}

if (import.meta.main) {
  const scope = parseScope(process.argv.slice(2));
  const folders = readdirSync(LIBRARY_DATA_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const readers = readersOf(folders, await publishedVersions());
  for (const version of checkedVersions(readers, scope)) console.log(version);
}
