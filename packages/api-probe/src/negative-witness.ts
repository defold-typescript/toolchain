import type { TranspileDiagnostic } from "@defold-typescript/transpiler";
import type { BindingSlot, LuaKind } from "../../types/scripts/engine-binding-extract";
import { readVerdicts, type Verdict } from "../../types/scripts/engine-binding-verdicts";
import type { DeclaredKinds } from "../../types/scripts/lua-kind";
import type { ApiTarget } from "../../types/scripts/regen";
import { ACCEPTED_WITNESS_OVERRIDES, ACCEPTED_WITNESSES } from "./contexts";
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

// Why a slot gets no witness call in either direction.
function unprobed(declared: DeclaredKinds, extracted: BindingSlot | undefined): string | undefined {
  if (declared === "any") return "declared any";
  if (extracted === undefined) return "the binding reads no such slot";
  if (extracted.manual !== undefined) return `manual: ${extracted.manual}`;
  if (extracted.unchecked) return "the binding converts any kind instead of raising";
  return undefined;
}

// A kind the binding refuses for this slot, outside both what it reads and what
// Lua converts into that, or why the slot has no such kind.
export function negativeWitness(
  declared: DeclaredKinds,
  extracted: BindingSlot | undefined,
): NegativeWitness {
  const skipped = unprobed(declared, extracted);
  if (skipped !== undefined) return { skipped };
  const accepted = coerced((extracted as BindingSlot).kinds);
  const order = accepted.has("table") || accepted.has("function") ? CONTAINER_ORDER : VALUE_ORDER;
  const kind = order.find((candidate) => !accepted.has(candidate));
  if (kind === undefined) return { skipped: "the binding accepts every kind" };
  return { kind, expression: EXPRESSIONS[kind] as string };
}

export interface AcceptedWitness {
  readonly kind: LuaKind;
  readonly expression: string;
  // False when the declaration leaves the kind out: the static too-narrow rule.
  readonly declared: boolean;
}

export type AcceptedWitnesses =
  | {
      readonly witnesses: readonly AcceptedWitness[];
      readonly missing: readonly { readonly kind: LuaKind; readonly reason: string }[];
    }
  | { readonly skipped: string };

function article(kind: string): string {
  return /^[aeio]/.test(kind) ? "an" : "a";
}

// One value per kind the binding reads for this slot. Only kinds it reads
// directly count: a kind Lua converts into one of them proves nothing about the
// binding. `derive` builds a value from the slot's positive argument or
// declared type, which a bare default may not satisfy (an id that must name a
// real object, a branded constant, a table with required fields).
export function acceptedWitnesses(
  declared: DeclaredKinds,
  extracted: BindingSlot | undefined,
  fqn = "",
  derive: (kind: LuaKind, declared: boolean) => string | undefined = () => undefined,
): AcceptedWitnesses {
  const skipped = unprobed(declared, extracted);
  if (skipped !== undefined) return { skipped };
  const slot = extracted as BindingSlot;
  const witnesses: AcceptedWitness[] = [];
  const missing: { kind: LuaKind; reason: string }[] = [];
  for (const kind of slot.kinds) {
    if (kind === "nil") continue;
    const accepts = (declared as readonly string[]).includes(kind);
    const expression =
      ACCEPTED_WITNESS_OVERRIDES[`${fqn}:${slot.index}:${kind}`] ??
      derive(kind, accepts) ??
      ACCEPTED_WITNESSES[kind];
    if (expression === undefined) {
      missing.push({ kind, reason: `no accepted witness for ${article(kind)} ${kind}` });
      continue;
    }
    witnesses.push({ kind, expression, declared: accepts });
  }
  return { witnesses, missing };
}

let verdicts: Readonly<Record<string, Verdict>> | undefined;

// The accepted too-narrow verdict recording why the declaration of this slot
// leaves out a kind its binding reads, keyed as the static verdict gate keys it.
export function narrowingVerdict(target: ApiTarget, fqn: string, slot: number): string | undefined {
  verdicts ??= readVerdicts();
  const suffix = `${fqn}:too-narrow:${slot}`;
  return [`${target.id}:${suffix}`, `*:${suffix}`].find(
    (key) => verdicts?.[key]?.verdict === "accepted",
  );
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
// accepts the kind the binding refuses; a type error in an accepted call means
// it rejects a kind the binding reads.
export function describeDiagnostic(
  source: string,
  calls: readonly ProbeCall[],
  diagnostic: TranspileDiagnostic,
): string {
  const call = diagnostic.line === undefined ? undefined : callAt(source, calls, diagnostic.line);
  const where =
    call === undefined ? `${diagnostic.file}:${diagnostic.line}` : `${call.name}:${call.variant}`;
  const unused = diagnostic.message.includes(UNUSED_DIRECTIVE);
  if (call?.witness?.expect === "raise" && unused) {
    const { slot, kind, binding } = call.witness;
    return `${where} slot ${slot} too loose: the declaration accepts ${article(kind)} ${kind}, which ${binding} rejects`;
  }
  if (call?.witness?.expect === "ok" && !unused) {
    const { slot, kind, binding } = call.witness;
    return `${where} slot ${slot} too narrow: the declaration rejects ${article(kind)} ${kind}, which ${binding} accepts`;
  }
  if (call?.readonlySet === true && unused) {
    return `${where} too loose: go.set accepts a key its catalog declares readonly`;
  }
  return `${where}: ${diagnostic.message}`;
}
