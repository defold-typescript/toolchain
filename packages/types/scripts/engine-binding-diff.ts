import {
  type BindingExtraction,
  type BindingFunction,
  type BindingSlot,
  type LuaKind,
  readBindingsForTarget,
  UNBOUND_NAMESPACES,
} from "./engine-binding-extract";
import { readVerdicts, VERDICTS_FILE, type Verdict } from "./engine-binding-verdicts";
import {
  type DeclaredFunction,
  type DeclaredKinds,
  type DeclaredSurface,
  readDeclaredSurface,
  surfaceProgram,
} from "./lua-kind";
import { type ApiTarget, loadApiTargets } from "./regen";

export { readVerdicts, VERDICTS_FILE, type Verdict };

// Targets whose engine bindings are vendored, and the on-demand ref-doc targets
// whose bindings are not.
export const COMPARED_TARGETS: readonly ApiTarget[] = loadApiTargets().filter(
  (target) => target.source === null,
);
const UNVENDORED_TARGETS: readonly ApiTarget[] = loadApiTargets().filter(
  (target) => target.source !== null,
);

export type MismatchRule =
  | "arity"
  | "too-loose"
  | "too-narrow"
  | "optional-as-required"
  | "required-as-optional"
  | "field-unread"
  | "field-undeclared"
  | "return-count"
  | "missing-binding"
  | "missing-declaration"
  | "constant-missing-binding"
  | "constant-missing-declaration"
  | "manual";

export interface Mismatch {
  readonly name: string;
  readonly rule: MismatchRule;
  readonly slot?: string;
  readonly extracted: string;
  readonly declared: string;
}

export function mismatchKey(mismatch: Mismatch): string {
  const slot = mismatch.slot === undefined ? "" : `:${mismatch.slot}`;
  return `${mismatch.name}:${mismatch.rule}${slot}`;
}

export function comparedNamespaces(target: ApiTarget): string[] {
  return target.modules
    .map((module) => module.namespace)
    .filter((namespace) => !UNBOUND_NAMESPACES.has(namespace));
}

function union<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}

function mergeSlot(a: BindingSlot | undefined, b: BindingSlot | undefined): BindingSlot {
  if (!a) return { ...(b as BindingSlot), optional: true };
  if (!b) return { ...a, optional: true };
  const manual = a.manual ?? b.manual;
  return {
    index: a.index,
    kinds: union([...a.kinds, ...b.kinds]).sort() as LuaKind[],
    optional: a.optional || b.optional,
    fields: union([...a.fields, ...b.fields]).sort(),
    ...(manual === undefined ? {} : { manual }),
    ...(a.minusOne || b.minusOne ? { minusOne: true as const } : {}),
    ...(a.unchecked && b.unchecked ? { unchecked: true as const } : {}),
  };
}

// The Box2D v2 and v3 sources, and platform variants such as `http.request`,
// bind one Lua name more than once. A declaration serves every variant, so it
// is compared against what any of them accepts.
export function mergeBindings(functions: readonly BindingFunction[]): BindingFunction[] {
  const merged = new Map<string, BindingFunction>();
  for (const fn of functions) {
    const key = `${fn.namespace}.${fn.name}`;
    const prior = merged.get(key);
    if (!prior) {
      merged.set(key, fn);
      continue;
    }
    const length = Math.max(prior.slots.length, fn.slots.length);
    const slots = Array.from({ length }, (_, i) => mergeSlot(prior.slots[i], fn.slots[i]));
    const count =
      prior.returns.count === fn.returns.count ? prior.returns.count : ("dynamic" as const);
    merged.set(key, {
      ...prior,
      minArgs: Math.min(prior.minArgs, fn.minArgs),
      maxArgs:
        prior.maxArgs === "variadic" || fn.maxArgs === "variadic"
          ? "variadic"
          : Math.max(prior.maxArgs, fn.maxArgs),
      slots,
      returns: { count, kinds: prior.returns.kinds },
      manual: union([...prior.manual, ...fn.manual]),
    });
  }
  return [...merged.values()];
}

function arityText(min: number, max: number | "variadic"): string {
  return `${min}..${max === "variadic" ? "*" : max}`;
}

function kindsText(kinds: DeclaredKinds | readonly LuaKind[]): string {
  return kinds === "any" ? "any" : kinds.join("|");
}

// Lua converts a number argument to a string and a numeric string to a number
// wherever the binding reads the other, so declaring the convertible kind too
// is not a mismatch.
function coerced(accepted: readonly LuaKind[]): Set<LuaKind> {
  const out = new Set(accepted);
  if (out.has("string")) out.add("number");
  if (out.has("number")) out.add("string");
  return out;
}

