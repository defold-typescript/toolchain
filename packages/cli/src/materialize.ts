import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import * as path from "node:path";
import {
  loadApiTargetsRegistry,
  type RegistryTarget,
  resolveTypesPackageRoot,
} from "./api-registry";
import type { SelectedApiSurface } from "./api-surface";
import type { DefoldChannel } from "./defold-channel";
import { formatJsonLikeBiome } from "./format-json";

export const MATERIALIZED_ROOT = ".defold-types";

// The materialized surface must not mint its own copy of the branded engine
// primitives: `Hash` & co. are `unique symbol`-branded per declaration, so a
// copied `core-types.d.ts` is nominally distinct from the installed
// `@defold-typescript/types` a consumer imports from, and the two never unify
// (a consumer comparing `message_id === hash(...)` or assigning an imported
// `Hash` would get TS2367/TS2741). Re-export the package's copy instead so the
// ambient surface shares one brand. `engine-globals.d.ts` stays copied; its
// relative `./core-types` import resolves to this re-export.
const CORE_TYPES_REEXPORT = 'export * from "@defold-typescript/types/core-types";\n';

export interface MaterializeApiSurfaceOptions {
  readonly cwd: string;
  readonly surface: SelectedApiSurface;
  readonly sourceGeneratedDir: string | null;
}

