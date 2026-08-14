import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Writable } from "node:stream";
import { GENERATED_BANNER } from "./build-output";
import {
  EDITOR_API_TITLE,
  EDITOR_PORT_FILE,
  type EditorTransport,
  type ReloadOutcome,
} from "./editor-attach";
import type {
  EditorReloadCommand as PublicEditorReloadCommand,
  RunWatchOptions as PublicRunWatchOptions,
  WatchEditorClient as PublicWatchEditorClient,
} from "./index";
import {
  createWatchEditorClient,
  type EditorReloadCommand,
  runWatch,
  type WatchEditorClient,
  type WatchEvent,
  type Watcher,
  type WatcherFactory,
} from "./watch";

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

// Editor attach/detach is a status channel that now reports on every watch,
// including one with no editor. Strip it so an assertion aimed at build failures
// still fails on any real failure line.
const EDITOR_STATUS = /^defold-typescript watch: (attached to Defold editor|no Defold editor)/;

function failureOutput(stderrText: string): string {
  return stderrText
    .split("\n")
    .filter((line) => line !== "" && !EDITOR_STATUS.test(line))
    .join("\n");
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
    expect(failureOutput(err())).toBe("");
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

  test("initial build compile error keeps the watcher open, reports each located error, and recovers", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/a.ts", 'const x: number = "oops";\n');
    writeProjectFile("src/b.ts", 'const y: number = "nope";\n');
    const { stdout, stderr, out, err } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, watcherFactory: factory.factory });
    await handle.waitForIdle();

    expect(factory.opened).toBe(true);
    expect(err()).toMatch(/ {2}src\/a\.ts:\d+:\d+: /);
    expect(err()).toMatch(/ {2}src\/b\.ts:\d+:\d+: /);
    expect(countMatches(err(), /^ {2}\S.*?:\d+:\d+: /gm)).toBe(2);

    const settled = await Promise.race([
      handle.done.then(() => "resolved" as const).catch(() => "rejected" as const),
      new Promise<"pending">((r) => setTimeout(() => r("pending"), 10)),
    ]);
    expect(settled).toBe("pending");

    writeProjectFile("src/a.ts", scriptSource(1));
    writeProjectFile("src/b.ts", scriptSource(2));
    factory.trigger("change", "src/a.ts");
    factory.trigger("change", "src/b.ts");
    await handle.waitForIdle();

    expect(out()).toMatch(/wrote \d+ files/);

    handle.stop();
    const code = await handle.done;
    expect(code).toBe(0);
  });

  test("non-json mode frames each build cycle with begin and end sentinel lines", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, out } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, watcherFactory: factory.factory });
    await handle.waitForIdle();

    const initial = out();
    const beginIdx = initial.indexOf("defold-typescript watch: build started");
    const wroteIdx = initial.indexOf("wrote 1 files");
    const endIdx = initial.indexOf("defold-typescript watch: build finished");
    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(beginIdx).toBeLessThan(wroteIdx);
    expect(wroteIdx).toBeLessThan(endIdx);

    writeProjectFile("src/main.ts", scriptSource(2));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    expect(countMatches(out(), /defold-typescript watch: build started/g)).toBe(2);
    expect(countMatches(out(), /defold-typescript watch: build finished/g)).toBe(2);

    handle.stop();
    await handle.done;
  });

  test("json mode emits the initial-build compile error as a structured build event with a per-diagnostic list", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/a.ts", 'const x: number = "oops";\n');
    writeProjectFile("src/b.ts", 'const y: number = "nope";\n');
    const { stdout, stderr, out, err } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({ cwd, stdout, stderr, json: true, watcherFactory: factory.factory });
    await handle.waitForIdle();

    expect(factory.opened).toBe(true);
    const lines = out().trimEnd().split("\n");
    const build = JSON.parse(lines[lines.length - 1] as string) as Record<string, unknown>;
    expect(build.event).toBe("build");
    expect(build.ok).toBe(false);
    expect(Array.isArray(build.errors)).toBe(true);
    const errors = build.errors as Array<Record<string, unknown>>;
    expect(errors.length).toBe(2);
    expect(typeof errors[0]?.file).toBe("string");
    expect(typeof errors[0]?.message).toBe("string");
    expect(err()).toBe("");

    handle.stop();
    await handle.done;
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

const EDITOR_SCRIPT_SOURCE = [
  'import { defineEditorScript } from "@defold-typescript/types";',
  "export default defineEditorScript({",
  '  get_commands: () => [{ label: "Say Hi", locations: ["Edit"], run: () => print("hi") }],',
  "});",
  "",
].join("\n");

function moduleSource(value: number): string {
  return `export const answer = ${value};\n`;
}

/**
 * A hand-driven console stream. `settled()` resolves once every pushed item has
 * been pulled *and* the consumer has parked again, which is what makes an
 * assertion on surfaced output deterministic without a sleep.
 */
interface FakeConsole {
  readonly items: AsyncIterable<string>;
  push(...items: string[]): void;
  end(): void;
  settled(): Promise<void>;
  /** Resolves once the consumer's loop has actually left the iterator. */
  closed(): Promise<void>;
  /** Whether the signal production handed this stream has been aborted. */
  isAborted(): boolean;
}

function makeConsole(seed: readonly string[] = [], signal?: AbortSignal): FakeConsole {
  const queue: string[] = [...seed];
  let wake: (() => void) | null = null;
  let onPark: (() => void) | null = null;
  let ended = false;
  let parked = false;
  let markFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    markFinished = resolve;
  });

  async function* iterate(): AsyncGenerator<string> {
    try {
      for (;;) {
        while (queue.length > 0) yield queue.shift() as string;
        if (ended) return;
        parked = true;
        const announce = onPark;
        onPark = null;
        announce?.();
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    } finally {
      markFinished();
    }
  }

  // Clearing `parked` here rather than after the await keeps `settled()` from
  // observing a stale park from before the push it is meant to wait on.
  const resume = (): void => {
    parked = false;
    const pending = wake;
    wake = null;
    pending?.();
  };

  // A real `/console/stream` ends only when its request is cancelled, so the
  // fake unparks on the signal alone: dropping the abort wiring leaves this
  // stream parked forever, exactly as it would in production.
  signal?.addEventListener("abort", () => {
    ended = true;
    resume();
  });

  return {
    items: { [Symbol.asyncIterator]: iterate },
    push(...items) {
      queue.push(...items);
      resume();
    },
    end() {
      ended = true;
      resume();
    },
    settled() {
      if (ended) return finished;
      if (parked) return Promise.resolve();
      return new Promise<void>((resolve) => {
        onPark = resolve;
      });
    },
    closed: () => finished,
    isAborted: () => signal?.aborted === true,
  };
}

