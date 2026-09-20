import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import apiTargets from "../api-targets.json" with { type: "json" };
import { RETURN_FIELD_OPTIONALITY_CORRECTIONS, RETURN_TYPE_CORRECTIONS } from "./emit-dts";
import { decodeSlotProse, fieldProse, fieldTypeTokens } from "./return-correction-provenance";

const PKG = resolve(import.meta.dir, "..");

interface TargetModule {
  readonly namespace: string;
  readonly fixture: string;
}

interface Target {
  readonly id: string;
  readonly fixturesDir: string;
  readonly modules: readonly TargetModule[];
}

const TARGETS = (apiTargets as { targets: readonly Target[] }).targets;

interface RefDocSlot {
  readonly name?: string;
  readonly doc?: string;
  readonly types?: readonly string[];
}

interface RefDocElement {
  readonly type?: string;
  readonly name?: string;
  readonly returnvalues?: readonly RefDocSlot[];
}

interface Sighting {
  readonly target: string;
  readonly slot: RefDocSlot;
}

// Every retained target that vendors the element, so a correction is pinned
// against the release it ships from and every older release still generated.
// Keyed per target rather than globally: a newer target's upstream fix must not
// force deleting an entry the older surfaces still need.
function sightings(elementName: string, slotName?: string): Sighting[] {
  const namespace = elementName.slice(0, elementName.lastIndexOf("."));
  const out: Sighting[] = [];
  for (const target of TARGETS) {
    for (const module of target.modules) {
      if (module.namespace !== namespace) continue;
      const path = join(PKG, target.fixturesDir, module.fixture);
      if (!existsSync(path)) continue;
      const doc = JSON.parse(readFileSync(path, "utf8")) as { elements?: RefDocElement[] };
      for (const element of doc.elements ?? []) {
        if (element.type !== "FUNCTION" || element.name !== elementName) continue;
        for (const slot of element.returnvalues ?? []) {
          if (slotName !== undefined && slot.name !== slotName) continue;
          out.push({ target: target.id, slot });
        }
      }
    }
  }
  return out;
}

// `<element>:<kind>:<slot>:<field>`, the key shape both correction tables and
// `TABLE_FIELD_TYPE_OVERRIDES` use.
function splitFieldKey(key: string): {
  element: string;
  kind: string;
  slot: string;
  field: string;
} {
  const parts = key.split(":");
  if (parts.length !== 4) throw new Error(`malformed field-optionality key ${key}`);
  const [element, kind, slot, field] = parts as [string, string, string, string];
  return { element, kind, slot, field };
}

describe("return field-optionality correction provenance", () => {
  const entries = [...RETURN_FIELD_OPTIONALITY_CORRECTIONS.entries()];

  test("the correction set is non-empty and every entry names a return slot", () => {
    expect(entries.length).toBeGreaterThan(0);
    const misKeyed = entries
      .filter(([key]) => splitFieldKey(key).kind !== "return")
      .map(([key]) => key);
    expect(misKeyed).toEqual([]);
  });

  test("every entry resolves to a real return slot in at least one vendored ref-doc", () => {
    const unresolved = entries
      .filter(([key]) => {
        const { element, slot } = splitFieldKey(key);
        return sightings(element, slot).length === 0;
      })
      .map(([key]) => key);
    expect(unresolved).toEqual([]);
  });

  test("every vendored ref-doc still carries the evidence sentence the entry rests on", () => {
    const drifted: string[] = [];
    for (const [key, correction] of entries) {
      const { element, slot, field } = splitFieldKey(key);
      for (const sighting of sightings(element, slot)) {
        const prose = fieldProse(sighting.slot.doc ?? "", field);
        if (prose === undefined) {
          drifted.push(`${key} in ${sighting.target}: field no longer documented`);
        } else if (!prose.includes(correction.evidence)) {
          drifted.push(`${key} in ${sighting.target}: evidence gone, doc now reads ${prose}`);
        }
      }
    }
    expect(drifted).toEqual([]);
  });

  test("every vendored ref-doc still declares the field type the entry pins", () => {
    const drifted: string[] = [];
    for (const [key, correction] of entries) {
      const { element, slot, field } = splitFieldKey(key);
      for (const sighting of sightings(element, slot)) {
        const tokens = fieldTypeTokens(sighting.slot.doc ?? "", field);
        if (tokens === undefined || tokens.join("|") !== correction.upstream.join("|")) {
          drifted.push(
            `${key} in ${sighting.target}: pinned ${correction.upstream.join("|")}, found ${tokens?.join("|") ?? "no field"}`,
          );
        }
      }
    }
    expect(drifted).toEqual([]);
  });

  test("every entry states the evidence it rests on", () => {
    const unexplained = entries
      .filter(([, correction]) => correction.evidence.trim().length === 0)
      .map(([key]) => key);
    expect(unexplained).toEqual([]);
  });
});

describe("return-type correction provenance", () => {
  const entries = [...RETURN_TYPE_CORRECTIONS.entries()];

  test("the correction set is non-empty and every entry resolves to a real return", () => {
    expect(entries.length).toBeGreaterThan(0);
    const unresolved = entries.filter(([key]) => sightings(key).length === 0).map(([key]) => key);
    expect(unresolved).toEqual([]);
  });

  test("every vendored ref-doc still declares the return tokens the entry pins", () => {
    const drifted: string[] = [];
    for (const [key, correction] of entries) {
      for (const sighting of sightings(key)) {
        const tokens = sighting.slot.types ?? [];
        if (tokens.join("|") !== correction.upstream.join("|")) {
          drifted.push(
            `${key} in ${sighting.target}: pinned ${correction.upstream.join("|")}, found ${tokens.join("|")}`,
          );
        }
      }
    }
    expect(drifted).toEqual([]);
  });

  test("every vendored ref-doc still states the contradicting prose in the slot doc", () => {
    const drifted: string[] = [];
    for (const [key, correction] of entries) {
      for (const sighting of sightings(key)) {
        const prose = decodeSlotProse(sighting.slot.doc ?? "");
        if (!prose.includes(correction.reason)) {
          drifted.push(`${key} in ${sighting.target}: reason gone, doc now reads ${prose}`);
        }
      }
    }
    expect(drifted).toEqual([]);
  });

  test("every correction states why it overrides upstream", () => {
    const unexplained = entries
      .filter(([, correction]) => correction.reason.trim().length === 0)
      .map(([key]) => key);
    expect(unexplained).toEqual([]);
  });
});
