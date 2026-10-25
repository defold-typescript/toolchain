import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";
import { toPosix } from "./build-output";
import { readCliVersion } from "./cli-version";
import { librariesDirName } from "./library-materialize";

const EXTENSIONS_ENTRY = "extensions";

// The keys are project-relative, so a resolution must stay on the path it was
// reached by: a real path leaves the project wherever a parent folder is a
// symlink, as macOS's `/var` is.
const MODULE_OPTIONS: ts.CompilerOptions = {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  preserveSymlinks: true,
};

function stringEntries(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : undefined;
}

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

// A `/// <reference path>` may leave the extension off, as `tsc` accepts.
function referencedDeclaration(target: string): string | undefined {
  if (target.endsWith(".d.ts") && existsSync(target)) {
    return target;
  }
  const withExtension = `${target}.d.ts`;
  return existsSync(withExtension) ? withExtension : undefined;
}

/**
 * The declarations behind the `extensions` and current `libraries@<version>`
 * `types` entries `resolve` writes, keyed by project-relative POSIX path. The
 * build loads them as declaration-only inputs because its program is made of the
 * seeded engine files and `include`, never `types`. Every other entry is left
 * out: the engine `surfaceId` surface duplicates the seeded engine files, and a
 * `node_modules` directive is not something `resolve` installed.
 */
export function collectResolvedDeclarations(
  cwd: string,
  cliVersion: string = readCliVersion(),
): Record<string, string> {
  const tsconfigPath = path.join(cwd, "tsconfig.json");
  if (!existsSync(tsconfigPath)) {
    return {};
  }
  const { compilerOptions } = JSON.parse(readFileSync(tsconfigPath, "utf8")) as {
    compilerOptions?: { types?: unknown; typeRoots?: unknown };
  };
  const wanted = new Set([EXTENSIONS_ENTRY, librariesDirName(cliVersion)]);
  const entries = (stringEntries(compilerOptions?.types) ?? []).filter((entry) =>
    wanted.has(entry),
  );
  const typeRoots = stringEntries(compilerOptions?.typeRoots)?.map((root) =>
    path.resolve(cwd, root),
  );
  const typeOptions: ts.CompilerOptions = {
    preserveSymlinks: true,
    ...(typeRoots === undefined ? {} : { typeRoots }),
  };

  const pending: string[] = [];
  for (const entry of entries) {
    const { resolvedTypeReferenceDirective } = ts.resolveTypeReferenceDirective(
      entry,
      tsconfigPath,
      typeOptions,
      ts.sys,
    );
    if (resolvedTypeReferenceDirective?.resolvedFileName !== undefined) {
      pending.push(resolvedTypeReferenceDirective.resolvedFileName);
    }
  }

  // The entry file alone misses everything it reaches by relative path: the
  // per-namespace files and the `shipped/` sets the barrel imports.
  const files = new Map<string, string>();
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    const rel = toPosix(path.relative(cwd, file));
    if (files.has(rel)) {
      continue;
    }
    const text = readFileSync(file, "utf8");
    files.set(rel, text);
    const { importedFiles, referencedFiles } = ts.preProcessFile(text, true, false);
    for (const { fileName } of importedFiles) {
      if (!isRelativeSpecifier(fileName)) {
        continue;
      }
      const { resolvedModule } = ts.resolveModuleName(fileName, file, MODULE_OPTIONS, ts.sys);
      if (resolvedModule?.extension === ts.Extension.Dts) {
        pending.push(resolvedModule.resolvedFileName);
      }
    }
    for (const { fileName } of referencedFiles) {
      const target = referencedDeclaration(path.resolve(path.dirname(file), fileName));
      if (target !== undefined) {
        pending.push(target);
      }
    }
  }
  return Object.fromEntries([...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
