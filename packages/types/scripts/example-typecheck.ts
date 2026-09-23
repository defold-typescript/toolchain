/**
 * Compile every hand-authored `@example` translation against the declarations
 * that actually ship it.
 *
 * Two traps shape the design. `tsc` skips the whole program's **semantic** pass
 * once any file carries a **syntactic** error, so one malformed example would
 * mask every type error in every other one; the TypeScript API is used instead,
 * per file, so a broken example fails alone. And a blanket tolerance for
 * unresolved names would swallow a misspelled API — `rendr.clear()` reads as
 * fragment context and passes — so tolerance is pinned per translation, exactly,
 * rather than granted per diagnostic code.
 *
 * Cost is program construction, one program per surface, bounded by the derived
 * surface inventory rather than by the number of examples.
 */
import { writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import type { TranslationStore } from "../src/example-store";
import { type ExampleDiagnostic, PINS_PATH, type PinFile } from "./example-pins";
import { boundOwnership, type ExampleSurface, exampleIdentity } from "./example-surfaces";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const TSCONFIG_PATH = resolve(PACKAGE_ROOT, "tsconfig.json");

export { type ExampleDiagnostic, PINS_PATH, type PinFile, readPins } from "./example-pins";

/** `<surface>:<fqn>:<sourceHash>` — one translation judged on one surface. */
export function pinIdentity(surfaceId: string, fqn: string, sourceHash: string): string {
  return `${surfaceId}:${exampleIdentity(fqn, sourceHash)}`;
}

export interface CompilerOptionOverride {
  readonly option: string;
  readonly reason: string;
}

/**
 * What the gate changes about the package's own compiler options, and why. Kept
 * as data so the test can assert the list rather than trusting a comment.
 */
export const COMPILER_OPTION_OVERRIDES: readonly CompilerOptionOverride[] = [
  {
    option: "types",
    reason:
      'the package\'s `types: ["bun"]` is build tooling, not a surface a Defold example compiles against; leaving it in would resolve `Bun`, `process` and `console` on a surface that declares none of them',
  },
  {
    option: "noEmit",
    reason: "the gate reads diagnostics and writes nothing",
  },
  {
    option: "baseUrl",
    reason:
      "the options are built programmatically and carry no `configFilePath`, so `paths` below has no directory to resolve against unless one is named",
  },
  {
    option: "skipLibCheck",
    reason:
      "every surface entry is a declaration file, so the inherited `skipLibCheck` short-circuits `getSemanticDiagnostics` for it and the entry-resolution guard can never fire",
  },
  {
    option: "paths",
    reason:
      "a materialized kind subpath re-exports its factory from the installed `@defold-typescript/types/<module>` specifier, which resolves in a consumer's project but not inside the gate's virtual root; mapping it to the package's own `src/*` reproduces what an install provides, and without it the factory is `any` and the surface judges nothing",
  },
];

/**
 * The package's own compiler options, with the overrides above applied. Parsed
 * from `tsconfig.json` (through its `extends` chain) rather than restated, so a
 * strictness change in the repo reaches the gate on the same edit.
 */
export function gateCompilerOptions(): ts.CompilerOptions {
  const parsed = ts.getParsedCommandLineOfConfigFile(TSCONFIG_PATH, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, " "));
    },
  } as ts.ParseConfigFileHost);
  if (!parsed) throw new Error(`could not parse ${TSCONFIG_PATH}`);
  return {
    ...parsed.options,
    types: [],
    noEmit: true,
    baseUrl: PACKAGE_ROOT,
    paths: { "@defold-typescript/types/*": ["src/*"] },
    skipLibCheck: false,
    declaration: false,
    declarationMap: false,
    sourceMap: false,
    configFilePath: undefined,
  };
}

export function normalizeDiagnostic(diagnostic: ts.Diagnostic): ExampleDiagnostic {
  return {
    code: diagnostic.code,
    text: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
  };
}

/**
 * Sorted, duplicate-preserving. A set would swallow a second identical
 * diagnostic, so a regression repeated inside one example could land silently.
 */