interface FakeEditor {
  readonly client: WatchEditorClient;
  readonly posts: EditorReloadCommand[];
  readonly consoles: FakeConsole[];
  resolveCount(): number;
  setBaseUrl(url: string | null): void;
  setOutcome(outcome: ReloadOutcome): void;
  /** Suspend every post opened from now until the returned release is called. */
  hold(): () => void;
  /** Suspend every resolve started from now until the returned release is called. */
  holdResolve(): () => void;
  /** The signal production passed to the most recent resolve, if any. */
  lastResolveSignal(): AbortSignal | undefined;
}

function makeEditor(baseUrl: string | null = "http://localhost:4242"): FakeEditor {
  const posts: EditorReloadCommand[] = [];
  const consoles: FakeConsole[] = [];
  const state = {
    resolves: 0,
    url: baseUrl,
    outcome: "accepted" as ReloadOutcome,
    resolveSignal: undefined as AbortSignal | undefined,
  };
  let gate: Promise<void> | null = null;
  let resolveGate: Promise<void> | null = null;
  const client: WatchEditorClient = {
    async resolve(_cwd, signal) {
      state.resolves += 1;
      state.resolveSignal = signal;
      const open = resolveGate;
      if (open) await open;
      return state.url === null ? null : { baseUrl: state.url };
    },
    async postCommand(_cwd, name) {
      posts.push(name);
      const open = gate;
      if (open) await open;
      return state.outcome;
    },
    openConsole(_endpoint, signal) {
      const stream = makeConsole([], signal);
      consoles.push(stream);
      return Promise.resolve(stream.items);
    },
  };
  return {
    client,
    posts,
    consoles,
    resolveCount: () => state.resolves,
    setBaseUrl(url) {
      state.url = url;
    },
    setOutcome(outcome) {
      state.outcome = outcome;
    },
    hold() {
      let release!: () => void;
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        gate = null;
        release();
      };
    },
    holdResolve() {
      let release!: () => void;
      resolveGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        resolveGate = null;
        release();
      };
    },
    lastResolveSignal: () => state.resolveSignal,
  };
}

