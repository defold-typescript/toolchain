import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EDITOR_VM_MODULE_MANIFEST } from "../scripts/regen";
import { collectDeclaredFqns } from "./declared-fqns";

const PAGE = resolve(import.meta.dir, "..", "..", "docs", "guide", "editor-scripts.md");
const GLOBALS_PATH = resolve(import.meta.dir, "..", "src", "editor-vm-globals.d.ts");
const HEADING = "## The editor VM's own libraries";

// Every global the editor-script surface actually carries beside `editor.*`:
// the emitted namespace modules plus whatever the hand-authored file introduces
// at top level (`pprint` today). Read from production so a library added or
// dropped later cannot leave the guide's table quietly wrong.
function shippedGlobals(): string[] {
  const emitted = EDITOR_VM_MODULE_MANIFEST.map((entry) => entry.namespace);
  const handAuthored = [...collectDeclaredFqns(readFileSync(GLOBALS_PATH, "utf8"))].filter(
    (name) => !name.includes("."),
  );
  return [...new Set([...emitted, ...handAuthored])].sort();
}

function tableGlobals(): string[] {
  const body = readFileSync(PAGE, "utf8");
  const start = body.indexOf(HEADING);
  expect(start).toBeGreaterThan(-1);
  const next = body.indexOf("\n## ", start + 1);
  const section = body.slice(start, next === -1 ? undefined : next);
  const names = [...section.matchAll(/^\| `([^`]+)` \|/gm)].map((match) => match[1] as string);
  return [...new Set(names)].sort();
}

describe("editor-scripts guide — editor VM library table", () => {
  test("lists exactly the globals the editor-script surface ships", () => {
    expect(tableGlobals()).toEqual(shippedGlobals());
  });
});
