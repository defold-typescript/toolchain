import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  type ApiTarget,
  generateModuleDeclaration,
  generateVersionIndex,
  KIND_MODULE_MANIFEST,
  type KindManifestEntry,
  kindStdlibReferences,
  loadTargetEditorModules,
  type ResolveTargetOptions,
  resolveTargetModules,
} from "./regen";

export { RUNTIME_KIND_MANIFEST, targetKindManifest } from "./regen";

export interface RenderMaterializedKindIndexOptions {
  readonly kind: string;
  readonly universalModules: readonly string[];
  readonly restrictedModule: string | null;
  // Set for a kind built from the target's own editor documents. It replaces
  // the universal set outright — an editor kind is disjoint from the runtime
  // surface, not a narrowing of it.
  readonly editorModules?: readonly string[];
}

// The installed subpath a materialized kind re-exports its factory from: the
// surface has no relative `src/<module>` to reach, but the package publishes
// each factory module under its own name.
function installedFactoryModule(entry: KindManifestEntry): string {
  const module = (entry.factoryFrom ?? "../../src/lifecycle").split("/").pop();
  return `@defold-typescript/types/${module}`;
}

// Render one per-kind subpath for the materialized surface, mirroring
// `generateKindIndex` but re-exporting the factory from the installed
// `@defold-typescript/types/<module>` subpath. Pure: returns a string, no FS.
export function renderMaterializedKindIndex(opts: RenderMaterializedKindIndexOptions): string {
  const entry = KIND_MODULE_MANIFEST.find((e) => e.kind === opts.kind);
  if (!entry) throw new Error(`unknown script kind: ${opts.kind}`);
  const modules =
    entry.only === undefined
      ? [...new Set(["engine-globals", ...opts.universalModules])].sort()
      : [...(opts.editorModules ?? [])];
  const lines = modules.map((mod) => `import "../${mod}";`);
  if (entry.only === undefined && opts.restrictedModule) {
    lines.push(`import "../${opts.restrictedModule}";`);
  }
  const from = installedFactoryModule(entry);
  const values = [entry.factory, ...(entry.extraExports ?? [])].join(", ");
  const typeExports = entry.extraTypeExports?.length
    ? `\nexport type { ${entry.extraTypeExports.join(", ")} } from "${from}";`
    : "";
  const properties =
    entry.propertyTypes === false
      ? ""
      : `\nexport type { ScriptProperties, ScriptProperty } from "${from}";`;
  return `${kindStdlibReferences(entry)}${lines.join("\n")}\n\nexport { ${values} } from "${from}";${typeExports}${properties}\n`;
}

export interface BuildVersionedSurfaceOptions {
  readonly resolveOpts?: ResolveTargetOptions;
  // Bare module names (no `.d.ts`) to omit from the surface — both the emitted
  // file and its aggregate-index import. Lets a caller narrow the surface to a
  // script kind without the generator knowing what a script kind is.
  readonly excludeModules?: readonly string[];
}

export interface MaterializeVersionedSurfaceOptions extends BuildVersionedSurfaceOptions {
  readonly destDir: string;
}

export interface VersionedSurfaceFile {
  // Relative to the surface root, so a sink can write it to disk or key it in
  // object storage without rewriting the path.
  readonly path: string;
  readonly contents: string;
}

// Generate a versioned surface as an in-memory file map: resolve the target's
// module docs (ref-doc or committed fixture), emit each module declaration, then
// the aggregate side-effect entrypoint and a minimal package.json. Pure — no
// `node:fs` — so a Worker with no filesystem can serve a version generated at
// request time; `materializeVersionedSurface` is the disk sink over the same map.
export async function buildVersionedSurfaceFiles(
  target: ApiTarget,
  opts: BuildVersionedSurfaceOptions = {},
): Promise<VersionedSurfaceFile[]> {
  const exclude = new Set(opts.excludeModules ?? []);
  const kept = (outFile: string): boolean => !exclude.has(outFile.replace(/\.d\.ts$/, ""));
  const modules = (await resolveTargetModules(target, opts.resolveOpts ?? {})).filter((entry) =>
    kept(entry.outFile),
  );
  // The editor documents a target declares are always committed fixtures — the
  // ref-doc zip carries no editor surface — so they resolve from disk whatever
  // the target's `source` says.
  const editorModules = loadTargetEditorModules(
    target,
    opts.resolveOpts?.packageRoot ?? undefined,
  ).filter((entry) => kept(entry.outFile));

  const files: VersionedSurfaceFile[] = [...modules, ...editorModules].map((entry) => ({
    path: entry.outFile,
    contents: generateModuleDeclaration(entry).contents,
  }));

  // The aggregate entrypoint stays the runtime surface: importing the editor VM
  // there would drag it into every program that pins this version.
  const versioned = modules.map((entry) => ({ ...entry, versionId: target.id }));
  files.push({ path: "index.d.ts", contents: generateVersionIndex(target.id, versioned) });

  files.push({
    path: "package.json",
    contents: `${JSON.stringify(
      { name: `@defold-typescript/materialized-${target.id}`, types: "index.d.ts" },
      null,
      2,
    )}\n`,
  });

  return files;
}

// Write the generated surface into a project-local faux `@types` package.
// ref-doc targets are never pre-baked, so this is the only path that turns a
// resolved version into a consumable on-disk type surface.
export async function materializeVersionedSurface(
  target: ApiTarget,
  opts: MaterializeVersionedSurfaceOptions,
): Promise<void> {
  const files = await buildVersionedSurfaceFiles(target, opts);
  mkdirSync(opts.destDir, { recursive: true });
  for (const file of files) {
    const out = resolve(opts.destDir, file.path);
    // An editor VM module lands in its own subdirectory, so the sink cannot
    // assume every file is a direct child of the surface root.
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, file.contents);
  }
}
