import { readFileSync } from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";
import * as tstl from "typescript-to-lua";
import {
  type BundledLibrary,
  bundledLibraryClosure,
  bundledLibraryLoweringPlugin,
  bundledModuleOfRequire,
  bundledModules,
  requireLibrarySourceDir,
} from "./bundled-libraries";
import { createCompanionEmitPlugin } from "./companion-emit";
import { editorScriptErasurePlugin } from "./editor-script-erasure";
import { LUALIB_REQUIRE_NAME } from "./emitted-requires";
import {
  findDirectGoPropertyCalls,
  GO_PROPERTY_DIRECT_CALL_MESSAGE,
} from "./go-property-direct-call";
import { AMBIENT_FILES } from "./kind-surfaces";
import {
  createLifecycleErasure,
  type LifecycleErasure,
  type PendingProperties,
} from "./lifecycle-erasure";
import { scanEmittedRequires } from "./lua-require-scan";
import { messageDispatchLoweringPlugin } from "./message-dispatch-lowering";
import { messageGuardLoweringPlugin } from "./message-guard-lowering";
import {
  findGlobalAliasMarkerLeak,
  nativeGlobalModulesPlugin,
  rewriteGlobalAliasRequires,
} from "./native-global-modules";
import { requirePathForRel } from "./output-paths";
import { physicsEventGuardLoweringPlugin } from "./physics-event-guard-lowering";
import { evaluatePropertyDefaults, type PropertyValue } from "./property-default-evaluator";
import { importsTimersModule, timersLoweringPlugin } from "./timers-lowering";
import { TIMERS_REQUIRE_NAME, TIMERS_RUNTIME } from "./timers-runtime";
import { typeApplicationErasurePlugin } from "./type-application-erasure";
import { windowEventGuardLoweringPlugin } from "./window-event-guard-lowering";

export interface TranspileDiagnostic {
  readonly file?: string;
  readonly message: string;
  // 1-based source position of the offending expression. Populated only for
  // user-file diagnostics that carry a TS position; absent means a positionless
  // project diagnostic (no `file`/`start`).
  readonly line?: number;
  readonly column?: number;
  // Present only on advisory diagnostics (e.g. the deprecated direct
  // `go.property` call). Absent means a hard failure, so `collectFailures`
  // keeps treating uncategorized diagnostics as fatal.
  readonly category?: "warning";
}

export interface TranspileProjectResult {
  readonly lua: Readonly<Record<string, string>>;
  readonly sourceMaps: Readonly<Record<string, string>>;
  readonly diagnostics: readonly TranspileDiagnostic[];
  // The companion module a script-kind source with runtime value exports emits
  // alongside its script, keyed by the same source rel as `lua`. The script's
  // own chunk requires it at the module-kind output path, so the CLI must write
  // it there. Absent for a source that emits a single chunk.
  readonly companions?: Readonly<Record<string, string>>;
  // TSTL synthesizes this bundle (no user source) whenever a lualib feature is
  // registered — either by a user source using one (`Object.keys`, spread,
  // `__TS__TypeOf`, ...) or by the timers import lowering, whose generated
  // runtime requires the bundle. The emitted `require("lualib_bundle")` is an
  // internal name the CLI respells to where it writes the bundle. Absent when
  // neither trigger fires.
  readonly lualib?: string;
  // Hand-authored runtime Lua for the `@defold-typescript/types/timers`
  // polyfills (`setTimeout`/`wait`/...). Unlike `defineScript`, the import is
  // not erased — it lowers to `require("defold_typescript_timers")`, an
  // internal name the CLI respells to where it writes this. Present only when
  // a user file imports the module (pay-for-use).
  readonly timersRuntime?: string;
  // The compiled bundled-library modules the program requires, keyed by require
  // name (`defold_typescript_hsm.index`, ...). A bundled import lowers to
  // `require("<requireRoot>.<module>")`, an internal name the CLI respells to
  // where it writes each one. Present only when some chunk requires one
  // (pay-for-use).
  readonly libraryModules?: Readonly<Record<string, string>>;
  // The source map of each module in `libraryModules`, under the same keys. Its
  // `sources` names `<module>.ts` with an empty `sourceRoot`: only the CLI knows
  // where the module is written and where the library source sits, so it sets
  // the root that joins them.
  readonly librarySourceMaps?: Readonly<Record<string, string>>;
}

function flattenDiagnosticMessage(
  text: string | { messageText: string | { messageText: string } },
): string {
  if (typeof text === "string") {
    return text;
  }
  return flattenDiagnosticMessage(text.messageText);
}

interface CollectableFile {
  readonly outPath: string;
  readonly sourceFiles: readonly ts.SourceFile[];
  readonly lua?: string;
  readonly luaSourceMap?: string;
}

