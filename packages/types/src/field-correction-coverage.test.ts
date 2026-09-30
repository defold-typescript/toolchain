import { describe, expect, test } from "bun:test";
import resource113Doc from "../fixtures/defold-1.13.1/resource_doc.json" with { type: "json" };
import {
  MODULE_MANIFEST,
  targetFieldCorrectionGaps,
  VERSIONED_MODULE_MANIFEST,
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

describe("targetFieldCorrectionGaps", () => {
  test("every committed target reports no gap", () => {
    const byTarget = new Map<string, typeof MODULE_MANIFEST>([["default", MODULE_MANIFEST]]);
    for (const entry of VERSIONED_MODULE_MANIFEST) {
      if (entry.editor === true) continue;
      byTarget.set(entry.versionId, [...(byTarget.get(entry.versionId) ?? []), entry]);
    }
    expect(byTarget.size).toBeGreaterThan(1);
    for (const entries of byTarget.values()) {
      expect(targetFieldCorrectionGaps(entries)).toEqual([]);
    }
  });

  test("a 1.13.2 entry set with a stranded correction reports it", () => {
    const entries = [slots.resource, slots.b2d, slots["b2d.world"], slots.sys].map((doc) => ({
      namespace: doc.info.namespace,
      doc,
      outFile: `${doc.info.namespace}.d.ts`,
    }));
    expect(targetFieldCorrectionGaps(entries)).toEqual([]);
    const gaps = targetFieldCorrectionGaps(
      entries,
      tables({ required: ["resource.create_sound_data:param:options:data"] }),
    );
    expect(gaps.map((gap) => gap.key)).toEqual(["resource.create_sound_data:param:options:data"]);
  });
});
