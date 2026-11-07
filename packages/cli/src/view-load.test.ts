import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ECS_LIBRARY, HSM_LIBRARY, requireLibrarySourceDir } from "@defold-typescript/transpiler";
import { type LoadedMachine, loadProject } from "./view-load";
import { type EngineEntry, locationOf, type SourceSpan, ViewLoadError } from "./view-run";

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

interface StateLike {
  readonly initial?: string;
  readonly states?: Record<string, StateLike>;
}

interface Instance {
  readonly path: string | undefined;
  readonly ctx: unknown;
  readonly send: (event: { type: string }) => void;
  readonly update: (dt: number) => void;
}

interface Startable {
  readonly start: (ctx: unknown) => Instance;
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "view-load-"));
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

function load(entry: string) {
  return loadProject(entry, { hsmSourceDir, ecsSourceDir });
}

function slice(text: string, span: SourceSpan | undefined): string | undefined {
  return span === undefined ? undefined : text.slice(span.start, span.end);
}

function start(machine: LoadedMachine, ctx: unknown = {}): Instance {
  return (machine.machine as Startable).start(ctx);
}

function stateAt(config: StateLike, statePath: string): StateLike | undefined {
  let state: StateLike | undefined = config;
  for (const name of statePath.split("/").filter((part) => part.length > 0)) {
    state = state?.states?.[name];
  }
  return state;
}

function leafOf(config: StateLike): string | undefined {
  let leaf = config.initial;
  let state = leaf === undefined ? undefined : stateAt(config, leaf);
  while (state?.initial !== undefined) {
    leaf = state.initial;
    state = stateAt(config, leaf);
  }
  return leaf;
}

const PRIVATE_MACHINES = `import { defineMachine } from "@defold-typescript/types/hsm";
export const turret = defineMachine("turret")({
  privateCtx: () => ({ heat: 0 }),
  initial: "/a",
  states: { a: {} },
});
export const lamp = defineMachine()({
  privateCtx: () => ({ heat: 0 }),
  initial: "/a",
  states: { a: {} },
});
`;

function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

