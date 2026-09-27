import type { TranspileDiagnostic } from "@defold-typescript/transpiler";
import type { BindingSlot, LuaKind } from "../../types/scripts/engine-binding-extract";
import type { DeclaredKinds } from "../../types/scripts/lua-kind";
import type { ProbeCall } from "./witness";

export type NegativeWitness =
  | { readonly kind: LuaKind; readonly expression: string }
  | { readonly skipped: string };

const EXPRESSIONS: Readonly<Partial<Record<LuaKind, string>>> = {
  table: "{}",
  number: "1",
  boolean: "true",
  function: "() => {}",
};

// A value slot is refused a table first; a slot that takes a table or a
// function is refused a number, which no table-reading binding converts.
const VALUE_ORDER: readonly LuaKind[] = ["table", "number", "boolean", "function"];
const CONTAINER_ORDER: readonly LuaKind[] = ["number", "boolean", "table", "function"];

// Lua converts a number argument to a string and a numeric string to a number
// wherever the binding reads the other.
function coerced(kinds: readonly LuaKind[]): Set<LuaKind> {
  const out = new Set(kinds);
  if (out.has("string")) out.add("number");
  if (out.has("number")) out.add("string");
  return out;
}

// A kind the binding refuses for this slot, outside both what it reads and what
// Lua converts into that, or why the slot has no such kind.
export function negativeWitness(
  declared: DeclaredKinds,
  extracted: BindingSlot | undefined,
): NegativeWitness {
  if (declared === "any") return { skipped: "declared any" };
  if (extracted === undefined) return { skipped: "the binding reads no such slot" };
  if (extracted.manual !== undefined) return { skipped: `manual: ${extracted.manual}` };
  if (extracted.unchecked) return { skipped: "the binding converts any kind instead of raising" };
  const accepted = coerced(extracted.kinds);
  const order = accepted.has("table") || accepted.has("function") ? CONTAINER_ORDER : VALUE_ORDER;
  const kind = order.find((candidate) => !accepted.has(candidate));
  if (kind === undefined) return { skipped: "the binding accepts every kind" };
  return { kind, expression: EXPRESSIONS[kind] as string };
}

const UNUSED_DIRECTIVE = "Unused '@ts-expect-error' directive";

// The probe call a diagnostic falls in: the nearest `probe(...)` line at or
// above it in the generated file.
function callAt(source: string, calls: readonly ProbeCall[], line: number): ProbeCall | undefined {
  const lines = source.split("\n");
  for (let i = Math.min(line, lines.length) - 1; i >= 0; i--) {
    const match = /^\s*probe\("([^"]+)", "([^"]+)"/.exec(lines[i] ?? "");
    if (match) return calls.find((call) => call.name === match[1] && call.variant === match[2]);
  }
  return undefined;
}

// A type diagnostic in a generated probe file, named after the call it falls
// in. An unused `@ts-expect-error` on a negative call means the declaration
// accepts the kind the binding refuses.
export function describeDiagnostic(
  source: string,
  calls: readonly ProbeCall[],
  diagnostic: TranspileDiagnostic,
): string {
  const call = diagnostic.line === undefined ? undefined : callAt(source, calls, diagnostic.line);
  const where =
    call === undefined ? `${diagnostic.file}:${diagnostic.line}` : `${call.name}:${call.variant}`;
  if (call?.negative !== undefined && diagnostic.message.includes(UNUSED_DIRECTIVE)) {
    const { slot, kind, binding } = call.negative;
    const article = /^[aeiou]/.test(kind) ? "an" : "a";
    return `${where} slot ${slot} too loose: the declaration accepts ${article} ${kind}, which ${binding} rejects`;
  }
  return `${where}: ${diagnostic.message}`;
}
