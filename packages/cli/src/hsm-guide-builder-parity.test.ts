/**
 * The State machines guide shows a machine config with a Builder tab beside it, which writes the
 * same machine as `hsm/builder` statements. Both spellings are fences of the excerpt source: the
 * fence titled `builder/<name>.ts` is the twin of the fence titled `<name>.ts`. This loads each
 * pair over the hsm source, captures every config `defineMachine` receives, and holds the two
 * lists to each other, machine by machine in definition order, after folding each shorthand onto
 * the list spelling `build()` writes. A pair whose machine hsm rejects must be rejected with the
 * same message on both sides.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import { ECS_LIBRARY, HSM_LIBRARY, requireLibrarySourceDir } from "@defold-typescript/transpiler";
import { builderTwins, type Fence, REPO_ROOT, writeFenceProject } from "./guide-fence-gate";
import { loadProject } from "./view-load";

const EXCERPT_SOURCE = path.join(REPO_ROOT, "packages/cli/test/fixtures/hsm-guide-excerpts.md");
const HSM_SOURCE_DIR = requireLibrarySourceDir(HSM_LIBRARY);
const ECS_SOURCE_DIR = requireLibrarySourceDir(ECS_LIBRARY);
const SLOW = 120_000;

const tempRoots: string[] = [];

afterAll(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

// The shorthands the `StateConfig` table under `## Reference` in state-machines.md documents,
// each folded onto the list spelling `build()` writes: a target string is `[{ to }]`, one rule is
// a one-item list, an `after` or `every` record is a list in delay order, one `run` is a one-item
// list, and a function is a placeholder.
const FUNCTION = "<function>";

type Table = Record<string, unknown>;

function foldValue(value: unknown): unknown {
  if (typeof value === "function") {
    return FUNCTION;
  }
  if (Array.isArray(value)) {
    return value.map(foldValue);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, foldValue(item)]));
  }
  return value;
}

function foldRule(rule: unknown): Table {
  if (typeof rule === "string") {
    return { to: rule };
  }
  const { run, ...rest } = rule as Table;
  const folded = foldValue(rest) as Table;
  if (run !== undefined) {
    folded.run = foldValue(Array.isArray(run) ? run : [run]);
  }
  return folded;
}

function foldRules(rules: unknown): Table[] {
  return (Array.isArray(rules) ? rules : [rules]).map(foldRule);
}

function foldTimers(timers: unknown, slot: "after" | "every"): Table[] {
  if (Array.isArray(timers)) {
    return timers.map(foldRule);
  }
  const record = timers as Table;
  return Object.keys(record)
    .sort((a, b) => Number(a) - Number(b))
    .map((delay) => {
      const value = record[delay];
      return { delay: Number(delay), ...foldRule(slot === "every" ? { run: value } : value) };
    });
}

function foldState(state: unknown): Table {
  const folded: Table = {};
  for (const [slot, value] of Object.entries(state as Table)) {
    if (slot === "states") {
      folded.states = Object.fromEntries(
        Object.entries(value as Table).map(([name, child]) => [name, foldState(child)]),
      );
    } else if (slot === "on") {
      folded.on = Object.fromEntries(
        Object.entries(value as Table).map(([type, rules]) => [type, foldRules(rules)]),
      );
    } else if (slot === "always") {
      folded.always = foldRules(value);
    } else if (slot === "after" || slot === "every") {
      folded[slot] = foldTimers(value, slot);
    } else {
      folded[slot] = foldValue(value);
    }
  }
  return folded;
}

interface Definition {
  readonly key: string | undefined;
  readonly config: Table;
}

interface Capture {
  readonly definitions: readonly Definition[];
  /** What the load threw, with the fence's own path left out. */
  readonly error: string | undefined;
}

// The fold runs when hsm receives the config, before it can change the objects it was given.
function capture(file: string): Capture {
  const definitions: Definition[] = [];
  try {
    loadProject(file, {
      hsmSourceDir: HSM_SOURCE_DIR,
      ecsSourceDir: ECS_SOURCE_DIR,
      onDefine: (key, config) => {
        definitions.push({ key, config: foldState(config) });
        return config;
      },
    });
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    return { definitions, error: message.split(path.resolve(file)).join("<fence>") };
  }
  return { definitions, error: undefined };
}

function describeValue(value: unknown): string {
  return value === undefined ? "nothing" : JSON.stringify(value);
}

