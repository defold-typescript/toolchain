import { describe, expect, test } from "bun:test";
import { EXTENSION_GOLDEN_MANIFEST } from "../scripts/extension-goldens";
import { loadApiTargets, MODULE_MANIFEST, VERSIONED_MODULE_MANIFEST } from "../scripts/regen";
import {
  RETURN_FIELD_OPTIONALITY_CORRECTIONS,
  RETURN_TYPE_CORRECTIONS,
  type ReturnFieldOptionalityCorrection,
  type ReturnTypeCorrection,
} from "./emit-dts";
import { type ProvenanceSurface, retainedSurfaces } from "./optional-correction-provenance";
import {
  fieldCorrectionProvenance,
  returnCorrectionProvenance,
} from "./return-correction-provenance";

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

interface FakeReturn {
  readonly name?: string;
  readonly types?: readonly string[];
  readonly doc?: string;
}

interface FakeElement {
  readonly name: string;
  readonly returnvalues: readonly FakeReturn[];
}

// Raw ref-doc shape, so the fabricated inputs and the vendored fixtures enter
// the provenance functions through the same reader.
function surface(
  target: string,
  namespace: string,
  elements: readonly FakeElement[],
): ProvenanceSurface {
  return {
    target,
    namespace,
    doc: {
      info: { namespace, brief: "", description: "" },
      elements: elements.map((element) => ({
        type: "FUNCTION",
        name: element.name,
        returnvalues: element.returnvalues.map((slot) => ({
          name: "",
          doc: "",
          types: ["table"],
          ...slot,
        })),
      })),
    },
  };
}

const ADDRESS = "sys.get_ifaddrs:return:ifaddrs:address";
const ADDRESS_CORRECTION: ReturnFieldOptionalityCorrection = {
  upstream: ["string"],
  evidence: "might be nil if not available.",
};
const ADDRESS_ENTRIES: readonly [string, ReturnFieldOptionalityCorrection][] = [
  [ADDRESS, ADDRESS_CORRECTION],
];

const NEEDS_CORRECTION =
  '<span class="type">string</span> IP address. <span class="icon-attention"></span> might be <code>nil</code> if not available.';
const EVIDENCE_GONE = '<span class="type">string</span> IP address.';
const NIL_IN_TYPE_SPAN =
  '<span class="type">string | nil</span> IP address. <span class="icon-attention"></span> might be <code>nil</code> if not available.';
const RETYPED_STILL_NEEDED =
  '<span class="type">number</span> IP address. <span class="icon-attention"></span> might be <code>nil</code> if not available.';
const RETYPED_AND_RESOLVED = '<span class="type">number</span> IP address.';

function ifaddrs(addressDd: string | undefined): FakeElement {
  const fields = ['<dt><code>name</code></dt>\n<dd><span class="type">string</span> Name</dd>'];
  if (addressDd !== undefined) {
    fields.push(`<dt><code>address</code></dt>\n<dd>${addressDd}</dd>`);
  }
  return {
    name: "sys.get_ifaddrs",
    returnvalues: [
      {
        name: "ifaddrs",
        types: ["table"],
        doc: `an array of tables.\n<dl>\n${fields.join("\n")}\n</dl>`,
      },
    ],
  };
}

const GET_BODY = "b2d.get_body";
const GET_BODY_CORRECTION: ReturnTypeCorrection = {
  ts: 'Opaque<"b2Body"> | undefined',
  upstream: ["b2Body"],
  reason: "the body if successful. Otherwise nil.",
};
const GET_BODY_ENTRIES: readonly [string, ReturnTypeCorrection][] = [
  [GET_BODY, GET_BODY_CORRECTION],
];

function getBody(types: readonly string[], doc: string): FakeElement {
  return { name: "b2d.get_body", returnvalues: [{ name: "body", types, doc }] };
}

const BODY_REASON = "the body if successful. Otherwise nil.";