function manualSlot(name: string, slot: BindingSlot, declared: string): Mismatch {
  return {
    name,
    rule: "manual",
    slot: String(slot.index),
    extracted: slot.manual ?? "",
    declared,
  };
}

export function diffFunction(binding: BindingFunction, declared: DeclaredFunction): Mismatch[] {
  const name = declared.name;
  const out: Mismatch[] = [];
  const declaredArity = arityText(declared.minArgs, declared.maxArgs);
  if (binding.manual.length > 0) {
    out.push({
      name,
      rule: "manual",
      extracted: binding.manual.join("; "),
      declared: declaredArity,
    });
  } else if (binding.minArgs !== declared.minArgs || binding.maxArgs !== declared.maxArgs) {
    out.push({
      name,
      rule: "arity",
      extracted: arityText(binding.minArgs, binding.maxArgs),
      declared: declaredArity,
    });
  }

  const declaredSlots = new Map(declared.slots.map((slot) => [slot.index, slot]));
  for (const slot of binding.slots) {
    const target = declaredSlots.get(slot.index);
    const index = String(slot.index);
    if (slot.manual !== undefined) {
      out.push(manualSlot(name, slot, target === undefined ? "absent" : kindsText(target.kinds)));
      continue;
    }
    if (!target) continue;
    const accepted = slot.kinds.filter((kind) => kind !== "nil");
    if (accepted.length > 0) {
      const extracted = kindsText(accepted);
      if (target.kinds === "any") {
        out.push({ name, rule: "too-loose", slot: index, extracted, declared: "any" });
      } else {
        const declaredKinds = target.kinds;
        const convertible = coerced(accepted);
        const declaredText = kindsText(declaredKinds);
        if (declaredKinds.some((kind) => !convertible.has(kind))) {
          out.push({ name, rule: "too-loose", slot: index, extracted, declared: declaredText });
        }
        if (declaredKinds.length > 0 && accepted.some((kind) => !declaredKinds.includes(kind))) {
          out.push({ name, rule: "too-narrow", slot: index, extracted, declared: declaredText });
        }
      }
    }
    if (slot.optional && !target.optional) {
      out.push({
        name,
        rule: "optional-as-required",
        slot: index,
        extracted: "optional",
        declared: "required",
      });
    } else if (!slot.optional && target.optional) {
      out.push({
        name,
        rule: "required-as-optional",
        slot: index,
        extracted: "required",
        declared: "optional",
      });
    }
    // A binding that reads no named field walks or forwards the table, so only
    // a slot where both sides name fields is compared field by field.
    if (slot.fields.length > 0 && target.fields !== null) {
      const declaredFields = target.fields;
      for (const field of declaredFields.filter((f) => !slot.fields.includes(f))) {
        out.push({
          name,
          rule: "field-unread",
          slot: `${index}.${field}`,
          extracted: "not read",
          declared: "declared",
        });
      }
      for (const field of slot.fields.filter((f) => !declaredFields.includes(f))) {
        out.push({
          name,
          rule: "field-undeclared",
          slot: `${index}.${field}`,
          extracted: "read",
          declared: "not declared",
        });
      }
    }
  }

  const count = binding.returns.count;
  if (
    typeof count === "number" &&
    !declared.returnCounts.includes("variadic") &&
    !declared.returnCounts.includes(count)
  ) {
    out.push({
      name,
      rule: "return-count",
      extracted: String(count),
      declared: declared.returnCounts.join("|"),
    });
  }
  return out;
}

function namespaceOf(fqn: string): string {
  return fqn.slice(0, fqn.lastIndexOf("."));
}

export function diffTarget(
  bindings: Pick<BindingExtraction, "functions" | "constants">,
  declared: DeclaredSurface,
  namespaces: readonly string[],
): Mismatch[] {
  const compared = new Set(namespaces);
  const bound = new Map(
    mergeBindings(bindings.functions.filter((fn) => compared.has(fn.namespace))).map((fn) => [
      `${fn.namespace}.${fn.name}`,
      fn,
    ]),
  );
  const out: Mismatch[] = [];
  for (const [fqn, fn] of bound) {
    const declaration = declared.functions.get(fqn);
    if (declaration) {
      out.push(...diffFunction(fn, declaration));
      continue;
    }
    out.push({ name: fqn, rule: "missing-declaration", extracted: "bound", declared: "absent" });
    for (const slot of fn.slots) {
      if (slot.manual !== undefined) out.push(manualSlot(fqn, slot, "absent"));
    }
  }
  for (const fqn of declared.functions.keys()) {
    if (compared.has(namespaceOf(fqn)) && !bound.has(fqn)) {
      out.push({ name: fqn, rule: "missing-binding", extracted: "absent", declared: "declared" });
    }
  }
  const boundConstants = new Set(
    namespaces.flatMap((ns) => (bindings.constants.get(ns) ?? []).map((c) => `${ns}.${c}`)),
  );
  for (const fqn of boundConstants) {
    if (!declared.constants.has(fqn)) {
      out.push({
        name: fqn,
        rule: "constant-missing-declaration",
        extracted: "registered",
        declared: "absent",
      });
    }
  }
  for (const fqn of declared.constants) {
    if (compared.has(namespaceOf(fqn)) && !boundConstants.has(fqn)) {
      out.push({
        name: fqn,
        rule: "constant-missing-binding",
        extracted: "absent",
        declared: "declared",
      });
    }
  }
  return out.sort((a, b) => mismatchKey(a).localeCompare(mismatchKey(b)));
}

