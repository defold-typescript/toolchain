import { expect, test } from "bun:test";
import { readLibraryIndexSlotClassifications } from "./index-slot-classifications";

test("the shipped classifications hold named entries, spread-built keys included", () => {
  const classifications = readLibraryIndexSlotClassifications();
  expect(classifications.get("gooey/set_focus:param:index")?.class).toBe("native-1");
  expect(classifications.get("spine.gui/gui.cancel_spine:param:options:track")?.class).toBe(
    "native-1",
  );
  expect(classifications.get("druid/init:param:create_function")?.class).toBe("not-a-position");
});