const LUALIB_BUNDLE_NAME = "lualib_bundle.lua";

function isLualibBundle(file: CollectableFile): boolean {
  return file.sourceFiles.length === 0 && file.outPath.endsWith(LUALIB_BUNDLE_NAME);
}

export function collectOutputs(
  transpiledFiles: readonly CollectableFile[],
  diagnostics: readonly ts.Diagnostic[],
  userKeys: ReadonlySet<string>,
  emittedCompanions: ReadonlyMap<string, string> = new Map(),
): TranspileProjectResult {
  const lua: Record<string, string> = {};
  const sourceMaps: Record<string, string> = {};
  const companions: Record<string, string> = {};
  const markerLeaks: { file: string; globalName: string }[] = [];
  let lualib: string | undefined;
  for (const file of transpiledFiles) {
    if (isLualibBundle(file) && typeof file.lua === "string") {
      lualib = file.lua;
      continue;
    }
    const userSource = file.sourceFiles.find((s) => userKeys.has(s.fileName));
    if (!userSource || typeof file.lua !== "string") {
      continue;
    }
    // Column offsets after a swap shift, as they already do under the CLI's
    // require respelling — accepted.
    const swapped = rewriteGlobalAliasRequires(file.lua);
    lua[userSource.fileName] = swapped;
    const leaked = findGlobalAliasMarkerLeak(swapped);
    if (leaked !== undefined) {
      markerLeaks.push({ file: userSource.fileName, globalName: leaked });
    }
    if (typeof file.luaSourceMap === "string") {
      sourceMaps[userSource.fileName] = file.luaSourceMap;
    }
    const companion = emittedCompanions.get(userSource.fileName);
    if (companion !== undefined) {
      const swappedCompanion = rewriteGlobalAliasRequires(companion);
      companions[userSource.fileName] = swappedCompanion;
      const companionLeak = findGlobalAliasMarkerLeak(swappedCompanion);
      if (companionLeak !== undefined) {
        markerLeaks.push({ file: userSource.fileName, globalName: companionLeak });
      }
    }
  }

  const collectedDiagnostics: TranspileDiagnostic[] = diagnostics.map((d) => {
    const fileName = d.file?.fileName;
    const message = flattenDiagnosticMessage(d.messageText);
    if (fileName === undefined || !userKeys.has(fileName)) {
      return { message };
    }
    if (d.file === undefined || d.start === undefined) {
      return { file: fileName, message };
    }
    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
    return { file: fileName, message, line: line + 1, column: character + 1 };
  });

  // A surviving marker is a build error, not a fallback: the alternative —
  // leaving the original require — fails silently at load time in Defold.
  for (const leak of markerLeaks) {
    collectedDiagnostics.push({
      file: leak.file,
      message: `@globalTable lowering left an unrewritten require for \`${leak.globalName}\` in the emitted chunk; the output would fail to load in Defold.`,
    });
  }

  // Advisory scan of the user TypeScript AST for the deprecated direct
  // `go.property` call, plus detection of the timers polyfill import. Run here
  // (shared by transpileProject and the watch session) so both paths report it
  // identically.
  const scanned = new Set<string>();
  let timersImported = false;
  for (const file of transpiledFiles) {
    for (const sourceFile of file.sourceFiles) {
      if (!userKeys.has(sourceFile.fileName) || scanned.has(sourceFile.fileName)) {
        continue;
      }
      scanned.add(sourceFile.fileName);
      if (findDirectGoPropertyCalls(sourceFile).length > 0) {
        collectedDiagnostics.push({
          file: sourceFile.fileName,
          message: GO_PROPERTY_DIRECT_CALL_MESSAGE,
          category: "warning",
        });
      }
      if (importsTimersModule(sourceFile)) {
        timersImported = true;
      }
    }
  }

  const libraryModules = bundledLibraryClosure(
    [...Object.values(lua), ...Object.values(companions)],
    compileLibraryModules,
  );
  const librarySourceMaps =
    libraryModules === undefined ? undefined : selectLibrarySourceMaps(Object.keys(libraryModules));

  return {
    lua,
    sourceMaps,
    diagnostics: collectedDiagnostics,
    ...(Object.keys(companions).length > 0 ? { companions } : {}),
    ...(lualib !== undefined ? { lualib } : {}),
    ...(timersImported ? { timersRuntime: TIMERS_RUNTIME } : {}),
    ...(libraryModules !== undefined ? { libraryModules } : {}),
    ...(librarySourceMaps !== undefined ? { librarySourceMaps } : {}),
  };
}

