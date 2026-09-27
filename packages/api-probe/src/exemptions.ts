import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Box2DBackend } from "./contexts";
import type { ProbeOutcome } from "./outcome";
import type { ProbeCall } from "./witness";

export const EXEMPTIONS_FILE = resolve(import.meta.dir, "..", "probe-exemptions.json");

// `accepted`: the engine, not the declaration, is why the call cannot pass.
// `open`: the declaration accepts an argument the engine rejects, and is due a
// correction; the entry goes once the declaration is fixed.
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
}

// `<fn>:<variant>`, suffixed `@v3` for the Box2D v3 pass.
export function outcomeKey(backend: Box2DBackend, name: string, variant: string): string {
  return `${name}:${variant}${backend === "v2" ? "" : `@${backend}`}`;
}

export function readExemptions(file = EXEMPTIONS_FILE): Record<string, Exemption> {
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, Exemption>;
}

function describe(backend: Box2DBackend, outcome: ProbeOutcome): string {
  const slot = outcome.slot === undefined ? "" : ` slot ${outcome.slot}`;
  return `${outcomeKey(backend, outcome.name, outcome.variant)}${slot}: ${outcome.message}`;
}

export function evaluateProbe(
  passes: readonly PassResult[],
  exemptions: Readonly<Record<string, Exemption>>,
): ProbeFailures {
  const failures: ProbeFailures = { unreported: [], badArguments: [], unexempted: [], stale: [] };
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
      } else if (exemption?.outcome !== outcome.outcome) {
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