export function sortDiagnostics(diagnostics: readonly ExampleDiagnostic[]): ExampleDiagnostic[] {
  return [...diagnostics].sort((a, b) => a.code - b.code || a.text.localeCompare(b.text) || 0);
}

export function diagnosticsEqual(
  a: readonly ExampleDiagnostic[],
  b: readonly ExampleDiagnostic[],
): boolean {
  const left = sortDiagnostics(a);
  const right = sortDiagnostics(b);
  return (
    left.length === right.length &&
    left.every(
      (item, index) => item.code === right[index]?.code && item.text === right[index]?.text,
    )
  );
}

/**
 * A compiler host that serves an in-memory overlay before falling back to disk.
 * Module and type-reference resolution are routed through the same overlay, so a
 * materialized surface's `import "../b2d"` resolves against bytes that exist
 * nowhere while `@defold-typescript/types/lifecycle` resolves through the
 * `paths` mapping to the package's own `src/`.
 */
function createOverlayHost(
  options: ts.CompilerOptions,
  overlay: Map<string, string>,
): ts.CompilerHost {
  const host = ts.createCompilerHost(options, true);
  const baseFileExists = host.fileExists.bind(host);
  const baseReadFile = host.readFile.bind(host);
  const baseGetSourceFile = host.getSourceFile.bind(host);
  const baseDirectoryExists = host.directoryExists?.bind(host);

  const virtualDirectories = new Set<string>();
  for (const path of overlay.keys()) {
    let dir = resolve(path, "..");
    while (!virtualDirectories.has(dir) && dir !== resolve(dir, "..")) {
      virtualDirectories.add(dir);
      dir = resolve(dir, "..");
    }
  }

  host.fileExists = (fileName) => overlay.has(resolve(fileName)) || baseFileExists(fileName);
  host.readFile = (fileName) => overlay.get(resolve(fileName)) ?? baseReadFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const contents = overlay.get(resolve(fileName));
    if (contents === undefined)
      return baseGetSourceFile(fileName, languageVersion, onError, shouldCreate);
    return ts.createSourceFile(
      fileName,
      contents,
      languageVersion,
      true,
      fileName.endsWith(".d.ts") ? ts.ScriptKind.TS : undefined,
    );
  };
  host.directoryExists = (directoryName) =>
    virtualDirectories.has(resolve(directoryName)) ||
    (baseDirectoryExists?.(directoryName) ?? false);

  // Built by spread rather than by assigning `undefined`, because
  // `exactOptionalPropertyTypes` treats an absent optional and one set to
  // `undefined` as different types.
  const getDirectories = host.getDirectories?.bind(host);
  const realpath = host.realpath?.bind(host);
  const resolutionHost: ts.ModuleResolutionHost = {
    fileExists: host.fileExists,
    readFile: host.readFile,
    directoryExists: host.directoryExists,
    getCurrentDirectory: host.getCurrentDirectory.bind(host),
    useCaseSensitiveFileNames: host.useCaseSensitiveFileNames(),
    ...(getDirectories ? { getDirectories } : {}),
    ...(realpath ? { realpath } : {}),
  };
  const moduleCache = ts.createModuleResolutionCache(
    host.getCurrentDirectory(),
    (name) => name,
    options,
  );
  host.resolveModuleNameLiterals = (literals, containingFile, _redirected, compilerOptions) =>
    literals.map((literal) =>
      ts.resolveModuleName(
        literal.text,
        containingFile,
        compilerOptions,
        resolutionHost,
        moduleCache,
      ),
    );
  host.resolveTypeReferenceDirectiveReferences = (
    directives,
    containingFile,
    redirected,
    compilerOptions,
  ) =>
    directives.map((directive) =>
      ts.resolveTypeReferenceDirective(
        typeof directive === "string" ? directive : directive.fileName,
        containingFile,
        compilerOptions,
        resolutionHost,
        redirected,
      ),
    );
  return host;
}

export interface ExampleUnit {
  readonly identity: string;
  readonly fqn: string;
  readonly sourceHash: string;
  readonly fileName: string;
  readonly contents: string;
}

