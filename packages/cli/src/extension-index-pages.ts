// Which curated library pages document a `.script_api` a resolved extension
// ships, so its declaration notes each classified index under the same page key
// the API reference renders. A doc is matched by repo and by its path inside the
// archive, never by namespace: `defold-spine`'s `spine_gui.script_api` declares
// `gui`, and only its page key (`spine.gui`) tells it apart from the engine.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { archiveWrapperOf } from "@defold-typescript/transpiler";
import { normalizeSourceId } from "./library-match";
import { resolveLibraryTypesPackageRoot } from "./library-registry";

export interface CuratedExtensionManifest {
  readonly libraries: readonly {
    readonly repo: string;
    readonly docs: readonly { readonly path: string; readonly page: string }[];
  }[];
}

const EMPTY: CuratedExtensionManifest = { libraries: [] };

export function loadCuratedExtensionManifest(
  root: string | null = resolveLibraryTypesPackageRoot(),
): CuratedExtensionManifest {
  if (root === null) return EMPTY;
  const path = join(root, "defold-extensions.json");
  if (!existsSync(path)) return EMPTY;
  return JSON.parse(readFileSync(path, "utf8")) as CuratedExtensionManifest;
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
