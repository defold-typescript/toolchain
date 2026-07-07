// The bridge slice of the `[dependencies]`-driven extension typing pipeline: it
// joins the resolver (extension-archive.ts, URL -> located `.script_api` paths +
// provenance + cached archive) to the emitter (extension-emit.ts, one
// `.script_api` text -> ambient-namespace `.d.ts`). For each resolved extension it
// re-opens the cached archive, reads each located doc's bytes, and emits its
// declaration, returning one bundle per declared dependency. Asset-only deps carry
// an empty `declarations` list and are reported, not failed. Writing into
// `.defold-types/` and the CLI `resolve` verb stay later slices.

import {
  defaultReadZip,
  type ExtensionArchiveProvenance,
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
}

// Turn the archive's `.lua` entry paths into dotted require paths: strip the
// leading archive-wrapper dir (GitHub packs everything under `<repo>-<ref>/`)
// and the `.lua` suffix, then join with dots. Sorted and de-duplicated.
function archiveLuaModules(entries: readonly string[]): string[] {
  const modules = new Set<string>();
  for (const entry of entries) {
    if (!/\.lua$/i.test(entry)) {
      continue;
    }
    const segments = entry.split("/");
    const withoutWrapper = segments.length > 1 ? segments.slice(1) : segments;
    const dotted = withoutWrapper
      .join("/")
      .replace(/\.lua$/i, "")
      .replace(/\//g, ".");
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
    if (archive.assetOnly) {
      bundles.push({
        url: archive.url,
        provenance: archive.provenance,
        assetOnly: true,
        resolvedVersion: archive.resolvedVersion,
        declarations: [],
        luaModules,
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
    });
  }
  return bundles;
}
