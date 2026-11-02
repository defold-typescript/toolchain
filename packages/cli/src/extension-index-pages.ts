// Which curated library pages document a `.script_api` a resolved extension
// ships, so its declaration notes each classified index under the same page key
// the API reference renders. A doc is matched by repo and by its path inside the
// archive, never by namespace: `defold-spine`'s `spine_gui.script_api` declares
// `gui`, and only its page key (`spine.gui`) tells it apart from the engine.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { archiveWrapperOf } from "@defold-typescript/transpiler";
import { DEFOLD_EXTENSIONS_FILE } from "./library/library-data";
import { normalizeSourceId } from "./library-match";

export interface CuratedExtensionManifest {
  readonly libraries: readonly {
    readonly repo: string;
    readonly docs: readonly { readonly path: string; readonly page: string }[];
  }[];
}

const NO_PAGES: CuratedExtensionManifest = { libraries: [] };

// Read from the library data folder `resolve` reads, so a newly curated page
// reaches a project with no CLI upgrade. Without that file, nothing is curated.
export function loadCuratedExtensionManifest(dataDir: string | null): CuratedExtensionManifest {
  if (dataDir === null) {
    return NO_PAGES;
  }
  try {
    const { libraries } = JSON.parse(
      readFileSync(join(dataDir, DEFOLD_EXTENSIONS_FILE), "utf8"),
    ) as {
      libraries: { repo: string; docs: { path: string; page: string }[] }[];
    };
    return {
      libraries: libraries.map(({ repo, docs }) => ({
        repo,
        docs: docs.map(({ path, page }) => ({ path, page })),
      })),
    };
  } catch {
    return NO_PAGES;
  }
}

export function curatedIndexPages(
  url: string,
  entry: string,
  entries: readonly string[],
  manifest: CuratedExtensionManifest,
): string[] {
  const sourceId = normalizeSourceId(url);
  if (sourceId === "") return [];
  const wrapper = archiveWrapperOf(entries);
  const path = wrapper === undefined ? entry : entry.slice(wrapper.length + 1);
  return manifest.libraries
    .filter((library) => normalizeSourceId(library.repo) === sourceId)
    .flatMap((library) => library.docs.filter((doc) => doc.path === path).map((doc) => doc.page));
}