describe("runWatch hot reload", () => {
  test("a rebuild that emits files posts exactly one hot reload", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor();

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      hotReload: true,
      editorClient: editor.client,
    });
    await handle.waitForIdle();
    const afterStartup = editor.posts.length;

    writeProjectFile("src/main.ts", scriptSource(2));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    expect(editor.posts.length - afterStartup).toBe(1);
    expect(editor.posts[editor.posts.length - 1]).toBe("hot-reload");

    handle.stop();
    await handle.done;
  });

  test("a rebuild whose build fails posts no reload", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor();

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      hotReload: true,
      editorClient: editor.client,
    });
    await handle.waitForIdle();
    const afterStartup = editor.posts.length;

    writeProjectFile("src/main.ts", 'const x: number = "oops";\n');
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    expect(editor.posts.length).toBe(afterStartup);

    handle.stop();
    await handle.done;
  });

  test("a rebuild that succeeds but writes no files posts no reload", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    writeProjectFile("src/helper.ts", moduleSource(1));
    const { stdout, stderr, err } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor();

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      hotReload: true,
      editorClient: editor.client,
    });
    await handle.waitForIdle();
    const afterStartup = editor.posts.length;

    rmSync(path.join(cwd, "src/helper.ts"));
    factory.trigger("rename", "src/helper.ts");
    await handle.waitForIdle();

    expect(failureOutput(err())).toBe("");
    expect(editor.posts.length).toBe(afterStartup);

    handle.stop();
    await handle.done;
  });

  test("without hotReload the editor is still read, but nothing is ever posted to it", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor();

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    writeProjectFile("src/main.ts", scriptSource(2));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    expect(editor.posts.length).toBe(0);
    expect(editor.resolveCount()).toBeGreaterThan(0);

    handle.stop();
    await handle.done;
  });

  test("an editor-script-only emit posts reload-extensions, a runtime emit posts hot-reload, a mixed emit posts both", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    writeProjectFile("src/tools.ts", EDITOR_SCRIPT_SOURCE);
    const { stdout, stderr } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor();

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      hotReload: true,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    editor.posts.length = 0;
    writeProjectFile("src/tools.ts", EDITOR_SCRIPT_SOURCE.replace("Say Hi", "Say Hello"));
    factory.trigger("change", "src/tools.ts");
    await handle.waitForIdle();
    expect([...editor.posts]).toEqual(["reload-extensions"]);

    editor.posts.length = 0;
    writeProjectFile("src/main.ts", scriptSource(3));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();
    expect([...editor.posts]).toEqual(["hot-reload"]);

    editor.posts.length = 0;
    writeProjectFile("src/main.ts", scriptSource(4));
    writeProjectFile("src/tools.ts", EDITOR_SCRIPT_SOURCE.replace("Say Hi", "Say Howdy"));
    factory.trigger("change", "src/main.ts");
    factory.trigger("change", "src/tools.ts");
    await handle.waitForIdle();
    expect([...editor.posts].sort()).toEqual(["hot-reload", "reload-extensions"]);

    handle.stop();
    await handle.done;
  });

  test("a skipped reload outcome writes nothing to stdout or stderr", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, out, err } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor();
    editor.setOutcome("skipped");

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      hotReload: true,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    const beforeReload = out();
    writeProjectFile("src/main.ts", scriptSource(2));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    expect(editor.posts.length).toBeGreaterThan(0);
    expect(out().slice(beforeReload.length)).not.toMatch(/skipped|reload/i);
    // The attach transition is reported once; the 403 itself stays silent.
    expect(err()).not.toMatch(/skip|error|fail/i);

    handle.stop();
    await handle.done;
  });
});

