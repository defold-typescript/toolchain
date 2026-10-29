import type { LuaEngine, LuaLibraries, LuaWasm } from "wasmoon";
import { RESOURCE_PROPERTY_MARKERS } from "./lifecycle-erasure";
import { PROPERTY_DEFAULT_EVALUATION } from "./property-default-prelude";

// The global a script's entry chunk assigns its properties value to; the
// evaluator reads it after `require(entry)`.
export const PROPERTIES_CAPTURE_GLOBAL = "____properties";

const TIMEOUT_MS = 1000;
const MEMORY_LIMIT_BYTES = 16 * 1024 * 1024;

export type PropertyValue =
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "string" | "hash" | "url"; readonly value: string }
  | { readonly kind: "vector3" | "vector4" | "quat"; readonly value: readonly number[] }
  | { readonly kind: "resource"; readonly resource: string; readonly path?: string };

export type PropertyEvaluationResult =
  | { readonly ok: true; readonly values: ReadonlyMap<string, PropertyValue> }
  | { readonly ok: false; readonly error: { readonly message: string; readonly name?: string } };

export interface PropertyEvaluationInput {
  // Lua source keyed by the name its `require` uses (`src.config.defaults`).
  readonly chunks: Readonly<Record<string, string>>;
  readonly entry: string;
  readonly names: readonly string[];
}

interface EvaluatorRuntime {
  readonly Engine: typeof LuaEngine;
  readonly libraries: readonly LuaLibraries[];
  readonly module: LuaWasm;
}

let runtime: EvaluatorRuntime | undefined;
let loading: Promise<void> | undefined;

// wasmoon loads here, on first use, so a consumer that never evaluates (the
// editor plugin) never pulls in the WebAssembly module.
export function loadPropertyEvaluator(): Promise<void> {
  if (runtime !== undefined) {
    return Promise.resolve();
  }
  loading ??= (async () => {
    const wasmoon = await import("wasmoon");
    const module = await wasmoon.LuaWasm.initialize();
    runtime = {
      Engine: wasmoon.LuaEngine,
      libraries: [
        wasmoon.LuaLibraries.Base,
        wasmoon.LuaLibraries.Coroutine,
        wasmoon.LuaLibraries.Table,
        wasmoon.LuaLibraries.String,
        wasmoon.LuaLibraries.Math,
      ],
      module,
    };
  })().finally(() => {
    loading = undefined;
  });
  return loading;
}

const RESOURCE_KINDS = [...RESOURCE_PROPERTY_MARKERS].map((marker) =>
  marker.slice("resource.".length),
);

export function evaluatePropertyDefaults(input: PropertyEvaluationInput): PropertyEvaluationResult {
  if (runtime === undefined) {
    throw new Error("loadPropertyEvaluator() must complete before properties are evaluated");
  }
  const engine = new runtime.Engine(runtime.module, {
    openStandardLibs: false,
    injectObjects: false,
    enableProxy: false,
    traceAllocations: true,
    functionTimeout: TIMEOUT_MS,
  });
  try {
    for (const library of runtime.libraries) {
      engine.global.loadLibrary(library);
    }
    engine.global.setMemoryMax(MEMORY_LIMIT_BYTES);
    const evaluate = engine.doStringSync(PROPERTY_DEFAULT_EVALUATION) as (
      chunks: Record<string, string>,
      resourceKinds: readonly string[],
      entry: string,
      names: readonly string[],
    ) => unknown;
    const chunks: Record<string, string> = {};
    for (const [name, source] of Object.entries(input.chunks)) {
      chunks[name] = floatLongIntegerLiterals(source);
    }
    const outcome = evaluate(chunks, RESOURCE_KINDS, input.entry, [...input.names]);
    return readOutcome(outcome, input.names);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    return failure(text.split("\n", 1)[0] ?? text);
  } finally {
    engine.global.close();
  }
}

const LONG_INTEGER = /^\d{15,}$/;
const HEX_OR_POINT = /[0-9a-fA-F.]/;
const IDENTIFIER_START = /[A-Za-z_]/;
const IDENTIFIER_PART = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;