describe("per-target provenance — mixed-version inputs", () => {
  test("an older target that still documents the gate keeps the field correction alive", () => {
    const old = surface("old", "sys", [ifaddrs(NEEDS_CORRECTION)]);
    const fixed = surface("new", "sys", [ifaddrs(EVIDENCE_GONE)]);
    expect(fieldCorrectionProvenance(ADDRESS_ENTRIES, [old, fixed])).toEqual([
      {
        key: ADDRESS,
        sightedIn: ["new", "old"],
        neededBy: ["old"],
        resolvedIn: ["new"],
        missingFieldIn: [],
        typeDrift: [],
      },
    ]);
  });

  test("a nil token in the field's type span resolves it the same as the prose going", () => {
    const nilTyped = surface("newNil", "sys", [ifaddrs(NIL_IN_TYPE_SPAN)]);
    expect(fieldCorrectionProvenance(ADDRESS_ENTRIES, [nilTyped])).toEqual([
      {
        key: ADDRESS,
        sightedIn: ["newNil"],
        neededBy: [],
        resolvedIn: ["newNil"],
        missingFieldIn: [],
        typeDrift: [],
      },
    ]);
  });

  test("a field correction is deletable only once no retained target needs it", () => {
    const old = surface("old", "sys", [ifaddrs(NEEDS_CORRECTION)]);
    const fixed = surface("new", "sys", [ifaddrs(EVIDENCE_GONE)]);
    const nilTyped = surface("newNil", "sys", [ifaddrs(NIL_IN_TYPE_SPAN)]);
    const resolvedOnly = fieldCorrectionProvenance(ADDRESS_ENTRIES, [fixed, nilTyped])[0];
    expect(resolvedOnly?.neededBy).toEqual([]);
    expect(resolvedOnly?.sightedIn).toEqual(["new", "newNil"]);
    expect(fieldCorrectionProvenance(ADDRESS_ENTRIES, [fixed, nilTyped, old])[0]?.neededBy).toEqual(
      ["old"],
    );
  });

  test("a target needing the correction anywhere needs it despite a resolved declaration", () => {
    const mixed = surface("mixed", "sys", [ifaddrs(EVIDENCE_GONE), ifaddrs(NEEDS_CORRECTION)]);
    expect(fieldCorrectionProvenance(ADDRESS_ENTRIES, [mixed])).toEqual([
      {
        key: ADDRESS,
        sightedIn: ["mixed"],
        neededBy: ["mixed"],
        resolvedIn: [],
        missingFieldIn: [],
        typeDrift: [],
      },
    ]);
  });

  test("the field type pin binds where the correction is needed and nowhere else", () => {
    const retyped = surface("retyped", "sys", [ifaddrs(RETYPED_STILL_NEEDED)]);
    expect(fieldCorrectionProvenance(ADDRESS_ENTRIES, [retyped])[0]).toEqual({
      key: ADDRESS,
      sightedIn: ["retyped"],
      neededBy: ["retyped"],
      resolvedIn: [],
      missingFieldIn: [],
      typeDrift: ["retyped: pinned string, found number"],
    });

    const retypedAndResolved = surface("retypedNew", "sys", [ifaddrs(RETYPED_AND_RESOLVED)]);
    expect(fieldCorrectionProvenance(ADDRESS_ENTRIES, [retypedAndResolved])[0]).toEqual({
      key: ADDRESS,
      sightedIn: ["retypedNew"],
      neededBy: [],
      resolvedIn: ["retypedNew"],
      missingFieldIn: [],
      typeDrift: [],
    });
  });

  test("a field gone from a slot the target still declares is a hard failure, never a resolution", () => {
    const dropped = surface("dropped", "sys", [ifaddrs(undefined)]);
    expect(fieldCorrectionProvenance(ADDRESS_ENTRIES, [dropped])[0]).toEqual({
      key: ADDRESS,
      sightedIn: ["dropped"],
      neededBy: [],
      resolvedIn: [],
      missingFieldIn: ["dropped"],
      typeDrift: [],
    });
  });

  test("a field key no surface declares stays visible with no sighting", () => {
    const old = surface("old", "sys", [ifaddrs(NEEDS_CORRECTION)]);
    const noElement = "sys.no_such_function:return:ifaddrs:address";
    const noSlot = "sys.get_ifaddrs:return:nope:address";
    expect(
      fieldCorrectionProvenance(
        [
          [noElement, ADDRESS_CORRECTION],
          [noSlot, ADDRESS_CORRECTION],
        ],
        [old],
      ).map((entry) => entry.sightedIn),
    ).toEqual([[], []]);
  });

  test("an older target that still contradicts the declared return keeps the type correction alive", () => {
    const old = surface("old", "b2d", [getBody(["b2Body"], BODY_REASON)]);
    const fixed = surface("new", "b2d", [getBody(["b2Body", "nil"], BODY_REASON)]);
    expect(returnCorrectionProvenance(GET_BODY_ENTRIES, [old, fixed])).toEqual([
      { key: GET_BODY, sightedIn: ["new", "old"], neededBy: ["old"], resolvedIn: ["new"] },
    ]);
  });

  test("a target that keeps the tokens but drops the contradicting prose resolves it too", () => {
    const proseGone = surface("proseGone", "b2d", [getBody(["b2Body"], "the body.")]);
    expect(returnCorrectionProvenance(GET_BODY_ENTRIES, [proseGone])).toEqual([
      { key: GET_BODY, sightedIn: ["proseGone"], neededBy: [], resolvedIn: ["proseGone"] },
    ]);
  });

  test("a return-type correction is deletable only once no retained target needs it", () => {
    const old = surface("old", "b2d", [getBody(["b2Body"], BODY_REASON)]);
    const fixed = surface("new", "b2d", [getBody(["b2Body", "nil"], BODY_REASON)]);
    const proseGone = surface("proseGone", "b2d", [getBody(["b2Body"], "the body.")]);
    expect(returnCorrectionProvenance(GET_BODY_ENTRIES, [fixed, proseGone])[0]?.neededBy).toEqual(
      [],
    );
    expect(
      returnCorrectionProvenance(GET_BODY_ENTRIES, [fixed, proseGone, old])[0]?.neededBy,
    ).toEqual(["old"]);
  });

  test("a return key no surface declares stays visible with no sighting", () => {
    const old = surface("old", "b2d", [getBody(["b2Body"], BODY_REASON)]);
    expect(
      returnCorrectionProvenance([["b2d.no_such_function", GET_BODY_CORRECTION]], [old]),
    ).toEqual([{ key: "b2d.no_such_function", sightedIn: [], neededBy: [], resolvedIn: [] }]);
  });
});

