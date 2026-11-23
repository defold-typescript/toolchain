import { describe, expect, test } from "bun:test";
import * as apiDoc from "../src/api-doc";
import * as docCorrections from "../src/doc-corrections";
import type { ParamTypeCorrection } from "../src/emit-dts";
import * as emitDts from "../src/emit-dts";
import * as emitMessages from "../src/emit-messages";
import { bindingEvidenceFor } from "./binding-pin";
import {
  parseReplacementPinBaseline,
  REPLACEMENT_TABLES,
  type ReplacementTable,
  readReplacementPinBaseline,
  replacementPinFindings,
  UNPINNED_TABLES,
} from "./replacement-pins";
import { vendoredTargets } from "./sync-engine-bindings";

function registered(name: string): ReplacementTable {
  const table = REPLACEMENT_TABLES.find((candidate) => candidate.name === name);
  if (!table) throw new Error(`${name} is not registered`);
  return table;
}

function withEntries(name: string, entries: readonly (readonly [string, unknown])[]) {
  return { ...registered(name), entries };
}

const PINNED_PARAM: ParamTypeCorrection = {
  upstream: ["number"],
  reason: "the binding checks a string",
  ts: "string",
  binding: {
    file: "gamesys/src/gamesys/scripts/script_factory.cpp",
    cFunction: "FactoryComp_Create",
    contains: "luaL_checkstring(L, 1);",
  },
};

const { binding: _binding, ...UNPINNED_PARAM } = PINNED_PARAM;
const KEY = "factory.create:param:url";

describe("replacementPinFindings", () => {
  test("a pinned entry whose pin holds and that is not baselined yields nothing", () => {
    const tables = [withEntries("PARAM_TYPE_CORRECTIONS", [[KEY, PINNED_PARAM]])];
    expect(replacementPinFindings(tables, [], new Set([KEY]))).toEqual([]);
  });

  test("a pinned entry whose pin holds on no vendored target is a finding", () => {
    const tables = [withEntries("PARAM_TYPE_CORRECTIONS", [[KEY, PINNED_PARAM]])];
    expect(replacementPinFindings(tables, [], new Set())).toEqual([
      `PARAM_TYPE_CORRECTIONS:${KEY}: its pin holds on no vendored target`,
    ]);
  });

  test("an unpinned entry missing from the baseline names the pins its table accepts", () => {
    const tables = [withEntries("PARAM_TYPE_CORRECTIONS", [[KEY, UNPINNED_PARAM]])];
    expect(replacementPinFindings(tables, [], new Set([KEY]))).toEqual([
      `PARAM_TYPE_CORRECTIONS:${KEY}: no binding or engine pin (the table accepts a binding pin)`,
    ]);
  });

  test("an unpinned entry of a table with no pin field says so", () => {
    const tables = [
      withEntries("VARIABLE_TYPE_OVERRIDES", [["render.RENDER_TARGET_DEFAULT", "number"]]),
    ];
    expect(replacementPinFindings(tables, [], new Set())).toEqual([
      "VARIABLE_TYPE_OVERRIDES:render.RENDER_TARGET_DEFAULT: no binding or engine pin (the table has no pin field yet)",
    ]);
  });

  test("an unpinned entry in the baseline yields nothing", () => {
    const tables = [withEntries("PARAM_TYPE_CORRECTIONS", [[KEY, UNPINNED_PARAM]])];
    expect(replacementPinFindings(tables, [`PARAM_TYPE_CORRECTIONS:${KEY}`], new Set())).toEqual(
      [],
    );
  });

  test("a baseline line whose entry has a pin is stale", () => {
    const tables = [withEntries("PARAM_TYPE_CORRECTIONS", [[KEY, PINNED_PARAM]])];
    expect(
      replacementPinFindings(tables, [`PARAM_TYPE_CORRECTIONS:${KEY}`], new Set([KEY])),
    ).toEqual([`PARAM_TYPE_CORRECTIONS:${KEY}: stale, the entry is pinned`]);
  });

  test("a baseline line naming no entry is stale", () => {
    const tables = [withEntries("PARAM_TYPE_CORRECTIONS", [])];
    expect(replacementPinFindings(tables, [`PARAM_TYPE_CORRECTIONS:${KEY}`], new Set())).toEqual([
      `PARAM_TYPE_CORRECTIONS:${KEY}: stale, no such entry`,
    ]);
  });

  test("two entries of one table with the same ledger key throw", () => {
    const tables = [
      withEntries("PARAM_TYPE_CORRECTIONS", [
        [KEY, UNPINNED_PARAM],
        [KEY, PINNED_PARAM],
      ]),
    ];
    expect(() => replacementPinFindings(tables, [], new Set([KEY]))).toThrow(
      `PARAM_TYPE_CORRECTIONS:${KEY}`,
    );
  });

  test("a property key range with an engine field counts as pinned", () => {
    const range = {
      prefix: "texture",
      first: 0,
      last: 7,
      evidence: "the reference lists texture0 to texture7",
      engine: {
        last: 7,
        pins: [{ file: "gamesys/src/gamesys/components/comp_model.cpp", contains: "x" }],
      },
    };
    const tables = [withEntries("PROPERTY_KEY_RANGES", [["model.textureN", range]])];
    expect(replacementPinFindings(tables, [], new Set(["model.textureN"]))).toEqual([]);
    expect(replacementPinFindings(tables, [], new Set())).toEqual([
      "PROPERTY_KEY_RANGES:model.textureN: its pin holds on no vendored target",
    ]);
  });
});

