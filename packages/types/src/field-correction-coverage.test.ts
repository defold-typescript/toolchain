import { describe, expect, test } from "bun:test";
import resource113Doc from "../fixtures/defold-1.13.1/resource_doc.json" with { type: "json" };
import {
  type ApiTarget,
  assertCommittedFieldCorrectionCoverage,
  committedFieldCorrectionTargets,
  loadApiTargets,
  type ModuleManifestEntry,
  targetFieldCorrectionGaps,
  type VersionedModuleManifestEntry,
} from "../scripts/regen";
import slots from "../test/fixtures/defold-1.13.2-struct-slots.json" with { type: "json" };
import { type ApiModule, parseDefoldApiDoc } from "./api-doc";
import { LIST_FIELD_CORRECTIONS } from "./emit-dts";
import {
  FIELD_CORRECTION_TABLES,
  type FieldCorrectionTables,
  fieldCorrectionGaps,
} from "./field-correction-coverage";

// Verbatim 1.13.2 elements: `resource.create_atlas` and `resource.create_sound_data`
// with the structs their slots name, `b2d.world.cast_mover` over the `b2d`
// struct it names, and `sys.get_sys_info` with its return struct.
function modules113_2(): ApiModule[] {
  return [slots.resource, slots.b2d, slots["b2d.world"], slots.sys].map((doc) =>
    parseDefoldApiDoc(doc),
  );
}

const EMPTY: FieldCorrectionTables = {
  required: new Map(),
  list: new Map(),
  optionality: new Map(),
};

function tables(overrides: Partial<Record<keyof FieldCorrectionTables, string[]>>) {
  const withKeys = (keys: string[] | undefined) => new Map((keys ?? []).map((key) => [key, {}]));
  return {
    required: withKeys(overrides.required),
    list: withKeys(overrides.list),
    optionality: withKeys(overrides.optionality),
  } satisfies FieldCorrectionTables;
}

describe("fieldCorrectionGaps", () => {
  test("the production tables leave no gap on a 1.13.2 struct-typed surface", () => {
    expect(fieldCorrectionGaps(modules113_2(), FIELD_CORRECTION_TABLES)).toEqual([]);
  });

  test("resource.atlas carries the create_atlas list corrections on its members", () => {
    const listKeys = [...LIST_FIELD_CORRECTIONS.keys()].filter((key) =>
      key.startsWith("resource.create_atlas:"),
    );
    expect(listKeys.length).toBeGreaterThan(0);
    const memberKeys = [...LIST_FIELD_CORRECTIONS.keys()].filter((key) =>
      key.startsWith("resource.atlas:member:"),
    );
    expect(
      fieldCorrectionGaps(modules113_2(), tables({ list: [...listKeys, ...memberKeys] })),
    ).toEqual([]);
  });

  test("a slot-keyed list correction with no member-keyed counterpart is a gap on the struct", () => {
    const key = "resource.create_atlas:param:table:geometries";
    const gaps = fieldCorrectionGaps(modules113_2(), tables({ list: [key] }));
    expect(gaps.map((gap) => [gap.key, gap.struct])).toEqual([[key, "resource.atlas"]]);
  });

  test("a required correction upstream already states is satisfied", () => {
    const key = "b2d.world.cast_mover:param:capsule:radius";
    expect(fieldCorrectionGaps(modules113_2(), tables({ required: [key] }))).toEqual([]);
  });

  test("a required correction on an optional member needs its member-keyed entry", () => {
    const key = "resource.create_sound_data:param:options:data";
    const gaps = fieldCorrectionGaps(modules113_2(), tables({ required: [key] }));
    expect(gaps.map((gap) => [gap.key, gap.struct])).toEqual([
      [key, "resource.sound_data_options"],
    ]);
    expect(
      fieldCorrectionGaps(
        modules113_2(),
        tables({ required: [key, "resource.sound_data_options:member:data"] }),
      ),
    ).toEqual([]);
  });

  test("a nested list-element path resolves through the element struct", () => {
    const key = "resource.create_atlas:param:table:geometries[].vertices";
    expect(fieldCorrectionGaps(modules113_2(), tables({ required: [key] }))).toEqual([]);
    const missing = "resource.create_atlas:param:table:geometries[].normals";
    expect(
      fieldCorrectionGaps(modules113_2(), tables({ required: [missing] })).map((gap) => [
        gap.key,
        gap.struct,
      ]),
    ).toEqual([[missing, "resource.geometry"]]);
  });

  test("an optionality correction is satisfied only by an optional member", () => {
    const key = "sys.get_sys_info:return:sys_info:device_model";
    expect(fieldCorrectionGaps(modules113_2(), tables({ optionality: [key] }))).toEqual([]);
    const required = modules113_2().map((module) => ({
      ...module,
      structs: (module.structs ?? []).map((struct) => ({
        ...struct,
        members: struct.members.map((member) =>
          member.name === "device_model" ? { ...member, isOptional: false } : member,
        ),
      })),
    }));
    expect(
      fieldCorrectionGaps(required, tables({ optionality: [key] })).map((gap) => [
        gap.key,
        gap.struct,
      ]),
    ).toEqual([[key, "sys.sys_info"]]);
  });

  test("a declared element that lacks the slot is a gap", () => {
    const key = "resource.create_atlas:param:definition:texture";
    expect(
      fieldCorrectionGaps(modules113_2(), tables({ required: [key] })).map((gap) => gap.key),
    ).toEqual([key]);
  });

  test("an element the target does not declare reports nothing", () => {
    const key = "resource.set_atlas:param:table:texture";
    expect(fieldCorrectionGaps(modules113_2(), tables({ required: [key] }))).toEqual([]);
  });

  test("a prose table slot is not the checker's concern", () => {
    const modules = [parseDefoldApiDoc(resource113Doc)];
    expect(fieldCorrectionGaps(modules, FIELD_CORRECTION_TABLES)).toEqual([]);
    expect(fieldCorrectionGaps(modules, EMPTY)).toEqual([]);
  });
});

