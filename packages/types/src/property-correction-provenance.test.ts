import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import apiTargets from "../api-targets.json" with { type: "json" };
import { pinMatches, propertyCorrectionPins, spanTokens } from "./correction-pins";
import { PROPERTY_KEY_RANGES, PROPERTY_TYPE_CORRECTIONS } from "./emit-dts";

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
  readonly brief: string;
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
        out.push({ target: target.id, token: upstreamToken(element), brief: element.brief ?? "" });
      }
    }
  }
  return out;
}

// Property corrections a retained target already declares correctly while an
// older one still needs them, each with the targets whose span changed to the
// corrected type. A changed span in every retained target is a deletion instead.
const PROPERTY_CORRECTIONS_RESOLVED_UPSTREAM: Record<string, readonly string[]> = {
  "camera.projection": ["defold-1.13.2"],
  "camera.view": ["defold-1.13.2"],
};

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
      const pins = propertyCorrectionPins(correction);
      const resolvedIn = PROPERTY_CORRECTIONS_RESOLVED_UPSTREAM[key] ?? [];
      for (const sighting of sightings(key)) {
        if (resolvedIn.includes(sighting.target)) continue;
        if (sighting.token === undefined || !pinMatches(spanTokens(sighting.token), pins)) {
          drifted.push(
            `${key} in ${sighting.target}: pinned ${[correction.upstream, ...(correction.retypedUpstream ?? [])].join(" or ")}, found ${sighting.token ?? "no type span"}`,
          );
        }
      }
    }
    expect(drifted).toEqual([]);
  });

  test("each recorded resolution is a target whose span no longer carries a pin, while an older target still does", () => {
    const stale: string[] = [];
    for (const [key, targets] of Object.entries(PROPERTY_CORRECTIONS_RESOLVED_UPSTREAM)) {
      const correction = PROPERTY_TYPE_CORRECTIONS.get(key);
      if (correction === undefined) {
        stale.push(`${key}: no such correction`);
        continue;
      }
      const pins = propertyCorrectionPins(correction);
      const pinned = (sighting: Sighting) =>
        sighting.token !== undefined && pinMatches(spanTokens(sighting.token), pins);
      const found = sightings(key);
      for (const target of targets) {
        const own = found.filter((sighting) => sighting.target === target);
        if (own.length === 0 || own.some(pinned)) {
          stale.push(`${key}: ${target} still declares the pinned span — drop the record`);
        }
      }
      if (!found.some((sighting) => !targets.includes(sighting.target) && pinned(sighting))) {
        stale.push(`${key}: no older target still needs it — delete the correction`);
      }
    }
    expect(stale).toEqual([]);
  });

  test("every correction states why it overrides upstream", () => {
    const unexplained = entries
      .filter(([, correction]) => correction.reason.trim().length === 0)
      .map(([key]) => key);
    expect(unexplained).toEqual([]);
  });
});

describe("property key range provenance", () => {
  const entries = [...PROPERTY_KEY_RANGES.entries()];

  test("the range set is non-empty and every entry resolves to a real ref-doc property", () => {
    expect(entries.length).toBeGreaterThan(0);
    const unresolved = entries.filter(([key]) => sightings(key).length === 0).map(([key]) => key);
    expect(unresolved).toEqual([]);
  });

  test("every entry's evidence states the exact range it expands to", () => {
    const unstated = entries
      .filter(([, entry]) => !entry.evidence.includes(`${entry.first}-${entry.last}`))
      .map(
        ([key, entry]) => `${key}: "${entry.evidence}" does not state ${entry.first}-${entry.last}`,
      );
    expect(unstated).toEqual([]);
  });

  test("every vendored ref-doc still states the range the entry stands for", () => {
    const drifted: string[] = [];
    for (const [key, entry] of entries) {
      for (const sighting of sightings(key)) {
        if (!sighting.brief.includes(entry.evidence)) {
          drifted.push(`${key} in ${sighting.target}: brief no longer says "${entry.evidence}"`);
        }
      }
    }
    expect(drifted).toEqual([]);
  });
});
