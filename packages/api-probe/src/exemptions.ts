import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Box2DBackend } from "./contexts";
import type { ProbeOutcome } from "./outcome";
import type { ProbeCall } from "./witness";

export const EXEMPTIONS_FILE = resolve(import.meta.dir, "..", "probe-exemptions.json");

// Only an `accepted` entry clears a call, and only for the exact outcome it
// records: the engine, not the declaration, is why the call cannot pass.
// `open`: the declaration accepts an argument the engine rejects and is due a
// correction; it clears nothing and is reported until the declaration is fixed.
export interface Exemption {
  readonly outcome: "bad-argument" | "engine-error";
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
}

export class ExemptionValidationError extends Error {
  override readonly name = "ExemptionValidationError";
}

const EXEMPTION_KEYS = ["outcome", "reason", "verdict"];
const OUTCOMES: readonly unknown[] = ["bad-argument", "engine-error"];
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
  };
  const seen = new Set<string>();
  for (const pass of passes) {
    const reported = new Set(pass.outcomes.map((o) => outcomeKey(pass.backend, o.name, o.variant)));
    const last = pass.outcomes.at(-1);
    for (const call of pass.calls) {
      const key = outcomeKey(pass.backend, call.name, call.variant);
      if (reported.has(key)) continue;
      const after = last === undefined ? "before any call reported" : `after ${last.name}`;
      failures.unreported.push(`${key}: no outcome; the script died ${after}`);
    }
    for (const outcome of pass.outcomes) {
      const key = outcomeKey(pass.backend, outcome.name, outcome.variant);
      seen.add(key);
      const exemption = exemptions[key];
      if (outcome.outcome === "ok") {
        if (exemption) failures.stale.push(`${key}: now ends ok; delete the exemption`);
        continue;
      }
      if (exemption && exemption.outcome !== outcome.outcome) {
        failures.stale.push(`${key}: now ends ${outcome.outcome}; update or delete the exemption`);
      }
      if (exemption?.verdict === "open") failures.openFindings.push(`${key}: ${exemption.reason}`);
      if (exemption?.verdict !== "accepted" || exemption.outcome !== outcome.outcome) {
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
