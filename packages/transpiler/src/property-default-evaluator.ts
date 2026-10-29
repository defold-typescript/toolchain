import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RESOURCE_PROPERTY_MARKERS } from "./lifecycle-erasure";
import { decodeWire, encodeWire, type PropertyEvaluationRequest } from "./property-default-wire";

const TIMEOUT_MS = 1000;
const MEMORY_LIMIT_BYTES = 16 * 1024 * 1024;
const TIMEOUT_MESSAGE = `computing the property defaults took longer than ${TIMEOUT_MS} ms (timeout)`;

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

// The child's own limit ends a Lua loop at TIMEOUT_MS; the kill is for time
// spent in C code, and its margin keeps a slow start under load from reading
// as a timeout.
const KILL_AFTER_MS = TIMEOUT_MS + 2000;

let childEntry: string | undefined;

// Each evaluation runs wasmoon in a child process, so a consumer that never
// evaluates (the editor plugin) never pulls in the WebAssembly module.
export async function loadPropertyEvaluator(): Promise<void> {
  if (childEntry !== undefined) {
    return;
  }
  const name = import.meta.url.endsWith(".ts")
    ? "./property-default-child.ts"
    : "./property-default-child.js";
  const entry = fileURLToPath(new URL(name, import.meta.url));
  if (!existsSync(entry)) {
    throw new Error(`the property evaluator entry is missing: ${entry}`);
  }
  childEntry = entry;
}

const RESOURCE_KINDS = [...RESOURCE_PROPERTY_MARKERS].map((marker) =>
  marker.slice("resource.".length),
);

export function evaluatePropertyDefaults(input: PropertyEvaluationInput): PropertyEvaluationResult {
  if (childEntry === undefined) {
    throw new Error("loadPropertyEvaluator() must complete before properties are evaluated");
  }
  const chunks: Record<string, string> = {};
  for (const [name, source] of Object.entries(input.chunks)) {
    chunks[name] = floatLongIntegerLiterals(source);
  }
  const request: PropertyEvaluationRequest = {
    chunks,
    entry: input.entry,
    names: input.names,
    resourceKinds: RESOURCE_KINDS,
    timeoutMs: TIMEOUT_MS,
    memoryLimitBytes: MEMORY_LIMIT_BYTES,
  };
  const child = spawnSync(process.execPath, [childEntry], {
    input: encodeWire(request),
    encoding: "utf8",
    timeout: KILL_AFTER_MS,
    killSignal: "SIGKILL",
    maxBuffer: 4 * MEMORY_LIMIT_BYTES,
  });
  // An output past maxBuffer also ends in SIGKILL, so only the error code or
  // a kill with no error reads as the deadline.
  const spawnError = child.error as NodeJS.ErrnoException | undefined;
  if (
    spawnError?.code === "ETIMEDOUT" ||
    (spawnError === undefined && child.signal === "SIGKILL")
  ) {
    return failure(TIMEOUT_MESSAGE);
  }
  if (spawnError !== undefined || child.status !== 0) {
    const ended =
      child.signal !== null ? `signal ${child.signal}` : `exit status ${String(child.status)}`;
    const detail = spawnError?.message ?? firstLine(child.stderr) ?? ended;
    return failure(`the property evaluator failed: ${detail}`);
  }
  return readOutcome(decodeWire(child.stdout), input.names);
}

function firstLine(text: string): string | undefined {
  return text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "");
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
    return TIMEOUT_MESSAGE;
  }
  if (message === "not enough memory") {
    return `computing the property defaults used more than ${MEMORY_LIMIT_BYTES / 1024 / 1024} MB of memory`;
  }
  return message;
}
