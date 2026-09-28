import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Box2DBackend } from "./contexts";
import type { ProbeOutcome } from "./outcome";
import { returnMismatches } from "./return-kinds";
import type { ProbeCall } from "./witness";

export const EXEMPTIONS_FILE = resolve(import.meta.dir, "..", "probe-exemptions.json");

// Only an `accepted` entry clears a call, and only for the exact outcome it
// records: the engine, not the declaration, is why the call cannot pass.
// `open`: the declaration accepts an argument the engine rejects and is due a
// correction; it clears nothing and is reported until the declaration is fixed.
// Outcome `ok` records a negative call a lenient binding accepts by design.
export interface Exemption {
  readonly outcome: "ok" | "bad-argument" | "engine-error";
  readonly verdict: "accepted" | "open";
  readonly reason: string;
}

export interface PassResult {
  readonly backend: Box2DBackend;
  readonly calls: readonly ProbeCall[];
  readonly outcomes: readonly ProbeOutcome[];
}

export interface ProbeFailures {
  readonly unreported: string[];
  readonly badArguments: string[];
  readonly unexempted: string[];
  readonly stale: string[];
  readonly openFindings: string[];
  // Negative calls the engine accepted.
  readonly tooNarrow: string[];
  // Negative calls that raised, but not a bad argument at their own slot.
  readonly negativeMisfires: string[];
  readonly returnKinds: string[];
  // Index probes whose slot did not behave as its class says.
  readonly indexSemantics: string[];
  // Writes the engine accepted to a property declared readonly.
  readonly writableReadonly: string[];
}

export class ExemptionValidationError extends Error {
  override readonly name = "ExemptionValidationError";
}

const EXEMPTION_KEYS = ["outcome", "reason", "verdict"];
const OUTCOMES: readonly unknown[] = ["ok", "bad-argument", "engine-error"];
const VERDICTS: readonly unknown[] = ["accepted", "open"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateExemption(key: string, entry: unknown): Exemption {
  const fail = (problem: string) => new ExemptionValidationError(`${key}: ${problem}`);
  if (!isRecord(entry)) throw fail("an exemption must be an object");
  const keys = Object.keys(entry).sort();
  if (keys.join() !== EXEMPTION_KEYS.join()) {
    throw fail(`expected exactly the fields ${EXEMPTION_KEYS.join(", ")}, got ${keys.join(", ")}`);
  }
  if (!OUTCOMES.includes(entry.outcome)) {
    throw fail(`outcome must be one of ${OUTCOMES.join(", ")}, got ${String(entry.outcome)}`);
  }
  if (!VERDICTS.includes(entry.verdict)) {
    throw fail(`verdict must be one of ${VERDICTS.join(", ")}, got ${String(entry.verdict)}`);
  }
  if (typeof entry.reason !== "string" || entry.reason.trim() === "") {
    throw fail("reason must be a non-empty string");
  }
  return entry as unknown as Exemption;
}

// `<fn>:<variant>`, suffixed `@v3` for the Box2D v3 pass.
export function outcomeKey(backend: Box2DBackend, name: string, variant: string): string {
  return `${name}:${variant}${backend === "v2" ? "" : `@${backend}`}`;
}

export function parseExemptions(text: string): Record<string, Exemption> {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) {
    throw new ExemptionValidationError("the exemptions file must be an object keyed by call");
  }
  const exemptions: Record<string, Exemption> = {};
  for (const [key, entry] of Object.entries(parsed)) {
    exemptions[key] = validateExemption(key, entry);
  }
  return exemptions;
}

export function readExemptions(file = EXEMPTIONS_FILE): Record<string, Exemption> {
  return parseExemptions(readFileSync(file, "utf8"));
}

function describe(backend: Box2DBackend, outcome: ProbeOutcome): string {
  const slot = outcome.slot === undefined ? "" : ` slot ${outcome.slot}`;
  return `${outcomeKey(backend, outcome.name, outcome.variant)}${slot}: ${outcome.message}`;
}

function article(kind: string): string {
  return /^[aeiou]/.test(kind) ? "an" : "a";
}

// A negative call is expected to raise a bad argument at its own slot, or one
// whose message numbers no slot.
function raisesOnSlot(call: ProbeCall, outcome: ProbeOutcome): boolean {
  return (
    outcome.outcome === "bad-argument" &&
    (outcome.slot === undefined || outcome.slot === call.negative?.slot)
  );
}

// The raised message without the `file:line:` prefix Lua adds, which differs
// between two calls on different lines.
function bareMessage(message: string): string {
  return message.replace(/^[^:\s]+:\d+: /, "");
}

