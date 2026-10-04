import { existsSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { inspect } from "node:util";
import * as vm from "node:vm";
import { HSM_MODULE_SPECIFIER, hsmSourceFiles } from "@defold-typescript/transpiler";
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

export interface LoadedMachine {
  readonly name: string;
  readonly key: string | undefined;
  readonly config: unknown;
  readonly machine: unknown;
}

export type EngineEntry =
  | { readonly kind: "engine"; readonly api: string; readonly args: readonly unknown[] }
  | { readonly kind: "print"; readonly text: string };

export type EngineSink = (entry: EngineEntry) => void;

export interface MachineEngine {
  setSink(sink: EngineSink | undefined): void;
}

export interface MachineLoad {
  readonly files: readonly LoadedFile[];
  readonly machines: readonly LoadedMachine[];
  readonly engine: MachineEngine;
  /** Reruns the project files in the same hsm runtime; a failure keeps the last good load. */
  reload(): void;
}

export interface LoadMachinesOptions {
  readonly hsmSourceDir: string;
  /** Sees each config before hsm does; what it returns is what hsm defines. */
  readonly onDefine?: (key: string | undefined, config: unknown) => unknown;
}

export class HsmViewLoadError extends Error {
  override readonly name = "HsmViewLoadError";
}

const TAG = "__hsmLoc";
const MODULE_PARAMS = new Set(["require", "module", "exports", TAG]);
const TYPES_PACKAGE = "@defold-typescript/types";
const LOCATION = Symbol("hsm-view location");

const locationCache = new Map<string, SourceLocation>();

let realmGlobals: ReadonlySet<string> | undefined;

// The builtins of a fresh realm, not this process's `globalThis`: a name some other module set
// there (a test's Defold global, say) must still get a stub.
function builtinGlobals(): ReadonlySet<string> {
  realmGlobals ??= new Set(
    vm.runInNewContext("Object.getOwnPropertyNames(globalThis)") as string[],
  );
  return realmGlobals;
}

function tagLocation(value: object, meta: string): object {
  let location = locationCache.get(meta);
  if (location === undefined) {
    location = JSON.parse(meta) as SourceLocation;
    locationCache.set(meta, location);
  }
  Object.defineProperty(value, LOCATION, { value: location, configurable: true });
  return value;
}

/** The location a project file's literal was tagged with, or undefined for anything else. */
export function locationOf(value: unknown): SourceLocation | undefined {
  if (typeof value !== "object" || value === null) {
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

// Wraps each object and array literal as `__hsmLoc(<literal>, <location json>)`.
function locationTagger(file: string): ts.TransformerFactory<ts.SourceFile> {
  return (context) => (source) => {
    const factory = context.factory;
    const facts = literalFacts(source);
    const visit = (node: ts.Node): ts.Node => {
      const visited = ts.visitEachChild(node, visit, context);
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
    throw new HsmViewLoadError(`${file}${at}: ${message}`);
  }
  return output.outputText;
}

function describeThrown(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

function luaString(value: unknown): string {
  return value === undefined || value === null ? "nil" : String(value);
}

interface ModuleRecord {
  exports: Record<string, unknown>;
}

interface Definition {
  readonly key: string | undefined;
  readonly config: unknown;
  readonly machine: unknown;
}

interface Run {
  readonly modules: Map<string, ModuleRecord>;
  readonly files: LoadedFile[];
  readonly definitions: Definition[];
}

interface LoadState {
  readonly files: readonly LoadedFile[];
  readonly machines: readonly LoadedMachine[];
}

type DefineMachine = (key?: string) => (config: unknown) => unknown;

function isHsmSpecifier(specifier: string): boolean {
  return specifier === HSM_MODULE_SPECIFIER || specifier.startsWith(`${HSM_MODULE_SPECIFIER}/`);
}

function isFile(file: string): boolean {
  return existsSync(file) && statSync(file).isFile();
}

/**
 * Runs `file` and the project files it imports with Defold globals stubbed, recording every
 * `defineMachine` call. The hsm modules run once per load, so `reload` rebinds keyed machines.
 */
export function loadMachines(file: string, options: LoadMachinesOptions): MachineLoad {
  const entry = path.resolve(file);
  const hsmDir = path.resolve(options.hsmSourceDir);
  const hsmFiles = new Set(hsmSourceFiles(hsmDir));
  const onDefine = options.onDefine ?? ((_key: string | undefined, config: unknown) => config);
  const hsmModules = new Map<string, ModuleRecord>();
  const stubs = new Map<string, unknown>();
  let sink: EngineSink | undefined;
  let current: Run | undefined;

  const emit = (entry: EngineEntry): void => {
    sink?.(entry);
  };

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

  const recordingStub = (name: string): unknown => {
    const cached = stubs.get(name);
    if (cached !== undefined) {
      return cached;
    }
    const stub: unknown = new Proxy(() => undefined, {
      get: (_target, member) => {
        if (
          member === Symbol.toPrimitive ||
          member === "toString" ||
          member === "valueOf" ||
          member === "toJSON"
        ) {
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

  const stubFor = (name: string): unknown =>
    Object.hasOwn(builtins, name) ? builtins[name] : recordingStub(name);

  const wrapDefine = (record: ModuleRecord): void => {
    const define = record.exports.defineMachine as DefineMachine;
    record.exports.defineMachine = (key?: string) => {
      const defineWithKey = define(key);
      return (config: unknown) => {
        const machine = defineWithKey(onDefine(key, config));
        current?.definitions.push({ key, config, machine });
        return machine;
      };
    };
  };

  const resolveImport = (importer: string, specifier: string): string | undefined => {
    if (isHsmSpecifier(specifier)) {
      const name =
        specifier === HSM_MODULE_SPECIFIER
          ? "index"
          : specifier.slice(HSM_MODULE_SPECIFIER.length + 1);
      return hsmFiles.has(`${name}.ts`) ? path.join(hsmDir, `${name}.ts`) : undefined;
    }
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      const base = path.resolve(path.dirname(importer), specifier);
      return [`${base}.ts`, path.join(base, "index.ts")].find(isFile);
    }
    return undefined;
  };

  const requireFrom = (importer: string, specifier: string): unknown => {
    if (
      !isHsmSpecifier(specifier) &&
      (specifier === TYPES_PACKAGE || specifier.startsWith(`${TYPES_PACKAGE}/`))
    ) {
      return {};
    }
    const resolved = resolveImport(importer, specifier);
    if (resolved === undefined) {
      throw new HsmViewLoadError(
        `${importer}: cannot load "${specifier}"; only project files and ${TYPES_PACKAGE} modules can run here`,
      );
    }
    return loadModule(resolved);
  };

  const loadModule = (file: string): Record<string, unknown> => {
    const isHsm = path.dirname(file) === hsmDir;
    const run = current;
    if (run === undefined) {
      throw new Error("hsm-view: a module loaded outside a run");
    }
    const modules = isHsm ? hsmModules : run.modules;
    const cached = modules.get(file);
    if (cached !== undefined) {
      return cached.exports;
    }
    const text = readFileSync(file, "utf8");
    const record: ModuleRecord = { exports: {} };
    modules.set(file, record);
    if (!isHsm) {
      run.files.push({ path: file, text });
    }
    try {
      const js = compile(file, text, !isHsm);
      const stubNames = freeGlobals(js).filter(
        (name) =>
          !MODULE_PARAMS.has(name) &&
          (Object.hasOwn(builtins, name) || !builtinGlobals().has(name)),
      );
      const body = new Function("require", "module", "exports", TAG, ...stubNames, js);
      body(
        (specifier: string) => requireFrom(file, specifier),
        record,
        record.exports,
        tagLocation,
        ...stubNames.map(stubFor),
      );
    } catch (thrown) {
      if (isHsm) {
        modules.delete(file);
      }
      if (thrown instanceof HsmViewLoadError) {
        throw thrown;
      }
      // hsm reports a bad config by throwing a string.
      throw new HsmViewLoadError(`${file}: ${describeThrown(thrown)}`);
    }
    if (isHsm && path.basename(file) === "index.ts") {
      wrapDefine(record);
    }
    return record.exports;
  };

  const exportName = (modules: Iterable<ModuleRecord>, machine: unknown): string | undefined => {
    for (const { exports } of modules) {
      const name = Object.keys(exports).find((key) => exports[key] === machine);
      if (name !== undefined) {
        return name;
      }
    }
    return undefined;
  };

  const run = (): LoadState => {
    const next: Run = { modules: new Map(), files: [], definitions: [] };
    const previous = current;
    current = next;
    try {
      loadModule(entry);
    } finally {
      current = previous;
    }
    let unnamed = 0;
    const machines = next.definitions.map(({ key, config, machine }) => ({
      name: key ?? exportName(next.modules.values(), machine) ?? `machine-${++unnamed}`,
      key,
      config,
      machine,
    }));
    return { files: next.files, machines };
  };

  let state = run();
  return {
    get files() {
      return state.files;
    },
    get machines() {
      return state.machines;
    },
    engine: {
      setSink(next) {
        sink = next;
      },
    },
    reload() {
      state = run();
    },
  };
}
