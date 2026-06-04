import { describe, expect, test } from "bun:test";
import goDoc from "../fixtures/go_doc.json" with { type: "json" };
import { parseDefoldApiDoc } from "./api-doc";
import { SCRIPT_HOOK_NAMES } from "./lifecycle";

function deriveScriptCallbacks(): Set<string> {
  const module = parseDefoldApiDoc(goDoc);
  return new Set(module.functions.map((fn) => fn.name).filter((name) => !name.includes(".")));
}

describe("lifecycle hook drift guard", () => {
  test("derives a non-empty script-callback set from go_doc.json", () => {
    const callbacks = deriveScriptCallbacks();
    expect(callbacks.size).toBeGreaterThan(0);
  });

  test("derived set includes the frame-update regression class", () => {
    const callbacks = deriveScriptCallbacks();
    expect(callbacks.has("fixed_update")).toBe(true);
    expect(callbacks.has("late_update")).toBe(true);
  });

  test("ScriptHooks facade equals the fixture-derived callback set", () => {
    const callbacks = deriveScriptCallbacks();
    expect(callbacks).toEqual(new Set(SCRIPT_HOOK_NAMES));
  });
});
