import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Writable } from "node:stream";
import { GENERATED_BANNER } from "./build-output";
import { runWatch, type WatchEvent, type Watcher, type WatcherFactory } from "./watch";

function captureStreams() {
  const outChunks: Buffer[] = [];
  const errChunks: Buffer[] = [];
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      outChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      cb();
    },
  });
  const stderr = new Writable({
    write(chunk, _enc, cb) {
      errChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      cb();
    },
  });
  return {
    stdout,
    stderr,
    out: () => Buffer.concat(outChunks).toString("utf8"),
    err: () => Buffer.concat(errChunks).toString("utf8"),
  };
}

interface ControllableFactory {
  readonly factory: WatcherFactory;
  readonly opened: boolean;
  readonly closed: boolean;
  readonly observedRoot: string | null;
  trigger(kind: "change" | "rename", relPath: string): void;
}

function makeFactory(): ControllableFactory {
  let onEvent: ((e: WatchEvent) => void) | null = null;
  const state = { opened: false, closed: false, observedRoot: null as string | null };
  const factory: WatcherFactory = (root, cb): Watcher => {
    state.opened = true;
    state.observedRoot = root;
    onEvent = cb;
    return {
      close() {
        state.closed = true;
      },
    };
  };
  return {
    factory,
    get opened() {
      return state.opened;
    },
    get closed() {
      return state.closed;
    },
    get observedRoot() {
      return state.observedRoot;
    },
    trigger(kind, relPath) {
      if (!onEvent) throw new Error("watcher not opened");
      onEvent({ kind, path: relPath });
    },
  };
}