const DEFAULT_TARGET = loadApiTargets().find((candidate) => candidate.default === true);
if (!DEFAULT_TARGET) throw new Error("api-targets.json: no default target");

// Every runtime module regen emits, in the default target and every older
// generated one, plus the extension goldens `resolve` reproduces, since both
// correction tables are global and reach them all.
const SURFACES = retainedSurfaces(
  DEFAULT_TARGET.id,
  MODULE_MANIFEST,
  VERSIONED_MODULE_MANIFEST,
  EXTENSION_GOLDEN_MANIFEST,
);

// Corrections some retained target already documents correctly while an older
// one still needs them, each with the targets that resolved it. An upstream fix
// in one target lands here instead of deleting a correction older targets still
// pay for.
const FIELD_CORRECTIONS_RESOLVED_UPSTREAM: Record<string, readonly string[]> = {};
const RETURN_CORRECTIONS_RESOLVED_UPSTREAM: Record<string, readonly string[]> = {};

interface LifecycleVerdict {
  readonly key: string;
  readonly neededBy: readonly string[];
  readonly resolvedIn: readonly string[];
}

// Both classes record the same two-way fact, so they share the comparison: a
// still-needed correction whose resolved set is not the recorded one reds,
// naming both sets and both outcomes.
function resolvedUpstreamDrift(
  provenance: readonly LifecycleVerdict[],
  recorded: Record<string, readonly string[]>,
): string[] {
  const needed = provenance.filter((entry) => entry.neededBy.length > 0);
  const keys = new Set([
    ...needed.filter((entry) => entry.resolvedIn.length > 0).map((entry) => entry.key),
    ...Object.keys(recorded),
  ]);
  const drift: string[] = [];
  for (const key of keys) {
    const entry = needed.find((candidate) => candidate.key === key);
    const resolvedIn = entry?.resolvedIn ?? [];
    if (resolvedIn.join("\n") === [...(recorded[key] ?? [])].sort().join("\n")) continue;
    drift.push(
      `${key}: already documented in ${resolvedIn.join(", ")}, still needed by ${(entry?.neededBy ?? []).join(", ")} — record it; delete the correction once no retained target needs it`,
    );
  }
  return drift;
}