function selectLibrarySourceMaps(requireNames: readonly string[]): Record<string, string> {
  const selected: Record<string, string> = {};
  for (const requireName of requireNames) {
    const module = bundledModuleOfRequire(requireName);
    const map = module && compileLibrarySourceMaps(module.library)[module.name];
    if (map !== undefined) {
      selected[requireName] = map;
    }
  }
  return selected;
}

function transpileVirtual(
  files: Readonly<Record<string, string>>,
  companionEmit: ReturnType<typeof createCompanionEmitPlugin>,
  erasure: LifecycleErasure,
  overrides: Pick<tstl.CompilerOptions, "removeComments"> = {},
): tstl.TranspileVirtualProjectResult {
  return tstl.transpileVirtualProject(
    { ...AMBIENT_FILES, ...files },
    {
      luaTarget: tstl.LuaTarget.Lua51,
      sourceMap: true,
      // Already-resolved CompilerOptions, so the value is the lib file name, not
      // the tsconfig spelling "ES2022". Drops the default `lib.dom`, whose
      // `declare var window` shadows Defold's `window` namespace.
      lib: ["lib.es2022.d.ts"],
      // Don't cross-check the seeded ambient .d.ts surface against itself; we only
      // care about diagnostics on user files (mirrors the editor's skipLibCheck).
      skipLibCheck: true,
      // TypeScript turns this on under its default `bundler` resolution. With it on,
      // an error that has to name a module-declared type the file does not import
      // (`Url`, `Hash`, `Vector3`) throws inside the checker, which builds a module
      // specifier from an undefined base path and the virtual host's empty current
      // directory. The virtual host reads every `package.json` as empty, so no `#`
      // import resolves with the option on or off.
      resolvePackageJsonImports: false,
      // Defold scripts are not OO: free helper functions never receive a context,
      // so suppress TSTL's implicit `self` parameter and the `_G` call-site filler.
      noImplicitSelf: true,
      luaPlugins: [
        { plugin: erasure.plugin },
        { plugin: editorScriptErasurePlugin },
        { plugin: messageGuardLoweringPlugin },
        { plugin: windowEventGuardLoweringPlugin },
        { plugin: physicsEventGuardLoweringPlugin },
        { plugin: messageDispatchLoweringPlugin },
        { plugin: timersLoweringPlugin },
        { plugin: nativeGlobalModulesPlugin },
        { plugin: bundledLibraryLoweringPlugin },
        { plugin: typeApplicationErasurePlugin },
        { plugin: companionEmit.plugin },
      ],
      ...overrides,
    },
  );
}

export interface EvaluatedProperties {
  readonly values: ReadonlyMap<string, ReadonlyMap<string, PropertyValue>>;
  readonly diagnostics: readonly ts.Diagnostic[];
}

/**
 * Computes the properties of every script an emit left pending. That emit is
 * the evaluation input: every other module is already in its final form. Its
 * diagnostics, not the literal emit's, are the ones to report, since only it
 * transformed the `properties` values.
 */
export function evaluatePendingProperties(
  pending: ReadonlyMap<string, PendingProperties>,
  emitted: TranspileProjectResult,
): EvaluatedProperties {
  const modules = evaluationChunks(emitted);
  const values = new Map<string, ReadonlyMap<string, PropertyValue>>();
  const diagnostics: ts.Diagnostic[] = [];
  for (const [fileName, script] of pending) {
    const lua = emitted.lua[fileName];
    if (lua === undefined) {
      continue;
    }
    // Keyed by the source name, which no require spells, because a script
    // with a companion shares its require name with that companion.
    const result = evaluatePropertyDefaults({
      chunks: { ...modules, [fileName]: lua },
      entry: fileName,
      names: script.names,
    });
    if (result.ok) {
      values.set(fileName, result.values);
    } else {
      const { message, name } = result.error;
      const span =
        (name === undefined ? undefined : script.memberSpans.get(name)) ?? script.propertiesSpan;
      diagnostics.push({
        ...span,
        category: ts.DiagnosticCategory.Error,
        code: 0,
        messageText: `\`properties\` could not be computed at build time: ${message}`,
      });
    }
  }
  return { values, diagnostics };
}

// Every module a script can require, under the name its require uses.
function evaluationChunks(emitted: TranspileProjectResult): Record<string, string> {
  const chunks: Record<string, string> = {};
  for (const [fileName, lua] of Object.entries(emitted.lua)) {
    chunks[requirePathForRel(fileName)] = emitted.companions?.[fileName] ?? lua;
  }
  if (emitted.lualib !== undefined) {
    chunks[LUALIB_REQUIRE_NAME] = emitted.lualib;
  }
  if (emitted.timersRuntime !== undefined) {
    chunks[TIMERS_REQUIRE_NAME] = emitted.timersRuntime;
  }
  Object.assign(chunks, emitted.libraryModules);
  return chunks;
}

