import { existsSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { inspect } from "node:util";
import * as vm from "node:vm";
import {
  BUNDLED_LIBRARIES,
  type BundledLibrary,
  librarySourceFiles,
} from "@defold-typescript/transpiler";
import * as ts from "typescript";
import { freeGlobals } from "./hsm-view-free-globals";

export interface SourceSpan {
  readonly start: number;
  readonly end: number;
}

/** Where an object or array literal was written, and where each of its keys or elements is. */
export interface SourceLocation extends SourceSpan {
  readonly file: string;
  readonly keys: Readonly<Record<string, SourceSpan>>;
  /** The property name this literal is the value of, when it is one. */
  readonly keyOf: SourceSpan | undefined;
}

export interface LoadedFile {
  readonly path: string;
  readonly text: string;
}

export type EngineEntry =
  | { readonly kind: "engine"; readonly api: string; readonly args: readonly unknown[] }
  | { readonly kind: "print"; readonly text: string };

export type EngineSink = (entry: EngineEntry) => void;

export interface RunEngine {
  setSink(sink: EngineSink | undefined): void;
}

export interface ProjectLibrary {
  readonly library: BundledLibrary;
  readonly sourceDir: string;
}

export interface ProjectRunnerOptions {
  readonly libraries: readonly ProjectLibrary[];
  /** Called once per runner, after a library module loads; it may replace the module's exports. */
  readonly onLibraryModule?: (
    library: BundledLibrary,
    name: string,
    exports: Record<string, unknown>,
  ) => void;
  /**
   * Merged over `hash`, `print`, `pprint` and `tostring`. A plain-object value is a partial
   * namespace: a member it lacks is a logged stub.
   */
  readonly builtins?: Readonly<Record<string, unknown>>;
  /** What `@defold-typescript/types` exports at run time; every other subpath exports nothing. */
  readonly typesRoot?: Record<string, unknown>;
  /**
   * Tags each project file's object and array literals with where they were written, and runs
   * each call to a method named like an hsm builder statement under `currentSite`.
   */
  readonly tagLiterals: boolean;
}

export interface ProjectRun {
  readonly files: readonly LoadedFile[];
  /** Each project module's exports, by file. */
  readonly modules: ReadonlyMap<string, Record<string, unknown>>;
}

export interface ProjectRunner {
  /** Runs the entry and the project files it imports afresh; library modules keep their first run. */
  run(): ProjectRun;
  readonly engine: RunEngine;
}

export class ViewLoadError extends Error {
  override readonly name = "ViewLoadError";
}

const TAG = "__viewLoc";
const SITE = "__viewSite";
const MODULE_PARAMS = new Set(["require", "module", "exports", TAG, SITE]);
// The hsm builder statements whose rules `view` glows on the call that made them.
const STATEMENT_CALLS: ReadonlySet<string> = new Set(["on", "after", "every", "always", "update"]);
const TYPES_PACKAGE = "@defold-typescript/types";
const LOCATION = Symbol("view location");
// Lua's base `select` is no engine call, and ecs's `checkTokens` takes its Lua branch when
// `typeof select === "function"`, so a callable stub would count `undefined` tokens and check none.
const UNBOUND_GLOBALS: ReadonlySet<string> = new Set(["select"]);

const locationCache = new Map<string, SourceLocation>();

// The statement calls running now, innermost last.
const siteStack: SourceLocation[] = [];

let realmGlobals: ReadonlySet<string> | undefined;

// The builtins of a fresh realm, not this process's `globalThis`: a name some other module set
// there (a test's Defold global, say) must still get a stub.
function builtinGlobals(): ReadonlySet<string> {
  realmGlobals ??= new Set(
    vm.runInNewContext("Object.getOwnPropertyNames(globalThis)") as string[],
  );
  return realmGlobals;
}

function parseLocation(meta: string): SourceLocation {
  let location = locationCache.get(meta);
  if (location === undefined) {
    location = JSON.parse(meta) as SourceLocation;
    locationCache.set(meta, location);
  }
  return location;
}

/** Tags `value` with `location`, which `locationOf` then returns. */
export function setLocation(value: object, location: SourceLocation): void {
  Object.defineProperty(value, LOCATION, { value: location, configurable: true });
}

function tagLocation(value: object, meta: string): object {
  setLocation(value, parseLocation(meta));
  return value;
}

function atSite(meta: string, call: () => unknown): unknown {
  siteStack.push(parseLocation(meta));
  try {
    return call();
  } finally {
    siteStack.pop();
  }
}

/**
 * Where the innermost statement call running now was written, its `keyOf` the span from the
 * method name to the closing parenthesis; undefined outside one.
 */
export function currentSite(): SourceLocation | undefined {
  return siteStack.at(-1);
}

/** The location a project file's literal or statement entry was tagged with, or undefined. */
export function locationOf(value: unknown): SourceLocation | undefined {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return undefined;
  }
  return (value as { [LOCATION]?: SourceLocation })[LOCATION];
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function isLiteral(node: ts.Node): node is ts.ObjectLiteralExpression | ts.ArrayLiteralExpression {
  return ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node);
}