async function until(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("runWatch hot reload coalescing and diagnostics", () => {
  test("rebuilds landing during an in-flight reload collapse into exactly one trailing reload", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, out } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor();

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      hotReload: true,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    const release = editor.hold();

    writeProjectFile("src/main.ts", scriptSource(2));
    factory.trigger("change", "src/main.ts");
    await until(() => editor.posts.length === 1);

    writeProjectFile("src/main.ts", scriptSource(3));
    factory.trigger("change", "src/main.ts");
    await until(() => countMatches(out(), /wrote 1 files/g) === 3);

    writeProjectFile("src/main.ts", scriptSource(4));
    factory.trigger("change", "src/main.ts");
    await until(() => countMatches(out(), /wrote 1 files/g) === 4);

    expect(editor.posts.length).toBe(1);

    release();
    await handle.waitForIdle();

    expect(editor.posts.length).toBe(2);

    handle.stop();
    await handle.done;
  });

  test("the attached-editor diagnostic naming the port is printed once, not once per rebuild", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, err } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor("http://localhost:4242");

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      hotReload: true,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    for (const value of [2, 3, 4]) {
      writeProjectFile("src/main.ts", scriptSource(value));
      factory.trigger("change", "src/main.ts");
      await handle.waitForIdle();
    }

    expect(err()).toContain("http://localhost:4242");
    expect(countMatches(err(), /http:\/\/localhost:4242/g)).toBe(1);

    handle.stop();
    await handle.done;
  });

  test("the no-editor notice is printed at most once across many rebuilds", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, err } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor(null);

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      hotReload: true,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    for (const value of [2, 3, 4]) {
      writeProjectFile("src/main.ts", scriptSource(value));
      factory.trigger("change", "src/main.ts");
      await handle.waitForIdle();
    }

    expect(countMatches(err(), /no Defold editor/g)).toBe(1);

    handle.stop();
    await handle.done;
  });

  test("an editor that appears after the watch started attaches on the next rebuild", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, err } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor(null);

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      hotReload: true,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    writeProjectFile("src/main.ts", scriptSource(2));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();
    expect(editor.posts.length).toBe(0);
    expect(err()).not.toContain("http://localhost:7777");

    editor.setBaseUrl("http://localhost:7777");
    writeProjectFile("src/main.ts", scriptSource(3));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    expect(editor.posts).toEqual(["hot-reload"]);
    expect(err()).toContain("http://localhost:7777");

    handle.stop();
    await handle.done;
  });

  test("json mode emits a reload event per outcome and keeps the attach diagnostics out of the stream", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, out, err } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor();

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      json: true,
      watcherFactory: factory.factory,
      hotReload: true,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    const readReloadEvents = (): Array<Record<string, unknown>> =>
      out()
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .filter((event) => event.event === "reload");

    writeProjectFile("src/main.ts", scriptSource(2));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    expect(readReloadEvents()).toEqual([
      { command: "watch", event: "reload", ok: true, written: [] },
    ]);

    editor.setOutcome("skipped");
    writeProjectFile("src/main.ts", scriptSource(3));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();
    expect(readReloadEvents().length).toBe(1);

    editor.setBaseUrl(null);
    writeProjectFile("src/main.ts", scriptSource(4));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    const events = readReloadEvents();
    expect(events.length).toBe(2);
    const unavailable = events[1] as Record<string, unknown>;
    expect(unavailable.ok).toBe(false);
    expect(typeof unavailable.error).toBe("string");

    expect(err()).toBe("");

    handle.stop();
    await handle.done;
  });
});