// The messages each function's positive calls raised under an accepted
// engine-error exemption: the engine cannot run that function here at all.
function exemptedFailures(
  pass: PassResult,
  exemptions: Readonly<Record<string, Exemption>>,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const outcome of pass.outcomes) {
    const exemption = exemptions[outcomeKey(pass.backend, outcome.name, outcome.variant)];
    if (outcome.outcome !== "engine-error" || exemption?.verdict !== "accepted") continue;
    if (exemption.outcome !== "engine-error") continue;
    const messages = out.get(outcome.name) ?? new Set<string>();
    messages.add(bareMessage(outcome.message));
    out.set(outcome.name, messages);
  }
  return out;
}

function evaluateNegative(
  pass: PassResult,
  call: ProbeCall,
  outcome: ProbeOutcome,
  exemption: Exemption | undefined,
  inherited: ReadonlySet<string> | undefined,
  failures: ProbeFailures,
): void {
  const key = outcomeKey(pass.backend, outcome.name, outcome.variant);
  const target = call.negative as NonNullable<ProbeCall["negative"]>;
  if (raisesOnSlot(call, outcome)) {
    if (exemption) failures.stale.push(`${key}: now raises on its slot; delete the exemption`);
    return;
  }
  if (exemption && exemption.outcome !== outcome.outcome) {
    failures.stale.push(`${key}: now ends ${outcome.outcome}; update or delete the exemption`);
  }
  if (exemption?.verdict === "open") failures.openFindings.push(`${key}: ${exemption.reason}`);
  if (exemption?.verdict === "accepted" && exemption.outcome === outcome.outcome) return;
  // A negative call that fails exactly like its function's exempted positive
  // call never reached the slot it tests.
  if (exemption === undefined && inherited?.has(bareMessage(outcome.message))) return;
  if (outcome.outcome === "ok") {
    failures.tooNarrow.push(
      `${key}: the engine accepts ${article(target.kind)} ${target.kind} in slot ${target.slot}; the declaration is too narrow or ${target.binding} is lenient`,
    );
    return;
  }
  const slot = outcome.slot === undefined ? "" : ` slot ${outcome.slot}`;
  failures.negativeMisfires.push(
    `${key}${slot}: raised ${outcome.outcome}, expected a bad argument #${target.slot}: ${outcome.message}`,
  );
}

export function evaluateProbe(
  passes: readonly PassResult[],
  exemptions: Readonly<Record<string, Exemption>>,
): ProbeFailures {
  const failures: ProbeFailures = {
    unreported: [],
    badArguments: [],
    unexempted: [],
    stale: [],
    openFindings: [],
    tooNarrow: [],
    negativeMisfires: [],
    returnKinds: [],
    indexSemantics: [],
    writableReadonly: [],
  };
  const seen = new Set<string>();
  for (const pass of passes) {
    const reported = new Set(pass.outcomes.map((o) => outcomeKey(pass.backend, o.name, o.variant)));
    const calls = new Map(pass.calls.map((c) => [outcomeKey(pass.backend, c.name, c.variant), c]));
    const last = pass.outcomes.at(-1);
    const inherited = exemptedFailures(pass, exemptions);
    for (const [key, call] of calls) {
      if (reported.has(key)) continue;
      if (call.message?.direction === "incoming" && call.message.triggered !== true) continue;
      const after = last === undefined ? "before any call reported" : `after ${last.name}`;
      failures.unreported.push(`${key}: no outcome; the script died ${after}`);
    }
    for (const outcome of pass.outcomes) {
      const key = outcomeKey(pass.backend, outcome.name, outcome.variant);
      seen.add(key);
      const exemption = exemptions[key];
      const call = calls.get(key);
      if (call?.negative !== undefined) {
        evaluateNegative(pass, call, outcome, exemption, inherited.get(call.name), failures);
        continue;
      }
      if (call?.readonlySet === true) {
        if (outcome.outcome === "ok") {
          failures.writableReadonly.push(
            `${key}: the engine accepts a write to a property declared readonly`,
          );
        }
        continue;
      }
      if (outcome.outcome === "ok") {
        if (exemption) failures.stale.push(`${key}: now ends ok; delete the exemption`);
        if (call?.returns !== undefined) {
          for (const problem of returnMismatches(call.returns, outcome.returns ?? [])) {
            failures.returnKinds.push(`${key}: ${problem}`);
          }
        }
        continue;
      }
      if (exemption && exemption.outcome !== outcome.outcome) {
        failures.stale.push(`${key}: now ends ${outcome.outcome}; update or delete the exemption`);
      }
      if (exemption?.verdict === "open") failures.openFindings.push(`${key}: ${exemption.reason}`);
      if (exemption?.verdict !== "accepted" || exemption.outcome !== outcome.outcome) {
        if (call?.index !== undefined) {
          failures.indexSemantics.push(`${key} (${call.index}): ${outcome.message}`);
          continue;
        }
        const list =
          outcome.outcome === "bad-argument" ? failures.badArguments : failures.unexempted;
        list.push(describe(pass.backend, outcome));
      }
    }
  }
  for (const key of Object.keys(exemptions)) {
    if (!seen.has(key)) failures.stale.push(`${key}: no such probe call; delete the exemption`);
  }
  return failures;
}
