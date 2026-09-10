import { describe, expect, test } from "bun:test";
import { loadApiTargets, MODULE_MANIFEST, VERSIONED_MODULE_MANIFEST } from "../scripts/regen";
import { OPTIONAL_SLOT_CORRECTIONS } from "./emit-dts";
import {
  correctionProvenance,
  type ProvenanceSurface,
  retainedSurfaces,
  whollyUnmarkedNamespaces,
} from "./optional-correction-provenance";

interface FakeParameter {
  readonly name: string;
  readonly types?: readonly string[];
  readonly is_optional?: string;
}

interface FakeFunction {
  readonly name: string;
  readonly parameters: readonly FakeParameter[];
}

function surface(
  target: string,
  namespace: string,
  functions: readonly FakeFunction[],
): ProvenanceSurface {
  return {
    target,
    namespace,
    doc: {
      info: { namespace, brief: "", description: "" },
      elements: functions.map((fn) => ({
        type: "FUNCTION",
        name: fn.name,
        parameters: fn.parameters.map((p) => ({ doc: "", types: ["number"], ...p })),
      })),
    },
  };
}

const THROTTLE = "sys.set_engine_throttle:param:cooldown";

function throttle(cooldown: Omit<FakeParameter, "name">): FakeFunction {
  return {
    name: "sys.set_engine_throttle",
    parameters: [
      { name: "enable", types: ["boolean"], is_optional: "False" },
      { name: "cooldown", ...cooldown },
    ],
  };
}

const OLD = surface("old", "sys", [throttle({ is_optional: "False" })]);
const NEW = surface("new", "sys", [throttle({ is_optional: "True" })]);
const NEW_NIL = surface("newNil", "sys", [throttle({ types: ["number", "nil"] })]);

describe("per-target provenance — mixed-version inputs", () => {
  test("an older target that leaves the slot unmarked keeps the correction alive", () => {
    expect(correctionProvenance([THROTTLE], [OLD, NEW])).toEqual([
      { key: THROTTLE, sightedIn: ["new", "old"], neededBy: ["old"], markedIn: ["new"] },
    ]);
  });

  test("a nil type marks the slot the same as is_optional", () => {
    expect(correctionProvenance([THROTTLE], [NEW_NIL])).toEqual([
      { key: THROTTLE, sightedIn: ["newNil"], neededBy: [], markedIn: ["newNil"] },
    ]);
  });

  test("a correction is removable only once every retained target marks it", () => {
    expect(correctionProvenance([THROTTLE], [NEW, NEW_NIL])[0]?.neededBy).toEqual([]);
    expect(correctionProvenance([THROTTLE], [NEW, NEW_NIL, OLD])[0]?.neededBy).toEqual(["old"]);
  });

  test("an overload inside one target counts as needed while any declaration is unmarked", () => {
    const overloaded = surface("overloaded", "sys", [
      throttle({ is_optional: "True" }),
      throttle({ is_optional: "False" }),
    ]);
    expect(correctionProvenance([THROTTLE], [overloaded])).toEqual([
      { key: THROTTLE, sightedIn: ["overloaded"], neededBy: ["overloaded"], markedIn: [] },
    ]);
  });

  test("a key no surface declares stays visible with no sighting", () => {
    const noFunction = "sys.no_such_function:param:cooldown";
    const noSlot = "sys.set_engine_throttle:param:nope";
    expect(correctionProvenance([noFunction, noSlot], [OLD, NEW])).toEqual([
      { key: noFunction, sightedIn: [], neededBy: [], markedIn: [] },
      { key: noSlot, sightedIn: [], neededBy: [], markedIn: [] },
    ]);
  });

  test("wholly unmarked modules are computed per target", () => {
    const surfaces = [
      surface("old", "iap", [
        { name: "iap.buy", parameters: [{ name: "id" }, { name: "options" }] },
      ]),
      surface("old", "window", [{ name: "window.get_size", parameters: [] }]),
      surface("new", "iap", [
        {
          name: "iap.buy",
          parameters: [{ name: "id" }, { name: "options", is_optional: "False" }],
        },
      ]),
    ];
    expect(whollyUnmarkedNamespaces(surfaces)).toEqual(
      new Map([
        ["old", ["iap"]],
        ["new", []],
      ]),
    );
  });
});