describe("return field-optionality correction provenance", () => {
  const entries = [...RETURN_FIELD_OPTIONALITY_CORRECTIONS.entries()];
  const provenance = fieldCorrectionProvenance(entries, SURFACES);

  test("the correction set is non-empty and every entry names a return slot", () => {
    expect(entries.length).toBeGreaterThan(0);
    const misKeyed = entries
      .filter(([key]) => splitFieldKey(key).kind !== "return")
      .map(([key]) => key);
    expect(misKeyed).toEqual([]);
  });

  test("every entry resolves to a real return slot in some retained target", () => {
    const unresolved = provenance.filter((entry) => entry.sightedIn.length === 0).map((e) => e.key);
    expect(unresolved).toEqual([]);
  });

  test("every correction is still needed by some retained target", () => {
    // A red here means upstream fixed the gate in every retained target: delete
    // the RETURN_FIELD_OPTIONALITY_CORRECTIONS entry, never re-pin it, once no
    // retained target needs it. Kept after the fix, the entry would silently
    // outlive the evidence that justified it.
    const redundant = provenance
      .filter(
        (entry) =>
          entry.sightedIn.length > 0 &&
          entry.neededBy.length === 0 &&
          entry.missingFieldIn.length === 0,
      )
      .map(
        (entry) =>
          `${entry.key}: every retained target (${entry.resolvedIn.join(", ")}) now documents it — delete the correction`,
      );
    expect(redundant).toEqual([]);
  });

  test("no retained target has dropped a field a correction still names", () => {
    // Separate from the deletion signal above: a field gone from a slot the
    // target still declares makes `applyFieldOptionalityCorrections` throw
    // there, so regen breaks rather than re-widening.
    const stale = provenance
      .filter((entry) => entry.missingFieldIn.length > 0)
      .map(
        (entry) =>
          `${entry.key}: no longer documented in ${entry.missingFieldIn.join(", ")} — applyFieldOptionalityCorrections throws for that target`,
      );
    expect(stale).toEqual([]);
  });

  test("the field type pin holds wherever the correction is needed", () => {
    expect(provenance.flatMap((entry) => entry.typeDrift)).toEqual([]);
  });

  test("the corrections a retained target already documents are exactly the recorded ones", () => {
    expect(resolvedUpstreamDrift(provenance, FIELD_CORRECTIONS_RESOLVED_UPSTREAM)).toEqual([]);
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
  const provenance = returnCorrectionProvenance(entries, SURFACES);

  test("the correction set is non-empty and every entry resolves to a real return", () => {
    expect(entries.length).toBeGreaterThan(0);
    const unresolved = provenance.filter((entry) => entry.sightedIn.length === 0).map((e) => e.key);
    expect(unresolved).toEqual([]);
  });

  test("every correction is still needed by some retained target", () => {
    // A red here means every retained target now declares the token or dropped
    // the contradicting prose: delete the RETURN_TYPE_CORRECTIONS entry, never
    // re-pin it, once no retained target needs it.
    const redundant = provenance
      .filter((entry) => entry.sightedIn.length > 0 && entry.neededBy.length === 0)
      .map(
        (entry) =>
          `${entry.key}: every retained target (${entry.resolvedIn.join(", ")}) now documents it — delete the correction`,
      );
    expect(redundant).toEqual([]);
  });

  test("the returns a retained target already documents are exactly the recorded ones", () => {
    expect(resolvedUpstreamDrift(provenance, RETURN_CORRECTIONS_RESOLVED_UPSTREAM)).toEqual([]);
  });

  test("every correction states why it overrides upstream", () => {
    const unexplained = entries
      .filter(([, correction]) => correction.reason.trim().length === 0)
      .map(([key]) => key);
    expect(unexplained).toEqual([]);
  });
});