describe("loadProject machines", () => {
  test("loads the platformer's player machine and runs its hooks against the stubs", () => {
    const loaded = load(PLATFORMER_MACHINE);
    expect(loaded.machines.map((machine) => machine.name)).toEqual(["playerMachine"]);
    const entries: EngineEntry[] = [];
    loaded.engine.setSink((entry) => entries.push(entry));

    const [machine] = loaded.machines;
    if (machine === undefined) {
      throw new Error("no machine loaded");
    }
    const instance = start(machine, {
      velocity: { x: 0, y: 0, z: 0 },
      ground_contact: false,
    });
    const leaf = leafOf(machine.config as StateLike);
    expect(leaf).toBeDefined();
    expect(instance.path).toBe(leaf);

    const plays = entries.filter(
      (entry) => entry.kind === "engine" && entry.api === "sprite.play_flipbook",
    );
    expect(plays).toHaveLength(1);
    const play = plays[0];
    const anim = play?.kind === "engine" ? /^hash: \[(\w+)\]$/.exec(String(play.args[1])) : null;
    expect(anim).not.toBeNull();
    expect(readFileSync(PLATFORMER_MACHINE, "utf8")).toContain(`hash("${anim?.[1]}")`);
  });

  test("names a machine by its key, then its export, then its definition order", () => {
    const entry = write(
      "main.ts",
      `import { defineMachine } from "@defold-typescript/types/hsm";
export const front = defineMachine("door")({ initial: "/a", states: { a: {} } });
export const lamp = defineMachine()({ initial: "/a", states: { a: {} } });
defineMachine("gate")({ initial: "/a", states: { a: {} } });
defineMachine()({ initial: "/a", states: { a: {} } });
`,
    );
    const loaded = load(entry);
    expect(loaded.machines.map(({ name, key }) => ({ name, key }))).toEqual([
      { name: "door", key: "door" },
      { name: "lamp", key: undefined },
      { name: "gate", key: "gate" },
      { name: "machine-1", key: undefined },
    ]);
  });

  test("lists a machine whose config has privateCtx", () => {
    const loaded = load(write("main.ts", PRIVATE_MACHINES));
    expect(loaded.machines.map(({ name, key }) => ({ name, key }))).toEqual([
      { name: "turret", key: "turret" },
      { name: "lamp", key: undefined },
    ]);
  });

  test("starts a recorded private machine with the fields its privateCtx builds", () => {
    const [turret] = load(write("main.ts", PRIVATE_MACHINES)).machines;
    if (turret === undefined) {
      throw new Error("no machine loaded");
    }
    expect(start(turret, { rate: 2 }).ctx).toEqual({ rate: 2, heat: 0 });
  });

  test("lists the entry file, then each imported project file in first-import order", () => {
    const entry = write(
      "main.ts",
      `import { defineMachine } from "@defold-typescript/types/hsm";
import "@defold-typescript/types/script";
import { airborne } from "./air-states";
import { b } from "./b";
export const m = defineMachine()({ initial: "/airborne", states: { airborne, b } });
`,
    );
    const airStates = write(
      "air-states.ts",
      `import { shared } from "./shared";
export const airborne = { ...shared };
`,
    );
    const shared = write("shared/index.ts", "export const shared = {};\n");
    const b = write("b.ts", `import { shared } from "./shared";\nexport const b = shared;\n`);

    const loaded = load(entry);
    expect(loaded.files.map((file) => file.path)).toEqual([entry, airStates, shared, b]);
    for (const file of loaded.files) {
      expect(file.text).toBe(readFileSync(file.path, "utf8"));
    }
  });

  test("tags every literal with where it was written", () => {
    const entry = write(
      "main.ts",
      `import { defineMachine } from "@defold-typescript/types/hsm";
import { airborne } from "./air-states";

const extra = {
  idle: { on: { GO: "/grounded" } },
};

export const m = defineMachine()({
  initial: "/grounded",
  states: {
    grounded: { on: { GO: { to: "/idle", run: [() => {}, () => {}] } } },
    airborne,
    ...extra,
  },
});
`,
    );
    const airStates = write(
      "air-states.ts",
      'export const airborne = { initial: "/airborne/up", states: { up: {} } };\n',
    );

    const loaded = load(entry);
    const text = loaded.files[0]?.text ?? "";
    const config = loaded.machines[0]?.config as {
      states: Record<string, { on?: { GO: { run: unknown[] } } }>;
    };

    const states = locationOf(config.states);
    expect(states?.file).toBe(entry);
    expect(slice(text, states?.keys.grounded)).toBe("grounded");
    expect(slice(text, states?.keys.airborne)).toBe("airborne");
    expect(states?.keys.idle).toBeUndefined();
    expect(slice(text, states?.keyOf)).toBe("states");
    expect(slice(text, states)?.startsWith("{")).toBe(true);
    expect(slice(text, states)?.endsWith("}")).toBe(true);

    const hooks = locationOf(config.states.grounded?.on?.GO.run);
    expect(slice(text, hooks)).toBe("[() => {}, () => {}]");
    expect(slice(text, hooks?.keys["1"])).toBe("() => {}");

    expect(locationOf(config.states.airborne)?.file).toBe(airStates);

    const idle = locationOf(config.states.idle);
    expect(slice(text, idle?.keyOf)).toBe("idle");
    expect(idle?.keyOf?.start).toBeGreaterThan(text.indexOf("const extra"));
    expect(idle?.keyOf?.start).toBeLessThan(text.indexOf("export const m"));

    expect(locationOf("grounded")).toBeUndefined();
    expect(Object.keys(config.states)).toEqual(["grounded", "airborne", "idle"]);
  });

  test("loads type-only and declaration imports, and refuses anything else", () => {
    const typed = write(
      "typed.ts",
      `import type { Missing } from "./missing";
import "@defold-typescript/types/script";
import { defineMachine } from "@defold-typescript/types/hsm";
export const m = defineMachine()({ initial: "/a", states: { a: {} } as Missing });
`,
    );
    expect(load(typed).machines.map((machine) => machine.name)).toEqual(["m"]);

    const external = write(
      "external.ts",
      `import { x } from "monarch";
export const y = x;
`,
    );
    const importError = thrown(() => load(external));
    expect(importError).toBeInstanceOf(ViewLoadError);
    expect((importError as Error).message).toContain("monarch");
    expect((importError as Error).message).toContain(external);

    const broken = write(
      "broken.ts",
      `import { defineMachine } from "@defold-typescript/types/hsm";
export const m = defineMachine()({ initial: "/a", states: { a: { on: { GO: "nowhere" } } } });
`,
    );
    const hsmError = thrown(() => load(broken));
    expect(hsmError).toBeInstanceOf(ViewLoadError);
    expect((hsmError as Error).message).toContain(broken);
    expect((hsmError as Error).message).toContain(`targets "nowhere"`);
  });

  test("stubs Defold globals by name and sends calls and prints to the sink", () => {
    const entry = write(
      "main.ts",
      `import { defineMachine } from "@defold-typescript/types/hsm";
export const m = defineMachine()({
  initial: "/a",
  states: {
    a: {
      enter: (ctx) => {
        ctx.first = go.PLAYBACK_ONCE_FORWARD;
        ctx.second = go.PLAYBACK_ONCE_FORWARD;
        ctx.shown = tostring(go.PLAYBACK_ONCE_FORWARD);
        print("hi");
        msg.post(".", hash("ping"));
      },
    },
  },
});
`,
    );
    const loaded = load(entry);
    const entries: EngineEntry[] = [];
    loaded.engine.setSink((entry) => entries.push(entry));
    const ctx: Record<string, unknown> = {};
    const [machine] = loaded.machines;
    if (machine === undefined) {
      throw new Error("no machine loaded");
    }
    start(machine, ctx);

    expect(String(ctx.first)).toBe("go.PLAYBACK_ONCE_FORWARD");
    expect(`${ctx.first}`).toBe("go.PLAYBACK_ONCE_FORWARD");
    expect(ctx.first).toBe(ctx.second);
    expect(ctx.shown).toBe("go.PLAYBACK_ONCE_FORWARD");
    expect(entries).toEqual([
      { kind: "print", text: "hi" },
      { kind: "engine", api: "msg.post", args: [".", "hash: [ping]"] },
    ]);
  });

  test("passes a shared builder update callback its arguments and returns its result", () => {
    const entry = write(
      "main.ts",
      `import { buildMachine } from "@defold-typescript/types/hsm/builder";
type Ctx = { dts: number[]; machines: unknown[] };
const m = buildMachine<Ctx, { type: "GO" }>()({ initial: "/a", states: { a: {}, b: {} } });
const shared = (ctx: Ctx, dt: number, machine: unknown) => {
  ctx.dts.push(dt);
  ctx.machines.push(machine);
  return ctx.dts.length === 1 ? "/b" : undefined;
};
m.state("/a").update(shared);
m.state("/b").update(shared);
export const machine = m.build();
`,
    );
    const [machine] = load(entry).machines;
    if (machine === undefined) {
      throw new Error("no machine loaded");
    }
    const ctx = { dts: [] as number[], machines: [] as unknown[] };
    const instance = start(machine, ctx);

    instance.update(0.5);
    expect(instance.path).toBe("/b");
    expect(ctx.dts).toEqual([0.5]);
    expect(ctx.machines[0]).toBe(instance);

    instance.update(0.25);
    expect(instance.path).toBe("/b");
    expect(ctx.dts).toEqual([0.5, 0.25]);
  });

  test("stubs a Defold global even when this process's globalThis carries one", () => {
    const entry = write(
      "main.ts",
      `import { defineMachine } from "@defold-typescript/types/hsm";
export const m = defineMachine()({
  initial: "/a",
  states: { a: { enter: () => particlefx.play("#fx") } },
});
`,
    );
    const host = globalThis as { particlefx?: unknown };
    host.particlefx = undefined;
    try {
      const loaded = load(entry);
      const entries: EngineEntry[] = [];
      loaded.engine.setSink((entry) => entries.push(entry));
      const [machine] = loaded.machines;
      if (machine === undefined) {
        throw new Error("no machine loaded");
      }
      start(machine);
      expect(entries).toEqual([{ kind: "engine", api: "particlefx.play", args: ["#fx"] }]);
    } finally {
      delete host.particlefx;
    }
  });
});

