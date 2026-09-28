import { describe, expect, test } from "bun:test";
import {
  INDEX_BASE_MARKERS,
  indexBaseNotes,
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
      "the atlas. **0️⃣ `indices` is 0-based; passed to Defold unchanged.**",
    );
  });
});