function nameSpan(
  name: ts.PropertyName,
  source: ts.SourceFile,
): { key: string; span: SourceSpan } | undefined {
  const start = name.getStart(source);
  const end = name.getEnd();
  if (ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) {
    return { key: name.text, span: { start: start + 1, end: end - 1 } };
  }
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isNumericLiteral(name)) {
    return { key: name.text, span: { start, end } };
  }
  return undefined;
}

function keySpans(
  literal: ts.ObjectLiteralExpression | ts.ArrayLiteralExpression,
  source: ts.SourceFile,
): Record<string, SourceSpan> {
  const keys: Record<string, SourceSpan> = {};
  if (ts.isArrayLiteralExpression(literal)) {
    for (const [index, element] of literal.elements.entries()) {
      // A spread's length is a runtime fact, so no later index can be placed.
      if (ts.isSpreadElement(element)) {
        break;
      }
      if (!ts.isOmittedExpression(element)) {
        keys[String(index)] = { start: element.getStart(source), end: element.getEnd() };
      }
    }
    return keys;
  }
  for (const property of literal.properties) {
    if (ts.isSpreadAssignment(property) || property.name === undefined) {
      continue;
    }
    const named = nameSpan(property.name, source);
    if (named !== undefined) {
      keys[named.key] = named.span;
    }
  }
  return keys;
}

interface LiteralFacts {
  readonly keyOf: Map<ts.Node, SourceSpan>;
  /** Literals written as destructuring assignment targets, which must stay patterns. */
  readonly targets: Set<ts.Node>;
}

function literalFacts(source: ts.SourceFile): LiteralFacts {
  const keyOf = new Map<ts.Node, SourceSpan>();
  const targets = new Set<ts.Node>();
  const markTarget = (expression: ts.Expression): void => {
    const target = unwrap(expression);
    if (ts.isObjectLiteralExpression(target)) {
      targets.add(target);
      for (const property of target.properties) {
        if (ts.isPropertyAssignment(property)) {
          markTarget(property.initializer);
        } else if (ts.isSpreadAssignment(property)) {
          markTarget(property.expression);
        }
      }
    } else if (ts.isArrayLiteralExpression(target)) {
      targets.add(target);
      for (const element of target.elements) {
        markTarget(ts.isSpreadElement(element) ? element.expression : element);
      }
    } else if (
      ts.isBinaryExpression(target) &&
      target.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      markTarget(target.left);
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node)) {
      const value = unwrap(node.initializer);
      const named = nameSpan(node.name, source);
      if (isLiteral(value) && named !== undefined) {
        keyOf.set(value, named.span);
      }
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      markTarget(node.left);
    } else if (
      (ts.isForOfStatement(node) || ts.isForInStatement(node)) &&
      !ts.isVariableDeclarationList(node.initializer)
    ) {
      markTarget(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { keyOf, targets };
}

// An `await` or `yield` cannot move into the thunk `__viewSite` runs.
function suspends(node: ts.Node): boolean {
  if (ts.isAwaitExpression(node) || ts.isYieldExpression(node)) {
    return true;
  }
  return (
    !ts.isFunctionLike(node) &&
    ts.forEachChild(node, (child) => suspends(child) || undefined) === true
  );
}

// The span from the method name to the closing parenthesis of a call such as `.on("HIT")`. A call
// inside an optional chain is left alone: the thunk would end the chain's short-circuit.
function statementSpan(node: ts.Node, source: ts.SourceFile): SourceSpan | undefined {
  if (!ts.isCallExpression(node) || ts.isOptionalChain(node)) {
    return undefined;
  }
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee) || !STATEMENT_CALLS.has(callee.name.text)) {
    return undefined;
  }
  return suspends(node) ? undefined : { start: callee.name.getStart(source), end: node.getEnd() };
}

