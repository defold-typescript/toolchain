import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ForkEntry,
  type IndexSlotEntry,
  type LibraryJson,
  type LualsEntry,
  libraryFolderName,
  type NativeEntry,
  type RecipeJson,
  type ScriptApiEntry,
  writeLibraryJson,
  writeRecipeJson,
  writeReviewedJson,
} from "./library/library-data";
import type { RefKind } from "./library/sync-defold-extensions";

interface Pin {
  repo: string;
  ref?: string;
  license?: string;
  refKind?: RefKind;
}

// A lane target as one flat record: its library's pin beside its lane entry.
export type Flat<Entry> = Pin & Partial<Entry>;

export interface FlatLibraryTargets {
  luals?: Flat<LualsEntry>[];
  scriptApi?: Flat<ScriptApiEntry>[];
  forks?: Flat<ForkEntry>[];
  native?: Flat<NativeEntry>[];
  indexSlots?: Record<string, IndexSlotEntry>;
  // Each library's floors, by the folder its repo names.
  floors?: Record<string, LibraryJson["floors"]>;
}

// Writes each target into the folder its repo names: the repo, license and
// refKind into `library.json`, the ref into `reviewed.json` (none without one),
// the rest into its lane's entry, with paths as given (relative to the library
// folder). Every index slot goes to the first library written. Returns the folder
// of each repo.
export function writeLibraryTargets(dataDir: string, targets: FlatLibraryTargets): string[] {
  const libraries = new Map<
    string,
    { library: LibraryJson; ref: string | undefined; recipe: RecipeJson }
  >();
  const libraryOf = ({ repo, ref, license, refKind }: Pin) => {
    const folder = libraryFolderName(repo);
    let entry = libraries.get(folder);
    if (entry === undefined) {
      entry = {
        library: {
          repo,
          ...(license === undefined ? {} : { license }),
          ...(refKind === undefined ? {} : { refKind }),
        },
        ref,
        recipe: {},
      };
      libraries.set(folder, entry);
    }
    return entry;
  };
  const split = <Entry>(target: Flat<Entry>): Entry => {
    const { repo: _repo, ref: _ref, license: _license, refKind: _refKind, ...entry } = target;
    return entry as Entry;
  };
  for (const target of targets.luals ?? []) {
    const { recipe } = libraryOf(target);
    recipe.luals = [...(recipe.luals ?? []), split(target)];
  }
  for (const target of targets.scriptApi ?? []) {
    const { recipe } = libraryOf(target);
    recipe.scriptApi = [...(recipe.scriptApi ?? []), split(target)];
  }
  for (const target of targets.forks ?? []) {
    const { library } = libraryOf(target);
    library.forks = [...(library.forks ?? []), split(target)];
  }
  for (const target of targets.native ?? []) {
    libraryOf(target).library.native = split(target);
  }
  const [first] = libraries.values();
  if (targets.indexSlots !== undefined && first !== undefined) {
    first.library.indexSlots = targets.indexSlots;
  }
  for (const [folder, { library, ref, recipe }] of libraries) {
    const floors = targets.floors?.[folder];
    writeLibraryJson(dataDir, floors === undefined ? library : { ...library, floors });
    if (ref !== undefined) writeReviewedJson(dataDir, folder, { ref });
    if (recipe.luals !== undefined || recipe.scriptApi !== undefined) {
      writeRecipeJson(dataDir, folder, recipe);
    }
  }
  return [...libraries.keys()];
}

// A library data folder whose only targets are authored forks, one per module, so
// a `resolve` test names the modules a fake dependency confirms and the exact
// bytes each one prints, without the real corpus.
export function writeAuthoredLibraryData(forks: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), "defold-typescript-library-data-"));
  writeLibraryTargets(root, {
    forks: Object.entries(forks).map(([moduleId, contents]) => {
      const library = moduleId.split(".")[0] as string;
      const authored = `fork/${moduleId}.d.ts`;
      mkdirSync(join(root, library, "fork"), { recursive: true });
      writeFileSync(join(root, library, authored), contents);
      return {
        repo: `https://github.com/owner/${library}`,
        ref: "1.0.0",
        authored,
        moduleId,
        namespace: moduleId,
        apiDoc: `api-doc/${moduleId}.json`,
        upstreamLua: [`source/upstream/${moduleId}.lua`],
      };
    }),
  });
  return root;
}
