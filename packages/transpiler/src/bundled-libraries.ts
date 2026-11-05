import { existsSync, readdirSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import { LuaLibFeature, type Plugin, type TransformationContext } from "typescript-to-lua";
import { scanEmittedRequires } from "./lua-require-scan";

/**
 * A library the toolchain compiles into a user's project from its own
 * TypeScript source. Its `specifier` is the `index` module; every other module
 * is a subpath of it. Each lowers to a require of `<requireRoot>.<module>`,
 * which the CLI respells to the module's place in its runtime folder, the way
 * it handles the timers runtime.
 */
export interface BundledLibrary {
  /**
   * Names the workspace package (`packages/<id>/src`), the shipped `dist/<id>/`
   * copy, the `packages/types/<id>/` declarations and the runtime-folder
   * subfolder the build writes the modules to.
   */
  readonly id: "hsm" | "ecs";
  /** What a user imports for the `index` module. */
  readonly specifier: string;
  /** The first segment of every module's require name. */
  readonly requireRoot: string;
  /** How a contested-path failure names the library's output. */
  readonly label: string;
  /**
   * The modules whose Lua requires the lualib bundle, with the features each
   * registers. Every other module stays plain Lua, so a program that imports
   * none of these ships no bundle.
   */
  readonly lualibModules: Readonly<Record<string, readonly LuaLibFeature[]>>;
  /**
   * The compiled Lua opens with the source file's leading block comment, which
   * the compile otherwise strips: the license the library ships under.
   */
  readonly licenseFromSource?: boolean;
}

export const HSM_LIBRARY: BundledLibrary = {
  id: "hsm",
  specifier: "@defold-typescript/types/hsm",
  requireRoot: "defold_typescript_hsm",
  label: "the hsm state machine library",
  lualibModules: { async: [LuaLibFeature.Promise, LuaLibFeature.New] },
};

export const ECS_LIBRARY: BundledLibrary = {
  id: "ecs",
  specifier: "@defold-typescript/types/ecs",
  requireRoot: "defold_typescript_ecs",
  label: "the ecs entity system library",
  lualibModules: {},
  licenseFromSource: true,
};

export const BUNDLED_LIBRARIES: readonly BundledLibrary[] = [HSM_LIBRARY, ECS_LIBRARY];

export interface BundledModule {
  readonly library: BundledLibrary;
  /** The source file's basename without `.ts`. */
  readonly name: string;
  /** What a user imports. */
  readonly specifier: string;
  /** What the import lowers to, and the module path the CLI writes it under. */
  readonly requireName: string;
}

function moduleSpecifier(library: BundledLibrary, name: string): string {
  return name === "index" ? library.specifier : `${library.specifier}/${name}`;
}

// Same anchoring as the CLI's version lookup: the module URL, never
// `import.meta.dir`, so the bundled `dist/index.js` under node still lands on
// the package root.
function defaultPackageRoot(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
}

// The one filter the transpiler build (what ships in `dist/<id>/`) and the
// compile (what reaches a project) both read, so a new module ships without
// editing a list.
export function librarySourceFiles(dir: string): string[] {
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
// inside this repo; a published install has only the `dist/<id>/` copy.
export function resolveLibrarySourceDir(
  library: BundledLibrary,
  packageRoot: string = defaultPackageRoot(),
): string | null {
  const workspace = path.join(packageRoot, "..", library.id, "src");
  if (existsSync(workspace)) {
    return workspace;
  }
  const shipped = path.join(packageRoot, "dist", library.id);
  if (existsSync(shipped)) {
    return shipped;
  }
  return null;
}

export function requireLibrarySourceDir(library: BundledLibrary): string {
  const dir = resolveLibrarySourceDir(library);
  if (dir === null) {
    throw new Error(
      `@defold-typescript/transpiler: the ${library.id} source is missing from this install; reinstall @defold-typescript/transpiler.`,
    );
  }
  return dir;
}

const modulesByLibrary = new Map<BundledLibrary, readonly BundledModule[]>();

export function bundledModules(library: BundledLibrary): readonly BundledModule[] {
  let modules = modulesByLibrary.get(library);
  if (modules === undefined) {
    modules = librarySourceFiles(requireLibrarySourceDir(library)).map((file) => {
      const name = file.slice(0, -".ts".length);
      return {
        library,
        name,
        specifier: moduleSpecifier(library, name),
        requireName: `${library.requireRoot}.${name}`,
      };
    });
    modulesByLibrary.set(library, modules);
  }
  return modules;
}

/** The bundled module a require path names, or undefined for any other require. */
export function bundledModuleOfRequire(requirePath: string): BundledModule | undefined {
  for (const library of BUNDLED_LIBRARIES) {
    if (requirePath.startsWith(`${library.requireRoot}.`)) {
      return bundledModules(library).find((module) => module.requireName === requirePath);
    }
  }
  return undefined;
}

function bundledModuleOfSpecifier(node: ts.Expression | undefined): BundledModule | undefined {
  if (node === undefined || !ts.isStringLiteral(node)) {
    return undefined;
  }
  const { text } = node;
  for (const library of BUNDLED_LIBRARIES) {
    if (text === library.specifier || text.startsWith(`${library.specifier}/`)) {
      return bundledModules(library).find((module) => module.specifier === text);
    }
  }
  return undefined;
}

function requiredModules(lua: string): BundledModule[] {
  const modules: BundledModule[] = [];
  for (const { path: requirePath } of scanEmittedRequires(lua)) {
    const module = bundledModuleOfRequire(requirePath);
    if (module !== undefined) {
      modules.push(module);
    }
  }
  return modules;
}

/**
 * The bundled modules a program needs, keyed by require name: every one its
 * chunks require, plus every one those require in turn. Read from emitted Lua
 * rather than the import AST, so an import TypeScript elides (`import type`, an
 * unused binding) selects nothing. `compile` runs once per library, and only
 * for a library some chunk requires a module of.
 */
export function bundledLibraryClosure(
  chunks: Iterable<string>,
  compile: (library: BundledLibrary) => Readonly<Record<string, string>>,
): Record<string, string> | undefined {
  const pending: BundledModule[] = [];
  for (const lua of chunks) {
    pending.push(...requiredModules(lua));
  }
  if (pending.length === 0) {
    return undefined;
  }
  const compiled = new Map<BundledLibrary, Readonly<Record<string, string>>>();
  const selected: Record<string, string> = {};
  for (let module = pending.pop(); module !== undefined; module = pending.pop()) {
    if (module.requireName in selected) {
      continue;
    }
    let libraryLua = compiled.get(module.library);
    if (libraryLua === undefined) {
      libraryLua = compile(module.library);
      compiled.set(module.library, libraryLua);
    }
    const lua = libraryLua[module.name];
    if (lua === undefined) {
      continue;
    }
    selected[module.requireName] = lua;
    pending.push(...requiredModules(lua));
  }
  return Object.fromEntries(Object.entries(selected).sort(([a], [b]) => a.localeCompare(b)));
}

// Rewrite a bundled specifier to its flat require, the way the timers lowering
// does: `@NoResolution:` keeps TSTL from looking for a Lua source behind the
// `.d.ts` the import type-checks against.
function lowerSpecifier(module: BundledModule): ts.StringLiteral {
  return ts.factory.createStringLiteral(`@NoResolution:${module.requireName}`);
}

type Lowered = ReturnType<TransformationContext["superTransformStatements"]>;

function loweredAnything(lowered: Lowered): boolean {
  return Array.isArray(lowered) ? lowered.length > 0 : lowered !== undefined;
}

// The same resolver verdict TSTL's own import transform uses to decide which
// bindings it requires, so the bundle and the emitted require cannot disagree.
// Takes the original node: the resolver has no binding for a synthesized copy.
function importSurvivesElision(
  node: ts.ImportDeclaration,
  context: TransformationContext,
): boolean {
  const clause = node.importClause;
  if (clause === undefined) {
    return true;
  }
  const { resolver } = context;
  if (clause.name !== undefined && resolver.isReferencedAliasDeclaration(clause)) {
    return true;
  }
  const bindings = clause.namedBindings;
  if (bindings === undefined) {
    return false;
  }
  if (ts.isNamespaceImport(bindings)) {
    return resolver.isReferencedAliasDeclaration(bindings);
  }
  return bindings.elements.some((element) => resolver.isReferencedAliasDeclaration(element));
}

// TSTL writes `lualib_bundle.lua` only for features a user chunk registers; it
// never sees a bundled module's own source, which the CLI writes beside the
// build. An elided import (type-only, unused) registers nothing. The import
// visitor passes the resolver's elision verdict, because TSTL's import transform
// always returns nothing and queues its require on the scope instead; the export
// visitor passes whether its lowered statements are non-empty, because TSTL's
// export transform returns them.
function registerLualib(
  module: BundledModule,
  emitted: boolean,
  context: TransformationContext,
): void {
  if (!emitted) {
    return;
  }
  for (const feature of module.library.lualibModules[module.name] ?? []) {
    context.usedLuaLibFeatures.add(feature);
  }
}

export const bundledLibraryLoweringPlugin: Plugin = {
  visitors: {
    [ts.SyntaxKind.ImportDeclaration]: (node, context) => {
      const module = bundledModuleOfSpecifier(node.moduleSpecifier);
      if (module === undefined) {
        return context.superTransformStatements(node);
      }
      registerLualib(module, importSurvivesElision(node, context), context);
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
      const module = bundledModuleOfSpecifier(node.moduleSpecifier);
      if (module === undefined) {
        return context.superTransformStatements(node);
      }
      const lowered = context.superTransformStatements(
        ts.factory.updateExportDeclaration(
          node,
          node.modifiers,
          node.isTypeOnly,
          node.exportClause,
          lowerSpecifier(module),
          node.attributes,
        ),
      );
      registerLualib(module, loweredAnything(lowered), context);
      return lowered;
    },
  },
};
