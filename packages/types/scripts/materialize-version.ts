import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type ApiTarget,
  generateModuleDeclaration,
  generateVersionIndex,
  KIND_MODULE_MANIFEST,
  LUA_STDLIB_REFERENCES,
  type ResolveTargetOptions,
  resolveTargetModules,
} from "./regen";

export { KIND_MODULE_MANIFEST } from "./regen";

export interface RenderMaterializedKindIndexOptions {
  readonly kind: string;
  readonly universalModules: readonly string[];
  readonly restrictedModule: string | null;
}

// Render one per-kind subpath for the materialized surface, mirroring
// `generateKindIndex` but re-exporting the factory from the installed
// `@defold-typescript/types/lifecycle` subpath (the materialized surface has no
// relative `src/lifecycle` to reach). Pure: returns a string, no FS.
export function renderMaterializedKindIndex(opts: RenderMaterializedKindIndexOptions): string {
  const entry = KIND_MODULE_MANIFEST.find((e) => e.kind === opts.kind);
  if (!entry) throw new Error(`unknown script kind: ${opts.kind}`);
  const universal = [...new Set(["engine-globals", ...opts.universalModules])].sort();
  const lines = universal.map((mod) => `import "../${mod}";`);
  if (opts.restrictedModule) lines.push(`import "../${opts.restrictedModule}";`);
  return `${LUA_STDLIB_REFERENCES}${lines.join("\n")}\n\nexport { ${entry.factory} } from "@defold-typescript/types/lifecycle";\nexport type { ScriptProperties, ScriptProperty } from "@defold-typescript/types/lifecycle";\n`;
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
  const modules = (await resolveTargetModules(target, opts.resolveOpts ?? {})).filter(
    (entry) => !exclude.has(entry.outFile.replace(/\.d\.ts$/, "")),
  );

  const files: VersionedSurfaceFile[] = modules.map((entry) => ({
    path: entry.outFile,
    contents: generateModuleDeclaration(entry).contents,
  }));

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
    writeFileSync(resolve(opts.destDir, file.path), file.contents);
  }
}
