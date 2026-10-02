import { existsSync, readdirSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import type { Plugin } from "typescript-to-lua";
import { scanEmittedRequires } from "./lua-require-scan";

// `@defold-typescript/types/hsm` is the `index` module; every other module is a
// subpath of it. Each lowers to a require of `defold_typescript_hsm.<module>`,
// which the CLI writes under the output root the way it writes the timers
// runtime.
export const HSM_MODULE_SPECIFIER = "@defold-typescript/types/hsm";
export const HSM_REQUIRE_ROOT = "defold_typescript_hsm";

export interface HsmModule {
  /** The source file's basename without `.ts`. */
  readonly name: string;
  /** What a user imports. */
  readonly specifier: string;
  /** What the import lowers to, and the module path the CLI writes it under. */
  readonly requireName: string;
}

export function hsmRequireName(name: string): string {
  return `${HSM_REQUIRE_ROOT}.${name}`;
}

function hsmSpecifier(name: string): string {
  return name === "index" ? HSM_MODULE_SPECIFIER : `${HSM_MODULE_SPECIFIER}/${name}`;
}

// Same anchoring as the CLI's version lookup: the module URL, never
// `import.meta.dir`, so the bundled `dist/index.js` under node still lands on
// the package root.
function defaultPackageRoot(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
}

// The one filter the transpiler build (what ships in `dist/hsm/`) and the
// compile (what reaches a project) both read, so a new module ships without
// editing a list.
export function hsmSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith(".test.ts") &&
        !entry.name.endsWith(".d.ts"),
    )
    .map((entry) => entry.name)
    .sort();
}

// The workspace sibling wins so a stale `dist/` never shadows the live source
// inside this repo; a published install has only the `dist/hsm/` copy.
export function resolveHsmSourceDir(packageRoot: string = defaultPackageRoot()): string | null {
  const workspace = path.join(packageRoot, "..", "hsm", "src");
  if (existsSync(workspace)) {
    return workspace;
  }
  const shipped = path.join(packageRoot, "dist", "hsm");
  if (existsSync(shipped)) {
    return shipped;
  }
  return null;
}

export function requireHsmSourceDir(): string {
  const dir = resolveHsmSourceDir();
  if (dir === null) {
    throw new Error(
      "@defold-typescript/transpiler: the hsm source is missing from this install; reinstall @defold-typescript/transpiler.",
    );
  }
  return dir;
}

let modules: readonly HsmModule[] | undefined;

export function hsmModules(): readonly HsmModule[] {
  modules ??= hsmSourceFiles(requireHsmSourceDir()).map((file) => {
    const name = file.slice(0, -".ts".length);
    return { name, specifier: hsmSpecifier(name), requireName: hsmRequireName(name) };
  });
  return modules;
}

/** The hsm module a require path names, or undefined for any other require. */
function hsmModuleOfRequire(requirePath: string): HsmModule | undefined {
  if (!requirePath.startsWith(`${HSM_REQUIRE_ROOT}.`)) {
    return undefined;
  }
  return hsmModules().find((module) => module.requireName === requirePath);
}

export function isHsmRequireName(requirePath: string): boolean {
  return hsmModuleOfRequire(requirePath) !== undefined;
}

function hsmModuleOfSpecifier(node: ts.Expression | undefined): HsmModule | undefined {
  if (node === undefined || !ts.isStringLiteral(node)) {
    return undefined;
  }
  const { text } = node;
  if (text !== HSM_MODULE_SPECIFIER && !text.startsWith(`${HSM_MODULE_SPECIFIER}/`)) {
    return undefined;
  }
  return hsmModules().find((module) => module.specifier === text);
}

function requiredHsmNames(lua: string): string[] {
  const names: string[] = [];
  for (const { path: requirePath } of scanEmittedRequires(lua)) {
    const module = hsmModuleOfRequire(requirePath);
    if (module !== undefined) {
      names.push(module.name);
    }
  }
  return names;
}

/**
 * The hsm modules a program needs: every one its chunks require, plus every one
 * those require in turn. Read from emitted Lua rather than the import AST, so an
 * import TypeScript elides (`import type`, an unused binding) selects nothing.
 * `compile` runs only when some chunk requires a module.
 */
export function hsmClosure(
  chunks: Iterable<string>,
  compile: () => Readonly<Record<string, string>>,
): Record<string, string> | undefined {
  const pending: string[] = [];
  for (const lua of chunks) {
    pending.push(...requiredHsmNames(lua));
  }
  if (pending.length === 0) {
    return undefined;
  }
  const compiled = compile();
  const selected: Record<string, string> = {};
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    const lua = compiled[name];
    if (name in selected || lua === undefined) {
      continue;
    }
    selected[name] = lua;
    pending.push(...requiredHsmNames(lua));
  }
  return Object.fromEntries(Object.entries(selected).sort(([a], [b]) => a.localeCompare(b)));
}

// Rewrite an hsm specifier to its flat require, the way the timers lowering
// does: `@NoResolution:` keeps TSTL from looking for a Lua source behind the
// `.d.ts` the import type-checks against. No lualib feature is registered,
// because hsm compiles to plain Lua.
function lowerSpecifier(module: HsmModule): ts.StringLiteral {
  return ts.factory.createStringLiteral(`@NoResolution:${module.requireName}`);
}

export const hsmLoweringPlugin: Plugin = {
  visitors: {
    [ts.SyntaxKind.ImportDeclaration]: (node, context) => {
      const module = hsmModuleOfSpecifier(node.moduleSpecifier);
      if (module === undefined) {
        return context.superTransformStatements(node);
      }
      return context.superTransformStatements(
        ts.factory.updateImportDeclaration(
          node,
          node.modifiers,
          node.importClause,
          lowerSpecifier(module),
          node.attributes,
        ),
      );
    },
    [ts.SyntaxKind.ExportDeclaration]: (node, context) => {
      const module = hsmModuleOfSpecifier(node.moduleSpecifier);
      if (module === undefined) {
        return context.superTransformStatements(node);
      }
      return context.superTransformStatements(
        ts.factory.updateExportDeclaration(
          node,
          node.modifiers,
          node.isTypeOnly,
          node.exportClause,
          lowerSpecifier(module),
          node.attributes,
        ),
      );
    },
  },
};
