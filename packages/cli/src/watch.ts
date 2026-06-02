import { existsSync, watch as fsWatch } from "node:fs";
import * as path from "node:path";
import { isTranspilerSource, toPosix } from "./build-output";
import { type BuildSession, createBuildSession } from "./build-session";
import { isComponentPath, isSkipped } from "./script-kind";

export interface WatchEvent {
  readonly kind: "change" | "rename";
  readonly path: string;
}

export interface Watcher {
  close(): void;
}

export type WatcherFactory = (srcDir: string, onEvent: (e: WatchEvent) => void) => Watcher;

export interface RunWatchOptions {
  readonly cwd: string;
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
  readonly debounceMs?: number;
  readonly watcherFactory?: WatcherFactory;
  readonly syncSurface?: () => void;
  readonly componentWatcherFactory?: WatcherFactory;
}

export interface RunWatchHandle {
  readonly stop: () => void;
  readonly done: Promise<number>;
  readonly waitForIdle: () => Promise<void>;
}

const DEFAULT_DEBOUNCE_MS = 50;

export const recursiveWatcherFactory: WatcherFactory = (srcDir, onEvent) => {
  const w = fsWatch(srcDir, { recursive: true }, (eventType, filename) => {
    onEvent({
      kind: eventType === "rename" ? "rename" : "change",
      path: filename ?? "",
    });
  });
  return { close: () => w.close() };
};

function formatBuildLine(written: readonly string[]): string {
  return `defold-typescript build: wrote ${written.length} files: ${written.join(", ")}\n`;
}

function rewrapInitError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  return new Error(message.replace(/^defold-typescript build:/, "defold-typescript watch:"));
}

export function runWatch(opts: RunWatchOptions): RunWatchHandle {
  const { cwd, stdout, stderr } = opts;
  const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const factory = opts.watcherFactory ?? recursiveWatcherFactory;

  let resolveDone!: (code: number) => void;
  let rejectDone!: (err: Error) => void;
  const done = new Promise<number>((res, rej) => {
    resolveDone = res;
    rejectDone = rej;
  });

  let session: BuildSession;
  try {
    opts.syncSurface?.();
    session = createBuildSession({ cwd });
    const { written } = session.buildAll();
    stdout.write(formatBuildLine(written));
  } catch (err) {
    rejectDone(rewrapInitError(err));
    return {
      stop: () => {},
      done,
      waitForIdle: () => Promise.resolve(),
    };
  }

  const srcDir = path.join(cwd, "src");

  let scheduled: ReturnType<typeof setTimeout> | null = null;
  let syncScheduled: ReturnType<typeof setTimeout> | null = null;
  let rebuildBusy = false;
  let syncBusy = false;
  let stopped = false;
  let idleResolvers: Array<() => void> = [];
  const pending = new Set<string>();

  function notifyIdle(): void {
    if (rebuildBusy || syncBusy) return;
    const resolvers = idleResolvers;
    idleResolvers = [];
    for (const resolve of resolvers) resolve();
  }

  function rebuild(): void {
    scheduled = null;
    const drained = [...pending];
    pending.clear();
    const changed: string[] = [];
    const removed: string[] = [];
    for (const rel of drained) {
      const key = `src/${toPosix(rel)}`;
      if (existsSync(path.join(srcDir, rel))) {
        changed.push(key);
      } else {
        removed.push(key);
      }
    }
    try {
      const { written } = session.applyEvents(changed, removed);
      stdout.write(formatBuildLine(written));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      stderr.write(`${message}\n`);
    }
    rebuildBusy = false;
    notifyIdle();
  }

  function onEvent(e: WatchEvent): void {
    if (stopped) return;
    if (!e.path || !isTranspilerSource(e.path)) return;
    rebuildBusy = true;
    pending.add(e.path);
    if (scheduled) clearTimeout(scheduled);
    scheduled = setTimeout(rebuild, debounceMs);
  }

  const watcher = factory(srcDir, onEvent);

  function runSync(): void {
    syncScheduled = null;
    try {
      opts.syncSurface?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      stderr.write(`${message}\n`);
    }
    syncBusy = false;
    notifyIdle();
  }

  function onComponentEvent(e: WatchEvent): void {
    if (stopped) return;
    if (!e.path || isSkipped(e.path) || !isComponentPath(e.path)) return;
    syncBusy = true;
    if (syncScheduled) clearTimeout(syncScheduled);
    syncScheduled = setTimeout(runSync, debounceMs);
  }

  const componentWatcher = opts.componentWatcherFactory
    ? opts.componentWatcherFactory(cwd, onComponentEvent)
    : null;

  function stop(): void {
    if (stopped) return;
    stopped = true;
    if (scheduled) {
      clearTimeout(scheduled);
      scheduled = null;
    }
    if (syncScheduled) {
      clearTimeout(syncScheduled);
      syncScheduled = null;
    }
    watcher.close();
    componentWatcher?.close();
    rebuildBusy = false;
    syncBusy = false;
    notifyIdle();
    resolveDone(0);
  }

  function waitForIdle(): Promise<void> {
    if (!rebuildBusy && !syncBusy) return Promise.resolve();
    return new Promise<void>((resolve) => {
      idleResolvers.push(resolve);
    });
  }

  return { stop, done, waitForIdle };
}