const UNITS_ROOT = resolve(PACKAGE_ROOT, ".example-gate", "units");

/**
 * Turn a host-native relative path into a module specifier. A specifier is
 * always `/`-separated, and this one is emitted into a TypeScript string
 * literal where `\` is an escape — so on Windows the native `relative` result
 * `..\..\generated\kinds\gui-script` would reach the compiler as the
 * unresolvable `....generatedkindsgui-script`. Splitting on both separators
 * rather than on `sep` keeps the rule checkable from any host.
 */
export function moduleSpecifier(relativePath: string): string {
  const specifier = relativePath
    .split(/[\\/]/)
    .join("/")
    .replace(/\.d\.ts$/, "");
  return specifier.startsWith(".") ? specifier : `./${specifier}`;
}

/**
 * The import a unit needs to see its surface the way a consumer does. A kind
 * subpath *exports* its factory rather than declaring it ambiently, so a user
 * writing a script imports `defineScript` from `@defold-typescript/types/script`
 * — and an example compiled without it is judged against a surface nobody
 * consumes, reporting the factory as an unresolved name and leaving every
 * `self` it types unchecked in the bargain.
 */
export function surfacePrelude(surface: ExampleSurface, unitDir: string): string {
  const { values, types } = surface.exports;
  if (values.length === 0 && types.length === 0) return "";
  const specifier = moduleSpecifier(relative(unitDir, surface.entry));
  const lines: string[] = [];
  if (values.length > 0) lines.push(`import { ${values.join(", ")} } from "${specifier}";`);
  if (types.length > 0) lines.push(`import type { ${types.join(", ")} } from "${specifier}";`);
  return `${lines.join("\n")}\n`;
}

/**
 * One translation as a compilable module. `export {}` keeps each fragment's
 * top-level declarations from colliding with another's inside the one program
 * the surface gets.
 */
