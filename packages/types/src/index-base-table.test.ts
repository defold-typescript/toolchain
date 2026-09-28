import { describe, expect, test } from "bun:test";
import { engineIndexBaseRows, engineIndexBaseTable } from "./index-base-table";
import {
  INDEX_BASE_MARKERS,
  INDEX_SLOT_CLASSIFICATIONS,
  type IndexSlotClassification,
} from "./index-slot-classifications";

function tableRows(markdown: string): string[][] {
  return markdown
    .split("\n")
    .slice(2)
    .map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    );
}

describe("engineIndexBaseTable", () => {
  test("lists each base under its marker, with the API and the position it counts", () => {
    const rows = tableRows(engineIndexBaseTable());
    const fixtureRow = rows.find(([, api]) => api?.includes("`b2d.fixture.get_density`"));
    expect(fixtureRow?.[0]).toBe(`${INDEX_BASE_MARKERS["native-1"]} **1-based**`);
    expect(fixtureRow?.[2]).toContain("`fixture_index`");
    const guiRow = rows.find(([, api]) => api?.includes("`gui.get_index`"));
    expect(guiRow?.[0]).toBe(`${INDEX_BASE_MARKERS["native-0"]} **0-based**`);
  });

  test("leaves out slots that address nothing by position", () => {
    const table = engineIndexBaseTable();
    expect(table).not.toContain("crash.get_sys_field");
    expect(table).not.toContain("model.set_blend_weights");
  });

  test("names a table field by the slot that holds it", () => {
    const rows = tableRows(engineIndexBaseTable());
    const options = rows.find(([, api]) => api?.includes("`go.get`"));
    expect(options?.[2]).toBe("`index` field of `options`");
    const fixtures = rows.find(([, api]) => api?.includes("`b2d.body.get_fixtures`"));
    expect(fixtures?.[2]).toBe("`index` field of the returned `fixtures`");
  });

  test("says a position counts from the end when it does", () => {
    const rows = tableRows(engineIndexBaseTable());
    const send = rows.find(
      ([, api, position]) => api === "`client:send`" && position?.includes("`i`"),
    );
    expect(send?.[2]).toContain("counts from the end when negative");
  });
});

describe("engineIndexBaseRows", () => {
  test("puts every native position in exactly one row of its own base", () => {
    const rows = engineIndexBaseRows();
    for (const [key, { class: base }] of INDEX_SLOT_CLASSIFICATIONS) {
      const holding = rows.filter((row) => row.keys.includes(key));
      if (base === "not-a-position") {
        expect(holding).toEqual([]);
        continue;
      }
      expect(holding.map((row) => row.base)).toEqual([base]);
    }
  });

  test("merges one namespace's slot of one base into one row", () => {
    const fixtureKeys = [...INDEX_SLOT_CLASSIFICATIONS.keys()].filter(
      (key) => key.startsWith("b2d.fixture.") && key.endsWith(":param:fixture_index"),
    );
    expect(fixtureKeys).toHaveLength(16);
    const holding = engineIndexBaseRows().filter((row) =>
      fixtureKeys.some((key) => row.keys.includes(key)),
    );
    expect(holding).toHaveLength(1);
    expect(holding[0]?.keys).toEqual(fixtureKeys);
    expect(holding[0]?.keys).not.toContain("b2d.body.destroy_fixture:param:fixture_index");
  });

  test("gains a row for a newly classified position", () => {
    const added = new Map<string, IndexSlotClassification>([
      ...INDEX_SLOT_CLASSIFICATIONS,
      ["example.fetch:param:slot_index", { class: "native-1", evidence: "1-based" }],
    ]);
    expect(engineIndexBaseRows(added)).toHaveLength(engineIndexBaseRows().length + 1);
    expect(engineIndexBaseTable(added)).toContain("`example.fetch`");
  });
});
