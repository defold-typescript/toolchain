import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BOX2D_BACKENDS,
  type Box2DBackend,
  box2dConstantBackends,
  constantAbsence,
  isBox2D,
} from "./contexts";
import type { ProbeOutcome } from "./outcome";
import { returnMismatches } from "./return-kinds";
import { type ProbeCall, probeTarget, type WitnessTarget } from "./witness";

export const EXEMPTIONS_FILE = resolve(import.meta.dir, "..", "probe-exemptions.json");

// Only an `accepted` entry clears a call, and only for the exact outcome it
// records: the engine, not the declaration, is why the call cannot pass.
// `open`: the declaration accepts an argument the engine rejects and is due a
// correction; it clears nothing and is reported until the declaration is fixed.
// Outcome `ok` records a negative call a lenient binding accepts by design; an
// accepted call is expected to end ok, so an exemption recording that is stale.
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
  // Accepted calls refused a bad argument at their own slot: a kind the
  // extractor reads as accepted that the binding rejects.
  readonly acceptedRefused: string[];
  // Negative calls that raised, but not a bad argument at their own slot, and
  // accepted calls that raised anything else.
  readonly misfires: string[];
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
const CONSTANT_KEY = /^(.+):constant(?:@([\w-]+))?$/;
const OUTCOMES: readonly unknown[] = ["ok", "bad-argument", "engine-error"];
const VERDICTS: readonly unknown[] = ["accepted", "open"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

let box2dConstants: ReadonlyMap<string, ReadonlySet<Box2DBackend>> | undefined;

function probedBox2DConstants(): ReadonlyMap<string, ReadonlySet<Box2DBackend>> {
  box2dConstants ??= box2dConstantBackends(probeTarget().id);
  return box2dConstants;
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
  const [, constant, suffix] = CONSTANT_KEY.exec(key) ?? [];
  if (constant !== undefined) {
    const backend = (suffix ?? "v2") as Box2DBackend;
    if (!BOX2D_BACKENDS.includes(backend)) {
      throw fail(`unknown backend @${suffix}; expected one of ${BOX2D_BACKENDS.join(", ")}`);
    }
    const constants = probedBox2DConstants();
    const absence = constantAbsence(constant, backend, constants);
    if (absence !== "backend" && absence !== "module") {
      const namespace = constant.slice(0, constant.lastIndexOf("."));
      if (isBox2D(namespace)) {
        throw fail(
          constants.get(constant)?.has(backend)
            ? `the ${backend} backend registers it, so the ${backend} pass cannot leave it absent`
            : "no Box2D backend registers it, so no backend leaves it absent; fix the declaration",
        );
      }
      throw fail(
        "only a constant a Box2D backend or an unlinked module leaves absent can be exempted; an ordinary constant must be fixed in the declaration",
      );
    }
    if (entry.outcome !== "engine-error") {
      throw fail(`a constant exemption records engine-error, got ${String(entry.outcome)}`);
    }
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
  return /^[aeio]/.test(kind) ? "an" : "a";
}

// A bad argument at the witness's own slot, or one whose message numbers no
// slot.
function raisesOnSlot(call: ProbeCall, outcome: ProbeOutcome): boolean {
  return (
    outcome.outcome === "bad-argument" &&
    (outcome.slot === undefined || outcome.slot === call.witness?.slot)
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

// A negative call must raise a bad argument at its own slot, an accepted call
// must end ok; anything else fails unless an accepted exemption records it.
function evaluateWitness(
  pass: PassResult,
  call: ProbeCall,
  outcome: ProbeOutcome,
  exemption: Exemption | undefined,
  inherited: ReadonlySet<string> | undefined,
  failures: ProbeFailures,
): void {
  const key = outcomeKey(pass.backend, outcome.name, outcome.variant);
  const target = call.witness as WitnessTarget;
  const refused = raisesOnSlot(call, outcome);
  if (target.expect === "raise" ? refused : outcome.outcome === "ok") {
    if (exemption === undefined) return;
    const now =
      target.expect === "raise"
        ? "now raises on its slot"
        : exemption.outcome === "ok"
          ? "ok is the expected outcome"
          : "now ends ok";
    failures.stale.push(`${key}: ${now}; delete the exemption`);
    return;
  }
  if (exemption && exemption.outcome !== outcome.outcome) {
    failures.stale.push(`${key}: now ends ${outcome.outcome}; update or delete the exemption`);
  }
  if (exemption?.verdict === "open") failures.openFindings.push(`${key}: ${exemption.reason}`);
  if (exemption?.verdict === "accepted" && exemption.outcome === outcome.outcome) return;
  // A witness call that fails exactly like its function's exempted positive
  // call never reached the slot it tests.
  if (exemption === undefined && inherited?.has(bareMessage(outcome.message))) return;
  const kind = `${article(target.kind)} ${target.kind}`;
  if (target.expect === "raise" && outcome.outcome === "ok") {
    failures.tooNarrow.push(
      `${key}: the engine accepts ${kind} in slot ${target.slot}; the declaration is too narrow or ${target.binding} is lenient`,
    );
    return;
  }
  if (target.expect === "ok" && refused) {
    failures.acceptedRefused.push(
      `${key}: ${target.binding} refuses ${kind} in slot ${target.slot}, a kind the extractor reads as accepted: ${outcome.message}`,
    );
    return;
  }
  const slot = outcome.slot === undefined ? "" : ` slot ${outcome.slot}`;
  const expected = target.expect === "ok" ? "ok" : `a bad argument #${target.slot}`;
  failures.misfires.push(
    `${key}${slot}: raised ${outcome.outcome}, expected ${expected}: ${outcome.message}`,
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
    acceptedRefused: [],
    misfires: [],
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
      if (call?.witness !== undefined) {
        evaluateWitness(pass, call, outcome, exemption, inherited.get(call.name), failures);
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