describe("runWatch hot reload failure reporting", () => {
  test("a rebuild whose post is refused reports the endpoint and claims no new attachment", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, err } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor("http://localhost:4242");
    editor.setOutcome("unavailable");

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      hotReload: true,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    const beforeReload = err();
    writeProjectFile("src/main.ts", scriptSource(2));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    const afterReload = err().slice(beforeReload.length);
    expect(afterReload).toContain("http://localhost:4242");
    expect(afterReload).toMatch(/did not accept the reload/);
    expect(afterReload).not.toContain("attached to Defold editor");

    handle.stop();
    await handle.done;
  });

  test("a persistently refused reload writes its notice once, not once per rebuild", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, err } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor();
    editor.setOutcome("unavailable");

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      hotReload: true,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    for (const value of [2, 3, 4]) {
      writeProjectFile("src/main.ts", scriptSource(value));
      factory.trigger("change", "src/main.ts");
      await handle.waitForIdle();
    }

    expect(countMatches(err(), /did not accept the reload/g)).toBe(1);

    handle.stop();
    await handle.done;
  });

  test("a reload accepted after a refusal re-announces the attachment", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, err } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor("http://localhost:4242");
    editor.setOutcome("unavailable");

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      hotReload: true,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    writeProjectFile("src/main.ts", scriptSource(2));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    const beforeRecovery = err();
    editor.setOutcome("accepted");
    writeProjectFile("src/main.ts", scriptSource(3));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    expect(err().slice(beforeRecovery.length)).toContain(
      "attached to Defold editor at http://localhost:4242",
    );

    handle.stop();
    await handle.done;
  });

  test("a skipped reload is a success: one attach line and no refusal notice", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, err } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor();
    editor.setOutcome("skipped");

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      hotReload: true,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    for (const value of [2, 3]) {
      writeProjectFile("src/main.ts", scriptSource(value));
      factory.trigger("change", "src/main.ts");
      await handle.waitForIdle();
    }

    expect(countMatches(err(), /attached to Defold editor/g)).toBe(1);
    expect(err()).not.toMatch(/did not accept the reload/);

    handle.stop();
    await handle.done;
  });

  test("json mode reports a refused post as a reload event and writes nothing to stderr", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, out, err } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor();
    editor.setOutcome("unavailable");

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      json: true,
      watcherFactory: factory.factory,
      hotReload: true,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    writeProjectFile("src/main.ts", scriptSource(2));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    const reloads = out()
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((event) => event.event === "reload");
    expect(reloads.length).toBe(1);
    expect((reloads[0] as Record<string, unknown>).ok).toBe(false);
    expect(typeof (reloads[0] as Record<string, unknown>).error).toBe("string");
    expect(err()).toBe("");

    handle.stop();
    await handle.done;
  });

  test("a compile failure after a refused reload does not re-announce the attachment", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, err } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor("http://localhost:4242");
    editor.setOutcome("unavailable");

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      hotReload: true,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    writeProjectFile("src/main.ts", scriptSource(2));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    const beforeFailure = err();
    writeProjectFile("src/main.ts", 'const x: number = "oops";\n');
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    expect(err().slice(beforeFailure.length)).not.toContain("attached to Defold editor");

    handle.stop();
    await handle.done;
  });

  test("a rebuild that writes nothing after a refused reload does not re-announce the attachment", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    writeProjectFile("src/helper.ts", moduleSource(1));
    const { stdout, stderr, err } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor("http://localhost:4242");
    editor.setOutcome("unavailable");

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      hotReload: true,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    writeProjectFile("src/main.ts", scriptSource(2));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    const beforeEmptyEmit = err();
    rmSync(path.join(cwd, "src/helper.ts"));
    factory.trigger("rename", "src/helper.ts");
    await handle.waitForIdle();

    expect(err().slice(beforeEmptyEmit.length)).not.toContain("attached to Defold editor");

    handle.stop();
    await handle.done;
  });

  test("a post-less rebuild between two refusals does not repeat the refusal notice", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    writeProjectFile("src/helper.ts", moduleSource(1));
    const { stdout, stderr, err } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor("http://localhost:4242");
    editor.setOutcome("unavailable");

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      hotReload: true,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    writeProjectFile("src/main.ts", scriptSource(2));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    rmSync(path.join(cwd, "src/helper.ts"));
    factory.trigger("rename", "src/helper.ts");
    await handle.waitForIdle();

    writeProjectFile("src/main.ts", scriptSource(3));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    expect(countMatches(err(), /did not accept the reload/g)).toBe(1);

    handle.stop();
    await handle.done;
  });

  test("a reload accepted after a post-less rebuild still re-announces the attachment", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    writeProjectFile("src/helper.ts", moduleSource(1));
    const { stdout, stderr, err } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor("http://localhost:4242");
    editor.setOutcome("unavailable");

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      hotReload: true,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    writeProjectFile("src/main.ts", scriptSource(2));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    rmSync(path.join(cwd, "src/helper.ts"));
    factory.trigger("rename", "src/helper.ts");
    await handle.waitForIdle();

    const beforeRecovery = err();
    editor.setOutcome("accepted");
    writeProjectFile("src/main.ts", scriptSource(3));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    expect(err().slice(beforeRecovery.length)).toContain(
      "attached to Defold editor at http://localhost:4242",
    );

    handle.stop();
    await handle.done;
  });

  test("an editor that quits and returns after a refusal is announced as a new session", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    writeProjectFile("src/helper.ts", moduleSource(1));
    const { stdout, stderr, err } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor("http://localhost:4242");
    editor.setOutcome("unavailable");

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      hotReload: true,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    writeProjectFile("src/main.ts", scriptSource(2));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    editor.setBaseUrl(null);
    writeProjectFile("src/main.ts", scriptSource(3));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    const beforeReturn = err();
    editor.setBaseUrl("http://localhost:4242");
    rmSync(path.join(cwd, "src/helper.ts"));
    factory.trigger("rename", "src/helper.ts");
    await handle.waitForIdle();

    expect(err().slice(beforeReturn.length)).toContain(
      "attached to Defold editor at http://localhost:4242",
    );

    handle.stop();
    await handle.done;
  });
});

