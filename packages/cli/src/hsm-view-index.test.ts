import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { requireHsmSourceDir } from "@defold-typescript/transpiler";
import { machineIndex } from "./hsm-view-index";
import { loadMachines, type SourceSpan } from "./hsm-view-load";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
const PLATFORMER_MACHINE = path.join(
  REPO_ROOT,
  "docs",
  "examples",
  "platformer",
  "src",
  "player-machine.ts",
);
const hsmSourceDir = requireHsmSourceDir();

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "hsm-view-index-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(rel: string, text: string): string {
  const file = path.join(dir, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}

function load(file: string) {
  return loadMachines(file, { hsmSourceDir });
}

function spanText(
  files: readonly { readonly text: string }[],
  span: ({ readonly file: number } & SourceSpan) | undefined,
): string | undefined {
  return span === undefined ? undefined : files[span.file]?.text.slice(span.start, span.end);
}

describe("machineIndex", () => {
  test("maps every platformer state path to the state key in its source file", () => {
    const loaded = load(PLATFORMER_MACHINE);
    const config = loaded.machines[0]?.config;
    const index = machineIndex(config, loaded.files);

    expect(Object.keys(index.states).sort()).toEqual([
      "/airborne",
      "/airborne/falling",
      "/airborne/rising",
      "/grounded",
      "/grounded/idle",
      "/grounded/walk",
    ]);
    for (const [statePath, span] of Object.entries(index.states)) {
      expect(spanText(loaded.files, span)).toBe(statePath.slice(statePath.lastIndexOf("/") + 1));
    }
  });

  test("maps event entries and every rule kind to the defining key or array entry", () => {
    const entry = write(
      "main.ts",
      `import { defineMachine } from "@defold-typescript/types/hsm";
export const m = defineMachine()({
  initial: "/a",
  on: { "A|on|B": "/b" },
  states: {
    a: {
      on: { GO: [{ target: "/b", guard: () => false }, { target: "/b" }], BACK: "/b" },
      after: { 0.5: "/b" },
      always: [{ target: "/b", guard: () => false }, { target: "/b" }],
      update: () => undefined,
    },
    b: {},
  },
});
`,
    );
    const loaded = load(entry);
    const index = machineIndex(loaded.machines[0]?.config, loaded.files);

    expect(spanText(loaded.files, index.onKeys["/a"]?.GO)).toBe("GO");
    expect(index.rules["/a|on|BACK|0"]).toEqual(index.onKeys["/a"]?.BACK);
    expect(spanText(loaded.files, index.rules["/a|on|GO|0"])).toContain('target: "/b"');
    expect(spanText(loaded.files, index.rules["/a|on|GO|1"])).toBe('{ target: "/b" }');
    expect(spanText(loaded.files, index.rules["/a|after|0.5|0"])).toBe("0.5");
    expect(spanText(loaded.files, index.rules["/a|always|0"])).toContain("guard");
    expect(spanText(loaded.files, index.rules["/a|always|1"])).toBe('{ target: "/b" }');
    expect(spanText(loaded.files, index.rules["/a|update"])).toBe("update");
    expect(index.ruleOnKeys["|on|A|on|B|0"]).toEqual({ statePath: "", event: "A|on|B" });
    expect(index.ruleOnKeys["/a|on|GO|1"]).toEqual({ statePath: "/a", event: "GO" });
    expect(index.ruleOnKeys).not.toHaveProperty(["/a|after|0.5|0"]);
    expect(index.ruleOnKeys).not.toHaveProperty(["/a|always|0"]);
    expect(index.ruleOnKeys).not.toHaveProperty(["/a|update"]);
  });

  test("uses imported and spread source locations and omits states with no key location", () => {
    const entry = write(
      "main.ts",
      `import { defineMachine } from "@defold-typescript/types/hsm";
import { air, extra } from "./air-states";
const makeSwim = () => ({});
export const m = defineMachine()({
  initial: "/air",
  states: { air, ...extra, swim: makeSwim() },
});
`,
    );
    const imported = write(
      "air-states.ts",
      `export const air = { initial: "/air/up", states: { up: {} } };
export const extra = { glide: {} };
`,
    );
    const loaded = load(entry);
    const index = machineIndex(loaded.machines[0]?.config, loaded.files);

    expect(loaded.files[index.states["/air/up"]?.file ?? -1]?.path).toBe(imported);
    expect(spanText(loaded.files, index.states["/air/up"])).toBe("up");
    expect(loaded.files[index.states["/glide"]?.file ?? -1]?.path).toBe(imported);
    expect(spanText(loaded.files, index.states["/glide"])).toBe("glide");
    expect(index.states["/swim"]).toBeUndefined();
  });
});
