import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The fields of library data the site shows, read from each library folder's
// `library.json`, `reviewed.json` and `recipe.json`. The CLI owns the full reader
// and its checks; the site depends on the layout only, so a layout change reds the
// tests that run this on the real data folder.

type RefKind = "release" | "tag" | "commit";

interface Module {
  moduleId: string;
  namespace: string;
}

export interface SiteLibrary {
  repo: string;
  ref: string;
  license: string;
  refKind?: RefKind;
  luals: Module[];
  scriptApi: (Module & { apiDoc: string })[];
  forks: (Module & { apiDoc: string })[];
  native?: { namespace: string };
}

interface LibraryJson {
  repo: string;
  license?: string;
  refKind?: RefKind;
  forks?: (Module & { apiDoc: string })[];
  native?: { namespace: string };
  indexSlots?: Record<string, unknown>;
}

interface RecipeJson {
  luals?: Module[];
  scriptApi?: (Module & { apiDoc: string })[];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function libraryDirs(dataDir: string | undefined): string[] {
  if (dataDir === undefined || !existsSync(dataDir)) return [];
  return readdirSync(dataDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(dataDir, entry.name, "library.json")))
    .map((entry) => entry.name)
    .sort();
}

// Every library folder under the data folder, in folder-name order; an absent
// data folder holds none.
export function readSiteLibraries(dataDir: string | undefined): SiteLibrary[] {
  if (dataDir === undefined) return [];
  return libraryDirs(dataDir).map((dir) => {
    const library = readJson<LibraryJson>(join(dataDir, dir, "library.json"));
    const { ref } = readJson<{ ref: string }>(join(dataDir, dir, "reviewed.json"));
    const recipePath = join(dataDir, dir, "recipe.json");
    const recipe = existsSync(recipePath) ? readJson<RecipeJson>(recipePath) : {};
    return {
      repo: library.repo,
      ref,
      license: library.license ?? "",
      ...(library.refKind === undefined ? {} : { refKind: library.refKind }),
      luals: recipe.luals ?? [],
      scriptApi: recipe.scriptApi ?? [],
      forks: library.forks ?? [],
      ...(library.native === undefined ? {} : { native: library.native }),
    };
  });
}

// Every library's index slots, with those of the extension pages no library
// folder holds, unparsed.
export function readSiteIndexSlots(dataDir: string | undefined): Record<string, unknown> {
  if (dataDir === undefined) return {};
  const extensionFile = join(dataDir, "index-slot-classifications.json");
  const slots: Record<string, unknown> = existsSync(extensionFile)
    ? readJson<Record<string, unknown>>(extensionFile)
    : {};
  for (const dir of libraryDirs(dataDir)) {
    const { indexSlots } = readJson<LibraryJson>(join(dataDir, dir, "library.json"));
    Object.assign(slots, indexSlots);
  }
  return slots;
}
