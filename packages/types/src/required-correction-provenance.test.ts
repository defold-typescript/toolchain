import { describe, expect, test } from "bun:test";
import { EXTENSION_GOLDEN_MANIFEST } from "../scripts/extension-goldens";
import { loadApiTargets, MODULE_MANIFEST, VERSIONED_MODULE_MANIFEST } from "../scripts/regen";
import { REQUIRED_SLOT_CORRECTIONS } from "./emit-dts";
import { correctionProvenance, retainedSurfaces } from "./optional-correction-provenance";

const DEFAULT_TARGET = loadApiTargets().find((candidate) => candidate.default === true);
if (!DEFAULT_TARGET) throw new Error("api-targets.json: no default target");

const SURFACES = retainedSurfaces(
  DEFAULT_TARGET.id,
  MODULE_MANIFEST,
  VERSIONED_MODULE_MANIFEST,
  EXTENSION_GOLDEN_MANIFEST,
);

describe("required-slot correction provenance", () => {
  const entries = [...REQUIRED_SLOT_CORRECTIONS.entries()];
  const provenance = correctionProvenance(
    entries.map(([key]) => key),
    SURFACES,
  );

  test("every entry resolves to a real ref-doc parameter", () => {
    expect(entries.length).toBeGreaterThan(0);
    const unresolved = provenance.filter((p) => p.sightedIn.length === 0).map((p) => p.key);
    expect(unresolved).toEqual([]);
  });

  test("every correction is still needed by some retained target", () => {
    // The correction acts only where a ref-doc marks the slot omissible. A red
    // here means no retained target does any more: delete the entry.
    const redundant = provenance
      .filter((p) => p.sightedIn.length > 0 && p.markedIn.length === 0)
      .map((p) => `${p.key}: no retained target marks it omissible — delete the correction`);
    expect(redundant).toEqual([]);
  });

  test("every correction names the engine binding it rests on", () => {
    const unexplained = entries
      .filter(([, correction]) => !/^[\w./]+\.cpp:\w+ /.test(correction.evidence))
      .map(([key]) => key);
    expect(unexplained).toEqual([]);
  });
});
