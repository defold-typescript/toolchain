import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ECS_LIBRARY, HSM_LIBRARY, requireLibrarySourceDir } from "@defold-typescript/transpiler";
import { machineIndex, ruleId, ruleIds } from "./hsm-view-index";
import { loadProject } from "./view-load";
import type { SourceSpan } from "./view-run";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
const PLATFORMER_MACHINE = path.join(
  REPO_ROOT,
  "docs",
  "examples",
  "platformer",
  "src",
  "player-machine.ts",
);
const hsmSourceDir = requireLibrarySourceDir(HSM_LIBRARY);
const ecsSourceDir = requireLibrarySourceDir(ECS_LIBRARY);

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
  return loadProject(file, { hsmSourceDir, ecsSourceDir });
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
      on: { GO: [{ to: "/b", when: () => false }, { to: "/b" }], BACK: "/b" },
      after: { 0.5: "/b" },
      always: [{ to: "/b", when: () => false }, { to: "/b" }],
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
    expect(index.rules[ruleId("/a", "on", "BACK", 0)]).toEqual(index.onKeys["/a"]?.BACK);
    expect(spanText(loaded.files, index.rules[ruleId("/a", "on", "GO", 0)])).toContain('to: "/b"');
    expect(spanText(loaded.files, index.rules[ruleId("/a", "on", "GO", 1)])).toBe('{ to: "/b" }');
    expect(spanText(loaded.files, index.rules[ruleId("/a", "after", "0.5")])).toBe("0.5");
    expect(spanText(loaded.files, index.rules[ruleId("/a", "always", 0)])).toContain("when");
    expect(spanText(loaded.files, index.rules[ruleId("/a", "always", 1)])).toBe('{ to: "/b" }');
    expect(spanText(loaded.files, index.rules[ruleId("/a", "update")])).toBe("update");
    expect(index.ruleOnKeys[ruleId("", "on", "A|on|B", 0)]).toEqual({
      statePath: "",
      event: "A|on|B",
    });
    expect(index.ruleOnKeys[ruleId("/a", "on", "GO", 1)]).toEqual({ statePath: "/a", event: "GO" });
    expect(index.ruleOnKeys).not.toHaveProperty([ruleId("/a", "after", "0.5")]);
    expect(index.ruleOnKeys).not.toHaveProperty([ruleId("/a", "always", 0)]);
    expect(index.ruleOnKeys).not.toHaveProperty([ruleId("/a", "update")]);
  });

  test("maps each after list entry to its own rule id and source", () => {
    const entry = write(
      "main.ts",
      `import { defineMachine } from "@defold-typescript/types/hsm";
export const m = defineMachine()({
  initial: "/a",
  states: {
    a: { after: [{ delay: 2, to: "/b" }, { delay: (ctx) => ctx.wait, to: "/c" }] },
    b: { after: { 0: { to: "/c" }, 1.5: "/a" } },
    c: {},
  },
});
`,
    );
    const loaded = load(entry);
    const config = loaded.machines[0]?.config;
    const index = machineIndex(config, loaded.files);

    expect(spanText(loaded.files, index.rules[ruleId("/a", "after", 0)])).toBe(
      '{ delay: 2, to: "/b" }',
    );
    expect(spanText(loaded.files, index.rules[ruleId("/a", "after", 1)])).toBe(
      '{ delay: (ctx) => ctx.wait, to: "/c" }',
    );
    expect(index.rules).not.toHaveProperty([ruleId("/a", "after", "0")]);
    expect(index.rules).not.toHaveProperty([ruleId("/a", "after", "1")]);
    expect(spanText(loaded.files, index.rules[ruleId("/b", "after", "0")])).toBe("0");
    expect(spanText(loaded.files, index.rules[ruleId("/b", "after", "1.5")])).toBe("1.5");
    expect(index.rules).not.toHaveProperty([ruleId("/b", "after", 0)]);
    expect(ruleIds(config)["/a"]?.after).toEqual([
      ruleId("/a", "after", 0),
      ruleId("/a", "after", 1),
    ]);
  });

  test("maps each every entry to its own rule id and source", () => {
    const entry = write(
      "main.ts",
      `import { defineMachine } from "@defold-typescript/types/hsm";
export const m = defineMachine()({
  initial: "/a",
  states: {
    a: {
      every: { 0.5: (ctx) => { ctx.n += 1; }, 2: [(ctx) => { ctx.n += 2; }] },
      after: { 2: "/b" },
    },
    b: {
      every: [
        { delay: 1, run: (ctx) => { ctx.n += 1; } },
        { delay: (ctx) => ctx.rate, run: (ctx) => { ctx.n += 1; } },
      ],
    },
  },
});
`,
    );
    const loaded = load(entry);
    const config = loaded.machines[0]?.config;
    const index = machineIndex(config, loaded.files);

    expect(spanText(loaded.files, index.rules[ruleId("/a", "every", "0.5")])).toBe("0.5");
    expect(spanText(loaded.files, index.rules[ruleId("/a", "every", "2")])).toBe("2");
    expect(index.rules[ruleId("/a", "every", "2")]).not.toEqual(
      index.rules[ruleId("/a", "after", "2")],
    );
    expect(spanText(loaded.files, index.rules[ruleId("/b", "every", 0)])).toBe(
      "{ delay: 1, run: (ctx) => { ctx.n += 1; } }",
    );
    expect(spanText(loaded.files, index.rules[ruleId("/b", "every", 1)])).toContain("ctx.rate");
    expect(index.rules).not.toHaveProperty([ruleId("/b", "every", "0")]);
    expect(index.ruleOnKeys).not.toHaveProperty([ruleId("/a", "every", "0.5")]);
    expect(index.ruleOnKeys).not.toHaveProperty([ruleId("/a", "every", "2")]);
    expect(index.ruleOnKeys).not.toHaveProperty([ruleId("/b", "every", 0)]);
    expect(index.ruleOnKeys).not.toHaveProperty([ruleId("/b", "every", 1)]);
    expect(ruleIds(config)["/b"]?.every).toEqual([
      ruleId("/b", "every", 0),
      ruleId("/b", "every", 1),
    ]);
  });

  test("gives rules of colliding state names and event types distinct ids", () => {
    const entry = write(
      "main.ts",
      `import { defineMachine } from "@defold-typescript/types/hsm";
export const m = defineMachine()({
  initial: "/a",
  states: {
    a: { on: { "b|on|c": "/a|on|b", "on|b|c": "/a|on|b" } },
    "a|on|b": { on: { c: "/a" } },
  },
});
`,
    );
    const loaded = load(entry);
    const config = loaded.machines[0]?.config;
    const index = machineIndex(config, loaded.files);
    const first = ruleId("/a", "on", "b|on|c", 0);
    const second = ruleId("/a|on|b", "on", "c", 0);

    expect(first).not.toBe(second);
    expect(index.ruleOnKeys[first]).toEqual({ statePath: "/a", event: "b|on|c" });
    expect(index.ruleOnKeys[second]).toEqual({ statePath: "/a|on|b", event: "c" });
    expect(index.rules[first]).toEqual(index.onKeys["/a"]?.["b|on|c"]);
    expect(index.rules[second]).toEqual(index.onKeys["/a|on|b"]?.c);
    expect(index.rules[first]).not.toEqual(index.rules[second]);

    const ids = Object.values(ruleIds(config)).flatMap((state) => [
      ...Object.values(state.on).flat(),
      ...state.after,
      ...state.every,
      ...state.always,
      ...(state.update === undefined ? [] : [state.update]),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(Object.keys(index.ruleOnKeys).length);
  });

  test("maps a builder machine's rules to the statement calls that made them", () => {
    const source = `import { buildMachine } from "@defold-typescript/types/hsm/builder";
type Ev = { type: "HIT" };
const m = buildMachine<{ hp: number }, Ev>()({
  initial: "/alive",
  states: {
    alive: { initial: "/alive/patrol", states: { patrol: {}, chase: {} } },
    dead: {},
  },
});
m.state("/alive").on("HIT").when((ctx) => ctx.hp <= 1).to("/dead");
m.state("/alive").on("HIT").run((ctx) => { ctx.hp -= 1; });
m.state("/alive/chase").after(0.5).to("/alive/patrol");
m.state("/alive/chase").every(1).run((ctx) => { ctx.hp += 1; });
m.state("/dead").always().when((ctx) => ctx.hp > 0).to("/alive");
m.state("/alive/patrol").update(() => undefined);
export const machine = m.build();
`;
    const entry = write("main.ts", source);
    const loaded = load(entry);
    const index = machineIndex(loaded.machines[0]?.config, loaded.files);
    const callAt = (call: string, from = 0) => {
      const start = source.indexOf(call, from);
      return { file: 0, start, end: start + call.length };
    };
    const firstHit = callAt('on("HIT")');
    const secondHit = callAt('on("HIT")', firstHit.end);

    expect(loaded.files[0]?.path).toBe(entry);
    expect(secondHit.start).toBeGreaterThan(firstHit.start);
    expect(index.rules[ruleId("/alive", "on", "HIT", 0)]).toEqual(firstHit);
    expect(index.rules[ruleId("/alive", "on", "HIT", 1)]).toEqual(secondHit);
    expect(index.onKeys["/alive"]?.HIT).toEqual(firstHit);
    expect(index.rules[ruleId("/alive/chase", "after", 0)]).toEqual(callAt("after(0.5)"));
    expect(index.rules[ruleId("/alive/chase", "every", 0)]).toEqual(callAt("every(1)"));
    expect(index.rules[ruleId("/dead", "always", 0)]).toEqual(callAt("always()"));
    expect(index.rules[ruleId("/alive/patrol", "update")]).toEqual(
      callAt("update(() => undefined)"),
    );
    expect(Object.keys(index.states).sort()).toEqual([
      "/alive",
      "/alive/chase",
      "/alive/patrol",
      "/dead",
    ]);
    for (const [statePath, span] of Object.entries(index.states)) {
      expect(spanText(loaded.files, span)).toBe(statePath.slice(statePath.lastIndexOf("/") + 1));
    }
  });

  test("maps each builder state's update rule to its own call when states share a callback", () => {
    const source = `import { buildMachine } from "@defold-typescript/types/hsm/builder";
const m = buildMachine<object, { type: "GO" }>()({ initial: "/a", states: { a: {}, b: {} } });
const shared = () => undefined;
m.state("/a").update(shared);
m.state("/b").update(shared);
export const machine = m.build();
`;
    const entry = write("main.ts", source);
    const loaded = load(entry);
    const index = machineIndex(loaded.machines[0]?.config, loaded.files);
    const callAt = (call: string, from = 0) => {
      const start = source.indexOf(call, from);
      return { file: 0, start, end: start + call.length };
    };
    const first = callAt("update(shared)");
    const second = callAt("update(shared)", first.end);

    expect(second.start).toBeGreaterThan(first.start);
    expect(index.rules[ruleId("/a", "update")]).toEqual(first);
    expect(index.rules[ruleId("/b", "update")]).toEqual(second);
  });

  test("maps a builder state's one on call to both its rule and its on key", () => {
    const source = `import { buildMachine } from "@defold-typescript/types/hsm/builder";
const m = buildMachine<object, { type: "SEE" }>()({ initial: "/a", states: { a: {}, b: {} } });
m.root.on("SEE").to("/b");
export const machine = m.build();
`;
    const entry = write("main.ts", source);
    const loaded = load(entry);
    const index = machineIndex(loaded.machines[0]?.config, loaded.files);
    const start = source.indexOf('on("SEE")');
    const call = { file: 0, start, end: start + 'on("SEE")'.length };

    expect(index.rules[ruleId("", "on", "SEE", 0)]).toEqual(call);
    expect(index.onKeys[""]?.SEE).toEqual(call);
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