const DEFAULT_TARGET = loadApiTargets().find((candidate) => candidate.default === true);
if (!DEFAULT_TARGET) throw new Error("api-targets.json: no default target");

// Every runtime module regen emits, in the default target and every older
// generated one, since the correction table is global and reaches them all.
const SURFACES = retainedSurfaces(DEFAULT_TARGET.id, MODULE_MANIFEST, VERSIONED_MODULE_MANIFEST);

// Corrections some retained target already marks optional while an older one
// still needs them, each with the targets that mark it. A metadata fix in one
// target lands here instead of deleting a correction older targets still pay for.
const CORRECTIONS_MARKED_UPSTREAM: Record<string, readonly string[]> = {};

describe("optional-slot correction provenance", () => {
  const entries = [...OPTIONAL_SLOT_CORRECTIONS.entries()];
  const provenance = correctionProvenance(
    entries.map(([key]) => key),
    SURFACES,
  );

  test("the correction set is non-empty and every entry resolves to a real ref-doc parameter", () => {
    expect(entries.length).toBeGreaterThan(0);
    const unresolved = provenance.filter((p) => p.sightedIn.length === 0).map((p) => p.key);
    expect(unresolved).toEqual([]);
  });

  test("every correction is still needed by some retained target", () => {
    // A red here means upstream fixed the metadata in every retained target:
    // delete the OPTIONAL_SLOT_CORRECTIONS entry, never re-pin it, once no
    // retained target needs it. Kept after the fix, the entry would silently
    // outlive the evidence that justified it.
    const redundant = provenance
      .filter((p) => p.sightedIn.length > 0 && p.neededBy.length === 0)
      .map(
        (p) =>
          `${p.key}: every retained target (${p.markedIn.join(", ")}) now marks it optional — delete the correction`,
      );
    expect(redundant).toEqual([]);
  });

  test("the corrections a retained target already marks are exactly the recorded ones", () => {
    const needed = provenance.filter((p) => p.neededBy.length > 0);
    const keys = new Set([
      ...needed.filter((p) => p.markedIn.length > 0).map((p) => p.key),
      ...Object.keys(CORRECTIONS_MARKED_UPSTREAM),
    ]);
    const drift: string[] = [];
    for (const key of keys) {
      const entry = needed.find((p) => p.key === key);
      const markedIn = entry?.markedIn ?? [];
      const recorded = CORRECTIONS_MARKED_UPSTREAM[key] ?? [];
      if (markedIn.join("\n") === [...recorded].sort().join("\n")) continue;
      drift.push(
        `${key}: marked in ${markedIn.join(", ")}, still needed by ${(entry?.neededBy ?? []).join(", ")} — record it; delete the correction once no retained target needs it`,
      );
    }
    expect(drift).toEqual([]);
  });

  test("every correction records the upstream evidence behind it", () => {
    const unexplained = entries
      .filter(([, evidence]) => evidence.trim().length === 0)
      .map(([key]) => key);
    expect(unexplained).toEqual([]);
  });
});

describe("modules upstream leaves wholly unmarked", () => {
  // In these modules `is_optional` is absent from every parameter, so every
  // parameter emits required whether or not the engine needs it, and only prose
  // or examples can tell the fidelity audit otherwise. The list is per target:
  // when upstream starts marking one in a release, it leaves that release's row
  // and gets a real optionality audit there, and a new target records its own
  // row, including any module that arrives unmarked.
  const UNMARKED_BY_TARGET: Record<string, string[]> = {
    "defold-1.13.1": ["iac", "iap", "push", "webview"],
    "defold-1.13.0": ["iac", "iap", "push", "webview"],
    "defold-1.12.4": ["iac", "iap", "push", "webview"],
  };

  test("each retained target carries no is_optional field on exactly its recorded modules", () => {
    expect(Object.fromEntries(whollyUnmarkedNamespaces(SURFACES))).toEqual(UNMARKED_BY_TARGET);
  });
});