function makeEditorTransport(historyLines: number, stream: FakeConsole): EditorTransport {
  const ok = (text: string): Promise<{ status: number; text(): Promise<string> }> =>
    Promise.resolve({ status: 200, text: () => Promise.resolve(text) });
  return (url) => {
    if (url.endsWith("/openapi.json"))
      return ok(JSON.stringify({ info: { title: EDITOR_API_TITLE } }));
    if (url.endsWith("/console/stream")) {
      return Promise.resolve({
        status: 200,
        text: () => Promise.resolve(""),
        body: stream.items,
      });
    }
    if (url.endsWith("/console")) {
      return ok(JSON.stringify({ lines: Array.from({ length: historyLines }, (_, i) => `${i}`) }));
    }
    return Promise.resolve({ status: 404, text: () => Promise.resolve("") });
  };
}

describe("runWatch console surfacing", () => {
  test("ERROR and WARNING console lines reach the terminal and ordinary frame logging does not", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, err } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor();

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    const stream = editor.consoles[0] as FakeConsole;
    stream.push(
      "INFO:ENGINE: Defold Engine 1.9.8",
      "DEBUG:SCRIPT: player position updated",
      "ERROR:SCRIPT: main/main.script:5: attempt to index a nil value",
      "WARNING:SCRIPT: main/main.script:7: a deprecated call",
      "INFO:RESOURCE: main/main.luac successfully reloaded",
    );
    await stream.settled();

    expect(err()).toContain(
      "defold-typescript watch: editor: ERROR:SCRIPT: main/main.script:5: attempt to index a nil value",
    );
    expect(err()).toContain(
      "defold-typescript watch: editor: WARNING:SCRIPT: main/main.script:7: a deprecated call",
    );
    expect(err()).not.toContain("Defold Engine 1.9.8");
    expect(err()).not.toContain("player position updated");
    expect(err()).not.toContain("successfully reloaded");

    handle.stop();
    await handle.done;
  });

  test("a traceback following an error header is surfaced with it", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, err } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor();

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    const stream = editor.consoles[0] as FakeConsole;
    stream.push(
      "ERROR:SCRIPT: main/main.script:5: attempt to call a nil value",
      "stack traceback:",
      "\tmain/main.script:5: in function <main/main.script:4>",
      "INFO:ENGINE: the next frame is not part of the error",
    );
    await stream.settled();

    expect(err()).toContain("stack traceback:");
    expect(err()).toContain("in function <main/main.script:4>");
    expect(err()).not.toContain("the next frame is not part of the error");

    handle.stop();
    await handle.done;
  });

  test("attaching to an editor whose console already holds errors replays none of them", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    writeProjectFile(EDITOR_PORT_FILE, "4242\n");
    const history = [
      "ERROR:SCRIPT: main/old.script:1: an error from before this watch started",
      "INFO:ENGINE: an old info line",
    ];
    const stream = makeConsole(history.map((line) => `${line}\n`));
    const { stdout, stderr, err } = captureStreams();
    const factory = makeFactory();

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      editorClient: createWatchEditorClient(makeEditorTransport(history.length, stream)),
    });
    await handle.waitForIdle();
    await stream.settled();

    expect(err()).not.toContain("an error from before this watch started");

    stream.push("ERROR:SCRIPT: main/main.script:9: a live error arrived after attach\n");
    await stream.settled();

    expect(err()).toContain("a live error arrived after attach");

    handle.stop();
    await handle.done;
  });

  test("the editor quitting mid-watch ends surfacing without failing the watch, and a later editor re-attaches", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, err } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor();

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    const first = editor.consoles[0] as FakeConsole;
    first.end();
    await first.settled();

    writeProjectFile("src/main.ts", scriptSource(2));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    expect(editor.consoles.length).toBe(2);
    const second = editor.consoles[1] as FakeConsole;
    second.push("ERROR:SCRIPT: main/main.script:2: surfaced after re-attach");
    await second.settled();

    expect(err()).toContain("surfaced after re-attach");

    handle.stop();
    expect(await handle.done).toBe(0);
  });

  test("json mode keeps surfaced editor errors out of the event stream", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, out, err } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor();

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      json: true,
      watcherFactory: factory.factory,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    const stream = editor.consoles[0] as FakeConsole;
    stream.push("ERROR:SCRIPT: main/main.script:5: runtime boom");
    await stream.settled();

    writeProjectFile("src/main.ts", scriptSource(2));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();
    stream.push("ERROR:SCRIPT: main/main.script:6: runtime boom again");
    await stream.settled();

    for (const line of out().trimEnd().split("\n")) {
      expect(() => JSON.parse(line) as unknown).not.toThrow();
    }
    expect(out()).not.toContain("runtime boom");
    expect(err()).toContain("runtime boom");

    handle.stop();
    await handle.done;
  });
});

