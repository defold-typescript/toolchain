import { describe, expect, test } from "bun:test";
import { defineGuiScript, defineRenderScript, defineScript } from "./lifecycle";

describe("defineScript", () => {
  test("returns the hooks object by identity (no wrapping)", () => {
    const hooks = {
      init: () => ({ counter: 0 }),
      update() {},
    };
    expect(defineScript<{ counter: number }>(hooks)).toBe(hooks);
  });

  test("returns property-and-state hook objects by identity", () => {
    type Props = { name: string };
    type State = { counter: number };
    const hooks = {
      init: () => ({ counter: 0 }),
      update(self: Props & State) {
        self.counter += 1;
      },
    };
    expect(defineScript<Props, State>(hooks)).toBe(hooks);
  });

  test("accepts an empty hooks object", () => {
    const hooks = {};
    expect(defineScript<Record<string, never>>(hooks)).toBe(hooks);
  });

  test("accepts a fixed_update hook typed like update", () => {
    const hooks = {
      fixed_update(self: { velocity: number }, dt: number) {
        self.velocity += dt;
      },
    };
    expect(defineScript<{ velocity: number }>(hooks)).toBe(hooks);
  });

  test("accepts a late_update hook typed like update", () => {
    const hooks = {
      late_update(self: { velocity: number }, dt: number) {
        self.velocity += dt;
      },
    };
    expect(defineScript<{ velocity: number }>(hooks)).toBe(hooks);
  });
});

describe("defineGuiScript", () => {
  test("returns the hooks object by identity (no wrapping)", () => {
    const hooks = {
      init: () => ({ counter: 0 }),
      update() {},
    };
    expect(defineGuiScript<{ counter: number }>(hooks)).toBe(hooks);
  });
});

describe("defineRenderScript", () => {
  test("returns the hooks object by identity (no wrapping)", () => {
    const hooks = {
      init: () => ({ counter: 0 }),
      update() {},
    };
    expect(defineRenderScript<{ counter: number }>(hooks)).toBe(hooks);
  });
});