describe("reload", () => {
  const keyed = (target: string) =>
    `import { defineMachine } from "@defold-typescript/types/hsm";
export const m = defineMachine("m")({
  initial: "/a",
  states: { a: { on: { GO: "${target}" } }, b: {}, c: {} },
});
`;

  test("rebinds a keyed machine's live instance to the edited config", () => {
    const entry = write("main.ts", keyed("/b"));
    const loaded = load(entry);
    const before = loaded.machines[0];
    if (before === undefined) {
      throw new Error("no machine loaded");
    }
    const instance = start(before);
    expect(instance.path).toBe("/a");

    write("main.ts", keyed("/c"));
    loaded.reload();

    expect(loaded.machines[0]?.machine).toBe(before.machine);
    expect(loaded.files[0]?.text).toBe(keyed("/c"));
    expect(instance.path).toBe("/a");
    instance.send({ type: "GO" });
    expect(instance.path).toBe("/c");
  });

  test("defines an unkeyed machine afresh", () => {
    const unkeyed = `import { defineMachine } from "@defold-typescript/types/hsm";
export const m = defineMachine()({ initial: "/a", states: { a: {} } });
`;
    const entry = write("main.ts", unkeyed);
    const loaded = load(entry);
    const before = loaded.machines[0]?.machine;
    loaded.reload();
    expect(loaded.machines[0]?.machine).toBeDefined();
    expect(loaded.machines[0]?.machine).not.toBe(before);
  });

  test("follows imports added and removed by the edit", () => {
    const entry = write("main.ts", keyed("/b"));
    const extra = write("extra.ts", "export const extra = 1;\n");
    const loaded = load(entry);
    expect(loaded.files.map((file) => file.path)).toEqual([entry]);

    write("main.ts", `import "./extra";\n${keyed("/b")}`);
    loaded.reload();
    expect(loaded.files.map((file) => file.path)).toEqual([entry, extra]);

    write("main.ts", keyed("/b"));
    loaded.reload();
    expect(loaded.files.map((file) => file.path)).toEqual([entry]);
  });

  test("keeps the last good load when the edit does not compile", () => {
    const entry = write("main.ts", keyed("/b"));
    const loaded = load(entry);
    const files = loaded.files;
    const machines = loaded.machines;

    write("main.ts", "export const = ;\n");
    const error = thrown(() => loaded.reload());
    expect(error).toBeInstanceOf(ViewLoadError);
    expect((error as Error).message).toContain(entry);
    expect(loaded.files).toBe(files);
    expect(loaded.machines).toBe(machines);
  });
});

