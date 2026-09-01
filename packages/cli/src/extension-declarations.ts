// The bridge slice of the `[dependencies]`-driven extension typing pipeline: it
// joins the resolver (extension-archive.ts, URL -> located `.script_api` paths +
// provenance + cached archive) to the emitter (extension-emit.ts, one
// `.script_api` text -> ambient-namespace `.d.ts`). For each resolved extension it
// re-opens the cached archive, reads each located doc's bytes, and emits its
// declaration, returning one bundle per declared dependency. Asset-only deps carry
// an empty `declarations` list and are reported, not failed. Writing into
// `.defold-types/` and the CLI `resolve` verb stay later slices.

import { archiveWrapperOf, libraryIncludedEntries } from "@defold-typescript/transpiler";
import {
  defaultReadZip,
  type ExtensionArchiveProvenance,
  type ExtensionZip,
  type ResolveExtensionArchiveOptions,
  resolveExtensions,
} from "./extension-archive";
import type { ExtensionDependency } from "./extension-deps";
import { type EmittedExtension, emitExtensionDeclaration } from "./extension-emit";

export interface ExtensionDeclarations {
  readonly url: string;
  readonly provenance: ExtensionArchiveProvenance;
  readonly assetOnly: boolean;
  readonly resolvedVersion: string;
  readonly declarations: EmittedExtension[];
  // Dotted Lua require paths the archive actually ships (`a/b/c.lua` -> `a.b.c`,
  // leading GitHub archive-wrapper dir stripped). Downstream library matching
  // verifies a repo-name match against these before emitting.
  readonly luaModules: string[];
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
}

// The archive's own `game.project`, read through the wrapper strip so a library
// packed under `<repo>-<ref>/` is found the same way a bare one is.
function archiveGameProject(zip: ExtensionZip): string | undefined {
  const entries = zip.entries();
  const wrapper = archiveWrapperOf(entries);
  for (const entry of entries) {
    const path = wrapper === undefined ? entry : entry.slice(wrapper.length + 1);
    if (path === "game.project") {
      return zip.read(entry);
    }
  }
  return undefined;
}

function archiveSceneSources(zip: ExtensionZip): {
  sceneSources: { path: string; text: string }[];
  sceneReasons: string[];
  sceneRefused: string[];
} {
  const { shared, reasons, refused } = libraryIncludedEntries(
    zip.entries(),
    archiveGameProject(zip),
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

export async function resolveExtensionDeclarations(
  deps: readonly ExtensionDependency[],
  opts: ResolveExtensionArchiveOptions,
): Promise<ExtensionDeclarations[]> {
  const open = opts.readZip ?? defaultReadZip;
  const resolved = await resolveExtensions(deps, opts);

  const bundles: ExtensionDeclarations[] = [];
  for (const archive of resolved) {
    const zip = await open(archive.archivePath);
    const luaModules = archiveLuaModules(zip.entries());
    const { sceneSources, sceneReasons, sceneRefused } = archiveSceneSources(zip);
    if (archive.assetOnly) {
      bundles.push({
        url: archive.url,
        provenance: archive.provenance,
        assetOnly: true,
        resolvedVersion: archive.resolvedVersion,
        declarations: [],
        luaModules,
        sceneSources,
        sceneReasons,
        sceneRefused,
      });
      continue;
    }
    const declarations: EmittedExtension[] = [];
    for (const scriptApi of archive.scriptApis) {
      declarations.push(await emitExtensionDeclaration(zip.read(scriptApi)));
    }
    bundles.push({
      url: archive.url,
      provenance: archive.provenance,
      assetOnly: false,
      resolvedVersion: archive.resolvedVersion,
      declarations,
      luaModules,
      sceneSources,
      sceneReasons,
      sceneRefused,
    });
  }
  return bundles;
}
