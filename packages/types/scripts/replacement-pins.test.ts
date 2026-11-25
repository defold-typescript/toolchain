import { describe, expect, test } from "bun:test";
import type { ParamTypeCorrection, TableSlotCuration } from "../src/emit-dts";
import { MESSAGE_FIELD_CONSTANT_GROUPS } from "../src/emit-messages";
import { pinEvidenceKey } from "../src/engine-pin";
import { retainedSurfaces } from "../src/optional-correction-provenance";
import { bindingEvidenceFor } from "./binding-pin";
import { messageFieldEntries } from "./engine-pinned-tables";
import { EXTENSION_GOLDEN_MANIFEST } from "./extension-goldens";
import { refDocEvidenceFor } from "./ref-doc-pin";
import {
  EDITOR_MODULE_MANIFEST,
  loadApiTargets,
  MODULE_MANIFEST,
  VERSIONED_MODULE_MANIFEST,
} from "./regen";
import {
  parseReplacementPinBaseline,
  REPLACEMENT_TABLES,
  type ReplacementTable,
  readReplacementPinBaseline,
  replacementPinFindings,
  tableClassificationFindings,
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
const PARAM_LINE = pinEvidenceKey("PARAM_TYPE_CORRECTIONS", KEY);

describe("replacementPinFindings", () => {
  test("a pinned entry whose pin holds and that is not baselined yields nothing", () => {
    const tables = [withEntries("PARAM_TYPE_CORRECTIONS", [[KEY, PINNED_PARAM]])];
    expect(replacementPinFindings(tables, [], new Set([PARAM_LINE]))).toEqual([]);
  });

  test("a pinned entry whose pin holds on no vendored target is a finding", () => {
    const tables = [withEntries("PARAM_TYPE_CORRECTIONS", [[KEY, PINNED_PARAM]])];
    expect(replacementPinFindings(tables, [], new Set())).toEqual([
      `PARAM_TYPE_CORRECTIONS:${KEY}: its pin holds on no vendored target`,
    ]);
  });

  test("an unpinned entry missing from the baseline names the pins its table accepts", () => {
    const tables = [withEntries("PARAM_TYPE_CORRECTIONS", [[KEY, UNPINNED_PARAM]])];
    expect(replacementPinFindings(tables, [], new Set([PARAM_LINE]))).toEqual([
      `PARAM_TYPE_CORRECTIONS:${KEY}: no pin (the table accepts a binding pin)`,
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
      replacementPinFindings(tables, [`PARAM_TYPE_CORRECTIONS:${KEY}`], new Set([PARAM_LINE])),
    ).toEqual([`PARAM_TYPE_CORRECTIONS:${KEY}: stale, the entry is pinned`]);
  });

  test("a baseline line naming no entry is stale", () => {
    const tables = [withEntries("PARAM_TYPE_CORRECTIONS", [])];
    expect(replacementPinFindings(tables, [`PARAM_TYPE_CORRECTIONS:${KEY}`], new Set())).toEqual([
      `PARAM_TYPE_CORRECTIONS:${KEY}: stale, no such entry`,
    ]);
  });

  test("a pin holding under one table never vouches for another table's entry of the same key", () => {
    const tables = [
      withEntries("PARAM_TYPE_CORRECTIONS", [[KEY, PINNED_PARAM]]),
      withEntries("TABLE_FIELD_TYPE_OVERRIDES", [
        [KEY, { ts: "string", binding: PINNED_PARAM.binding }],
      ]),
    ];
    expect(replacementPinFindings(tables, [], new Set([PARAM_LINE]))).toEqual([
      `TABLE_FIELD_TYPE_OVERRIDES:${KEY}: its pin holds on no vendored target`,
    ]);
  });

  test("a refDoc-pinned entry holds only where its own ref-doc evidence does", () => {
    const key = "physics.raycast_async:param:groups";
    const curation: TableSlotCuration = {
      kind: "array",
      element: "hash",
      refDoc: { contains: "the hashed groups" },
    };
    const { refDoc: _refDoc, ...unpinned } = curation;
    const line = pinEvidenceKey("TABLE_SLOT_CURATIONS", key);
    const pinned = [withEntries("TABLE_SLOT_CURATIONS", [[key, curation]])];
    expect(replacementPinFindings(pinned, [], new Set([line]))).toEqual([]);
    expect(replacementPinFindings(pinned, [], new Set([key]))).toEqual([
      `${line}: its pin holds on no retained ref-doc`,
    ]);
    expect(
      replacementPinFindings(
        [withEntries("TABLE_SLOT_CURATIONS", [[key, unpinned]])],
        [],
        new Set(),
      ),
    ).toEqual([
      `${line}: no pin (the table accepts a refDoc pin or a binding pin or an engine pin)`,
    ]);
  });

  test("a table slot curation counts as pinned through one holding binding pin of its own", () => {
    const key = "factory.create:param:properties";
    const curation: TableSlotCuration = {
      kind: "verbatim",
      ts: "PlainTable",
      binding: {
        file: "gamesys/src/gamesys/scripts/script_factory.cpp",
        cFunction: "FactoryComp_Create",
        contains: "lua_next",
      },
    };
    const line = pinEvidenceKey("TABLE_SLOT_CURATIONS", key);
    const tables = [withEntries("TABLE_SLOT_CURATIONS", [[key, curation]])];
    expect(replacementPinFindings(tables, [], new Set([line]))).toEqual([]);
    expect(replacementPinFindings(tables, [], new Set())).toEqual([
      `${line}: its pin holds on no vendored target`,
    ]);
    const twice = { ...curation, refDoc: { contains: "the properties" } };
    expect(
      replacementPinFindings(
        [withEntries("TABLE_SLOT_CURATIONS", [[key, twice]])],
        [],
        new Set([line]),
      ),
    ).toEqual([`${line}: carries more than one pin`]);
  });

  test("a table slot curation pinned only by engine pins counts as pinned", () => {
    const key = "sys.save:param:table";
    const curation: TableSlotCuration = {
      kind: "verbatim",
      ts: "PlainTable",
      engine: [{ file: "script/src/script_table.cpp", contains: "lua_next" }],
    };
    const line = pinEvidenceKey("TABLE_SLOT_CURATIONS", key);
    const tables = [withEntries("TABLE_SLOT_CURATIONS", [[key, curation]])];
    expect(replacementPinFindings(tables, [], new Set([line]))).toEqual([]);
    expect(replacementPinFindings(tables, [line], new Set([line]))).toEqual([
      `${line}: stale, the entry is pinned`,
    ]);
  });

  test("two entries of one table with the same ledger key throw", () => {
    const tables = [
      withEntries("PARAM_TYPE_CORRECTIONS", [
        [KEY, UNPINNED_PARAM],
        [KEY, PINNED_PARAM],
      ]),
    ];
    expect(() => replacementPinFindings(tables, [], new Set([PARAM_LINE]))).toThrow(
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
    expect(
      replacementPinFindings(tables, [], new Set(["PROPERTY_KEY_RANGES:model.textureN"])),
    ).toEqual([]);
    expect(replacementPinFindings(tables, [], new Set(["model.textureN"]))).toEqual([
      "PROPERTY_KEY_RANGES:model.textureN: its pin holds on no vendored target",
    ]);
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

const DEFAULT_TARGET = loadApiTargets().find((candidate) => candidate.default === true);
if (!DEFAULT_TARGET) throw new Error("api-targets.json: no default target");

// Every ref-doc the global correction tables reach: each runtime module regen
// emits and the extension goldens, as the provenance tests build it, and the
// default target's editor modules, which carry the editor entries.
const RETAINED_SURFACES = [
  ...retainedSurfaces(
    DEFAULT_TARGET.id,
    MODULE_MANIFEST,
    VERSIONED_MODULE_MANIFEST,
    EXTENSION_GOLDEN_MANIFEST,
  ),
  ...EDITOR_MODULE_MANIFEST.map((entry) => ({
    target: DEFAULT_TARGET.id,
    namespace: entry.namespace,
    doc: entry.doc,
  })),
];

describe("the committed correction tables", () => {
  test("every entry carries a pin that holds on a retained target or sits in the baseline", () => {
    const evidenceKeys = new Set(refDocEvidenceFor(REPLACEMENT_TABLES, RETAINED_SURFACES));
    for (const target of vendoredTargets()) {
      for (const key of bindingEvidenceFor(target)) evidenceKeys.add(key);
    }
    expect(
      replacementPinFindings(REPLACEMENT_TABLES, readReplacementPinBaseline(), evidenceKeys),
    ).toEqual([]);
  }, 120_000);

  test("a message constant-group entry added without a pin is a finding", () => {
    const timeStep = MESSAGE_FIELD_CONSTANT_GROUPS.find((entry) => entry.name === "set_time_step");
    if (!timeStep) throw new Error("no set_time_step constant group");
    const { refDoc: _refDoc, ...unpinned } = timeStep;
    const record = {
      ...registered("MESSAGE_FIELD_CONSTANT_GROUPS"),
      entries: messageFieldEntries([
        ...MESSAGE_FIELD_CONSTANT_GROUPS,
        { ...unpinned, field: "factor" },
      ]),
    };
    const holding = new Set(
      messageFieldEntries(MESSAGE_FIELD_CONSTANT_GROUPS).map(([key]) =>
        pinEvidenceKey("MESSAGE_FIELD_CONSTANT_GROUPS", key),
      ),
    );
    expect(replacementPinFindings([record], [], holding)).toEqual([
      "MESSAGE_FIELD_CONSTANT_GROUPS:collectionproxy.set_time_step:factor: no pin (the table accepts a refDoc pin or a binding pin or an engine pin)",
    ]);
  });
});

describe("tableClassificationFindings", () => {
  test("every exported correction table is classified exactly once", () => {
    expect(tableClassificationFindings()).toEqual([]);
  });

  test("an exported _GROUPS table left out of both lists is a finding", () => {
    const tables = REPLACEMENT_TABLES.filter(
      (table) => table.name !== "MESSAGE_FIELD_CONSTANT_GROUPS",
    );
    expect(tableClassificationFindings(tables)).toEqual([
      "MESSAGE_FIELD_CONSTANT_GROUPS: neither registered nor excluded",
    ]);
  });

  test("a table both registered and excluded is a finding", () => {
    const unpinned = new Map([...UNPINNED_TABLES, ["MESSAGE_FIELD_CONSTANT_GROUPS", "reason"]]);
    expect(tableClassificationFindings(REPLACEMENT_TABLES, unpinned)).toEqual([
      "MESSAGE_FIELD_CONSTANT_GROUPS: classified 2 times",
    ]);
  });

  test("an exclusion naming no exported table is a finding", () => {
    const unpinned = new Map([...UNPINNED_TABLES, ["GONE_CORRECTIONS", "reason"]]);
    expect(tableClassificationFindings(REPLACEMENT_TABLES, unpinned)).toEqual([
      "GONE_CORRECTIONS: not an exported table",
    ]);
  });
});
