import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildFidelityReport } from "./luals-fidelity";
import type { LibraryModel } from "./parse-luals";
import { buildTargetFidelity, readLualsTargets } from "./sync-luals-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

const tinyModel: LibraryModel = {
  interfaces: [
    {
      name: "Widget",
      generics: [],
      brief: "a widget",
      methods: [],
      fields: [
        { name: "count", types: ["integer"], doc: "the count", isOptional: false },
        { name: "mystery", types: ["some_unlisted_class"], doc: "", isOptional: false },
      ],
    },
  ],
  aliases: [],
  moduleFunctions: [],
};

describe("buildFidelityReport", () => {
  test("tallies unknown fallbacks, undocumented members, and coverage", () => {
    const report = buildFidelityReport("widgets", tinyModel, {});
    expect(report.unknownFallbacks).toBe(1);
    expect(report.undocumentedMembers).toBe(1);
    expect(report.unknownTokens).toContain("some_unlisted_class");
    expect(report.coverage).toBeGreaterThanOrEqual(0);
    expect(report.coverage).toBeLessThanOrEqual(1);
    expect(report.totalMembers).toBeGreaterThan(0);
  });

  test("an unmapped vmath.* token makes the report throw (loud fail propagates)", () => {
    const model: LibraryModel = {
      interfaces: [
        {
          name: "Broken",
          generics: [],
          brief: "",
          methods: [],
          fields: [{ name: "v", types: ["vmath.made_up"], doc: "", isOptional: false }],
        },
      ],
      aliases: [],
      moduleFunctions: [],
    };
    expect(() => buildFidelityReport("broken", model, {})).toThrow(/vmath\.made_up/);
  });

  test("coverage clamps to 0 when one token records more unknowns than tokens", () => {
    const multiUnknownModel: LibraryModel = {
      interfaces: [
        {
          name: "Handler",
          generics: [],
          brief: "",
          methods: [],
          fields: [{ name: "cb", types: ["fun(self, ctx)"], doc: "", isOptional: false }],
        },
      ],
      aliases: [],
      moduleFunctions: [],
    };
    const report = buildFidelityReport("handler", multiUnknownModel, {});
    expect(report.unknownFallbacks).toBe(2);
    expect(report.totalTypeTokens).toBe(1);
    expect(report.coverage).toBe(0);
    expect(report.coverage).toBeGreaterThanOrEqual(0);
    expect(report.coverage).toBeLessThanOrEqual(1);
  });

  test("building twice over the same model yields deeply-equal reports", () => {
    expect(buildFidelityReport("widgets", tinyModel, {})).toEqual(
      buildFidelityReport("widgets", tinyModel, {}),
    );
  });
});

describe("druid fidelity round-trip", () => {
  const druid = readLualsTargets(PACKAGE_ROOT).find((t) => t.namespace === "druid");
  if (!druid) throw new Error("druid target missing from luals-targets.json");

  test("the committed report matches a freshly built one (offline)", () => {
    const built = buildTargetFidelity(PACKAGE_ROOT, druid);
    const committed = JSON.parse(readFileSync(join(PACKAGE_ROOT, "fidelity/druid.json"), "utf8"));
    expect(built).toEqual(committed);
  });

  test("smoke floor: the druid report has members and every vmath.* resolves", () => {
    const built = buildTargetFidelity(PACKAGE_ROOT, druid);
    expect(built.totalMembers).toBeGreaterThan(0);
    expect(built.totalTypeTokens).toBeGreaterThan(0);
  });
});