function entries113_2(): ModuleManifestEntry[] {
  return [slots.resource, slots.b2d, slots["b2d.world"], slots.sys].map((doc) => ({
    namespace: doc.info.namespace,
    doc,
    outFile: `${doc.info.namespace}.d.ts`,
  }));
}

function syntheticTarget(id: string, extra: Partial<ApiTarget> = {}): ApiTarget {
  return {
    id,
    fixturesDir: `fixtures/${id}`,
    generatedDir: `generated/${id}`,
    coreTypesImport: "../src/core-types",
    modules: [],
    ...extra,
  };
}

const STRANDED_SOUND_DATA = "resource.create_sound_data:param:options:data";
const STRANDED_ATLAS = "resource.create_atlas:param:table:geometries";

function rejection(
  targets: Parameters<typeof assertCommittedFieldCorrectionCoverage>[0],
  stranded: FieldCorrectionTables,
): string {
  try {
    assertCommittedFieldCorrectionCoverage(targets, stranded);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    return (error as Error).message;
  }
  throw new Error("expected the coverage gate to reject");
}

describe("committedFieldCorrectionTargets", () => {
  test("groups the default runtime surface and each fixture-backed version's runtime entries", () => {
    const runtime = entries113_2();
    const versioned = ["v-fixture", "v-refdoc"].flatMap((versionId) => [
      { ...runtime[0], versionId, editor: true },
      { ...runtime[1], versionId },
    ]) as VersionedModuleManifestEntry[];
    const groups = committedFieldCorrectionTargets(
      [
        syntheticTarget("v-default", { default: true }),
        syntheticTarget("v-fixture"),
        syntheticTarget("v-refdoc", { source: { kind: "ref-doc", version: "9.9.9" } }),
      ],
      runtime,
      versioned,
    );
    expect(groups).toEqual([
      { id: "v-default", entries: runtime },
      { id: "v-fixture", entries: [versioned[1] as VersionedModuleManifestEntry] },
    ]);
  });

  test("the production grouping judges every committed target and no editor document", () => {
    const targets = loadApiTargets();
    const groups = committedFieldCorrectionTargets();
    const ids = groups.map((group) => group.id);
    expect(ids).toContain((targets.find((target) => target.default === true) as ApiTarget).id);
    expect(groups.length).toBeGreaterThan(1);
    const sourceBacked = targets.filter((target) => (target.source ?? null) != null);
    expect(sourceBacked.length).toBeGreaterThan(0);
    for (const target of sourceBacked) expect(ids).not.toContain(target.id);
    for (const group of groups) {
      expect(group.entries.length).toBeGreaterThan(0);
      for (const entry of group.entries) expect("editor" in entry && entry.editor).not.toBe(true);
    }
  });
});

describe("assertCommittedFieldCorrectionCoverage", () => {
  test("every committed target passes, and the gate reports how many it judged", () => {
    expect(assertCommittedFieldCorrectionCoverage()).toBe(committedFieldCorrectionTargets().length);
  });

  test("a stranded correction rejects with every failing target and key named", () => {
    const stranded = tables({ required: [STRANDED_SOUND_DATA], list: [STRANDED_ATLAS] });
    const judged = [
      { id: "first-target", entries: entries113_2() },
      { id: "second-target", entries: entries113_2() },
    ];
    const message = rejection(judged, stranded);
    for (const needle of ["first-target", "second-target", STRANDED_SOUND_DATA, STRANDED_ATLAS]) {
      expect(message).toContain(needle);
    }
  });

  test("a target's skip rules withhold the slot a stranded correction names", () => {
    const stranded = tables({ required: [STRANDED_SOUND_DATA], list: [STRANDED_ATLAS] });
    const entries = entries113_2().map((entry) =>
      entry.namespace === "resource" ? { ...entry, skipFunctions: ["create_sound_data"] } : entry,
    );
    const message = rejection([{ id: "skipping-target", entries }], stranded);
    expect(message).toContain(STRANDED_ATLAS);
    expect(message).not.toContain(STRANDED_SOUND_DATA);
  });
});

describe("targetFieldCorrectionGaps", () => {
  test("a 1.13.2 entry set with a stranded correction reports it", () => {
    const entries = entries113_2();
    expect(targetFieldCorrectionGaps(entries)).toEqual([]);
    const gaps = targetFieldCorrectionGaps(
      entries,
      tables({ required: ["resource.create_sound_data:param:options:data"] }),
    );
    expect(gaps.map((gap) => gap.key)).toEqual(["resource.create_sound_data:param:options:data"]);
  });
});
