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

  test("an extends of a declared interface adds one resolved token", () => {
    const model: LibraryModel = {
      interfaces: [
        { name: "Base", generics: [], brief: "b", methods: [], fields: [] },
        { name: "Child", extends: "Base", generics: [], brief: "c", methods: [], fields: [] },
      ],
      aliases: [],
      moduleFunctions: [],
    };
    const report = buildFidelityReport("x", model, {});
    expect(report.totalTypeTokens).toBe(1);
    expect(report.unknownFallbacks).toBe(0);
  });

  test("an extends of an undeclared parent records the parent as an unknown fallback", () => {
    const model: LibraryModel = {
      interfaces: [
        { name: "Child", extends: "Ghost", generics: [], brief: "", methods: [], fields: [] },
      ],
      aliases: [],
      moduleFunctions: [],
    };
    const report = buildFidelityReport("x", model, {});
    expect(report.totalTypeTokens).toBe(1);
    expect(report.unknownFallbacks).toBe(1);
    expect(report.unknownTokens).toContain("Ghost");
  });

  test("an undeclared interface-generic constraint is an unknown fallback; a declared one is resolved", () => {
    const undeclared: LibraryModel = {
      interfaces: [
        {
          name: "Bag",
          generics: [{ name: "T", constraint: "Ghost" }],
          brief: "",
          methods: [],
          fields: [],
        },
      ],
      aliases: [],
      moduleFunctions: [],
    };
    const undeclaredReport = buildFidelityReport("x", undeclared, {});
    expect(undeclaredReport.totalTypeTokens).toBe(1);
    expect(undeclaredReport.unknownFallbacks).toBe(1);
    expect(undeclaredReport.unknownTokens).toContain("Ghost");

    const declared: LibraryModel = {
      interfaces: [
        { name: "Cmp", generics: [], brief: "", methods: [], fields: [] },
        {
          name: "Bag",
          generics: [{ name: "T", constraint: "Cmp" }],
          brief: "",
          methods: [],
          fields: [],
        },
      ],
      aliases: [],
      moduleFunctions: [],
    };
    const declaredReport = buildFidelityReport("x", declared, {});
    expect(declaredReport.totalTypeTokens).toBe(1);
    expect(declaredReport.unknownFallbacks).toBe(0);
  });

  test("an undeclared method-generic constraint is an unknown fallback", () => {
    const model: LibraryModel = {
      interfaces: [
        {
          name: "Mapper",
          generics: [],
          brief: "",
          fields: [],
          methods: [
            {
              name: "map",
              brief: "m",
              generics: [{ name: "U", constraint: "Ghost2" }],
              params: [],
              returns: [],
            },
          ],
        },
      ],
      aliases: [],
      moduleFunctions: [],
    };
    const report = buildFidelityReport("x", model, {});
    expect(report.totalTypeTokens).toBe(1);
    expect(report.unknownFallbacks).toBe(1);
    expect(report.unknownTokens).toContain("Ghost2");
  });

  test("building twice over the same model yields deeply-equal reports", () => {
    expect(buildFidelityReport("widgets", tinyModel, {})).toEqual(
      buildFidelityReport("widgets", tinyModel, {}),
    );
  });
});

describe("fidelity round-trip", () => {
  const targets = readLualsTargets(PACKAGE_ROOT);
  if (!targets.some((t) => t.namespace === "druid")) {
    throw new Error("druid target missing from luals-targets.json");
  }

  test.each(
    targets.map((t) => [t.namespace, t] as const),
  )("%s: the committed report matches a freshly built one (offline)", (namespace, target) => {
    const built = buildTargetFidelity(PACKAGE_ROOT, target);
    const committed = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "fidelity", `${namespace}.json`), "utf8"),
    );
    expect(built).toEqual(committed);
  });

  test.each(
    targets.map((t) => [t.namespace, t] as const),
  )("smoke floor: the %s report has members and type tokens", (_namespace, target) => {
    const built = buildTargetFidelity(PACKAGE_ROOT, target);
    expect(built.totalMembers).toBeGreaterThan(0);
    expect(built.totalTypeTokens).toBeGreaterThan(0);
  });
});
