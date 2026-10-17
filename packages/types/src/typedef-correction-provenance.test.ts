import { describe, expect, test } from "bun:test";
import { EXTENSION_GOLDEN_MANIFEST } from "../scripts/extension-goldens";
import { loadApiTargets, MODULE_MANIFEST, VERSIONED_MODULE_MANIFEST } from "../scripts/regen";
import { parseDefoldApiDoc } from "./api-doc";
import { TYPEDEF_ALIAS_CORRECTIONS } from "./emit-dts";
import { retainedSurfaces } from "./optional-correction-provenance";

const DEFAULT_TARGET = loadApiTargets().find((candidate) => candidate.default === true);
if (!DEFAULT_TARGET) throw new Error("api-targets.json: no default target");

const SURFACES = retainedSurfaces(
  DEFAULT_TARGET.id,
  MODULE_MANIFEST,
  VERSIONED_MODULE_MANIFEST,
  EXTENSION_GOLDEN_MANIFEST,
);

const DECLARED_ALIASES = SURFACES.flatMap((surface) =>
  parseDefoldApiDoc(surface.doc).typedefs.map((typedef) => ({
    name: typedef.name,
    aliasOf: typedef.aliasOf ?? [],
  })),
);

describe("typedef alias correction provenance", () => {
  const entries = [...TYPEDEF_ALIAS_CORRECTIONS.entries()];

  test("the correction set is non-empty", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  test("every correction's pinned token is a typedef some retained target still declares", () => {
    // A red here means every retained target changed that typedef, so the
    // correction is inert: delete it if upstream fixed the slot, or re-author it
    // against the new token it still gets wrong. Never re-pin it to pass.
    const stale = entries
      .filter(
        ([name, correction]) =>
          !DECLARED_ALIASES.some(
            (typedef) =>
              typedef.name === name &&
              typedef.aliasOf.length === 1 &&
              typedef.aliasOf[0] === correction.upstream,
          ),
      )
      .map(([name, correction]) => `${name}: no retained target declares ${correction.upstream}`);
    expect(stale).toEqual([]);
  });
});