describe("parseReplacementPinBaseline", () => {
  test("accepts a sorted array of distinct strings", () => {
    expect(parseReplacementPinBaseline(["A:a", "A:b", "B:a"], "baseline")).toEqual([
      "A:a",
      "A:b",
      "B:a",
    ]);
  });

  test("throws on a non-array", () => {
    expect(() => parseReplacementPinBaseline({ "A:a": true }, "baseline")).toThrow("baseline");
  });

  test("throws on a non-string line", () => {
    expect(() => parseReplacementPinBaseline(["A:a", 1], "baseline")).toThrow("baseline");
  });

  test("throws on a duplicate line", () => {
    expect(() => parseReplacementPinBaseline(["A:a", "A:a"], "baseline")).toThrow("A:a");
  });

  test("throws on an unsorted file", () => {
    expect(() => parseReplacementPinBaseline(["B:a", "A:a"], "baseline")).toThrow("A:a");
  });
});

describe("the committed correction tables", () => {
  test("every entry carries a pin that holds on a vendored target or sits in the baseline", () => {
    const evidenceKeys = new Set<string>();
    for (const target of vendoredTargets()) {
      for (const key of bindingEvidenceFor(target)) evidenceKeys.add(key);
    }
    expect(
      replacementPinFindings(REPLACEMENT_TABLES, readReplacementPinBaseline(), evidenceKeys),
    ).toEqual([]);
  }, 120_000);
});

const TABLE_NAME =
  /_(CORRECTIONS|OVERRIDES|ADDITIONS|RANGES|CURATIONS|SLOTS|SLOT_KEYS|RESOLUTIONS|RULES|ALTERNATIVES|ALIASES|CLASSIFICATIONS)$/;

const MODULE_EXPORTS: readonly Record<string, unknown>[] = [
  emitDts,
  emitMessages,
  apiDoc,
  docCorrections,
];

function exportedTables(): string[] {
  return MODULE_EXPORTS.flatMap((exports) =>
    Object.entries(exports)
      .filter(
        ([name, value]) =>
          TABLE_NAME.test(name) &&
          (value instanceof Map || value instanceof Set || Array.isArray(value)),
      )
      .map(([name]) => name),
  );
}

describe("correction table classification", () => {
  test("every exported correction table is registered or excluded exactly once", () => {
    const registered = REPLACEMENT_TABLES.map((table) => table.name);
    const problems: string[] = [];
    for (const name of exportedTables()) {
      const count =
        registered.filter((candidate) => candidate === name).length +
        (UNPINNED_TABLES.has(name) ? 1 : 0);
      if (count === 0) problems.push(`${name}: neither registered nor excluded`);
      if (count > 1) problems.push(`${name}: classified ${count} times`);
    }
    expect(problems).toEqual([]);
  });

  test("every registered or excluded name is still an exported table", () => {
    const exported = new Set(exportedTables());
    const named = [...REPLACEMENT_TABLES.map((table) => table.name), ...UNPINNED_TABLES.keys()];
    expect(named.filter((name) => !exported.has(name))).toEqual([]);
  });
});