describe("runWatch stop lifecycle", () => {
  test("stopping a watch releases an idle console stream instead of parking on it", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor();

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    const stream = editor.consoles[0] as FakeConsole;
    await stream.settled();

    handle.stop();
    expect(await handle.done).toBe(0);

    await stream.closed();
    expect(stream.isAborted()).toBe(true);
  });

  test("stopping while discovery is in flight announces no attachment and opens no stream", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, err } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor();
    const release = editor.holdResolve();

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      editorClient: editor.client,
    });

    handle.stop();
    release();
    expect(await handle.done).toBe(0);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(editor.resolveCount()).toBe(1);
    expect(err()).not.toContain("attached to Defold editor");
    expect(editor.consoles.length).toBe(0);
  });

  test("a console line already queued when the stop lands is never written", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, err } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor();

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    const stream = editor.consoles[0] as FakeConsole;
    await stream.settled();

    // Queued and then stopped in the same synchronous turn: the drain wakes with
    // a real line to write and `stopped` already true, which is the race the
    // post-stop guard exists for.
    stream.push("ERROR:SCRIPT: main/main.script:1: raced the stop");
    handle.stop();
    expect(await handle.done).toBe(0);
    await stream.closed();

    expect(err()).not.toContain("raced the stop");
  });

  test("stopping twice resolves once and emits a single stop event", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, out } = captureStreams();
    const factory = makeFactory();
    const editor = makeEditor();

    const handle = runWatch({
      cwd,
      stdout,
      stderr,
      json: true,
      watcherFactory: factory.factory,
      editorClient: editor.client,
    });
    await handle.waitForIdle();

    handle.stop();
    expect(await handle.done).toBe(0);
    handle.stop();
    expect(await handle.done).toBe(0);

    const stops = out()
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as { event?: string })
      .filter((event) => event.event === "stop");
    expect(stops.length).toBe(1);
  });
});

describe("runWatch console support is optional", () => {
  test("a client declaring only resolve and postCommand drives a hot-reloading watch", async () => {
    writeProjectFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeProjectFile("src/main.ts", scriptSource(1));
    const { stdout, stderr, err } = captureStreams();
    const factory = makeFactory();
    const posts: PublicEditorReloadCommand[] = [];

    // Declared against the exported type rather than inferred structurally, so
    // re-tightening `openConsole` back to required reds the type-check.
    const client: PublicWatchEditorClient = {
      resolve: () => Promise.resolve({ baseUrl: "http://localhost:4242" }),
      postCommand: (_cwd, name) => {
        posts.push(name);
        return Promise.resolve("accepted" as const);
      },
    };
    const opts: PublicRunWatchOptions = {
      cwd,
      stdout,
      stderr,
      watcherFactory: factory.factory,
      hotReload: true,
      editorClient: client,
    };

    const handle = runWatch(opts);
    await handle.waitForIdle();

    writeProjectFile("src/main.ts", scriptSource(2));
    factory.trigger("change", "src/main.ts");
    await handle.waitForIdle();

    expect(posts).toEqual(["hot-reload"]);
    expect(err()).toContain("attached to Defold editor at http://localhost:4242");
    expect(err()).not.toContain("defold-typescript watch: editor: ");

    handle.stop();
    expect(await handle.done).toBe(0);
  });
});
