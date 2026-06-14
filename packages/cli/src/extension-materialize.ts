// The materialization slice of the `[dependencies]`-driven extension typing
// pipeline: it takes the `resolveExtensionDeclarations` output (one
// `ExtensionDeclarations` bundle per declared dependency) and writes each emitted
// namespace into the gitignored sibling surface `.defold-types/extensions/`, then
// additively points `tsconfig` at it. The extensions package is a sibling of the
// engine `<surfaceId>/` surface so an engine re-materialization (which prunes
// non-wanted `.d.ts` in its own dir) never clobbers it, and the two coexist under
// one `typeRoots: [".defold-types"]`. The CLI `resolve` verb that orchestrates
// resolve -> write -> reference stays the next slice.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { ExtensionDeclarations } from "./extension-declarations";
import { formatJsonLikeBiome } from "./format-json";
import { ensureGitignoreLine, MATERIALIZED_ROOT } from "./materialize";

const EXTENSIONS_DIR = "extensions";

export interface MaterializeExtensionDeclarationsOptions {
  readonly cwd: string;
  readonly bundles: readonly ExtensionDeclarations[];
}

export interface MaterializeExtensionDeclarationsResult {
  readonly materializedDir: string | null;
  readonly namespaces: string[];
}

export function materializeExtensionDeclarations(
  opts: MaterializeExtensionDeclarationsOptions,
): MaterializeExtensionDeclarationsResult {
  const { cwd, bundles } = opts;

  // Flatten every bundle's declarations and dedup by namespace, last wins.
  const byNamespace = new Map<string, string>();
  for (const bundle of bundles) {
    for (const { namespace, contents } of bundle.declarations) {
      byNamespace.set(namespace, contents);
    }
  }

  const namespaces = [...byNamespace.keys()].sort();
  if (namespaces.length === 0) {
    return { materializedDir: null, namespaces: [] };
  }

  const relDir = path.posix.join(MATERIALIZED_ROOT, EXTENSIONS_DIR);
  const absDir = path.join(cwd, MATERIALIZED_ROOT, EXTENSIONS_DIR);
  mkdirSync(absDir, { recursive: true });

  const wanted = new Set(namespaces.map((ns) => `${ns}.d.ts`));
  for (const existing of readdirSync(absDir)) {
    if (existing.endsWith(".d.ts") && existing !== "index.d.ts" && !wanted.has(existing)) {
      rmSync(path.join(absDir, existing));
    }
  }

  for (const namespace of namespaces) {
    writeFileSync(path.join(absDir, `${namespace}.d.ts`), byNamespace.get(namespace) ?? "");
  }

  const imports = namespaces.map((ns) => `import "./${ns}";`).join("\n");
  writeFileSync(path.join(absDir, "index.d.ts"), `${imports}\n\nexport {};\n`);

  writeFileSync(
    path.join(absDir, "package.json"),
    `${formatJsonLikeBiome({
      name: "@defold-typescript/materialized-extensions",
      types: "index.d.ts",
    })}\n`,
  );

  return { materializedDir: relDir, namespaces };
}

export function ensureExtensionTypesReference(cwd: string, materializedDir: string | null): void {
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

    // Purely additive: keep an existing engine `surfaceId` entry and only append
    // `"extensions"` when absent, so this composes with `ensureMaterializedReference`.
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
