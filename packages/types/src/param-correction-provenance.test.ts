import { describe, expect, test } from "bun:test";
import { EXTENSION_GOLDEN_MANIFEST } from "../scripts/extension-goldens";
import { loadApiTargets, MODULE_MANIFEST, VERSIONED_MODULE_MANIFEST } from "../scripts/regen";
import { PARAM_TYPE_CORRECTIONS, type ParamTypeCorrection } from "./emit-dts";
import { type ProvenanceSurface, retainedSurfaces } from "./optional-correction-provenance";
import { paramCorrectionProvenance } from "./param-correction-provenance";

interface FakeParameter {
  readonly name: string;
  readonly types: readonly string[];
}

// Raw ref-doc shape, so the fabricated inputs and the vendored fixtures enter
// the provenance function through the same parser.
function surface(
  target: string,
  namespace: string,
  elements: readonly { name: string; parameters: readonly FakeParameter[] }[],
): ProvenanceSurface {
  return {
    target,
    namespace,
    doc: {
      info: { namespace, brief: "", description: "" },
      elements: elements.map((element) => ({
        type: "FUNCTION",
        name: element.name,
        brief: "",
        description: "",
        returnvalues: [],
        parameters: element.parameters.map((parameter) => ({
          ...parameter,
          doc: "",
          is_optional: "False",
        })),
      })),
    },
  };
}

const KEY = "render.set_render_target:param:render_target";
const CORRECTION: ParamTypeCorrection = {
  adds: "string | Hash",
  upstream: ["render_target"],
  reason: "example `render.set_render_target('my_rt_resource')`",
};
const ENTRIES: readonly [string, ParamTypeCorrection][] = [[KEY, CORRECTION]];

function setRenderTarget(types: readonly string[]) {
  return { name: "render.set_render_target", parameters: [{ name: "render_target", types }] };
}

describe("per-target provenance — fabricated inputs", () => {
  test("a target still declaring the pinned tokens needs the correction", () => {
    const old = surface("old", "render", [setRenderTarget(["render_target"])]);
    const fixed = surface("new", "render", [setRenderTarget(["render_target", "string", "hash"])]);
    expect(paramCorrectionProvenance(ENTRIES, [old, fixed])).toEqual([
      { key: KEY, sightedIn: ["new", "old"], neededBy: ["old"], resolvedIn: ["new"] },
    ]);
  });

  test("a nil token alone does not resolve it — optionality is a separate table", () => {
    const nilTyped = surface("t", "render", [setRenderTarget(["render_target", "nil"])]);
    expect(paramCorrectionProvenance(ENTRIES, [nilTyped])[0]?.neededBy).toEqual(["t"]);
  });

  test("an overload that still shows the defect keeps the target needing it", () => {
    const mixed = surface("t", "render", [
      setRenderTarget(["render_target", "string"]),
      setRenderTarget(["render_target"]),
    ]);
    expect(paramCorrectionProvenance(ENTRIES, [mixed])[0]?.neededBy).toEqual(["t"]);
  });

  test("a target declaring a retyped pin still needs the correction", () => {
    const retyped: readonly [string, ParamTypeCorrection][] = [
      [KEY, { ...CORRECTION, retypedUpstream: [["render_target", "string"]] }],
    ];
    const later = surface("later", "render", [setRenderTarget(["render_target", "string", "nil"])]);
    const fixed = surface("fixed", "render", [
      setRenderTarget(["render_target", "string", "hash"]),
    ]);
    expect(paramCorrectionProvenance(retyped, [later, fixed])).toEqual([
      { key: KEY, sightedIn: ["fixed", "later"], neededBy: ["later"], resolvedIn: ["fixed"] },
    ]);
  });

  test("a target declaring neither pin resolves it", () => {
    const retyped: readonly [string, ParamTypeCorrection][] = [
      [KEY, { ...CORRECTION, retypedUpstream: [["render_target", "string"]] }],
    ];
    const other = surface("t", "render", [setRenderTarget(["string", "render_target"])]);
    expect(paramCorrectionProvenance(retyped, [other])[0]?.resolvedIn).toEqual(["t"]);
  });

  test("a slot no surface declares stays visible with no sighting", () => {
    const other = surface("t", "render", [
      { name: "render.set_render_target", parameters: [{ name: "target", types: ["x"] }] },
    ]);
    expect(paramCorrectionProvenance(ENTRIES, [other])).toEqual([
      { key: KEY, sightedIn: [], neededBy: [], resolvedIn: [] },
    ]);
  });
});

const DEFAULT_TARGET = loadApiTargets().find((candidate) => candidate.default === true);
if (!DEFAULT_TARGET) throw new Error("api-targets.json: no default target");

// The table is global, so it reaches every runtime module regen emits and the
// extension goldens `resolve` reproduces.
const SURFACES = retainedSurfaces(
  DEFAULT_TARGET.id,
  MODULE_MANIFEST,
  VERSIONED_MODULE_MANIFEST,
  EXTENSION_GOLDEN_MANIFEST,
);

// Corrections some retained target already declares correctly while an older
// one still needs them, each with the targets that resolved it.
const PARAM_CORRECTIONS_RESOLVED_UPSTREAM: Record<string, readonly string[]> = {};

describe("parameter-type correction provenance", () => {
  const entries = [...PARAM_TYPE_CORRECTIONS.entries()];
  const provenance = paramCorrectionProvenance(entries, SURFACES);

  test("the correction set is non-empty and every key names a param slot", () => {
    expect(entries.length).toBeGreaterThan(0);
    const misKeyed = entries.filter(([key]) => key.split(":")[1] !== "param").map(([key]) => key);
    expect(misKeyed).toEqual([]);
  });

  test("every correction still contradicts an upstream slot in some retained target", () => {
    // A red here means the slot is gone, or every retained target now declares
    // other tokens: delete the PARAM_TYPE_CORRECTIONS entry, never re-pin it.
    // Kept, the entry would overwrite a type nobody verified.
    const stale = provenance
      .filter((entry) => entry.neededBy.length === 0)
      .map((entry) =>
        entry.sightedIn.length === 0
          ? `${entry.key}: no retained target declares this slot — delete the correction`
          : `${entry.key}: no retained target (${entry.resolvedIn.join(", ")}) still declares the pinned tokens — delete the correction`,
      );
    expect(stale).toEqual([]);
  });

  test("the corrections a retained target already resolves are exactly the recorded ones", () => {
    const drift = provenance
      .filter(
        (entry) =>
          entry.neededBy.length > 0 &&
          entry.resolvedIn.join("\n") !==
            [...(PARAM_CORRECTIONS_RESOLVED_UPSTREAM[entry.key] ?? [])].sort().join("\n"),
      )
      .map(
        (entry) =>
          `${entry.key}: resolved in ${entry.resolvedIn.join(", ")}, still needed by ${entry.neededBy.join(", ")} — record it; delete the correction once no retained target needs it`,
      );
    expect(drift).toEqual([]);
  });

  test("every correction states the upstream evidence it rests on", () => {
    const unexplained = entries
      .filter(([, correction]) => correction.reason.trim().length === 0)
      .map(([key]) => key);
    expect(unexplained).toEqual([]);
  });
});
