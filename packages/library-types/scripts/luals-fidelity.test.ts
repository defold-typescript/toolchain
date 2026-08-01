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

  test("a moduleObject's constant fields and a captured instance interface's methods count toward totalMembers", () => {
    const model: LibraryModel = {
      moduleObject: "Squid",
      interfaces: [
        {
          name: "Squid",
          generics: [],
          brief: "the module",
          methods: [],
          fields: [
            { name: "TRACE", types: ["integer"], doc: "t", isOptional: false },
            { name: "ALLOWLIST", types: ["table"], doc: "a", isOptional: false },
          ],
        },
        {
          name: "SquidInstance",
          generics: [],
          brief: "the instance",
          fields: [],
          methods: [
            {
              name: "log",
              brief: "log it",
              generics: [],
              params: [
                { name: "message", types: ["string"], doc: "", isOptional: false, isVararg: false },
              ],
              returns: [],
            },
            { name: "save_logs", brief: "save", generics: [], params: [], returns: [] },
          ],
        },
      ],
      aliases: [],
      moduleFunctions: [
        {
          name: "new",
          brief: "make",
          generics: [],
          params: [],
          returns: [
            { name: "", types: ["SquidInstance"], doc: "", isOptional: false, isVararg: false },
          ],
        },
      ],
    };
    const report = buildFidelityReport("squid", model, {});
    // 2 module constants + 2 instance methods + 1 module function.
    expect(report.totalMembers).toBe(5);
    // The instance-method and module-function type tokens flow through the tally cleanly.
    expect(report.unknownFallbacks).toBe(0);
    expect(report.coverage).toBe(1);
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

  test("a class overload counts its type token in totalTypeTokens without adding unknown fallbacks", () => {
    const model: LibraryModel = {
      interfaces: [
        {
          name: "Widget",
          generics: [],
          brief: "w",
          methods: [],
          fields: [],
          overloads: [{ type: "fun(vararg:any): any", doc: "" }],
        },
      ],
      aliases: [],
      moduleFunctions: [],
    };
    const report = buildFidelityReport("x", model, {});
    expect(report.totalTypeTokens).toBe(1);
    expect(report.unknownFallbacks).toBe(0);
  });

  test("non-public members are excluded from the tally and never contribute unknown tokens", () => {
    const build = (hidden: boolean): LibraryModel => ({
      interfaces: [
        {
          name: "Comp",
          generics: [],
          brief: "c",
          fields: [
            {
              name: "secret",
              types: ["some_unknown_field_class"],
              doc: "d",
              isOptional: false,
              ...(hidden ? { visibility: "private" as const } : {}),
            },
          ],
          methods: [
            {
              name: "hidden",
              brief: "m",
              generics: [],
              params: [
                {
                  name: "x",
                  types: ["some_unknown_param_class"],
                  doc: "",
                  isOptional: false,
                  isVararg: false,
                },
              ],
              returns: [],
              ...(hidden ? { visibility: "local" as const } : {}),
            },
          ],
        },
      ],
      aliases: [],
      moduleFunctions: [],
    });

    const pub = buildFidelityReport("x", build(false), {});
    const nonpub = buildFidelityReport("x", build(true), {});
    expect(nonpub.totalMembers).toBeLessThan(pub.totalMembers);
    expect(nonpub.totalTypeTokens).toBeLessThan(pub.totalTypeTokens);
    expect(nonpub.unknownTokens).not.toContain("some_unknown_field_class");
    expect(nonpub.unknownTokens).not.toContain("some_unknown_param_class");
    expect(pub.unknownTokens).toContain("some_unknown_field_class");
  });

  test("typing a callback field's params clears the unknown fallbacks an untyped fun(...) records", () => {
    const build = (fieldType: string): LibraryModel => ({
      interfaces: [
        { name: "druid.button", generics: [], brief: "the button", methods: [], fields: [] },
        {
          name: "druid.button.style",
          generics: [],
          brief: "the style",
          methods: [],
          fields: [{ name: "on_click", types: [fieldType], doc: "d", isOptional: false }],
        },
      ],
      aliases: [],
      moduleFunctions: [],
    });

    const untyped = buildFidelityReport("druid", build("fun(self, node)|nil"), {});
    expect(untyped.unknownFallbacks).toBe(2);
    expect(untyped.unknownTokens).toEqual(["node", "self"]);

    const typed = buildFidelityReport(
      "druid",
      build("fun(self: druid.button, node: node)|nil"),
      {},
    );
    expect(typed.unknownFallbacks).toBe(0);
    expect(typed.unknownTokens).toEqual([]);
    expect(typed.coverage).toBe(1);
  });

  test("a method with two return entries counts two type tokens, not one", () => {
    const model: LibraryModel = {
      interfaces: [
        {
          name: "Layout",
          generics: [],
          brief: "l",
          fields: [],
          methods: [
            {
              name: "get_content_size",
              brief: "size",
              generics: [],
              params: [],
              returns: [
                { name: "", types: ["number"], doc: "", isOptional: false, isVararg: false },
                { name: "", types: ["number"], doc: "", isOptional: false, isVararg: false },
              ],
            },
          ],
        },
      ],
      aliases: [],
      moduleFunctions: [],
    };
    const report = buildFidelityReport("x", model, {});
    expect(report.totalTypeTokens).toBe(2);
    expect(report.unknownFallbacks).toBe(0);
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
});

describe("buildFidelityReport with externalTypes", () => {
  const externalModel: LibraryModel = {
    interfaces: [
      {
        name: "holder",
        generics: [],
        brief: "a holder",
        methods: [],
        fields: [{ name: "hook", types: ["ext"], doc: "the hook", isOptional: false }],
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  test("an external token resolves rather than counting as an unknown fallback", () => {
    const report = buildFidelityReport(
      "demo",
      externalModel,
      {},
      {
        ext: { module: "other.mod", name: "ext" },
      },
    );
    expect(report.unknownFallbacks).toBe(0);
    expect(report.unknownTokens).toEqual([]);
    expect(report.coverage).toBe(1);
  });

  test("the same model without the external map still records the token as unknown", () => {
    const report = buildFidelityReport("demo", externalModel, {});
    expect(report.unknownTokens).toEqual(["ext"]);
  });
});
