import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Writable } from "node:stream";
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
  readonly observedSrcDir: string | null;
  trigger(kind: "change" | "rename", relPath: string): void;
}

function makeFactory(): ControllableFactory {
  let onEvent: ((e: WatchEvent) => void) | null = null;
  const state = { opened: false, closed: false, observedSrcDir: null as string | null };
  const factory: WatcherFactory = (srcDir, cb): Watcher => {
    state.opened = true;
    state.observedSrcDir = srcDir;
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
    get observedSrcDir() {
      return state.observedSrcDir;
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

describe("runWatch", () => {
  test("initial build runs once and writes Lua", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", "export const a = 1;\n");
    const { stdout, stderr, out } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, watcherFactory: factory.factory });
    await handle.waitForIdle();

    expect(readFileSync(path.join(cwd, "src/main.lua"), "utf8").length).toBeGreaterThan(0);
    expect(out()).toMatch(/wrote 1 files/);
    expect(factory.opened).toBe(true);

    handle.stop();
    const code = await handle.done;
    expect(code).toBe(0);
  });

  test("single FS event triggers exactly one rebuild", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", "export const a = 1;\n");
    const { stdout, stderr, out } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, watcherFactory: factory.factory });
    await handle.waitForIdle();

    writeProjectFile("src/main.ts", "export const a = 2;\n");
    factory.trigger("change", "main.ts");
    await handle.waitForIdle();

    expect(countMatches(out(), /wrote 1 files/g)).toBe(2);

    handle.stop();
    await handle.done;
  });

  test("generated .lua/.lua.map events trigger no rebuild and print no failure", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", "export const a = 1;\n");
    const { stdout, stderr, out, err } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, watcherFactory: factory.factory });
    await handle.waitForIdle();

    expect(countMatches(out(), /wrote 1 files/g)).toBe(1);

    factory.trigger("rename", "main.lua");
    factory.trigger("change", "main.lua");
    factory.trigger("rename", "main.lua.map");
    factory.trigger("change", "main.lua.map");
    await handle.waitForIdle();

    expect(countMatches(out(), /wrote 1 files/g)).toBe(1);
    expect(err()).toBe("");
    expect(err()).not.toContain("unsupported extension");

    handle.stop();
    await handle.done;
  });

  test("burst of events within debounce window coalesces to one rebuild", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", "export const a = 1;\n");
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

    for (let i = 0; i < 5; i++) factory.trigger("change", "main.ts");
    await handle.waitForIdle();

    expect(countMatches(out(), /wrote 1 files/g)).toBe(2);

    handle.stop();
    await handle.done;
  });

  test("build error mid-session is logged and watcher stays alive; recovers on next event", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", "export const a = 1;\n");
    const { stdout, stderr, out, err } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, watcherFactory: factory.factory });
    await handle.waitForIdle();

    writeProjectFile("src/main.ts", 'const x: number = "oops";\n');
    factory.trigger("change", "main.ts");
    await handle.waitForIdle();

    expect(err()).toContain("src/main.ts");
    const settled = await Promise.race([
      handle.done.then(() => "resolved" as const).catch(() => "rejected" as const),
      new Promise<"pending">((r) => setTimeout(() => r("pending"), 10)),
    ]);
    expect(settled).toBe("pending");

    writeProjectFile("src/main.ts", "export const a = 3;\n");
    factory.trigger("change", "main.ts");
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
    writeProjectFile("src/main.ts", "export const a = 1;\n");
    const { stdout, stderr } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, watcherFactory: factory.factory });
    await handle.waitForIdle();

    // A sibling appears on disk after the initial build but never fires an event.
    writeProjectFile("src/other.ts", "export const b = 2;\n");
    writeProjectFile("src/main.ts", "export const a = 2;\n");
    factory.trigger("change", "main.ts");
    await handle.waitForIdle();

    expect(readFileSync(path.join(cwd, "src/main.lua"), "utf8")).toContain("2");
    expect(existsSync(path.join(cwd, "src/other.lua"))).toBe(false);

    handle.stop();
    await handle.done;
  });

  test("stop() closes the watcher and resolves done with 0", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", "export const a = 1;\n");
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
    writeProjectFile("src/main.ts", "export const a = 1;\n");
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
    writeProjectFile("src/main.ts", "export const a = 1;\n");
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
    expect(component.observedSrcDir).toBe(cwd);
    expect(main.observedSrcDir).toBe(path.join(cwd, "src"));

    handle.stop();
    await handle.done;
    expect(component.closed).toBe(true);
  });

  test("a component-file rename re-syncs the surface; a src change does not", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", "export const a = 1;\n");
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

    writeProjectFile("src/main.ts", "export const a = 2;\n");
    main.trigger("change", "main.ts");
    await handle.waitForIdle();
    expect(syncCount).toBe(2);

    handle.stop();
    await handle.done;
  });

  test("component watcher ignores .defold-types, build, and node_modules events", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", "export const a = 1;\n");
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
    writeProjectFile("src/main.ts", "export const a = 1;\n");
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
});
