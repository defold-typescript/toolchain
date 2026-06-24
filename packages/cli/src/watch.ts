import { existsSync, watch as fsWatch } from "node:fs";
import * as path from "node:path";
import { isFileIncluded, isTranspilerSource, readBuildConfig, toPosix } from "./build-output";
import { type BuildSession, createBuildSession } from "./build-session";
import { renderWatchEvent } from "./json-output";
import { isComponentPath, isSkipped } from "./script-kind";

export interface WatchEvent {
  readonly kind: "change" | "rename";
  readonly path: string;
}

export interface Watcher {
  close(): void;
}

export type WatcherFactory = (root: string, onEvent: (e: WatchEvent) => void) => Watcher;

export interface RunWatchOptions {
  readonly cwd: string;
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
  readonly debounceMs?: number;
  readonly watcherFactory?: WatcherFactory;
  readonly syncSurface?: () => void;
  readonly componentWatcherFactory?: WatcherFactory;
  readonly resolveSurface?: () => void | Promise<void>;
  readonly json?: boolean;
}

export interface RunWatchHandle {
  readonly stop: () => void;
  readonly done: Promise<number>;
  readonly waitForIdle: () => Promise<void>;
}

const DEFAULT_DEBOUNCE_MS = 50;

export const recursiveWatcherFactory: WatcherFactory = (root, onEvent) => {
  const w = fsWatch(root, { recursive: true }, (eventType, filename) => {
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
  let config: ReturnType<typeof readBuildConfig>;
  if (opts.json) {
    stdout.write(renderWatchEvent({ event: "start" }));
  }
  try {
    opts.syncSurface?.();
    session = createBuildSession({ cwd });
    config = readBuildConfig(cwd);
    const { written, warnings } = session.buildAll();
    if (opts.json) {
      stdout.write(renderWatchEvent({ event: "build", written, warnings }));
    } else {
      stdout.write(formatBuildLine(written));
      for (const warning of warnings) {
        stderr.write(`defold-typescript watch: ${warning}\n`);
      }
    }
  } catch (err) {
    rejectDone(rewrapInitError(err));
    return {
      stop: () => {},
      done,
      waitForIdle: () => Promise.resolve(),
    };
  }

  let scheduled: ReturnType<typeof setTimeout> | null = null;
  let syncScheduled: ReturnType<typeof setTimeout> | null = null;
  let resolveScheduled: ReturnType<typeof setTimeout> | null = null;
  let rebuildBusy = false;
  let syncBusy = false;
  let resolveBusy = false;
  let stopped = false;
  let idleResolvers: Array<() => void> = [];
  const pending = new Set<string>();

  function notifyIdle(): void {
    if (rebuildBusy || syncBusy || resolveBusy) return;
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
    for (const key of drained) {
      if (existsSync(path.join(cwd, key))) {
        changed.push(key);
      } else {
        removed.push(key);
      }
    }
    try {
      const { written } = session.applyEvents(changed, removed);
      stdout.write(
        opts.json
          ? renderWatchEvent({ event: "rebuild", written, changed, removed })
          : formatBuildLine(written),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (opts.json) {
        stdout.write(renderWatchEvent({ event: "rebuild", error: message }));
      } else {
        stderr.write(`${message}\n`);
      }
    }
    rebuildBusy = false;
    notifyIdle();
  }

  function onEvent(e: WatchEvent): void {
    if (stopped) return;
    if (!e.path) return;
    if (toPosix(e.path) === "game.project") {
      resolveBusy = true;
      if (resolveScheduled) clearTimeout(resolveScheduled);
      resolveScheduled = setTimeout(runResolveSurface, debounceMs);
      return;
    }
    if (!isTranspilerSource(e.path)) return;
    const key = toPosix(e.path);
    if (!isFileIncluded(key, config.include)) return;
    rebuildBusy = true;
    pending.add(key);
    if (scheduled) clearTimeout(scheduled);
    scheduled = setTimeout(rebuild, debounceMs);
  }

  const watcher = factory(cwd, onEvent);

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

  async function runResolveSurface(): Promise<void> {
    resolveScheduled = null;
    try {
      await opts.resolveSurface?.();
      if (opts.json) {
        stdout.write(renderWatchEvent({ event: "resolve" }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (opts.json) {
        stdout.write(renderWatchEvent({ event: "resolve", error: message }));
      } else {
        stderr.write(`${message}\n`);
      }
    }
    resolveBusy = false;
    notifyIdle();
  }

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
    if (resolveScheduled) {
      clearTimeout(resolveScheduled);
      resolveScheduled = null;
    }
    watcher.close();
    componentWatcher?.close();
    if (opts.json) {
      stdout.write(renderWatchEvent({ event: "stop" }));
    }
    rebuildBusy = false;
    syncBusy = false;
    resolveBusy = false;
    notifyIdle();
    resolveDone(0);
  }

  function waitForIdle(): Promise<void> {
    if (!rebuildBusy && !syncBusy && !resolveBusy) return Promise.resolve();
    return new Promise<void>((resolve) => {
      idleResolvers.push(resolve);
    });
  }

  return { stop, done, waitForIdle };
}
