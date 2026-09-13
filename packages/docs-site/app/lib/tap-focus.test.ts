import { describe, expect, test } from "bun:test";
import { watchTapFocus } from "./tap-focus";

function pointerDown(target: EventTarget, pointerType: string) {
  target.dispatchEvent(Object.assign(new Event("pointerdown"), { pointerType }));
}

describe("watchTapFocus", () => {
  test("a fresh binder reports no tap", () => {
    const tapFocus = watchTapFocus(new EventTarget());
    expect(tapFocus.focusFromTap()).toBe(false);
  });

  test.each([
    "touch",
    "pen",
  ])("a %s pointerdown marks the next focus as tap-raised", (pointerType) => {
    const target = new EventTarget();
    const tapFocus = watchTapFocus(target);
    pointerDown(target, pointerType);
    expect(tapFocus.focusFromTap()).toBe(true);
  });

  test("a keydown after a tap clears the mark", () => {
    const target = new EventTarget();
    const tapFocus = watchTapFocus(target);
    pointerDown(target, "touch");
    target.dispatchEvent(new Event("keydown"));
    expect(tapFocus.focusFromTap()).toBe(false);
  });

  test("a mouse pointerdown after a tap clears the mark", () => {
    const target = new EventTarget();
    const tapFocus = watchTapFocus(target);
    pointerDown(target, "touch");
    pointerDown(target, "mouse");
    expect(tapFocus.focusFromTap()).toBe(false);
  });

  test("dispose stops listening", () => {
    const target = new EventTarget();
    const tapFocus = watchTapFocus(target);
    tapFocus.dispose();
    pointerDown(target, "touch");
    expect(tapFocus.focusFromTap()).toBe(false);
  });
});