export interface BindingDiff {
  // Keyed `<target|*>:<ns.fn>:<rule>[:<slot>]`; `*` when every compared target
  // reports the same mismatch with the same evidence.
  readonly mismatches: Map<string, Mismatch>;
  readonly unmapped: string[];
}

export function diffAll(): BindingDiff {
  const perTarget = new Map<string, Map<string, Mismatch>>();
  const unmapped: string[] = [];
  for (const target of COMPARED_TARGETS) {
    const namespaces = comparedNamespaces(target);
    const surface = readDeclaredSurface(surfaceProgram(target), namespaces);
    unmapped.push(...surface.unmapped.map((entry) => `${target.id}: ${entry}`));
    const found = diffTarget(readBindingsForTarget(target.id), surface, namespaces);
    perTarget.set(target.id, new Map(found.map((m) => [mismatchKey(m), m])));
  }

  const keys = union([...perTarget.values()].flatMap((found) => [...found.keys()])).sort();
  const entries: [string, Mismatch][] = [];
  for (const key of keys) {
    const seen = COMPARED_TARGETS.map((target) => perTarget.get(target.id)?.get(key));
    const first = seen[0];
    const shared =
      first !== undefined &&
      seen.every((m) => m?.extracted === first.extracted && m?.declared === first.declared);
    if (shared) {
      entries.push([`*:${key}`, first]);
      continue;
    }
    COMPARED_TARGETS.forEach((target, i) => {
      const m = seen[i];
      if (m) entries.push([`${target.id}:${key}`, m]);
    });
  }
  for (const target of UNVENDORED_TARGETS) {
    entries.push([
      `${target.id}:*:missing-binding`,
      { name: "*", rule: "missing-binding", extracted: "not vendored", declared: "ref-doc target" },
    ]);
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  return { mismatches: new Map(entries), unmapped };
}

const UNVENDORED_REASON = "on-demand ref-doc target, bindings not vendored";

// Keeps every accepted and manual verdict whose mismatch remains, records a new
// mismatch as open (manual for a slot the extractor could not read, accepted
// for an unvendored target), and drops verdicts whose mismatch is gone.
export function seedVerdicts(
  mismatches: ReadonlyMap<string, Mismatch>,
  prior: Readonly<Record<string, Verdict>>,
): Record<string, Verdict> {
  const next: Record<string, Verdict> = {};
  for (const [key, m] of mismatches) {
    const kept = prior[key];
    if (kept && kept.verdict !== "open") next[key] = kept;
    else if (m.rule === "manual") next[key] = { verdict: "manual", reason: m.extracted };
    else if (m.name === "*") next[key] = { verdict: "accepted", reason: UNVENDORED_REASON };
    else next[key] = { verdict: "open", extracted: m.extracted, declared: m.declared };
  }
  return next;
}

if (import.meta.main) {
  const { mismatches, unmapped } = diffAll();
  if (unmapped.length > 0) {
    console.error(`unmapped declared types:\n${unmapped.join("\n")}`);
    process.exit(1);
  }
  if (process.argv.includes("--write")) {
    let prior: Record<string, Verdict> = {};
    try {
      prior = readVerdicts();
    } catch {
      prior = {};
    }
    const next = seedVerdicts(mismatches, prior);
    const formatted = Bun.spawnSync(
      ["bunx", "biome", "format", "--stdin-file-path=engine-binding-verdicts.json"],
      { stdin: Buffer.from(JSON.stringify(next)) },
    );
    if (formatted.exitCode !== 0) throw new Error(formatted.stderr.toString());
    await Bun.write(VERDICTS_FILE, formatted.stdout.toString());
    console.log(`wrote ${Object.keys(next).length} verdicts to ${VERDICTS_FILE}`);
  } else {
    for (const [key, m] of mismatches) console.log(`${key}\t${m.extracted}\t${m.declared}`);
  }
}
