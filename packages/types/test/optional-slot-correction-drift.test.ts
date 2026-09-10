import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadApiTargets, MODULE_MANIFEST, VERSIONED_MODULE_MANIFEST } from "../scripts/regen";
import { OPTIONAL_SLOT_CORRECTIONS } from "../src/emit-dts";
import { correctionProvenance, retainedSurfaces } from "../src/optional-correction-provenance";
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

const provenance = new Map(
  correctionProvenance(
    [...OPTIONAL_SLOT_CORRECTIONS.keys()],
    retainedSurfaces(target.id, MODULE_MANIFEST, VERSIONED_MODULE_MANIFEST),
  ).map((entry) => [entry.key, entry]),
);

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

  test("every corrected slot names a parameter in some retained target", () => {
    const dead = corrections
      .filter(({ key }) => (provenance.get(key)?.sightedIn.length ?? 0) === 0)
      .map(
        ({ key, element, slot }) =>
          `${key}: no retained target declares ${element} with a ${slot} parameter`,
      );
    expect(dead).toEqual([]);
  });

  test("every corrected slot is one some retained target still documents as required", () => {
    // A correction is a disagreement with the ref-doc metadata. Once no retained
    // target leaves the slot unmarked the entry steers nothing and must be
    // deleted, not re-pinned — the same rule PROPERTY_TYPE_CORRECTIONS lives under.
    const redundant: string[] = [];
    for (const { key } of corrections) {
      const entry = provenance.get(key);
      if (!entry || entry.sightedIn.length === 0) continue;
      if (entry.neededBy.length === 0) {
        redundant.push(
          `${key}: every retained target (${entry.markedIn.join(", ")}) already documents it as optional`,
        );
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
