import { describe, expect, test } from "bun:test";
import { EXTENSION_GOLDEN_MANIFEST } from "../scripts/extension-goldens";
import { loadApiTargets, MODULE_MANIFEST, VERSIONED_MODULE_MANIFEST } from "../scripts/regen";
import { parseDefoldApiDoc } from "./api-doc";
import { ENGINE_TYPE_NAME_OVERRIDES, engineTypeName } from "./engine-type-name";
import { retainedSurfaces } from "./optional-correction-provenance";

describe("engineTypeName", () => {
  test.each([
    ["EASING", "Easing"],
    ["BLEND_FACTOR", "BlendFactor"],
    ["sys_info", "SysInfo"],
    ["render_target", "RenderTarget"],
    ["b2Body", "B2Body"],
    ["btCollisionObject", "BtCollisionObject"],
    ["B2", "B2"],
    ["ClearBufferKey", "ClearBufferKey"],
  ])("%s -> %s", (reference, expected) => {
    expect(engineTypeName(reference)).toBe(expected);
  });

  test.each([
    ["PIEBOUNDS", "PieBounds"],
    ["SYSFIELD", "SysField"],
    ["LIVEUPDATE", "LiveUpdate"],
  ])("the override %s -> %s wins over the rule", (reference, expected) => {
    expect(engineTypeName(reference)).toBe(expected);
  });
});

describe("ENGINE_TYPE_NAME_OVERRIDES", () => {
  const defaultTarget = loadApiTargets().find((candidate) => candidate.default === true);
  if (!defaultTarget) throw new Error("api-targets.json: no default target");
  const referenceLeaves = new Set(
    retainedSurfaces(
      defaultTarget.id,
      MODULE_MANIFEST,
      VERSIONED_MODULE_MANIFEST,
      EXTENSION_GOLDEN_MANIFEST,
    ).flatMap((surface) => {
      const module = parseDefoldApiDoc(surface.doc);
      return [...(module.enums ?? []), ...(module.structs ?? []), ...module.typedefs].map(
        (element) => element.name.slice(element.name.lastIndexOf(".") + 1),
      );
    }),
  );
  const overrides = [...ENGINE_TYPE_NAME_OVERRIDES];

  test("the table is non-empty", () => {
    expect(overrides.length).toBeGreaterThan(0);
  });

  test("every override changes what the rule alone derives", () => {
    const redundant = overrides.filter(
      ([reference, name]) => engineTypeName(reference, new Map()) === name,
    );
    expect(redundant).toEqual([]);
  });

  test("every override names a reference type some retained target still declares", () => {
    expect(overrides.filter(([reference]) => !referenceLeaves.has(reference))).toEqual([]);
  });
});
