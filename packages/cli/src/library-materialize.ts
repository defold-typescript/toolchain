// Materialization slice of `library-type-resolution`: copy the matched vendored
// libraries' committed `generated/<module>.d.ts` files verbatim into the
// gitignored sibling surface `.defold-types/libraries/`, then point tsconfig at
// it. Mirrors `extension-materialize.ts`; the two surfaces coexist under one
// `typeRoots: [".defold-types"]` alongside the engine `<surfaceId>/` surface.
// Unlike extension namespaces, the generated library files are self-contained
// ambient `declare module` blocks that reference only global engine types, so
// they copy byte-for-byte with no import rewriting.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { formatJsonLikeBiome } from "./format-json";
import type { VendoredLibrary } from "./library-match";
import { ensureGitignoreLine, MATERIALIZED_ROOT } from "./materialize";

const LIBRARIES_DIR = "libraries";

export interface MaterializeVendoredLibrariesOptions {
  readonly cwd: string;
  readonly matched: readonly VendoredLibrary[];
  readonly generatedDir: string | null;
}

export interface MaterializeVendoredLibrariesResult {
  readonly materializedDir: string | null;
  readonly modules: string[];
}

export function materializeVendoredLibraries(
  opts: MaterializeVendoredLibrariesOptions,
): MaterializeVendoredLibrariesResult {
  const { cwd, matched, generatedDir } = opts;

  const modules = [...new Set(matched.flatMap((library) => library.modules))].sort();
  if (modules.length === 0 || generatedDir === null) {
    return { materializedDir: null, modules: [] };
  }

  const relDir = path.posix.join(MATERIALIZED_ROOT, LIBRARIES_DIR);
  const absDir = path.join(cwd, MATERIALIZED_ROOT, LIBRARIES_DIR);
  mkdirSync(absDir, { recursive: true });

  const wanted = new Set(modules.map((module) => `${module}.d.ts`));
  for (const existing of readdirSync(absDir)) {
    if (existing.endsWith(".d.ts") && existing !== "index.d.ts" && !wanted.has(existing)) {
      rmSync(path.join(absDir, existing));
    }
  }

  for (const module of modules) {
    const file = `${module}.d.ts`;
    writeFileSync(path.join(absDir, file), readFileSync(path.join(generatedDir, file), "utf8"));
  }

  const imports = modules.map((module) => `import "./${module}";`).join("\n");
  writeFileSync(path.join(absDir, "index.d.ts"), `${imports}\n\nexport {};\n`);

  writeFileSync(
    path.join(absDir, "package.json"),
    `${formatJsonLikeBiome({
      name: "@defold-typescript/materialized-libraries",
      types: "index.d.ts",
    })}\n`,
  );

  return { materializedDir: relDir, modules };
}

export function ensureLibraryTypesReference(cwd: string, materializedDir: string | null): void {
  if (materializedDir === null) {
    return;
  }
  const entry = path.posix.basename(materializedDir);

  const tsconfigPath = path.join(cwd, "tsconfig.json");
  if (existsSync(tsconfigPath)) {
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as {
      compilerOptions?: Record<string, unknown>;
      [key: string]: unknown;
    };
    const current = tsconfig.compilerOptions ?? {};
    const types = Array.isArray(current.types) ? (current.types as unknown[]).slice() : [];
    const typeRoots = Array.isArray(current.typeRoots)
      ? (current.typeRoots as unknown[]).slice()
      : [];

    // Purely additive: keep an existing engine `surfaceId` and `"extensions"`
    // entry and only append `"libraries"` when absent, so this composes with
    // `ensureMaterializedReference` and `ensureExtensionTypesReference`.
    const needsEntry = !types.includes(entry);
    const needsRoot = !typeRoots.includes(MATERIALIZED_ROOT);
    if (needsEntry || needsRoot) {
      if (needsEntry) {
        types.push(entry);
      }
      if (needsRoot) {
        typeRoots.push(MATERIALIZED_ROOT);
      }
      tsconfig.compilerOptions = { ...current, typeRoots, types };
      writeFileSync(tsconfigPath, `${formatJsonLikeBiome(tsconfig)}\n`);
    }
  }

  ensureGitignoreLine(cwd, `${MATERIALIZED_ROOT}/`);
}