export interface MaterializeApiSurfaceResult {
  readonly materializedDir: string | null;
  readonly active: string | null;
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${formatJsonLikeBiome(value)}\n`);
}

function listDts(dir: string): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".d.ts"))
    .sort();
}

export function materializeApiSurface(
  opts: MaterializeApiSurfaceOptions,
): MaterializeApiSurfaceResult {
  const { cwd, surface, sourceGeneratedDir } = opts;
  if (!surface.available || surface.surfaceId === null || sourceGeneratedDir === null) {
    return { materializedDir: null, active: null };
  }

  const { surfaceId } = surface;
  const relDir = path.posix.join(MATERIALIZED_ROOT, surfaceId);
  const absDir = path.join(cwd, MATERIALIZED_ROOT, surfaceId);
  mkdirSync(absDir, { recursive: true });

  const sources = listDts(sourceGeneratedDir).filter((file) => file !== "index.d.ts");

  // The `*-overloads` augmentations and the `core-types` they import live in the
  // types package `src/` (sibling of `generated/`), not among the generated
  // module surfaces. Mirror the per-kind entrypoints, which import them so that
  // `msg.post`, `go.get`/`set`, etc. resolve; without this the materialized
  // surface silently drops those globals. Skipped when the source has no
  // sibling `src/` (e.g. synthetic test fixtures).
  const srcDir = path.resolve(sourceGeneratedDir, "..", "src");
  const overloads = ["msg-overloads.d.ts", "message-guard.d.ts", "go-overloads.d.ts"].filter(
    (file) => existsSync(path.join(srcDir, file)),
  );
  const coreTypesSrc = path.join(srcDir, "core-types.ts");
  const includeCoreTypes = overloads.length > 0 && existsSync(coreTypesSrc);
  const engineGlobalsSrc = path.join(srcDir, "engine-globals.d.ts");
  const includeEngineGlobals = includeCoreTypes && existsSync(engineGlobalsSrc);

  const wanted = new Set(sources);
  for (const file of overloads) {
    wanted.add(file);
  }
  if (includeCoreTypes) {
    wanted.add("core-types.d.ts");
  }
  if (includeEngineGlobals) {
    wanted.add("engine-globals.d.ts");
  }

  for (const existing of readdirSync(absDir)) {
    if (existing.endsWith(".d.ts") && existing !== "index.d.ts" && !wanted.has(existing)) {
      rmSync(path.join(absDir, existing));
    }
  }

  for (const file of sources) {
    writeFileSync(
      path.join(absDir, file),
      readFileSync(path.join(sourceGeneratedDir, file), "utf8"),
    );
  }
  if (includeCoreTypes) {
    writeFileSync(path.join(absDir, "core-types.d.ts"), CORE_TYPES_REEXPORT);
  }
  if (includeEngineGlobals) {
    writeFileSync(path.join(absDir, "engine-globals.d.ts"), readFileSync(engineGlobalsSrc, "utf8"));
  }
  for (const file of overloads) {
    writeFileSync(path.join(absDir, file), readFileSync(path.join(srcDir, file), "utf8"));
  }

  const modules = [...sources, ...overloads].map((file) => file.replace(/\.d\.ts$/, ""));
  if (includeEngineGlobals) {
    modules.push("engine-globals");
  }
  const imports = modules.map((mod) => `import "./${mod}";`).join("\n");
  writeFileSync(path.join(absDir, "index.d.ts"), `${imports}\n\nexport {};\n`);

  writeJson(path.join(absDir, "package.json"), {
    name: `@defold-typescript/materialized-${surfaceId}`,
    types: "index.d.ts",
  });

  return { materializedDir: relDir, active: surfaceId };
}

export function ensureGitignoreLine(cwd: string, line: string): void {
  const gitignorePath = path.join(cwd, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, `${line}\n`);
    return;
  }
  const existing = readFileSync(gitignorePath, "utf8");
  const present = new Set(existing.split("\n").map((entry) => entry.trim()));
  if (present.has(line)) {
    return;
  }
  const prefix = existing.endsWith("\n") || existing === "" ? "" : "\n";
  writeFileSync(gitignorePath, `${existing}${prefix}${line}\n`);
}

export function ensureMaterializedReference(cwd: string, materializedDir: string | null): void {
  if (materializedDir === null) {
    return;
  }
  const surfaceId = path.posix.basename(materializedDir);

  const tsconfigPath = path.join(cwd, "tsconfig.json");
  if (existsSync(tsconfigPath)) {
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as {
      compilerOptions?: Record<string, unknown>;
      [key: string]: unknown;
    };
    const current = tsconfig.compilerOptions ?? {};
    // The sibling `extensions` surface (ensureExtensionTypesReference) coexists
    // with the engine surface under one typeRoots; repointing the engine entry
    // must carry an existing `"extensions"` types entry through, not clobber it.
    const currentTypes = Array.isArray(current.types) ? (current.types as unknown[]) : [];
    const desiredTypes = currentTypes.includes("extensions")
      ? [surfaceId, "extensions"]
      : [surfaceId];
    // Skip the write when already repointed so the file keeps its existing
    // formatting (a consumer's Biome/Prettier shape) instead of churning to
    // JSON.stringify's layout on every build.
    const alreadyRepointed =
      JSON.stringify(current.typeRoots) === JSON.stringify([MATERIALIZED_ROOT]) &&
      JSON.stringify(current.types) === JSON.stringify(desiredTypes);
    if (!alreadyRepointed) {
      tsconfig.compilerOptions = {
        ...current,
        typeRoots: [MATERIALIZED_ROOT],
        types: desiredTypes,
      };
      writeJson(tsconfigPath, tsconfig);
    }
  }

  ensureGitignoreLine(cwd, `${MATERIALIZED_ROOT}/`);
}

export function resolveCurrentSurfaceGeneratedDir(): string | null {
  const root = resolveTypesPackageRoot();
  return root === null ? null : path.join(root, "generated");
}

export interface RefDocResolveOptions {
  readonly cacheDir?: string;
  readonly download?: (url: string) => Promise<Uint8Array>;
  readonly readZip?: (zipPath: string) => unknown;
  readonly channel?: DefoldChannel;
  readonly fetchChannelInfo?: (
    channel: DefoldChannel,
  ) => Promise<{ version: string; sha1: string }>;
}

interface MaterializeVersionedSurfaceModule {
  readonly materializeVersionedSurface: (
    target: unknown,
    opts: {
      destDir: string;
      resolveOpts?: RefDocResolveOptions;
      excludeModules?: readonly string[];
    },
  ) => Promise<void>;
}

export interface MaterializeRefDocSurfaceOptions {
  readonly cwd: string;
  readonly surfaceId: string;
  readonly resolveOpts?: RefDocResolveOptions;
  // Registry override (defaults to the installed types package's
  // api-targets.json). Injected only by tests that need a multi-module ref-doc
  // target.
  readonly registry?: readonly RegistryTarget[];
}

// Generate a pinned, ref-doc-sourced surface on the fly into the project's
// `.defold-types/<id>/`. The generator (`materializeVersionedSurface`) ships in
// the `@defold-typescript/types` tarball; it is imported by resolved path so the
// `current` build path never pulls in its fixture-reading module side effects.
// The faux package is made self-contained by emitting core-type imports as a
// sibling `./core-types` and copying `core-types.d.ts` in, so the surface
// resolves from a real `.defold-types/<id>/` regardless of dest depth.
export async function materializeRefDocSurface(
  opts: MaterializeRefDocSurfaceOptions,
): Promise<MaterializeApiSurfaceResult> {
  const { cwd, surfaceId, resolveOpts } = opts;
  const root = resolveTypesPackageRoot();
  if (root === null) {
    return { materializedDir: null, active: null };
  }
  const registry = opts.registry ?? loadApiTargetsRegistry();
  const target = registry.find((t) => t.id === surfaceId);
  if (target?.source?.kind !== "ref-doc") {
    return { materializedDir: null, active: null };
  }

  const relDir = path.posix.join(MATERIALIZED_ROOT, surfaceId);
  const absDir = path.join(cwd, MATERIALIZED_ROOT, surfaceId);
  try {
    const mod = (await import(
      path.join(root, "scripts", "materialize-version.ts")
    )) as MaterializeVersionedSurfaceModule;
    const selfContained = { ...target, coreTypesImport: "./core-types" };
    await mod.materializeVersionedSurface(selfContained, {
      destDir: absDir,
      ...(resolveOpts ? { resolveOpts } : {}),
    });
    writeFileSync(path.join(absDir, "core-types.d.ts"), CORE_TYPES_REEXPORT);
    copyFileSync(
      path.join(root, "src", "engine-globals.d.ts"),
      path.join(absDir, "engine-globals.d.ts"),
    );
    const indexPath = path.join(absDir, "index.d.ts");
    writeFileSync(indexPath, `import "./engine-globals";\n${readFileSync(indexPath, "utf8")}`);
  } catch {
    rmSync(absDir, { recursive: true, force: true });
    return { materializedDir: null, active: null };
  }
  return { materializedDir: relDir, active: surfaceId };
}