const DEFAULT_TSCONFIG = JSON.stringify(
  {
    compilerOptions: { target: "ES2022", module: "ESNext", strict: true },
    include: ["src/**/*.ts"],
  },
  null,
  2,
);

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-watch-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function writeProjectFile(rel: string, contents: string): void {
  const abs = path.join(cwd, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
}

function countMatches(haystack: string, needle: RegExp): number {
  return haystack.match(needle)?.length ?? 0;
}

function scriptSource(value: number): string {
  return `import { defineScript } from "@defold-typescript/types";\nexport default defineScript({ init() { vmath.vector3(${value}, 0, 0); } });\n`;
}

describe("runWatch", () => {
  test("initial build runs once and writes Lua", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, out } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, watcherFactory: factory.factory });
    await handle.waitForIdle();

    expect(readFileSync(path.join(cwd, "src/main.ts.script"), "utf8").length).toBeGreaterThan(0);
    expect(out()).toMatch(/wrote 1 files/);
    expect(factory.opened).toBe(true);

    handle.stop();
    const code = await handle.done;
    expect(code).toBe(0);
  });

  test("single FS event triggers exactly one rebuild", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, out } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, watcherFactory: factory.factory });
    await handle.waitForIdle();

    writeProjectFile("src/main.ts", scriptSource(2));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    expect(countMatches(out(), /wrote 1 files/g)).toBe(2);

    handle.stop();
    await handle.done;
  });

  test("generated .ts.script/.ts.script.map events trigger no rebuild and print no failure", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, out, err } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, watcherFactory: factory.factory });
    await handle.waitForIdle();

    expect(countMatches(out(), /wrote 1 files/g)).toBe(1);

    factory.trigger("rename", "src/main.ts.script");
    factory.trigger("change", "src/main.ts.script");
    factory.trigger("rename", "src/main.ts.script.map");
    factory.trigger("change", "src/main.ts.script.map");
    await handle.waitForIdle();

    expect(countMatches(out(), /wrote 1 files/g)).toBe(1);
    expect(err()).toBe("");
    expect(err()).not.toContain("unsupported extension");

    handle.stop();
    await handle.done;
  });

  test("startup warns about a sourceless orphan; an incremental edit adds no new orphan warning", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    writeProjectFile("src/old.lua", `return 1\n${GENERATED_BANNER}\n`);
    const { stdout, stderr, err } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, watcherFactory: factory.factory });
    await handle.waitForIdle();

    expect(err()).toContain("src/old.lua");
    expect(countMatches(err(), /src\/old\.lua/g)).toBe(1);

    writeProjectFile("src/main.ts", scriptSource(2));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    // The incremental rebuild path runs no orphan scan, so the warning count is unchanged.
    expect(countMatches(err(), /src\/old\.lua/g)).toBe(1);

    handle.stop();
    await handle.done;
  });

  test("burst of events within debounce window coalesces to one rebuild", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, out } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      debounceMs: 50,
    });
    await handle.waitForIdle();

    for (let i = 0; i < 5; i++) factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    expect(countMatches(out(), /wrote 1 files/g)).toBe(2);

    handle.stop();
    await handle.done;
  });

  test("build error mid-session is logged and watcher stays alive; recovers on next event", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, out, err } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, watcherFactory: factory.factory });
    await handle.waitForIdle();

    writeProjectFile("src/main.ts", 'const x: number = "oops";\n');
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    expect(err()).toContain("src/main.ts");
    const settled = await Promise.race([
      handle.done.then(() => "resolved" as const).catch(() => "rejected" as const),
      new Promise<"pending">((r) => setTimeout(() => r("pending"), 10)),
    ]);
    expect(settled).toBe("pending");

    writeProjectFile("src/main.ts", scriptSource(3));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    expect(countMatches(out(), /wrote 1 files/g)).toBe(2);

    handle.stop();
    const code = await handle.done;
    expect(code).toBe(0);
  });

  test("missing tsconfig.json at startup rejects and never opens a watcher", async () => {
    const { stdout, stderr } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, watcherFactory: factory.factory });

    let caught: Error | undefined;
    try {
      await handle.done;
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught?.message).toContain("defold-typescript watch");
    expect(caught?.message).toContain("tsconfig.json");
    expect(factory.opened).toBe(false);
  });

  test("a change event rewrites only the event-bearing file, not an un-triggered sibling", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, watcherFactory: factory.factory });
    await handle.waitForIdle();

    // A sibling appears on disk after the initial build but never fires an event.
    writeProjectFile("src/other.ts", "export const b = 2;\n");
    writeProjectFile("src/main.ts", scriptSource(2));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    expect(readFileSync(path.join(cwd, "src/main.ts.script"), "utf8")).toContain("2");
    expect(existsSync(path.join(cwd, "src/other.ts.script"))).toBe(false);

    handle.stop();
    await handle.done;
  });

  test("stop() closes the watcher and resolves done with 0", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, watcherFactory: factory.factory });
    await handle.waitForIdle();

    handle.stop();
    const code = await handle.done;

    expect(factory.closed).toBe(true);
    expect(code).toBe(0);
  });

  test("syncSurface runs once at startup before the first idle, even with no events", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr } = captureStreams();
    const factory = makeFactory();
    let syncCount = 0;

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      syncSurface: () => {
        syncCount++;
      },
    });
    await handle.waitForIdle();

    expect(syncCount).toBe(1);

    handle.stop();
    await handle.done;
  });

  test("the component watcher is opened over cwd (not src/) and closed on stop()", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr } = captureStreams();
    const main = makeFactory();
    const component = makeFactory();

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: main.factory,
      componentWatcherFactory: component.factory,
      syncSurface: () => {},
    });
    await handle.waitForIdle();

    expect(component.opened).toBe(true);
    expect(component.observedRoot).toBe(cwd);
    expect(main.observedRoot).toBe(cwd);

    handle.stop();
    await handle.done;
    expect(component.closed).toBe(true);
  });

  test("a component-file rename re-syncs the surface; a src change does not", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr } = captureStreams();
    const main = makeFactory();
    const component = makeFactory();
    let syncCount = 0;

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      debounceMs: 5,
      watcherFactory: main.factory,
      componentWatcherFactory: component.factory,
      syncSurface: () => {
        syncCount++;
      },
    });
    await handle.waitForIdle();
    expect(syncCount).toBe(1);

    component.trigger("rename", "main.gui_script");
    await handle.waitForIdle();
    expect(syncCount).toBe(2);

    writeProjectFile("src/main.ts", scriptSource(2));
    main.trigger("change", "src/main.ts");
    await handle.waitForIdle();
    expect(syncCount).toBe(2);

    handle.stop();
    await handle.done;
  });

  test("component watcher ignores .defold-types, build, and node_modules events", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr } = captureStreams();
    const main = makeFactory();
    const component = makeFactory();
    let syncCount = 0;

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      debounceMs: 5,
      watcherFactory: main.factory,
      componentWatcherFactory: component.factory,
      syncSurface: () => {
        syncCount++;
      },
    });
    await handle.waitForIdle();
    expect(syncCount).toBe(1);

    component.trigger("rename", ".defold-types/defold-1.12.4/index.d.ts");
    component.trigger("rename", "build/default/copy.script");
    component.trigger("rename", "node_modules/dep/example.script");
    await handle.waitForIdle();
    expect(syncCount).toBe(1);

    handle.stop();
    await handle.done;
  });

  test("backslash skip-segment component events do not re-sync; a backslash real component does", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr } = captureStreams();
    const main = makeFactory();
    const component = makeFactory();
    let syncCount = 0;

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      debounceMs: 5,
      watcherFactory: main.factory,
      componentWatcherFactory: component.factory,
      syncSurface: () => {
        syncCount++;
      },
    });
    await handle.waitForIdle();
    expect(syncCount).toBe(1);

    component.trigger("rename", "node_modules\\dep\\example.script");
    component.trigger("rename", "build\\default\\copy.script");
    component.trigger("rename", ".defold-types\\defold-1.12.4\\index.d.ts");
    await handle.waitForIdle();
    expect(syncCount).toBe(1);

    component.trigger("rename", "ui\\hud.gui_script");
    await handle.waitForIdle();
    expect(syncCount).toBe(2);

    handle.stop();
    await handle.done;
  });

  test("json mode emits a start line then a build NDJSON line at startup and no human line", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, out } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, json: true, watcherFactory: factory.factory });
    await handle.waitForIdle();

    const lines = out().trimEnd().split("\n");
    expect(lines.length).toBe(2);
    const start = JSON.parse(lines[0] as string) as Record<string, unknown>;
    expect(start).toEqual({ command: "watch", event: "start", ok: true, written: [] });
    const build = JSON.parse(lines[1] as string) as Record<string, unknown>;
    expect(build.command).toBe("watch");
    expect(build.event).toBe("build");
    expect(build.ok).toBe(true);
    expect(out()).not.toMatch(/wrote \d+ files/);

    handle.stop();
    await handle.done;
  });

  test("json mode calls to stop() append a stop NDJSON line as the last line and resolve done with 0", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, out } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, json: true, watcherFactory: factory.factory });
    await handle.waitForIdle();

    handle.stop();
    const code = await handle.done;
    expect(code).toBe(0);

    const lines = out().trimEnd().split("\n");
    expect(lines.length).toBe(3);
    const stop = JSON.parse(lines[lines.length - 1] as string) as Record<string, unknown>;
    expect(stop).toEqual({ command: "watch", event: "stop", ok: true, written: [] });
  });

  test("without json, startup and stop() produce no extra lines beyond the human formatBuildLine output", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, out } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, watcherFactory: factory.factory });
    await handle.waitForIdle();

    expect(out()).toMatch(/wrote 1 files/);
    const beforeStop = out();

    handle.stop();
    await handle.done;

    expect(out()).toBe(beforeStop);
    expect(out()).not.toContain('"event"');
  });

  test("json mode emits a rebuild event carrying changed and removed src keys", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    writeProjectFile("src/gone.ts", "export const b = 2;\n");
    const { stdout, stderr, out } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, json: true, watcherFactory: factory.factory });
    await handle.waitForIdle();

    writeProjectFile("src/main.ts", scriptSource(2));
    rmSync(path.join(cwd, "src/gone.ts"));
    factory.trigger("change", "src/main.ts");
    factory.trigger("rename", "src/gone.ts");
    await handle.waitForIdle();

    const lines = out().trimEnd().split("\n");
    const rebuild = JSON.parse(lines[lines.length - 1] as string) as Record<string, unknown>;
    expect(rebuild.event).toBe("rebuild");
    expect(rebuild.ok).toBe(true);
    expect(rebuild.changed).toContain("src/main.ts");
    expect(rebuild.removed).toContain("src/gone.ts");

    handle.stop();
    await handle.done;
  });

  test("json mode writes a failing rebuild as an ok:false line to stdout, nothing to stderr", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, out, err } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, json: true, watcherFactory: factory.factory });
    await handle.waitForIdle();

    writeProjectFile("src/main.ts", 'const x: number = "oops";\n');
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    const lines = out().trimEnd().split("\n");
    const last = JSON.parse(lines[lines.length - 1] as string) as Record<string, unknown>;
    expect(last.event).toBe("rebuild");
    expect(last.ok).toBe(false);
    expect(typeof last.error).toBe("string");
    expect(err()).toBe("");

    handle.stop();
    await handle.done;
  });

  test("without json, startup and rebuild keep the human formatBuildLine output", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, out } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, watcherFactory: factory.factory });
    await handle.waitForIdle();

    writeProjectFile("src/main.ts", scriptSource(2));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    expect(countMatches(out(), /wrote 1 files/g)).toBe(2);
    expect(out()).not.toContain('"event"');

    handle.stop();
    await handle.done;
  });

  test("a non-src include layout watches cwd and writes the configured source's component", async () => {
    const tsconfig = JSON.stringify({ include: ["scripts/**/*.ts"] }, null, 2);
    writeProjectFile("tsconfig.json", tsconfig);
    writeProjectFile("scripts/main.ts", scriptSource(1));
    const { stdout, stderr } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, watcherFactory: factory.factory });
    await handle.waitForIdle();

    expect(factory.observedRoot).toBe(cwd);
    expect(readFileSync(path.join(cwd, "scripts/main.ts.script"), "utf8").length).toBeGreaterThan(
      0,
    );

    handle.stop();
    await handle.done;
  });

  test("a change under a non-src include rebuilds with the unprefixed project-relative key", async () => {
    const tsconfig = JSON.stringify({ include: ["scripts/**/*.ts"] }, null, 2);
    writeProjectFile("tsconfig.json", tsconfig);
    writeProjectFile("scripts/main.ts", scriptSource(1));
    const { stdout, stderr, out } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, json: true, watcherFactory: factory.factory });
    await handle.waitForIdle();

    writeProjectFile("scripts/main.ts", scriptSource(2));
    factory.trigger("change", "scripts/main.ts");
    await handle.waitForIdle();

    const lines = out().trimEnd().split("\n");
    const rebuild = JSON.parse(lines[lines.length - 1] as string) as Record<string, unknown>;
    expect(rebuild.event).toBe("rebuild");
    expect(rebuild.changed).toContain("scripts/main.ts");
    expect(readFileSync(path.join(cwd, "scripts/main.ts.script"), "utf8")).toContain("2");

    handle.stop();
    await handle.done;
  });

  test("events outside the include patterns enqueue no rebuild", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, out } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, watcherFactory: factory.factory });
    await handle.waitForIdle();
    expect(countMatches(out(), /wrote 1 files/g)).toBe(1);

    factory.trigger("change", "node_modules/foo/index.ts");
    factory.trigger("change", "test/main.test.ts");
    await handle.waitForIdle();

    expect(countMatches(out(), /wrote 1 files/g)).toBe(1);

    handle.stop();
    await handle.done;
  });
});

