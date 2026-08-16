import { describe, expect, test } from "bun:test";
import { buildInputActionIndex } from "./input-action-index";

function documents(entries: Record<string, string>): ReadonlyMap<string, string> {
  return new Map(Object.entries(entries));
}

function trigger(kind: string, input: string, action: string): string {
  return `${kind} {\n  input: ${input}\n  action: "${action}"\n}\n`;
}

describe("buildInputActionIndex", () => {
  test("collects the action of every trigger block, whatever kind declares it", () => {
    // Defold adds trigger kinds over time, and a binding may name any of them;
    // a hardcoded block-name list would silently drop a project's actions.
    const index = buildInputActionIndex(
      documents({
        "input/game.input_binding":
          trigger("key_trigger", "KEY_SPACE", "jump") +
          trigger("mouse_trigger", "MOUSE_BUTTON_1", "touch") +
          trigger("gamepad_trigger", "GAMEPAD_LSTICK_LEFT", "left") +
          trigger("text_trigger", "TEXT", "type") +
          trigger("future_trigger", "SOMETHING_NEW", "warp"),
      }),
    );
    expect([...index].sort()).toEqual(["jump", "left", "touch", "type", "warp"]);
  });

  test("unions every binding the project ships, without duplicates", () => {
    const index = buildInputActionIndex(
      documents({
        "input/game.input_binding":
          trigger("key_trigger", "KEY_LEFT", "left") + trigger("key_trigger", "KEY_SPACE", "jump"),
        "input/menu.input_binding":
          trigger("key_trigger", "KEY_ENTER", "confirm") +
          trigger("key_trigger", "KEY_SPACE", "jump"),
      }),
    );
    expect([...index].sort()).toEqual(["confirm", "jump", "left"]);
  });

  test("a bound-but-unnamed trigger contributes nothing", () => {
    // A trigger whose `action` is empty is bound to no name at all, so offering
    // `""` would suggest a literal that can never match.
    const index = buildInputActionIndex(
      documents({
        "input/game.input_binding":
          trigger("key_trigger", "KEY_SPACE", "") + trigger("key_trigger", "KEY_LEFT", "left"),
      }),
    );
    expect([...index]).toEqual(["left"]);
  });

  test("the `input` half of a binding is never offered", () => {
    const index = buildInputActionIndex(
      documents({ "input/game.input_binding": trigger("key_trigger", "KEY_SPACE", "jump") }),
    );
    expect(index.has("KEY_SPACE")).toBe(false);
  });

  test("an empty document yields an empty universe", () => {
    expect([...buildInputActionIndex(documents({ "input/game.input_binding": "" }))]).toEqual([]);
    expect([...buildInputActionIndex(documents({}))]).toEqual([]);
  });

  test("an unparseable binding is skipped while its siblings still contribute", () => {
    // The same honest-hole convention the other index builders use: a suggestion
    // claims nothing about what is absent, so one broken file must not blank the
    // rest of the project.
    const index = buildInputActionIndex(
      documents({
        "input/broken.input_binding": 'key_trigger {\n  action: "orphan"\n',
        "input/game.input_binding": trigger("key_trigger", "KEY_SPACE", "jump"),
      }),
    );
    expect([...index]).toEqual(["jump"]);
  });
});