/** The first path at which `config` and `builder` differ, with both values, or undefined. */
function difference(config: unknown, builder: unknown, at: string): string | undefined {
  if (Object.is(config, builder)) {
    return undefined;
  }
  const objects =
    typeof config === "object" &&
    config !== null &&
    typeof builder === "object" &&
    builder !== null &&
    Array.isArray(config) === Array.isArray(builder);
  if (objects && Array.isArray(config)) {
    const other = builder as unknown[];
    for (let index = 0; index < Math.max(config.length, other.length); index++) {
      const found = difference(config[index], other[index], `${at}[${index}]`);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }
  if (objects) {
    const left = config as Table;
    const right = builder as Table;
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      const found = difference(left[key], right[key], at === "" ? key : `${at}.${key}`);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }
  return `${at === "" ? "(root)" : at}: config ${describeValue(config)}, builder ${describeValue(builder)}`;
}

/** How the machines the builder fence defines differ from the ones its config twin defines. */
function parityFailures(config: Fence, builder: Fence): string[] {
  const project = writeFenceProject([config, builder], {
    tmpPrefix: "defold-typescript-hsm-builder-parity-",
  });
  tempRoots.push(project.root);
  const left = capture(path.join(project.src, config.rel));
  const right = capture(path.join(project.src, builder.rel));
  const name = config.label;
  const failures: string[] = [];
  if (left.definitions.length === 0 && left.error === undefined) {
    failures.push(`${name}: the config fence defines no machine`);
  }
  if (left.definitions.length !== right.definitions.length) {
    failures.push(
      `${name}: the config fence defines ${left.definitions.length} machine(s), the builder fence ${right.definitions.length}`,
    );
  }
  left.definitions.forEach((definition, index) => {
    const twin = right.definitions[index];
    if (twin === undefined) {
      return;
    }
    const machine = `${name} machine ${index + 1}${definition.key === undefined ? "" : ` "${definition.key}"`}`;
    if (definition.key !== twin.key) {
      failures.push(
        `${machine}: key ${describeValue(definition.key)}, builder key ${describeValue(twin.key)}`,
      );
    }
    const found = difference(definition.config, twin.config, "");
    if (found !== undefined) {
      failures.push(`${machine} differs at ${found}`);
    }
  });
  if (left.error !== right.error) {
    failures.push(
      `${name}: the config load ${left.error === undefined ? "succeeds" : `throws ${left.error}`}, the builder load ${right.error === undefined ? "succeeds" : `throws ${right.error}`}`,
    );
  }
  return failures;
}

const twins = builderTwins(readFileSync(EXCERPT_SOURCE, "utf8"));

describe("hsm guide builder twins", () => {
  test("the excerpt source has builder twins, and every one has a config fence", () => {
    expect(twins.length).toBeGreaterThan(0);
    const orphans = twins.filter((twin) => twin.config === undefined);
    expect(
      orphans.map((twin) => twin.builder.rel),
      "builder fences with no fence of the same name",
    ).toEqual([]);
  });

  for (const { builder, config } of twins) {
    if (config === undefined) {
      continue;
    }
    test(
      `${builder.rel} defines the machines ${config.rel} defines`,
      () => {
        expect(parityFailures(config, builder)).toEqual([]);
      },
      SLOW,
    );
  }
});

describe("hsm guide builder parity gate", () => {
  const configFence = (states: string): Fence => ({
    label: "probe.ts",
    rel: "probe.ts",
    body: [
      'import { defineMachine } from "@defold-typescript/types/hsm";',
      "",
      'type ProbeEvent = { type: "GO" } | { type: "HIT" };',
      "",
      'export const probe = defineMachine<{ hp: number }, ProbeEvent>("probe")({',
      '  initial: "/idle",',
      `  states: ${states},`,
      "});",
    ].join("\n"),
  });
  const builderFence = (statements: readonly string[]): Fence => ({
    label: "builder/probe.ts",
    rel: "builder/probe.ts",
    body: [
      'import { buildMachine } from "@defold-typescript/types/hsm/builder";',
      "",
      'type ProbeEvent = { type: "GO" } | { type: "HIT" };',
      "",
      'const m = buildMachine<{ hp: number }, ProbeEvent>("probe")({',
      '  initial: "/idle",',
      "  states: { idle: {}, hurt: {}, dead: {} },",
      "});",
      ...statements,
      "export const probe = m.build();",
    ].join("\n"),
  });

  test(
    "a pair with the same machine passes",
    () => {
      const config = configFence(
        '{ idle: { on: { GO: "/hurt", HIT: [{ to: "/dead", when: (ctx) => ctx.hp <= 0 }, { to: "/hurt" }] } }, hurt: {}, dead: {} }',
      );
      const builder = builderFence([
        'm.state("/idle").on("GO").to("/hurt");',
        'm.state("/idle").on("HIT").when((ctx) => ctx.hp <= 0).to("/dead");',
        'm.state("/idle").on("HIT").to("/hurt");',
      ]);
      expect(parityFailures(config, builder)).toEqual([]);
    },
    SLOW,
  );

  test(
    "the gate can fail: a pair that differs in one target is reported",
    () => {
      const config = configFence('{ idle: { on: { GO: "/hurt" } }, hurt: {}, dead: {} }');
      const builder = builderFence(['m.state("/idle").on("GO").to("/dead");']);
      expect(parityFailures(config, builder)).toEqual([
        'probe.ts machine 1 "probe" differs at states.idle.on.GO[0].to: config "/hurt", builder "/dead"',
      ]);
    },
    SLOW,
  );

  test(
    "the gate can fail: rules for one event written in the other order are reported",
    () => {
      const config = configFence(
        '{ idle: { on: { HIT: [{ to: "/dead", when: (ctx) => ctx.hp <= 0 }, { to: "/hurt" }] } }, hurt: {}, dead: {} }',
      );
      const builder = builderFence([
        'm.state("/idle").on("HIT").to("/hurt");',
        'm.state("/idle").on("HIT").when((ctx) => ctx.hp <= 0).to("/dead");',
      ]);
      expect(parityFailures(config, builder)).toEqual([
        'probe.ts machine 1 "probe" differs at states.idle.on.HIT[0].to: config "/dead", builder "/hurt"',
      ]);
    },
    SLOW,
  );
});
