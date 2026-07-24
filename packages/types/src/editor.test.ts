import { describe, expect, test } from "bun:test";
import { defineEditorScript } from "./editor";

describe("defineEditorScript", () => {
  test("returns the module object by identity (no wrapping)", () => {
    const mod = {
      get_commands: () => [{ label: "Say Hi", locations: ["Edit"], run: () => {} }],
    };
    expect(defineEditorScript(mod)).toBe(mod);
  });

  test("accepts a typed get_commands returning EditorCommand objects", () => {
    const result = defineEditorScript({
      get_commands: () => [{ label: "Reverse", locations: ["Assets", "Outline"], run: () => {} }],
    });
    expect(typeof result.get_commands).toBe("function");
  });

  test("accepts an empty module", () => {
    const mod = {};
    expect(defineEditorScript(mod)).toBe(mod);
  });

  test("is typed as identity: the returned value keeps the argument's own keys", () => {
    const mod = {
      get_commands: () => [{ label: "Only", locations: ["View"] }],
      get_language_servers: () => [],
    };
    const result = defineEditorScript(mod);
    // Same static type in both directions (identity): each is assignable to the
    // other, which fails to compile if the return type were widened or narrowed.
    const back: typeof mod = result;
    const forth: typeof result = mod;
    expect(back).toBe(forth);
  });

  test("rejects an unknown hook key yet is identity at runtime", () => {
    const result = defineEditorScript({
      get_commands: () => [{ label: "Ok", locations: ["Edit"] }],
      // @ts-expect-error editor scripts have no such hook
      on_load: () => {},
    });
    expect(typeof result.get_commands).toBe("function");
  });

  test("rejects a get_commands returning a non-EditorCommand yet is identity at runtime", () => {
    const result = defineEditorScript({
      // @ts-expect-error a command needs at least `label` and `locations`
      get_commands: () => [{ label: "missing locations" }],
    });
    expect(typeof result.get_commands).toBe("function");
  });
});
