import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import apiTargets from "../api-targets.json" with { type: "json" };
import { PROPERTY_TYPE_CORRECTIONS } from "./emit-dts";

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

interface RefDocElement {
  readonly type?: string;
  readonly name?: string;
  readonly brief?: string;
}

// The upstream token lives in the property's `<span class="type">`, which is
// exactly where `parseProperty` reads it; anything else in the brief is prose.
function upstreamToken(element: RefDocElement): string | undefined {
  return /<span class="type">([^<]*)<\/span>/.exec(element.brief ?? "")?.[1]?.trim();
}

interface Sighting {
  readonly target: string;
  readonly token: string | undefined;
}

// Every place a corrected property is declared across the vendored ref-docs the
// generators actually read, so a correction is pinned against the release it
// ships from and every older release still in `api-targets.json`.
function sightings(key: string): Sighting[] {
  const dot = key.lastIndexOf(".");
  const namespace = key.slice(0, dot);
  const property = key.slice(dot + 1);
  const out: Sighting[] = [];
  for (const target of TARGETS) {
    for (const module of target.modules) {
      if (module.namespace !== namespace) continue;
      const path = join(PKG, target.fixturesDir, module.fixture);
      if (!existsSync(path)) continue;
      const doc = JSON.parse(readFileSync(path, "utf8")) as { elements?: RefDocElement[] };
      for (const element of doc.elements ?? []) {
        if (element.type !== "PROPERTY" || element.name !== property) continue;
        out.push({ target: target.id, token: upstreamToken(element) });
      }
    }
  }
  return out;
}

describe("property-type correction provenance", () => {
  const entries = [...PROPERTY_TYPE_CORRECTIONS.entries()];

  test("the correction set is non-empty and every entry resolves to a real ref-doc property", () => {
    expect(entries.length).toBeGreaterThan(0);
    const unresolved = entries.filter(([key]) => sightings(key).length === 0).map(([key]) => key);
    expect(unresolved).toEqual([]);
  });

  test("every vendored ref-doc still declares the upstream token the correction overrides", () => {
    const drifted: string[] = [];
    for (const [key, correction] of entries) {
      for (const sighting of sightings(key)) {
        if (sighting.token !== correction.upstream) {
          drifted.push(
            `${key} in ${sighting.target}: pinned ${correction.upstream}, found ${sighting.token ?? "no type span"}`,
          );
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