// Wraps each object and array literal as `__viewLoc(<literal>, <location json>)`, and each
// statement call as `__viewSite(<location json>, () => <call>)`.
function locationTagger(file: string): ts.TransformerFactory<ts.SourceFile> {
  return (context) => (source) => {
    const factory = context.factory;
    const facts = literalFacts(source);
    const visit = (node: ts.Node): ts.Node => {
      const visited = ts.visitEachChild(node, visit, context);
      const site = statementSpan(node, source);
      if (site !== undefined) {
        const location: SourceLocation = { file, ...site, keys: {}, keyOf: site };
        return factory.createCallExpression(factory.createIdentifier(SITE), undefined, [
          factory.createStringLiteral(JSON.stringify(location)),
          factory.createArrowFunction(
            undefined,
            undefined,
            [],
            undefined,
            factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
            visited as ts.Expression,
          ),
        ]);
      }
      if (!isLiteral(node) || facts.targets.has(node)) {
        return visited;
      }
      const location: SourceLocation = {
        file,
        start: node.getStart(source),
        end: node.getEnd(),
        keys: keySpans(node, source),
        keyOf: facts.keyOf.get(node),
      };
      return factory.createCallExpression(factory.createIdentifier(TAG), undefined, [
        visited as ts.Expression,
        factory.createStringLiteral(JSON.stringify(location)),
      ]);
    };
    return ts.visitEachChild(source, visit, context);
  };
}

function compile(file: string, text: string, tag: boolean): string {
  const output = ts.transpileModule(text, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    ...(tag ? { transformers: { before: [locationTagger(file)] } } : {}),
  });
  const error = output.diagnostics?.find(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (error !== undefined) {
    const message = ts.flattenDiagnosticMessageText(error.messageText, "\n");
    const where =
      error.file !== undefined && error.start !== undefined
        ? error.file.getLineAndCharacterOfPosition(error.start)
        : undefined;
    const at = where === undefined ? "" : `:${where.line + 1}:${where.character + 1}`;
    throw new ViewLoadError(`${file}${at}: ${message}`);
  }
  return output.outputText;
}

