import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLibraryIndexSlotClassifications } from "./index-slot-classifications";
import { EXTENSION_INDEX_SLOTS_FILE, writeLibraryJson, writeReviewedJson } from "./library-data";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("the classifications hold each library's named entries beside the extension pages' nested-field keys", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "index-slot-classifications-"));
  dirs.push(dataDir);
  const folder = writeLibraryJson(dataDir, {
    repo: "https://github.com/example/fixture-slots",
    indexSlots: {
      "knob/set_focus:param:index": {
        class: "native-1",
        evidence: "knob.lua:12 reads list[index]",
      },
      "knob/init:param:create_function": {
        class: "not-a-position",
        evidence: "knob.lua:30 calls create_function",
      },
    },
  });
  writeReviewedJson(dataDir, folder, { ref: "1.0.0" });
  writeFileSync(
    join(dataDir, EXTENSION_INDEX_SLOTS_FILE),
    JSON.stringify({
      "dial.gui/gui.cancel_dial:param:options:track": {
        class: "native-1",
        evidence: "dial.cpp:88 reads track as a 1-based index",
      },
    }),
  );

  const classifications = readLibraryIndexSlotClassifications(dataDir);
  expect(classifications.get("knob/set_focus:param:index")?.class).toBe("native-1");
  expect(classifications.get("dial.gui/gui.cancel_dial:param:options:track")).toEqual({
    class: "native-1",
    evidence: "dial.cpp:88 reads track as a 1-based index",
  });
  expect(classifications.get("knob/init:param:create_function")?.class).toBe("not-a-position");
  expect(classifications.size).toBe(3);
});
