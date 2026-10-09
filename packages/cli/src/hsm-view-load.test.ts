import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { requireHsmSourceDir } from "@defold-typescript/transpiler";
import {
  type EngineEntry,
  HsmViewLoadError,
  type LoadedMachine,
  loadMachines,
  locationOf,
  type SourceSpan,
} from "./hsm-view-load";

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

interface StateLike {
  readonly initial?: string;
  readonly states?: Record<string, StateLike>;
}

interface Instance {
  readonly path: string | undefined;
  readonly ctx: unknown;
  readonly send: (event: { type: string }) => void;
}

interface Startable {
  readonly start: (ctx: unknown) => Instance;
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "hsm-view-load-"));
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
  return loadMachines(entry, { hsmSourceDir });
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

const PRIVATE_MACHINES = `import { definePrivateMachine } from "@defold-typescript/types/hsm";
export const turret = definePrivateMachine("turret")({
  privateCtx: () => ({ heat: 0 }),
  initial: "/a",
  states: { a: {} },
});
export const lamp = definePrivateMachine()({
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

describe("loadMachines", () => {
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

  test("lists a machine built with definePrivateMachine", () => {
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
    expect(importError).toBeInstanceOf(HsmViewLoadError);
    expect((importError as Error).message).toContain("monarch");
    expect((importError as Error).message).toContain(external);

    const broken = write(
      "broken.ts",
      `import { defineMachine } from "@defold-typescript/types/hsm";
export const m = defineMachine()({ initial: "/a", states: { a: { on: { GO: "nowhere" } } } });
`,
    );
    const hsmError = thrown(() => load(broken));
    expect(hsmError).toBeInstanceOf(HsmViewLoadError);
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
    expect(error).toBeInstanceOf(HsmViewLoadError);
    expect((error as Error).message).toContain(entry);
    expect(loaded.files).toBe(files);
    expect(loaded.machines).toBe(machines);
  });
});
