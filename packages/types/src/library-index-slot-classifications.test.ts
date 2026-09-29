import { describe, expect, test } from "bun:test";
import { withIndexBaseNotes, withLibraryIndexBaseNotes } from "./index-slot-classifications";

describe("withLibraryIndexBaseNotes", () => {
  test("names the library as the receiver of a 1-based slot", () => {
    expect(withLibraryIndexBaseNotes("gooey", "set_focus", "param", "index", "")).toBe(
      "**⚠️ 1-based; passed to `gooey` unchanged.**",
    );
  });

  test("notes a 0-based callback argument under its slot", () => {
    expect(
      withLibraryIndexBaseNotes(
        "bridge",
        "bridge.daily_rewards.get_current_day",
        "param",
        "on_success",
        "function(_, day)",
      ),
    ).toEndWith("**0️⃣ `day` is 0-based; passed to `bridge` unchanged.**");
  });

  test("notes a class field", () => {
    expect(withLibraryIndexBaseNotes("decore", "system", "field", "index", "")).toBe(
      "**⚠️ 1-based; passed to `decore` unchanged.**",
    );
  });
});

describe("page keys stay on their own map", () => {
  test("an engine lookup never reads a library classification", () => {
    expect(withIndexBaseNotes("set_focus", "param", "index", "x")).toBe("x");
  });

  test("a library lookup never reads an engine classification", () => {
    expect(withLibraryIndexBaseNotes("spine.gui", "gui.set", "param", "options", "x")).toBe("x");
  });

  test("the engine note still names Defold", () => {
    expect(withIndexBaseNotes("b2d.fixture.get_density", "param", "fixture_index", "")).toBe(
      "**⚠️ 1-based; passed to Defold unchanged.**",
    );
  });
});