interface CompiledLibrary {
  readonly lua: Readonly<Record<string, string>>;
  readonly sourceMaps: Readonly<Record<string, string>>;
}

const compiledLibraries = new Map<BundledLibrary, CompiledLibrary>();

// The source's leading `/* ... */` block, which `removeComments` strips from the
// compile, as a Lua long comment. The bracket level grows until the text cannot
// close it early.
function luaLicenseHeader(source: string): string | undefined {
  const match = /^\/\*([\s\S]*?)\*\//.exec(source);
  const body = match?.[1];
  if (body === undefined) {
    return undefined;
  }
  let level = "";
  while (body.includes(`]${level}]`)) {
    level += "=";
  }
  return `--[${level}[${body}]${level}]\n`;
}

function lineCount(text: string): number {
  return text.split("\n").length - 1;
}

// Each `;` in `mappings` ends one generated line, so prepending one per header
// line moves every segment down past the header to the line it now maps from.
function shiftSourceMap(map: string, lines: number): string {
  if (lines === 0) {
    return map;
  }
  const parsed = JSON.parse(map) as { mappings: string };
  return JSON.stringify({ ...parsed, mappings: `${";".repeat(lines)}${parsed.mappings}` });
}

function requiresLualib(lua: string): boolean {
  return scanEmittedRequires(lua).some(({ path: requirePath }) => requirePath === "lualib_bundle");
}

/**
 * Every module of a bundled library compiled to Lua, keyed by module name, once
 * per process. The source is the shipped TypeScript, never a prebuilt Lua copy,
 * so the Lua a project gets always comes from the compiler that builds it. Each
 * library compiles in its own program, with each file at
 * `<requireRoot>/<module>.ts`, so a require between modules is already spelled
 * the way the user's lowered imports are. A `licenseFromSource` library's Lua
 * opens with its source's license block, and its maps shift past it. Throws
 * when the compile reports anything, when a module outside the library's
 * `lualibModules` needs the lualib bundle, or when a `licenseFromSource` module
 * has no leading license block.
 */
export function compileLibraryModules(library: BundledLibrary): Readonly<Record<string, string>> {
  return compileLibrary(library).lua;
}

/** The source map of every module `compileLibraryModules` returns, under the same keys. */
export function compileLibrarySourceMaps(
  library: BundledLibrary,
): Readonly<Record<string, string>> {
  return compileLibrary(library).sourceMaps;
}

function compileLibrary(library: BundledLibrary): CompiledLibrary {
  const cached = compiledLibraries.get(library);
  if (cached !== undefined) {
    return cached;
  }
  const sourceDir = requireLibrarySourceDir(library);
  const nameByKey = new Map<string, string>();
  const files: Record<string, string> = {};
  for (const { name } of bundledModules(library)) {
    const key = `${library.requireRoot}/${name}.ts`;
    nameByKey.set(key, name);
    files[key] = readFileSync(path.join(sourceDir, `${name}.ts`), "utf8");
  }
  // The source's doc comments are for the editor, which reads the declarations; the Lua a
  // project gets carries none of them.
  const result = transpileVirtual(files, createCompanionEmitPlugin(), createLifecycleErasure(), {
    removeComments: true,
  });

  const problems = result.diagnostics.map(
    (d) => `${d.file?.fileName ?? "(project)"}: ${flattenDiagnosticMessage(d.messageText)}`,
  );
  const lua: Record<string, string> = {};
  const sourceMaps: Record<string, string> = {};
  for (const file of result.transpiledFiles) {
    if (isLualibBundle(file)) {
      continue;
    }
    const source = file.sourceFiles.find((s) => nameByKey.has(s.fileName));
    const name = source === undefined ? undefined : nameByKey.get(source.fileName);
    if (name === undefined || typeof file.lua !== "string") {
      continue;
    }
    if (!(name in library.lualibModules) && requiresLualib(file.lua)) {
      problems.push(`the compiled ${name} module requires lualib_bundle`);
    }
    let header = "";
    if (library.licenseFromSource) {
      const license = luaLicenseHeader(files[`${library.requireRoot}/${name}.ts`] ?? "");
      if (license === undefined) {
        problems.push(`the ${name} module opens with no /* ... */ license block`);
      } else {
        header = license;
      }
    }
    lua[name] = `${header}${file.lua}`;
    if (typeof file.luaSourceMap === "string") {
      sourceMaps[name] = shiftSourceMap(file.luaSourceMap, lineCount(header));
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `@defold-typescript/transpiler: the ${library.id} library does not compile:\n  ${problems.join("\n  ")}`,
    );
  }
  const compiled = { lua, sourceMaps };
  compiledLibraries.set(library, compiled);
  return compiled;
}
