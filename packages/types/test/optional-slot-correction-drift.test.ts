import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadApiTargets, loadTargetModules } from "../scripts/regen";
import { type ApiParameter, parseDefoldApiDoc } from "../src/api-doc";
import { OPTIONAL_SLOT_CORRECTIONS } from "../src/emit-dts";
import {
  enumerateDeclaredParameterSlots,
  mergeDeclaredParameterSlots,
} from "./fixture-surface-enumerate";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const GENERATED_DIR = resolve(PACKAGE_ROOT, "generated");

function declarationFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return declarationFiles(path);
    return entry.isFile() && entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

// One slot map across every committed declaration the emitter writes. A slot
// counts omissible only when every copy that names it does, so a required
// versioned copy reds whatever order the walk yields, and a namespace split
// across files still resolves.
const declaredSlots = mergeDeclaredParameterSlots(
  declarationFiles(GENERATED_DIR).map((path) =>
    enumerateDeclaredParameterSlots(readFileSync(path, "utf8"), relative(GENERATED_DIR, path)),
  ),
);

const target = loadApiTargets().find((candidate) => candidate.default === true);
if (!target) throw new Error("api-targets.json: no default target");

const upstreamParameters = new Map<string, readonly ApiParameter[]>();
for (const entry of loadTargetModules(target)) {
  for (const fn of parseDefoldApiDoc(entry.doc).functions) {
    upstreamParameters.set(fn.name, fn.parameters);
  }
}

interface CorrectionKey {
  readonly key: string;
  readonly element: string;
  readonly slot: string;
  readonly evidence: string;
}

const corrections: CorrectionKey[] = [...OPTIONAL_SLOT_CORRECTIONS].map(([key, evidence]) => {
  const [element, kind, slot] = key.split(":");
  if (kind !== "param" || !element || !slot) {
    throw new Error(`OPTIONAL_SLOT_CORRECTIONS: malformed key ${key}`);
  }
  return { key, element, slot, evidence };
});

describe("OPTIONAL_SLOT_CORRECTIONS reaches the shipped declarations", () => {
  test("the table is not empty", () => {
    // Every assertion below iterates the table, so an emptied table would pass
    // them all while correcting nothing.
    expect(corrections.length).toBeGreaterThan(0);
  });

  test("every corrected slot is omissible in the committed declarations", () => {
    const unreached: string[] = [];
    for (const { key, element, slot } of corrections) {
      const slots = declaredSlots.get(element);
      if (!slots) {
        unreached.push(`${key}: generated/ declares no ${element}`);
        continue;
      }
      const declared = slots.get(slot);
      if (!declared) {
        unreached.push(`${key}: ${element} declares no ${slot} parameter`);
        continue;
      }
      if (!declared.optional) {
        unreached.push(
          `${key}: required in ${declared.requiredIn.join(", ")} as ${slot}: ${declared.typeText}`,
        );
      }
    }
    expect(unreached).toEqual([]);
  });

  test("every corrected slot still names a live upstream parameter", () => {
    const dead: string[] = [];
    for (const { key, element, slot } of corrections) {
      const parameters = upstreamParameters.get(element);
      if (!parameters) {
        dead.push(`${key}: the ref-doc declares no ${element}`);
        continue;
      }
      if (!parameters.some((parameter) => parameter.name === slot)) {
        dead.push(`${key}: ${element}(${parameters.map((p) => p.name).join(", ")})`);
      }
    }
    expect(dead).toEqual([]);
  });

  test("every corrected slot is one upstream still documents as required", () => {
    // A correction is a disagreement with the ref-doc metadata. Once upstream
    // marks the slot optional the entry steers nothing and must be deleted, not
    // re-pinned — the same rule PROPERTY_TYPE_CORRECTIONS lives under.
    const redundant: string[] = [];
    for (const { key, element, slot } of corrections) {
      const parameter = upstreamParameters.get(element)?.find((p) => p.name === slot);
      if (!parameter) continue;
      if (parameter.isOptional || parameter.types.includes("nil")) {
        redundant.push(`${key}: upstream already documents it as optional`);
      }
    }
    expect(redundant).toEqual([]);
  });

  test("every entry records the upstream evidence for its correction", () => {
    expect(corrections.filter((entry) => entry.evidence.trim() === "").map((e) => e.key)).toEqual(
      [],
    );
  });

  test("no two entries name the same slot", () => {
    const keys = corrections.map((entry) => entry.key);
    expect(keys.length).toBe(new Set(keys).size);
  });
});
