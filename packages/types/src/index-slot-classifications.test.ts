import { describe, expect, test } from "bun:test";
import {
  appendNotes,
  INDEX_BASE_MARKERS,
  indexBaseNotes,
  libraryIndexBaseNotes,
  parseLibraryIndexSlotClassifications,
  withIndexBaseNotes,
} from "./index-slot-classifications";

describe("indexBaseNotes", () => {
  test("a native-1 slot gets one bold sentence led by the 1-based marker", () => {
    expect(indexBaseNotes("b2d.fixture.get_density", "param", "fixture_index")).toEqual([
      "**⚠️ 1-based; passed to Defold unchanged.**",
    ]);
  });

  test("a native-0 slot gets one bold sentence led by the 0-based marker", () => {
    expect(indexBaseNotes("gui.get_index", "return", "index")).toEqual([
      "**0️⃣ 0-based; passed to Defold unchanged.**",
    ]);
  });

  test("a classified table field's note leads with the marker before the field name", () => {
    expect(indexBaseNotes("b2d.body.get_fixtures", "return", "fixtures")).toEqual([
      "**⚠️ `index` is 1-based; passed to Defold unchanged.**",
    ]);
  });

  test("an unclassified slot gets no note", () => {
    expect(indexBaseNotes("tilemap.set_tile", "param", "tile")).toEqual([]);
  });

  test("the markers are exported per native base", () => {
    expect(INDEX_BASE_MARKERS).toEqual({ "native-1": "⚠️", "native-0": "0️⃣" });
  });
});

describe("withIndexBaseNotes", () => {
  const note = "**⚠️ 1-based; passed to Defold unchanged.**";

  test("a one-line doc ending in a period gains the note after one space", () => {
    expect(
      withIndexBaseNotes("b2d.fixture.get_density", "param", "fixture_index", "the fixture."),
    ).toBe(`the fixture. ${note}`);
  });

  test("a one-line doc without a closing period gains one before the note", () => {
    expect(
      withIndexBaseNotes("b2d.fixture.get_density", "param", "fixture_index", "the fixture"),
    ).toBe(`the fixture. ${note}`);
  });

  test("a multi-line doc gains the note after a blank line", () => {
    expect(
      withIndexBaseNotes("b2d.fixture.get_density", "param", "fixture_index", "first\nsecond"),
    ).toBe(`first\nsecond\n\n${note}`);
  });

  test("an empty doc becomes the note alone", () => {
    expect(withIndexBaseNotes("b2d.fixture.get_density", "param", "fixture_index", "")).toBe(note);
  });

  test("a table with two 0-based fields gains one note for each", () => {
    expect(withIndexBaseNotes("resource.set_texture", "param", "table", "the texture.")).toBe(
      "the texture. **0️⃣ `page` is 0-based; passed to Defold unchanged.** **0️⃣ `mipmap` is 0-based; passed to Defold unchanged.**",
    );
  });

  test("a nested returned field names its own key", () => {
    expect(withIndexBaseNotes("resource.get_atlas", "return", "data", "the atlas.")).toBe(
      "the atlas. **⚠️ `frames` is 1-based; passed to Defold unchanged.** **0️⃣ `indices` is 0-based; passed to Defold unchanged.**",
    );
  });
});

describe("parseLibraryIndexSlotClassifications", () => {
  test("reads each key's class and evidence in input order", () => {
    const map = parseLibraryIndexSlotClassifications({
      "p/f:param:i": { class: "native-1", evidence: "x" },
      "p/a:return:": { class: "not-a-position", evidence: "y" },
    });
    expect(map.get("p/f:param:i")).toEqual({ class: "native-1", evidence: "x" });
    expect([...map.keys()]).toEqual(["p/f:param:i", "p/a:return:"]);
  });

  test.each([
    ["a value that is not an object", "x"],
    ["an array value", []],
    ["a class outside the three", { class: "native-2", evidence: "x" }],
    ["a missing class", { evidence: "x" }],
    ["a blank evidence", { class: "native-0", evidence: "  " }],
    ["an evidence that is not a string", { class: "native-0", evidence: 1 }],
  ])("throws naming the key for %s", (_, value) => {
    expect(() => parseLibraryIndexSlotClassifications({ "p/f:param:i": value })).toThrow(
      "p/f:param:i",
    );
  });

  test.each([
    ["an array", []],
    ["null", null],
    ["a string", "x"],
  ])("throws for a root that is %s", (_, root) => {
    expect(() => parseLibraryIndexSlotClassifications(root)).toThrow();
  });
});

describe("appendNotes", () => {
  const tileRaycast = parseLibraryIndexSlotClassifications({
    "tile_raycast/cast:return::tile_x": { class: "native-1", evidence: "x" },
    "tile_raycast/cast:return::tile_y": { class: "native-1", evidence: "y" },
    "tile_raycast/set_at:param:tile_x": { class: "native-1", evidence: "x" },
  });
  const [tileX = "", tileY = ""] = libraryIndexBaseNotes(
    tileRaycast,
    "tile_raycast",
    "cast",
    "return",
    "",
  );

  test("the fixture map notes both returned tile coordinates", () => {
    expect(tileX).toBe("**⚠️ `tile_x` is 1-based; passed to `tile_raycast` unchanged.**");
    expect(tileY).toBe("**⚠️ `tile_y` is 1-based; passed to `tile_raycast` unchanged.**");
  });

  test("a doc that already carries the note is returned unchanged", () => {
    const [note = ""] = libraryIndexBaseNotes(
      tileRaycast,
      "tile_raycast",
      "set_at",
      "param",
      "tile_x",
    );
    const doc = `Tile X coordinate. ${note}`;
    expect(appendNotes(doc, [note])).toBe(doc);
  });

  test("only the notes a doc lacks are appended, by the usual separator rules", () => {
    expect(appendNotes(`${tileX} The values.`, [tileX, tileY])).toBe(
      `${tileX} The values. ${tileY}`,
    );
    expect(appendNotes(`first\n${tileX}`, [tileX, tileY])).toBe(`first\n${tileX}\n\n${tileY}`);
  });

  test("a doc holding none of the notes gains all of them", () => {
    expect(appendNotes("The values", [tileX, tileY])).toBe(`The values. ${tileX} ${tileY}`);
  });
});