interface WorldLike {
  readonly systems: readonly object[];
  readonly entities: readonly Record<string, unknown>[];
  update(dt: number): void;
}

interface ScriptLike {
  readonly init?: (self: Record<string, unknown>) => Record<string, unknown> | undefined;
  readonly update?: (self: Record<string, unknown>, dt: number) => void;
}

function worldAt(loaded: ReturnType<typeof load>, index: number): WorldLike {
  const found = loaded.worlds[index];
  if (found === undefined) {
    throw new Error(`no world ${index}`);
  }
  return found as WorldLike;
}

function scriptOf(loaded: ReturnType<typeof load>): ScriptLike {
  if (loaded.script === undefined) {
    throw new Error("no script loaded");
  }
  return loaded.script as ScriptLike;
}

describe("loadProject worlds", () => {
  test("lists a world built at module scope once, with its systems' names and sources", () => {
    const entry = write(
      "main.ts",
      `import { processingSystem, refresh, requireAll, system, world } from "@defold-typescript/types/ecs";
interface Ent { pos?: number }
export const mover = processingSystem<Ent>("move")(requireAll("pos"), { process(e) { e.pos = 1; } });
export const tally = system<Ent>()({ update() {} });
const hidden = system<Ent>()({ onAdd() {} });
export const w = world<Ent>(mover, tally, hidden);
refresh(w);
`,
    );
    const loaded = load(entry);
    const text = loaded.files[0]?.text ?? "";

    expect(loaded.worlds).toHaveLength(1);
    expect(loaded.exportName(loaded.worlds[0])).toBe("w");
    const [mover, tally, hidden] = worldAt(loaded, 0).systems;
    expect([mover, tally, hidden].map((each) => loaded.systemName(each))).toEqual([
      "move",
      "tally",
      undefined,
    ]);
    expect(loaded.systemSource(mover)?.file).toBe(entry);
    expect(slice(text, loaded.systemSource(mover))).toBe("{ process(e) { e.pos = 1; } }");
    expect(slice(text, loaded.systemSource(hidden))).toBe("{ onAdd() {} }");
  });

  test("loads a script's hooks without running them, and records the world its init builds", () => {
    const entry = write(
      "main.ts",
      `import { defineScript } from "@defold-typescript/types";
import { world } from "@defold-typescript/types/ecs";
export default defineScript({
  init() { return { garden: world({ glow: 1 }) }; },
  update(self, dt) { self.garden.update(dt); },
});
`,
    );
    const loaded = load(entry);
    const script = scriptOf(loaded);

    expect(loaded.worlds).toHaveLength(0);
    expect(loaded.exportName(script)).toBe("default");
    expect(typeof script.init).toBe("function");
    expect(typeof script.update).toBe("function");
    const self = script.init?.({});
    expect(loaded.worlds).toHaveLength(1);
    expect(self?.garden).toBe(loaded.worlds[0]);
  });

  test("takes no script from a default export without init or update", () => {
    const loaded = load(write("main.ts", "export default { name: 1 };\n"));
    expect(loaded.script).toBeUndefined();
  });

  test("lists a file's machine at load and its script's world once init runs", () => {
    const entry = write(
      "main.ts",
      `import { defineScript } from "@defold-typescript/types";
import { world } from "@defold-typescript/types/ecs";
import { defineMachine } from "@defold-typescript/types/hsm";
export const lamp = defineMachine()({ initial: "/off", states: { off: {} } });
export default defineScript({ init() { return { garden: world() }; } });
`,
    );
    const loaded = load(entry);

    expect(loaded.machines.map((machine) => machine.name)).toEqual(["lamp"]);
    expect(loaded.worlds).toHaveLength(0);
    scriptOf(loaded).init?.({});
    expect(loaded.worlds).toHaveLength(1);
  });

  test("runs ecs/debug's inspect against the simulated engine and prints to the sink", () => {
    const entry = write(
      "main.ts",
      `import { defineScript } from "@defold-typescript/types";
import { world } from "@defold-typescript/types/ecs";
import { inspect } from "@defold-typescript/types/ecs/debug";
const garden = world({ glow: 1 });
export default defineScript({ init() { return { inspector: inspect(garden, "level") }; } });
`,
    );
    const loaded = load(entry);
    const entries: EngineEntry[] = [];
    loaded.engine.setSink((entry) => entries.push(entry));
    scriptOf(loaded).init?.({});

    const [first] = entries;
    expect(first?.kind).toBe("print");
    expect(first?.kind === "print" ? first.text : "").toStartWith("ecs level frame 0: inspecting");
  });
});

