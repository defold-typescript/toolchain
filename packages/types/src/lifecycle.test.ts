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

  test("accepts on_input (gui keeps input, unlike render)", () => {
    const hooks = {
      init: () => ({ counter: 0 }),
      on_input(self: { counter: number }) {
        self.counter += 1;
        return false;
      },
    };
    expect(defineGuiScript<{ counter: number }>(hooks)).toBe(hooks);
  });

  test("rejects a fixed_update hook (gui has no fixed-timestep pass) yet is identity at runtime", () => {
    const result = defineGuiScript<{ ready: boolean }>({
      init: () => ({ ready: true }),
      // @ts-expect-error gui scripts have no fixed_update hook
      fixed_update() {},
    });
    expect(typeof result.init).toBe("function");
  });

  test("rejects a late_update hook (gui has no late-update pass) yet is identity at runtime", () => {
    const result = defineGuiScript<{ ready: boolean }>({
      init: () => ({ ready: true }),
      // @ts-expect-error gui scripts have no late_update hook
      late_update() {},
    });
    expect(typeof result.init).toBe("function");
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
