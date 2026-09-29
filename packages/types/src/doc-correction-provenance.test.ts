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
  readonly parameters?: readonly RefDocSlot[];
  readonly returnvalues?: readonly RefDocSlot[];
}

interface Sighting {
  readonly target: string;
  readonly path: string;
  readonly doc: string;
}

// Every vendored ref-doc the generators read that documents the corrected slot,
// so an entry is pinned against the release it ships from and every older one
// still in `api-targets.json`.
function sightings(key: string): Sighting[] {
  const match = /^(.+)#(param|return):(.+)$/.exec(key);
  if (!match) return [];
  const [, fnName, slot, slotName] = match as unknown as [string, string, string, string];
  const out: Sighting[] = [];
  for (const target of TARGETS) {
    for (const module of target.modules) {
      if (!fnName.startsWith(`${module.namespace}.`)) continue;
      const path = join(PKG, target.fixturesDir, module.fixture);
      if (!existsSync(path)) continue;
      const doc = JSON.parse(readFileSync(path, "utf8")) as { elements?: RefDocElement[] };
      for (const element of doc.elements ?? []) {
        if (element.type !== "FUNCTION" || element.name !== fnName) continue;
        const slots = slot === "param" ? element.parameters : element.returnvalues;
        for (const s of slots ?? []) {
          if (s.name === slotName) out.push({ target: target.id, path, doc: s.doc ?? "" });
        }
      }
    }
  }
  return out;
}

describe("doc correction provenance", () => {
  const entries = [...DOC_CORRECTIONS.entries()];

  test("the correction set is non-empty and every entry resolves to a real ref-doc slot", () => {
    expect(entries.length).toBeGreaterThan(0);
    const unresolved = entries.filter(([key]) => sightings(key).length === 0).map(([key]) => key);
    expect(unresolved).toEqual([]);
  });

  // A red here means upstream changed the slot's doc: re-read it, and delete the
  // entry if upstream fixed it rather than re-pinning the hash.
  test("every vendored ref-doc still carries the exact upstream doc the correction replaces", () => {
    const drifted: string[] = [];
    for (const [key, correction] of entries) {
      for (const sighting of sightings(key)) {
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
      const [fnName, slotKey] = key.split("#") as [string, string];
      const [slot, slotName] = slotKey.split(":") as [string, string];
      for (const sighting of sightings(key)) {
        const module = parseDefoldApiDoc(JSON.parse(readFileSync(sighting.path, "utf8")));
        const fn = module.functions.find((f) => f.name === fnName);
        const slots = slot === "param" ? fn?.parameters : fn?.returnValues;
        const doc = slots?.find((p) => p.name === slotName)?.doc;
        if (doc !== correction.html) missed.push(`${key} in ${sighting.target}`);
      }
    }
    expect(missed).toEqual([]);
  });
});