function describeThrown(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

function luaString(value: unknown): string {
  return value === undefined || value === null ? "nil" : String(value);
}

function isFile(file: string): boolean {
  return existsSync(file) && statSync(file).isFile();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isLibrarySpecifier(library: BundledLibrary, specifier: string): boolean {
  return specifier === library.specifier || specifier.startsWith(`${library.specifier}/`);
}

// A stub stands in for a value code may print or interpolate, so it reads as its own name.
function isPrimitiveHook(member: string | symbol): boolean {
  return (
    member === Symbol.toPrimitive ||
    member === "toString" ||
    member === "valueOf" ||
    member === "toJSON"
  );
}

interface ModuleRecord {
  exports: Record<string, unknown>;
}

interface ResolvedLibrary {
  readonly library: BundledLibrary;
  readonly dir: string;
  readonly files: ReadonlySet<string>;
}

interface Run {
  readonly modules: Map<string, ModuleRecord>;
  readonly files: LoadedFile[];
}

/**
 * Runs `entry` and the project files it imports with Defold globals stubbed, against the given
 * library sources. A library module runs once per runner, so a second `run` rebinds what the
 * project's files register with it, as a game's hot reload does.
 */
export function createProjectRunner(entry: string, options: ProjectRunnerOptions): ProjectRunner {
  const entryFile = path.resolve(entry);
  const libraries: ResolvedLibrary[] = options.libraries.map(({ library, sourceDir }) => {
    const dir = path.resolve(sourceDir);
    return { library, dir, files: new Set(librarySourceFiles(dir)) };
  });
  const libraryModules = new Map<string, ModuleRecord>();
  const stubs = new Map<string, unknown>();
  let sink: EngineSink | undefined;
  let current: Run | undefined;

  const emit = (entry: EngineEntry): void => {
    sink?.(entry);
  };

  const recordingStub = (name: string): unknown => {
    const cached = stubs.get(name);
    if (cached !== undefined) {
      return cached;
    }
    const stub: unknown = new Proxy(() => undefined, {
      get: (_target, member) => {
        if (isPrimitiveHook(member)) {
          return () => name;
        }
        if (typeof member === "symbol" || member === "then") {
          return undefined;
        }
        return recordingStub(`${name}.${member}`);
      },
      apply: (_target, _self, args: unknown[]) => {
        emit({ kind: "engine", api: name, args });
        return undefined;
      },
      set: () => true,
    });
    stubs.set(name, stub);
    return stub;
  };

  const partialNamespace = (name: string, members: Record<string, unknown>): unknown =>
    new Proxy(members, {
      get: (target, member) => {
        if (Object.hasOwn(target, member)) {
          return target[member as string];
        }
        if (isPrimitiveHook(member)) {
          return () => name;
        }
        if (typeof member === "symbol" || member === "then") {
          return undefined;
        }
        return recordingStub(`${name}.${member}`);
      },
    });

  const builtins: Record<string, unknown> = {
    hash: (value: unknown) => `hash: [${luaString(value)}]`,
    tostring: luaString,
    print: (...args: unknown[]) => emit({ kind: "print", text: args.map(luaString).join("\t") }),
    pprint: (...args: unknown[]) =>
      emit({
        kind: "print",
        text: args
          .map((value) =>
            typeof value === "object" && value !== null ? inspect(value) : luaString(value),
          )
          .join("\t"),
      }),
  };
  for (const [name, value] of Object.entries(options.builtins ?? {})) {
    builtins[name] = isPlainObject(value) ? partialNamespace(name, value) : value;
  }

  const stubFor = (name: string): unknown => {
    if (Object.hasOwn(builtins, name)) {
      return builtins[name];
    }
    return UNBOUND_GLOBALS.has(name) ? undefined : recordingStub(name);
  };

  const libraryOf = (file: string): ResolvedLibrary | undefined => {
    const dir = path.dirname(file);
    return libraries.find((library) => library.dir === dir);
  };

  const resolveImport = (importer: string, specifier: string): string | undefined => {
    const bundled = BUNDLED_LIBRARIES.find((library) => isLibrarySpecifier(library, specifier));
    if (bundled !== undefined) {
      const resolved = libraries.find(({ library }) => library.id === bundled.id);
      if (resolved === undefined) {
        return undefined;
      }
      const name =
        specifier === bundled.specifier ? "index" : specifier.slice(bundled.specifier.length + 1);
      return resolved.files.has(`${name}.ts`) ? path.join(resolved.dir, `${name}.ts`) : undefined;
    }
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      const base = path.resolve(path.dirname(importer), specifier);
      return [`${base}.ts`, path.join(base, "index.ts")].find(isFile);
    }
    return undefined;
  };

  const requireFrom = (importer: string, specifier: string): unknown => {
    const isLibrary = BUNDLED_LIBRARIES.some((library) => isLibrarySpecifier(library, specifier));
    if (!isLibrary && specifier === TYPES_PACKAGE) {
      return options.typesRoot ?? {};
    }
    if (!isLibrary && specifier.startsWith(`${TYPES_PACKAGE}/`)) {
      return {};
    }
    const resolved = resolveImport(importer, specifier);
    if (resolved === undefined) {
      throw new ViewLoadError(
        `${importer}: cannot load "${specifier}"; only project files and ${TYPES_PACKAGE} modules can run here`,
      );
    }
    return loadModule(resolved);
  };

  const loadModule = (file: string): Record<string, unknown> => {
    const library = libraryOf(file);
    const run = current;
    if (run === undefined) {
      throw new Error("view: a module loaded outside a run");
    }
    const modules = library === undefined ? run.modules : libraryModules;
    const cached = modules.get(file);
    if (cached !== undefined) {
      return cached.exports;
    }
    const text = readFileSync(file, "utf8");
    const record: ModuleRecord = { exports: {} };
    modules.set(file, record);
    if (library === undefined) {
      run.files.push({ path: file, text });
    }
    try {
      const js = compile(file, text, library === undefined && options.tagLiterals);
      const stubNames = freeGlobals(js).filter(
        (name) =>
          !MODULE_PARAMS.has(name) &&
          (Object.hasOwn(builtins, name) || !builtinGlobals().has(name)),
      );
      const body = new Function("require", "module", "exports", TAG, SITE, ...stubNames, js);
      body(
        (specifier: string) => requireFrom(file, specifier),
        record,
        record.exports,
        tagLocation,
        atSite,
        ...stubNames.map(stubFor),
      );
    } catch (thrown) {
      if (library !== undefined) {
        modules.delete(file);
      }
      if (thrown instanceof ViewLoadError) {
        throw thrown;
      }
      // hsm reports a bad config by throwing a string.
      throw new ViewLoadError(`${file}: ${describeThrown(thrown)}`);
    }
    if (library !== undefined) {
      options.onLibraryModule?.(library.library, path.basename(file, ".ts"), record.exports);
    }
    return record.exports;
  };

  return {
    run() {
      const next: Run = { modules: new Map(), files: [] };
      const previous = current;
      current = next;
      try {
        loadModule(entryFile);
      } finally {
        current = previous;
      }
      const modules = new Map<string, Record<string, unknown>>();
      for (const [file, record] of next.modules) {
        modules.set(file, record.exports);
      }
      return { files: next.files, modules };
    },
    engine: {
      setSink(next) {
        sink = next;
      },
    },
  };
}
