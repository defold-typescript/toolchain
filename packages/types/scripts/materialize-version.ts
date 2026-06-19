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

export interface MaterializeVersionedSurfaceOptions {
  readonly destDir: string;
  readonly resolveOpts?: ResolveTargetOptions;
  // Bare module names (no `.d.ts`) to omit from the surface — both the emitted
  // file and its aggregate-index import. Lets a caller narrow the surface to a
  // script kind without the generator knowing what a script kind is.
  readonly excludeModules?: readonly string[];
}

// Generate a versioned surface on the fly into a project-local faux `@types`
// package: resolve the target's module docs (ref-doc or committed fixture),
// emit each module declaration, then write the aggregate side-effect entrypoint
// and a minimal package.json. ref-doc targets are never pre-baked, so this is
// the only path that turns a resolved version into a consumable type surface.
export async function materializeVersionedSurface(
  target: ApiTarget,
  opts: MaterializeVersionedSurfaceOptions,
): Promise<void> {
  const exclude = new Set(opts.excludeModules ?? []);
  const modules = (await resolveTargetModules(target, opts.resolveOpts ?? {})).filter(
    (entry) => !exclude.has(entry.outFile.replace(/\.d\.ts$/, "")),
  );
  mkdirSync(opts.destDir, { recursive: true });

  for (const entry of modules) {
    const { contents } = generateModuleDeclaration(entry);
    writeFileSync(resolve(opts.destDir, entry.outFile), contents);
  }

  const versioned = modules.map((entry) => ({ ...entry, versionId: target.id }));
  writeFileSync(resolve(opts.destDir, "index.d.ts"), generateVersionIndex(target.id, versioned));

  writeFileSync(
    resolve(opts.destDir, "package.json"),
    `${JSON.stringify(
      { name: `@defold-typescript/materialized-${target.id}`, types: "index.d.ts" },
      null,
      2,
    )}\n`,
  );
}