export function exampleUnit(
  surface: ExampleSurface,
  fqn: string,
  sourceHash: string,
  body: string,
): ExampleUnit {
  const slug = `${fqn}-${sourceHash}`.replace(/[^A-Za-z0-9_.-]/g, "_");
  const unitDir = resolve(UNITS_ROOT, surface.id.replace(/\//g, "__"));
  return {
    identity: pinIdentity(surface.id, fqn, sourceHash),
    fqn,
    sourceHash,
    fileName: resolve(unitDir, `${slug}.ts`),
    contents: `${surfacePrelude(surface, unitDir)}${body}\nexport {};\n`,
  };
}

/**
 * The diagnostic codes that say a surface cannot see its own declarations:
 * unresolved module, non-module target, missing exported member. The entry's
 * other diagnostics are generated-declaration noise this gate has no verdict on,
 * so reading them unfiltered would make every surface fail for reasons no
 * example can fix.
 */
const ENTRY_RESOLUTION_CODES = new Set([2305, 2306, 2307]);

/**
 * The diagnostic codes for a binding the scaffold's own strictness leaves
 * implicitly `any`: the three parameter shapes (ordinary `7006`, destructured
 * `7031`, rest `7019`) plus the variable and member shapes (`7005`, `7008`,
 * `7034`). Return and accessor shapes (`7010`, `7011`, `7032`) stay out — the
 * pins hold no `70xx` diagnostic, so widening the set would take on territory
 * no measurement supports.
 */
export const IMPLICIT_ANY_CODES = new Set([7005, 7006, 7008, 7019, 7031, 7034]);

/**
 * The diagnostics an example's body carries that the implicit-any class
 * refuses. Both the committed-pin closure and the compiled parameter-shape
 * probes judge through this one predicate, so neither can drift from the set.
 */
export function implicitAnyOffenders(
  diagnostics: readonly ExampleDiagnostic[],
): ExampleDiagnostic[] {
  return diagnostics.filter((diagnostic) => IMPLICIT_ANY_CODES.has(diagnostic.code));
}

export interface SurfaceCompilation {
  readonly units: Map<string, ExampleDiagnostic[]>;
  /**
   * The entry file's own unresolved-module diagnostics. A surface reporting any
   * is a surface whose declarations resolved to `any`, so every unit judged on
   * it is judged against nothing — the per-unit map alone cannot say so, because
   * the error is reported against the entry, which is not a unit.
   */
  readonly entry: readonly ExampleDiagnostic[];
}

/**
 * Compile one surface's units in a single program and return each unit's
 * diagnostics. Syntactic and semantic diagnostics are read per file through the
 * TypeScript API, which is what keeps a syntactically invalid example from
 * suppressing every other example's type errors.
 */
export function compileSurface(
  surface: ExampleSurface,
  units: readonly ExampleUnit[],
  options: ts.CompilerOptions = gateCompilerOptions(),
): SurfaceCompilation {
  const overlay = new Map<string, string>();
  for (const file of surface.virtualFiles) overlay.set(resolve(file.path), file.contents);
  for (const unit of units) overlay.set(resolve(unit.fileName), unit.contents);

  const host = createOverlayHost(options, overlay);
  const program = ts.createProgram({
    rootNames: [surface.entry, ...units.map((unit) => unit.fileName)],
    options,
    host,
  });

  const out = new Map<string, ExampleDiagnostic[]>();
  for (const unit of units) {
    const source = program.getSourceFile(unit.fileName);
    if (!source) throw new Error(`unit not in program: ${unit.fileName}`);
    const syntactic = program.getSyntacticDiagnostics(source);
    // A file that does not parse yields no meaningful semantic diagnostics, and
    // asking for them is what drags the whole-program short-circuit back in.
    const semantic = syntactic.length > 0 ? [] : program.getSemanticDiagnostics(source);
    out.set(unit.identity, sortDiagnostics([...syntactic, ...semantic].map(normalizeDiagnostic)));
  }

  const entrySource = program.getSourceFile(surface.entry);
  if (!entrySource) throw new Error(`surface entry not in program: ${surface.entry}`);
  const entry = sortDiagnostics(
    program
      .getSemanticDiagnostics(entrySource)
      .filter((diagnostic) => ENTRY_RESOLUTION_CODES.has(diagnostic.code))
      .map(normalizeDiagnostic),
  );
  return { units: out, entry };
}

export interface SurfaceTiming {
  readonly surfaceId: string;
  readonly units: number;
  readonly ms: number;
}

export interface GateResult {
  /** Every `<surface>:<fqn>:<sourceHash>` pair, whether or not it produced diagnostics. */
  readonly computed: Map<string, ExampleDiagnostic[]>;
  readonly timings: readonly SurfaceTiming[];
  /** Surface id -> that surface's entry resolution diagnostics, one key per compiled surface. */
  readonly entries: Map<string, readonly ExampleDiagnostic[]>;
}

/** Compile every owned translation on every surface that ships it. */
export function runGate(
  store: TranslationStore,
  surfaces: readonly ExampleSurface[],
  extraUnits: ReadonlyMap<string, readonly ExampleUnit[]> = new Map(),
): GateResult {
  const owners = boundOwnership(store, surfaces);
  const options = gateCompilerOptions();
  const bySurface = new Map<string, ExampleUnit[]>();
  for (const [fqn, entries] of Object.entries(store)) {
    for (const entry of entries) {
      for (const surfaceId of owners.get(exampleIdentity(fqn, entry.sourceHash)) ?? []) {
        const surface = surfaces.find((candidate) => candidate.id === surfaceId);
        if (!surface) continue;
        const list = bySurface.get(surfaceId) ?? [];
        list.push(exampleUnit(surface, fqn, entry.sourceHash, entry.ts));
        bySurface.set(surfaceId, list);
      }
    }
  }

  const computed = new Map<string, ExampleDiagnostic[]>();
  const timings: SurfaceTiming[] = [];
  const entries = new Map<string, readonly ExampleDiagnostic[]>();
  for (const surface of surfaces) {
    const units = [...(bySurface.get(surface.id) ?? []), ...(extraUnits.get(surface.id) ?? [])];
    if (units.length === 0) continue;
    const started = performance.now();
    const compilation = compileSurface(surface, units, options);
    for (const [identity, diagnostics] of compilation.units) {
      computed.set(identity, diagnostics);
    }
    entries.set(surface.id, compilation.entry);
    timings.push({
      surfaceId: surface.id,
      units: units.length,
      ms: Math.round(performance.now() - started),
    });
  }
  return { computed, timings, entries };
}

/** Only the identities that produced diagnostics — what the pin file records. */
export function pinsFrom(computed: ReadonlyMap<string, ExampleDiagnostic[]>): PinFile {
  const pins: PinFile = {};
  for (const identity of [...computed.keys()].sort()) {
    const diagnostics = computed.get(identity) ?? [];
    if (diagnostics.length > 0) pins[identity] = diagnostics;
  }
  return pins;
}

export type GateFailureKind = "unpinned" | "drifted" | "resolved" | "ghost";

export interface GateFailure {
  readonly identity: string;
  readonly kind: GateFailureKind;
  readonly detail: string;
}

function render(diagnostics: readonly ExampleDiagnostic[]): string {
  return sortDiagnostics(diagnostics)
    .map((diagnostic) => `TS${diagnostic.code}: ${diagnostic.text}`)
    .join("; ");
}

/**
 * Every way the measured diagnostics can disagree with the pin file. The
 * comparison is equality, not a floor: a new diagnostic fails, and one that
 * stopped occurring fails asking for its pin to be deleted, which is what makes
 * the ratchet only tighten.
 */
export function gateFailures(
  computed: ReadonlyMap<string, ExampleDiagnostic[]>,
  pins: PinFile,
): GateFailure[] {
  const failures: GateFailure[] = [];
  for (const identity of [...computed.keys()].sort()) {
    const actual = computed.get(identity) ?? [];
    const pinned = pins[identity] ?? [];
    if (diagnosticsEqual(actual, pinned)) continue;
    if (pinned.length === 0) {
      failures.push({
        identity,
        kind: "unpinned",
        detail: `new diagnostic(s): ${render(actual)}`,
      });
    } else if (actual.length === 0) {
      failures.push({
        identity,
        kind: "resolved",
        detail: `pinned diagnostic(s) no longer occur — delete the pin: ${render(pinned)}`,
      });
    } else {
      failures.push({
        identity,
        kind: "drifted",
        detail: `expected ${render(pinned)}; measured ${render(actual)}`,
      });
    }
  }
  for (const identity of Object.keys(pins).sort()) {
    if (computed.has(identity)) continue;
    failures.push({
      identity,
      kind: "ghost",
      detail: "pin names a translation/surface pair that no longer exists — delete the pin",
    });
  }
  return failures;
}

if (import.meta.main) {
  const { loadTranslations } = await import("./example-store-io");
  const { exampleSurfaces } = await import("./example-surfaces");
  const surfaces = await exampleSurfaces();
  const { computed, timings, entries } = runGate(loadTranslations(), surfaces);
  // Pins measured on a surface that cannot see its own declarations record
  // `any` as agreement, which is how the materialized surfaces stayed silent
  // through every previous re-pin. Refuse to write rather than record it again.
  const unresolved = [...entries]
    .filter(([, diagnostics]) => diagnostics.length > 0)
    .map(([id, diagnostics]) => `  ${id}: ${render(diagnostics)}`);
  if (unresolved.length > 0) {
    process.stderr.write(
      `refusing to re-pin — ${unresolved.length} surface(s) cannot resolve their own entry:\n${unresolved.join("\n")}\n`,
    );
    process.exit(1);
  }
  const pins = pinsFrom(computed);
  writeFileSync(PINS_PATH, `${JSON.stringify(pins, null, 2)}\n`);
  const total = timings.reduce((sum, timing) => sum + timing.ms, 0);
  process.stdout.write(
    `wrote ${PINS_PATH}: ${Object.keys(pins).length} pinned of ${computed.size} pairs across ${timings.length} surfaces (${total}ms)\n`,
  );
}