// Lua 5.4 reads a decimal integer literal as an integer and prints all of its
// digits; LuaJIT holds a double and prints 14 significant digits. TSTL joins a
// numeric literal into a string with a bare `..`, so a literal of 15 or more
// digits is rewritten as a float literal, which 5.4 prints the way LuaJIT does.
function floatLongIntegerLiterals(source: string): string {
  let output = "";
  let copied = 0;
  let index = 0;
  while (index < source.length) {
    const char = source.charAt(index);
    const next = source.charAt(index + 1);
    if (char === "-" && next === "-") {
      const level = longBracketLevel(source, index + 2);
      index =
        level === undefined ? lineEnd(source, index + 2) : longBracketEnd(source, index + 2, level);
    } else if (char === '"' || char === "'") {
      index = quotedEnd(source, index);
    } else if (char === "[" && longBracketLevel(source, index) !== undefined) {
      index = longBracketEnd(source, index, longBracketLevel(source, index) ?? 0);
    } else if (IDENTIFIER_START.test(char)) {
      index += 1;
      while (IDENTIFIER_PART.test(source.charAt(index))) {
        index += 1;
      }
    } else if (DIGIT.test(char) || (char === "." && DIGIT.test(next))) {
      const end = numeralEnd(source, index);
      if (LONG_INTEGER.test(source.slice(index, end))) {
        output += `${source.slice(copied, end)}.0`;
        copied = end;
      }
      index = end;
    } else {
      index += char === "." && next === "." ? 2 : 1;
    }
  }
  return output + source.slice(copied);
}

function longBracketLevel(source: string, start: number): number | undefined {
  if (source.charAt(start) !== "[") {
    return undefined;
  }
  let index = start + 1;
  while (source.charAt(index) === "=") {
    index += 1;
  }
  return source.charAt(index) === "[" ? index - start - 1 : undefined;
}

function longBracketEnd(source: string, start: number, level: number): number {
  const close = `]${"=".repeat(level)}]`;
  const found = source.indexOf(close, start + level + 2);
  return found === -1 ? source.length : found + close.length;
}

function lineEnd(source: string, start: number): number {
  const found = source.indexOf("\n", start);
  return found === -1 ? source.length : found;
}

function quotedEnd(source: string, start: number): number {
  const quote = source.charAt(start);
  let index = start + 1;
  while (index < source.length) {
    const char = source.charAt(index);
    if (char === "\\") {
      index += 2;
    } else if (char === quote || char === "\n") {
      return index + 1;
    } else {
      index += 1;
    }
  }
  return source.length;
}

// Mirrors `read_numeral` in Lua 5.4's llex.c: hex digits and points continue a
// numeral, and an exponent marker may take a sign.
function numeralEnd(source: string, start: number): number {
  let index = start;
  let exponent = /[Ee]/;
  if (source.charAt(index) === "0" && /[xX]/.test(source.charAt(index + 1))) {
    exponent = /[Pp]/;
    index += 2;
  }
  while (index < source.length) {
    const char = source.charAt(index);
    if (exponent.test(char)) {
      index += /[+-]/.test(source.charAt(index + 1)) ? 2 : 1;
    } else if (HEX_OR_POINT.test(char)) {
      index += 1;
    } else {
      break;
    }
  }
  return index;
}

interface LuaOutcome {
  readonly values?: readonly LuaRecord[] | Readonly<Record<string, never>>;
  readonly error?: string;
  readonly name?: string;
}

interface LuaRecord {
  readonly kind: PropertyValue["kind"];
  readonly value?: unknown;
  readonly resource?: string;
  readonly path?: string;
}

function readOutcome(outcome: unknown, names: readonly string[]): PropertyEvaluationResult {
  const { values, error, name } = outcome as LuaOutcome;
  if (error !== undefined) {
    return failure(error, name);
  }
  const records = Array.isArray(values) ? (values as readonly LuaRecord[]) : [];
  const result = new Map<string, PropertyValue>();
  names.forEach((propertyName, index) => {
    const record = records[index];
    if (record !== undefined) {
      result.set(propertyName, toPropertyValue(record));
    }
  });
  return { ok: true, values: result };
}

function toPropertyValue(record: LuaRecord): PropertyValue {
  switch (record.kind) {
    case "resource":
      return {
        kind: "resource",
        resource: record.resource ?? "",
        ...(record.path !== undefined ? { path: record.path } : {}),
      };
    case "vector3":
    case "vector4":
    case "quat":
      return { kind: record.kind, value: [...(record.value as number[])] };
    case "number":
      return { kind: "number", value: record.value as number };
    case "boolean":
      return { kind: "boolean", value: record.value as boolean };
    default:
      return { kind: record.kind, value: record.value as string };
  }
}

function failure(message: string, name?: string): PropertyEvaluationResult {
  return {
    ok: false,
    error: { message: explainLimit(message), ...(name !== undefined ? { name } : {}) },
  };
}

function explainLimit(message: string): string {
  if (message.includes("timeout exceeded")) {
    return `computing the property defaults took longer than ${TIMEOUT_MS} ms (timeout)`;
  }
  if (message === "not enough memory") {
    return `computing the property defaults used more than ${MEMORY_LIMIT_BYTES / 1024 / 1024} MB of memory`;
  }
  return message;
}