describe("loadProject reload and restart", () => {
  const garden = (step: number) => `import { defineScript } from "@defold-typescript/types";
import { processingSystem, requireAll, world } from "@defold-typescript/types/ecs";
interface Ent { x: number }
const move = processingSystem<Ent>("move")(requireAll("x"), {
  process(e) { e.x += ${step}; },
});
export default defineScript({
  init() { return { garden: world<Ent>(move, { x: 0 }) }; },
});
`;

  test("keeps a recorded world through a reload, and its keyed system runs the edited process", () => {
    const entry = write("main.ts", garden(1));
    const loaded = load(entry);
    scriptOf(loaded).init?.({});
    const before = worldAt(loaded, 0);

    write("main.ts", garden(10));
    loaded.reload();

    expect(loaded.worlds).toHaveLength(1);
    expect(loaded.worlds[0]).toBe(before);
    before.update(0);
    expect(before.entities[0]?.x).toBe(10);
    const [move] = before.systems;
    expect(slice(loaded.files[0]?.text ?? "", loaded.systemSource(move))).toContain("e.x += 10");
  });

  test("keeps the last files, machines, script and worlds when a reload throws", () => {
    const entry = write(
      "main.ts",
      `import { defineMachine } from "@defold-typescript/types/hsm";
${garden(1)}export const lamp = defineMachine()({ initial: "/off", states: { off: {} } });
`,
    );
    const loaded = load(entry);
    scriptOf(loaded).init?.({});
    const { files, machines, script } = loaded;

    write("main.ts", "export const = ;\n");
    const compileError = thrown(() => loaded.reload());
    write(
      "main.ts",
      `import { world } from "@defold-typescript/types/ecs";
export const extra = world();
throw new Error("boom");
`,
    );
    const runError = thrown(() => loaded.reload());

    expect(compileError).toBeInstanceOf(ViewLoadError);
    expect(runError).toBeInstanceOf(ViewLoadError);
    expect((runError as Error).message).toContain("boom");
    expect(loaded.files).toBe(files);
    expect(loaded.machines).toBe(machines);
    expect(loaded.script).toBe(script);
    expect(loaded.worlds).toHaveLength(1);
  });

  test("restart forgets every world and builds keyed systems afresh", () => {
    const loaded = load(write("main.ts", garden(1)));
    scriptOf(loaded).init?.({});
    const first = worldAt(loaded, 0);
    first.update(0);
    const [system] = first.systems;

    loaded.restart();
    expect(loaded.worlds).toHaveLength(0);
    scriptOf(loaded).init?.({});
    const restarted = worldAt(loaded, 0);
    restarted.update(0);
    expect(restarted).not.toBe(first);
    expect(restarted.systems[0]).not.toBe(system);
    expect(loaded.systemName(restarted.systems[0])).toBe("move");
  });

  test("restart reseeds math.random, and a reload keeps drawing from the same generator", () => {
    const entry = write(
      "main.ts",
      `import { defineScript } from "@defold-typescript/types";
export default defineScript({ init() { return { roll: math.random() }; } });
`,
    );
    const loaded = load(entry);
    const roll = () => scriptOf(loaded).init?.({})?.roll;
    const first = roll();

    loaded.reload();
    const afterReload = roll();
    loaded.restart();
    const afterRestart = roll();

    expect(afterReload).not.toBe(first);
    expect(afterRestart).toBe(first);
  });
});

