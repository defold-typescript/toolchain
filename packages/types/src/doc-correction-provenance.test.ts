import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import apiTargets from "../api-targets.json" with { type: "json" };
import { parseDefoldApiDoc } from "./api-doc";
import { DOC_CORRECTIONS } from "./doc-corrections";
import { fnv1a64 } from "./fnv1a";

const PKG = resolve(import.meta.dir, "..");

interface Target {
  readonly id: string;
  readonly fixturesDir: string;
  readonly modules: readonly { readonly namespace: string; readonly fixture: string }[];
}

const TARGETS = (apiTargets as { targets: readonly Target[] }).targets;

interface RefDocSlot {
  readonly name?: string;
  readonly doc?: string;
}

interface RefDocElement {
  readonly type?: string;
  readonly name?: string;
  readonly brief?: string;
  readonly description?: string;
  readonly parameters?: readonly RefDocSlot[];
  readonly returnvalues?: readonly RefDocSlot[];
}

interface Sighting {
  readonly target: string;
  readonly path: string;
  readonly doc: string;
}

type Slot = "param" | "return" | "property" | "brief" | "description";

interface SlotKey {
  readonly owner: string;
  readonly slot: Slot;
  readonly slotName: string;
}

// A function's own `brief` and `description` are keyed without a slot name.
function slotKey(key: string): SlotKey | undefined {
  const whole = /^(.+)#(brief|description)$/.exec(key);
  if (whole) {
    const [, owner, slot] = whole as unknown as [string, string, "brief" | "description"];
    return { owner, slot, slotName: "" };
  }
  const match = /^(.+)#(param|return|property):(.+)$/.exec(key);
  if (!match) return undefined;
  const [, owner, slot, slotName] = match as unknown as [string, string, Slot, string];
  return { owner, slot, slotName };
}

const isWholeFunctionSlot = (slot: Slot): slot is "brief" | "description" =>
  slot === "brief" || slot === "description";

// Every vendored ref-doc the generators read that documents the corrected slot,
// so an entry is pinned against the release it ships from and every older one
// still in `api-targets.json`. A property slot is keyed by its namespace, since
// the ref-doc names a `PROPERTY` element bare.
function sightings(key: string): Sighting[] {
  const parsed = slotKey(key);
  if (!parsed) return [];
  const { owner, slot, slotName } = parsed;
  const out: Sighting[] = [];
  for (const target of TARGETS) {
    for (const module of target.modules) {
      if (
        slot === "property" ? owner !== module.namespace : !owner.startsWith(`${module.namespace}.`)
      )
        continue;
      const path = join(PKG, target.fixturesDir, module.fixture);
      if (!existsSync(path)) continue;
      const doc = JSON.parse(readFileSync(path, "utf8")) as { elements?: RefDocElement[] };
      for (const element of doc.elements ?? []) {
        if (slot === "property") {
          if (element.type === "PROPERTY" && element.name === slotName) {
            out.push({ target: target.id, path, doc: element.description ?? "" });
          }
          continue;
        }
        if (element.type !== "FUNCTION" || element.name !== owner) continue;
        if (isWholeFunctionSlot(slot)) {
          out.push({ target: target.id, path, doc: element[slot] ?? "" });
          continue;
        }
        const slots = slot === "param" ? element.parameters : element.returnvalues;
        for (const s of slots ?? []) {
          if (s.name === slotName) out.push({ target: target.id, path, doc: s.doc ?? "" });
        }
      }
    }
  }
  return out;
}

// Doc corrections a retained target already documents correctly while an older
// one still needs them, each with the targets whose upstream doc changed into
// the fix. The hash gate leaves the correction inert there.
const DOC_CORRECTIONS_RESOLVED_UPSTREAM: Record<string, readonly string[]> = {
  // From 1.13.2 the return is a `graphics.adapter_info` STRUCT whose members carry the fields.
  "graphics.get_adapter_info#return:info": ["defold-1.13.2", "defold-1.14.0"],
};

const resolvedIn = (key: string, sighting: Sighting): boolean =>
  (DOC_CORRECTIONS_RESOLVED_UPSTREAM[key] ?? []).includes(sighting.target);

describe("doc correction provenance", () => {
  const entries = [...DOC_CORRECTIONS.entries()];

  test("the correction set is non-empty and every entry resolves to a real ref-doc slot", () => {
    expect(entries.length).toBeGreaterThan(0);
    const unresolved = entries.filter(([key]) => sightings(key).length === 0).map(([key]) => key);
    expect(unresolved).toEqual([]);
  });

  // A red here means upstream changed the slot's doc: re-read it, and delete the
  // entry if upstream fixed it rather than re-pinning the hash — or, while an
  // older retained target still needs it, record the fixing target above.
  test("every vendored ref-doc still carries the exact upstream doc the correction replaces", () => {
    const drifted: string[] = [];
    for (const [key, correction] of entries) {
      for (const sighting of sightings(key)) {
        if (resolvedIn(key, sighting)) continue;
        const found = fnv1a64(sighting.doc);
        if (found !== correction.upstreamHash) {
          drifted.push(
            `${key} in ${sighting.target}: pinned ${correction.upstreamHash}, found ${found}`,
          );
        }
      }
    }
    expect(drifted).toEqual([]);
  });

  test("the parse applies every correction in place of the upstream doc", () => {
    const missed: string[] = [];
    for (const [key, correction] of entries) {
      const { owner, slot, slotName } = slotKey(key) as SlotKey;
      for (const sighting of sightings(key)) {
        if (resolvedIn(key, sighting)) continue;
        const module = parseDefoldApiDoc(JSON.parse(readFileSync(sighting.path, "utf8")));
        let doc: string | undefined;
        if (slot === "property") {
          doc = module.properties.find((p) => p.name === slotName)?.description;
        } else {
          const fn = module.functions.find((f) => f.name === owner);
          if (isWholeFunctionSlot(slot)) {
            doc = fn?.[slot];
          } else {
            const slots = slot === "param" ? fn?.parameters : fn?.returnValues;
            doc = slots?.find((p) => p.name === slotName)?.doc;
          }
        }
        if (doc !== correction.html) missed.push(`${key} in ${sighting.target}`);
      }
    }
    expect(missed).toEqual([]);
  });

  test("each recorded resolution is a target whose doc left the pin, while an older target keeps it", () => {
    const stale: string[] = [];
    for (const [key, targets] of Object.entries(DOC_CORRECTIONS_RESOLVED_UPSTREAM)) {
      const correction = DOC_CORRECTIONS.get(key);
      if (correction === undefined) {
        stale.push(`${key}: no such correction`);
        continue;
      }
      const pinned = (sighting: Sighting) => fnv1a64(sighting.doc) === correction.upstreamHash;
      const found = sightings(key);
      for (const target of targets) {
        const own = found.filter((sighting) => sighting.target === target);
        if (own.length === 0 || own.some(pinned)) {
          stale.push(`${key}: ${target} still carries the pinned doc — drop the record`);
        }
      }
      if (!found.some((sighting) => !targets.includes(sighting.target) && pinned(sighting))) {
        stale.push(`${key}: no older target still needs it — delete the correction`);
      }
    }
    expect(stale).toEqual([]);
  });
});
