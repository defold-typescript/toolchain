import { expect, test } from "bun:test";
import { readLibraryIndexSlotClassifications } from "./index-slot-classifications";
import { LIBRARY_DATA_DIR } from "./package-root";

test("the shipped classifications hold named entries, spread-built keys included", () => {
  const classifications = readLibraryIndexSlotClassifications(LIBRARY_DATA_DIR);
  expect(classifications.get("gooey/set_focus:param:index")?.class).toBe("native-1");
  expect(classifications.get("spine.gui/gui.cancel_spine:param:options:track")?.class).toBe(
    "native-1",
  );
  expect(classifications.get("druid/init:param:create_function")?.class).toBe("not-a-position");
});