describe("loadProject instances", () => {
  const herd = `import { defineScript } from "@defold-typescript/types";
import { world } from "@defold-typescript/types/ecs";
import { join, tickMachines } from "@defold-typescript/types/ecs/hsm";
import { defineMachine, type MachineInstance } from "@defold-typescript/types/hsm";
interface Critter { readonly name: string; fsm?: MachineInstance<Critter, { type: "SCARE" }> }
export const herd = world<Critter>(tickMachines<Critter>("fsm"));
export const critter = defineMachine<Critter, { type: "SCARE" }>()({
  initial: "/wander",
  enter: join(herd),
  states: { wander: { on: { SCARE: "/flee" } }, flee: {} },
});
export const lamp = defineMachine()({ initial: "/off", states: { off: {} } });
function spawn(name: string): Critter {
  const one: Critter = { name };
  one.fsm = critter.start(one);
  return one;
}
export default defineScript({
  init() { return { light: lamp.start({}), a: spawn("a"), b: spawn("b") }; },
});
`;

  test("lists every start of a defined machine in start order, through a reload, until a restart", () => {
    const loaded = load(write("main.ts", herd));
    const self = scriptOf(loaded).init?.({}) ?? {};
    const names = () => loaded.instances.map((each) => each.machine.name);
    const instanceAt = (index: number) => loaded.instances[index]?.instance;
    const [critter, lamp] = loaded.machines as [LoadedMachine, LoadedMachine];

    expect(names()).toEqual(["lamp", "critter", "critter"]);
    expect(instanceAt(0)).toBe(self.light);
    expect(instanceAt(1)).toBe((self.a as { fsm: unknown }).fsm);
    expect(instanceAt(2)).toBe((self.b as { fsm: unknown }).fsm);
    expect(loaded.instances[1]?.machine).toBe(critter);

    const unrecorded = loaded.startUnrecorded(lamp, {}) as Instance;
    expect(unrecorded.path).toBe("/off");
    expect(loaded.instances).toHaveLength(3);

    loaded.reload();
    expect(names()).toEqual(["lamp", "critter", "critter"]);
    expect(instanceAt(0)).toBe(self.light);
    const later = start(loaded.machines[1] as LoadedMachine);
    expect(names()).toEqual(["lamp", "critter", "critter", "lamp"]);
    expect(instanceAt(3)).toBe(later);

    loaded.restart();
    expect(loaded.instances).toEqual([]);
    scriptOf(loaded).init?.({});
    expect(names()).toEqual(["lamp", "critter", "critter"]);
  });
});
