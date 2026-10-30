// The bridge slice of the `[dependencies]`-driven extension typing pipeline: it
// joins the resolver (extension-archive.ts, URL -> located `.script_api` paths +
// provenance + cached archive) to the emitter (extension-emit.ts, one
// `.script_api` text -> ambient-namespace `.d.ts`). For each resolved extension it
// re-opens the cached archive, reads each located doc's bytes, and emits its
// declaration, returning one bundle per declared dependency. Asset-only deps carry
// an empty `declarations` list and are reported, not failed. Writing into
// `.defold-types/` and the CLI `resolve` verb stay later slices.

import {
  archiveGameProjectEntry,
  archiveWrapperOf,
  libraryIncludedEntries,
} from "@defold-typescript/transpiler";
import {
  defaultReadZip,
  type ExtensionArchiveProvenance,
  type ExtensionZip,
  type ResolveExtensionArchiveOptions,
  resolveExtensions,
} from "./extension-archive";
import type { ExtensionDependency } from "./extension-deps";
import { type EmittedExtension, emitExtensionDeclaration } from "./extension-emit";
import { curatedIndexPages, loadCuratedExtensionManifest } from "./extension-index-pages";
import { loadLibraryIndexSlotClassifications } from "./library-registry";
import { locateShippedDeclarations, selectShippedDeclarations } from "./shipped-declarations";

export interface ExtensionDeclarations {
  readonly url: string;
  readonly provenance: ExtensionArchiveProvenance;
  readonly assetOnly: boolean;
  readonly resolvedVersion: string;
  // The archive the bundle was read from, which `resolve` reopens to print the
  // library modules it confirms.
  readonly archivePath: string;
  // Why a cached copy was served without being revalidated, when it was.
  readonly warning?: string;
  readonly declarations: EmittedExtension[];
  // Dotted Lua require paths the archive actually ships (`a/b/c.lua` -> `a.b.c`,
  // leading GitHub archive-wrapper dir stripped). Downstream library matching
  // verifies a repo-name match against these before emitting.
  readonly luaModules: string[];
  // Directories holding an `ext.manifest`, wrapper stripped (`daabbcc`). A native
  // extension ships no Lua module, so this is what confirms a curated native
  // target the way `luaModules` confirms a library.
  readonly manifestDirs: string[];
  // The scene sources the archive's own `game.project` shares, at the resource
  // path a depending project addresses them by. Filled on both arms: a
  // collection-only library takes the asset-only one.
  readonly sceneSources: { path: string; text: string }[];
  // Why an archive shares nothing, when it shares nothing. A silent empty result
  // is exactly the hole this surface exists to close.
  readonly sceneReasons: string[];
  // The entries the reader dropped because their merged path would not stay
  // inside the dependency's own directory. Distinct from `sceneReasons`: the
  // archive shares something, just not this.
  readonly sceneRefused: string[];
  // The `types/*.d.ts` files the archive ships for itself that would install,
  // read on both arms. A non-empty list is a candidate surface; `resolve`
  // decides whether it wins.
  readonly shipped: { entry: string; contents: string }[];
}

function readArchiveGameProject(zip: ExtensionZip): string | undefined {
  const entry = archiveGameProjectEntry(zip.entries());
  return entry === undefined ? undefined : zip.read(entry);
}

function archiveSceneSources(zip: ExtensionZip): {
  sceneSources: { path: string; text: string }[];
  sceneReasons: string[];
  sceneRefused: string[];
} {
  const { shared, reasons, refused } = libraryIncludedEntries(
    zip.entries(),
    readArchiveGameProject(zip),
  );
  return {
    sceneSources: shared.map(({ entry, path }) => ({ path, text: zip.read(entry) })),
    sceneReasons: reasons,
    sceneRefused: refused,
  };
}

// Turn the archive's `.lua` entry paths into dotted require paths: strip the
// leading archive-wrapper dir (GitHub packs everything under `<repo>-<ref>/`)
// and the `.lua` suffix, then join with dots. Sorted and de-duplicated. The
// strip is `archiveWrapperOf`, shared with the library scene-source reader so
// the two halves of one archive cannot disagree about where its root is.
function archiveLuaModules(entries: readonly string[]): string[] {
  const wrapper = archiveWrapperOf(entries);
  const modules = new Set<string>();
  for (const entry of entries) {
    if (!/\.lua$/i.test(entry)) {
      continue;
    }
    const withoutWrapper = wrapper === undefined ? entry : entry.slice(wrapper.length + 1);
    const dotted = withoutWrapper.replace(/\.lua$/i, "").replace(/\//g, ".");
    if (dotted.length > 0) {
      modules.add(dotted);
    }
  }
  return [...modules].sort();
}

function archiveManifestDirs(entries: readonly string[]): string[] {
  const wrapper = archiveWrapperOf(entries);
  const dirs = new Set<string>();
  for (const entry of entries) {
    const withoutWrapper = wrapper === undefined ? entry : entry.slice(wrapper.length + 1);
    const match = /^(.+)\/ext\.manifest$/.exec(withoutWrapper);
    if (match?.[1] !== undefined) {
      dirs.add(match[1]);
    }
  }
  return [...dirs].sort();
}

export async function resolveExtensionDeclarations(
  deps: readonly ExtensionDependency[],
  opts: ResolveExtensionArchiveOptions & {
    // The library data folder index-slot notes are read from; defaults to the
    // one the installed CLI selects.
    readonly libraryDataDir?: string | null;
  },
): Promise<ExtensionDeclarations[]> {
  const open = opts.readZip ?? defaultReadZip;
  const resolved = await resolveExtensions(deps, opts);
  const curated = loadCuratedExtensionManifest();
  const classifications =
    opts.libraryDataDir !== undefined
      ? loadLibraryIndexSlotClassifications(opts.libraryDataDir)
      : loadLibraryIndexSlotClassifications();

  const bundles: ExtensionDeclarations[] = [];
  for (const archive of resolved) {
    const zip = await open(archive.archivePath);
    const luaModules = archiveLuaModules(zip.entries());
    const manifestDirs = archiveManifestDirs(zip.entries());
    const { sceneSources, sceneReasons, sceneRefused } = archiveSceneSources(zip);
    const shipped = selectShippedDeclarations(
      locateShippedDeclarations(zip.entries()).map((entry) => ({
        entry,
        contents: zip.read(entry),
      })),
    );
    const warning = archive.warning === undefined ? {} : { warning: archive.warning };
    if (archive.assetOnly) {
      bundles.push({
        url: archive.url,
        provenance: archive.provenance,
        assetOnly: true,
        resolvedVersion: archive.resolvedVersion,
        archivePath: archive.archivePath,
        ...warning,
        declarations: [],
        luaModules,
        manifestDirs,
        sceneSources,
        sceneReasons,
        sceneRefused,
        shipped,
      });
      continue;
    }
    const declarations: EmittedExtension[] = [];
    for (const scriptApi of archive.scriptApis) {
      const pages = curatedIndexPages(archive.url, scriptApi, zip.entries(), curated);
      declarations.push(
        await emitExtensionDeclaration(zip.read(scriptApi), pages, classifications),
      );
    }
    bundles.push({
      url: archive.url,
      provenance: archive.provenance,
      assetOnly: false,
      resolvedVersion: archive.resolvedVersion,
      archivePath: archive.archivePath,
      ...warning,
      declarations,
      luaModules,
      manifestDirs,
      sceneSources,
      sceneReasons,
      sceneRefused,
      shipped,
    });
  }
  return bundles;
}
