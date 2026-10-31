// Which curated library pages document a `.script_api` a resolved extension
// ships, so its declaration notes each classified index under the same page key
// the API reference renders. A doc is matched by repo and by its path inside the
// archive, never by namespace: `defold-spine`'s `spine_gui.script_api` declares
// `gui`, and only its page key (`spine.gui`) tells it apart from the engine.

import { archiveWrapperOf } from "@defold-typescript/transpiler";
import CURATED_PAGES from "./extension-index-pages.json";
import { normalizeSourceId } from "./library-match";

export interface CuratedExtensionManifest {
  readonly libraries: readonly {
    readonly repo: string;
    readonly docs: readonly { readonly path: string; readonly page: string }[];
  }[];
}

// Ships in the CLI's bundle, so `resolve` reads it with no other package
// installed. `extension-index-pages.test.ts` holds it to `defold-extensions.json`.
export const CURATED_EXTENSION_MANIFEST: CuratedExtensionManifest = CURATED_PAGES;

export function curatedIndexPages(
  url: string,
  entry: string,
  entries: readonly string[],
  manifest: CuratedExtensionManifest = CURATED_EXTENSION_MANIFEST,
): string[] {
  const sourceId = normalizeSourceId(url);
  if (sourceId === "") return [];
  const wrapper = archiveWrapperOf(entries);
  const path = wrapper === undefined ? entry : entry.slice(wrapper.length + 1);
  return manifest.libraries
    .filter((library) => normalizeSourceId(library.repo) === sourceId)
    .flatMap((library) => library.docs.filter((doc) => doc.path === path).map((doc) => doc.page));
}