describe("runWatch resolve surface", () => {
  test("a game.project change invokes resolveSurface exactly once after the debounce window", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr } = captureStreams();
    const factory = makeFactory();
    let resolveCalls = 0;

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      debounceMs: 5,
      resolveSurface: () => {
        resolveCalls++;
      },
    });
    await handle.waitForIdle();
    expect(resolveCalls).toBe(0);

    factory.trigger("change", "game.project");
    await new Promise((r) => setTimeout(r, 20));
    expect(resolveCalls).toBe(1);

    handle.stop();
    await handle.done;
  });

  test("two game.project events inside one debounce window coalesce to a single resolveSurface call", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr } = captureStreams();
    const factory = makeFactory();
    let resolveCalls = 0;

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      debounceMs: 30,
      resolveSurface: () => {
        resolveCalls++;
      },
    });
    await handle.waitForIdle();

    factory.trigger("change", "game.project");
    factory.trigger("change", "game.project");
    await new Promise((r) => setTimeout(r, 60));
    expect(resolveCalls).toBe(1);

    handle.stop();
    await handle.done;
  });

  test("a non-game.project, non-transpiler path invokes neither resolveSurface nor a rebuild", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, out } = captureStreams();
    const factory = makeFactory();
    let resolveCalls = 0;

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      debounceMs: 5,
      resolveSurface: () => {
        resolveCalls++;
      },
    });
    await handle.waitForIdle();
    expect(countMatches(out(), /wrote 1 files/g)).toBe(1);

    factory.trigger("change", "README.md");
    await new Promise((r) => setTimeout(r, 20));
    expect(resolveCalls).toBe(0);
    expect(countMatches(out(), /wrote 1 files/g)).toBe(1);

    handle.stop();
    await handle.done;
  });

  test("a game.project event does not trigger a transpiler rebuild", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, out } = captureStreams();
    const factory = makeFactory();
    let resolveCalls = 0;

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      debounceMs: 5,
      resolveSurface: () => {
        resolveCalls++;
      },
    });
    await handle.waitForIdle();
    expect(countMatches(out(), /wrote 1 files/g)).toBe(1);

    factory.trigger("change", "game.project");
    await new Promise((r) => setTimeout(r, 20));
    expect(resolveCalls).toBe(1);
    expect(countMatches(out(), /wrote 1 files/g)).toBe(1);

    handle.stop();
    await handle.done;
  });

  test("json mode writes one resolve NDJSON line after the re-resolve settles", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, out } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      json: true,
      watcherFactory: factory.factory,
      debounceMs: 5,
      resolveSurface: () => {},
    });
    await handle.waitForIdle();

    const before = out();
    factory.trigger("change", "game.project");
    await new Promise((r) => setTimeout(r, 20));
    await handle.waitForIdle();

    const newLines = out().slice(before.length).trimEnd().split("\n");
    const last = JSON.parse(newLines[newLines.length - 1] as string) as Record<string, unknown>;
    expect(last).toEqual({ command: "watch", event: "resolve", ok: true, written: [] });

    handle.stop();
    await handle.done;
  });

  test("stop() before the debounce fires cancels the pending re-resolve", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr } = captureStreams();
    const factory = makeFactory();
    let resolveCalls = 0;

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      debounceMs: 50,
      resolveSurface: () => {
        resolveCalls++;
      },
    });
    await handle.waitForIdle();

    factory.trigger("change", "game.project");
    handle.stop();
    await handle.done;
    await new Promise((r) => setTimeout(r, 80));
    expect(resolveCalls).toBe(0);
  });

  test("waitForIdle() resolves only after an async resolveSurface settles", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr } = captureStreams();
    const factory = makeFactory();
    let release: (() => void) | undefined;
    const pending = new Promise<void>((r) => {
      release = r;
    });

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      debounceMs: 5,
      resolveSurface: () => pending,
    });
    await handle.waitForIdle();

    factory.trigger("change", "game.project");
    await new Promise((r) => setTimeout(r, 20));

    let settled = false;
    const idleProbe = handle.waitForIdle().then(() => {
      settled = true;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(settled).toBe(false);

    release?.();
    await idleProbe;
    expect(settled).toBe(true);

    handle.stop();
    await handle.done;
  });
});
