import { existsSync, watch as fsWatch } from "node:fs";
import * as path from "node:path";
import { SCRIPT_SUFFIX_BY_KIND } from "@defold-typescript/transpiler";
import {
  BuildFailureError,
  isFileIncluded,
  isTranspilerSource,
  readBuildConfig,
  toPosix,
} from "./build-output";
import { type BuildSession, createBuildSession } from "./build-session";
import {
  consoleLines,
  consoleWatermark,
  type EditorEndpoint,
  type EditorTransport,
  openConsoleStream,
  postCommand,
  type ReloadOutcome,
  resolveEditor,
} from "./editor-attach";
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

/**
 * `hot-reload` swaps the running game's Lua; `reload-extensions` reloads the
 * editor's own extension scripts. They are disjoint targets, so an emit that
 * touched both kinds posts both.
 */
export type EditorReloadCommand = "hot-reload" | "reload-extensions";

export interface WatchEditorClient {
  resolve(cwd: string): Promise<EditorEndpoint | null>;
  postCommand(cwd: string, name: EditorReloadCommand): Promise<ReloadOutcome>;
  /** Live console lines with the replayed history already dropped, or null when the stream will not open. */
  openConsole(endpoint: EditorEndpoint): Promise<AsyncIterable<string> | null>;
}

export function createWatchEditorClient(transport?: EditorTransport): WatchEditorClient {
  return {
    resolve: (cwd) => resolveEditor(cwd, transport),
    postCommand: (cwd, name) => postCommand(cwd, name, transport),
    async openConsole(endpoint) {
      // The watermark is read before the stream opens: /console/stream replays
      // the whole session, so without it every attach reprints history as news.
      const skip = await consoleWatermark(endpoint, transport);
      const chunks = await openConsoleStream(endpoint, transport);
      return chunks === null ? null : consoleLines(chunks, skip);
    },
  };
}

export const defaultEditorClient: WatchEditorClient = createWatchEditorClient();

const EDITOR_SCRIPT_SUFFIX = SCRIPT_SUFFIX_BY_KIND["editor-script"];

const RELOAD_UNAVAILABLE = "no running Defold editor accepted the reload";

function reloadCommandsFor(written: readonly string[]): EditorReloadCommand[] {
  const commands: EditorReloadCommand[] = [];
  if (written.some((rel) => !rel.endsWith(EDITOR_SCRIPT_SUFFIX))) commands.push("hot-reload");
  if (written.some((rel) => rel.endsWith(EDITOR_SCRIPT_SUFFIX))) commands.push("reload-extensions");
  return commands;
}

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
  readonly pinDiagnostics?: readonly string[];
  readonly pinMismatch?: { readonly installed: string; readonly pinned: string };
  readonly hotReload?: boolean;
  readonly editorClient?: WatchEditorClient;
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

// Cycle sentinels the VS Code background problemMatcher keys off to clear stale
// problems and re-anchor them per rebuild (see vscode-tasks.ts).
const BUILD_STARTED_LINE = "defold-typescript watch: build started\n";
const BUILD_FINISHED_LINE = "defold-typescript watch: build finished\n";

function formatFailureLine(entry: {
  readonly file: string;
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}): string {
  return entry.line !== undefined && entry.column !== undefined
    ? `  ${entry.file}:${entry.line}:${entry.column}: ${entry.message}`
    : `  ${entry.file}: ${entry.message}`;
}

const CONSOLE_PREFIX = "defold-typescript watch: editor: ";

// The engine tags every console line with its level, so the level is the filter:
// a watch that echoed the whole stream would drown in per-frame INFO lines.
function isConsoleErrorHeader(line: string): boolean {
  return /^(?:ERROR|WARNING):/.test(line);
}

// A traceback frame is indented and carries no level of its own, so it is only
// meaningful as a continuation of the header above it.
function isConsoleContinuation(line: string): boolean {
  return /^\s/.test(line) || /^stack traceback/i.test(line);
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

  // A BuildFailureError is a compile failure: report every located line (human)
  // or a structured `errors` event (json), keeping the watcher alive. Any other
  // error keeps today's single-message behavior.
  function reportFailure(err: unknown, event: "build" | "rebuild"): void {
    if (err instanceof BuildFailureError) {
      if (opts.json) {
        stdout.write(renderWatchEvent({ event, error: err.message, errors: err.entries }));
      } else {
        for (const entry of err.entries) {
          stderr.write(`${formatFailureLine(entry)}\n`);
        }
      }
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      stdout.write(renderWatchEvent({ event, error: message }));
    } else {
      stderr.write(`${message}\n`);
    }
  }

  let session: BuildSession;
  let config: ReturnType<typeof readBuildConfig>;
  if (opts.json) {
    // The diagnostics ride `start`, not the initial `build` event: a compile
    // failure routes to reportFailure, whose payload carries no warnings, so
    // hanging them on `build` would lose them for a project that has both a bad
    // pin key and a broken source file. The non-JSON stderr line comes from the
    // dispatch choke point, so nothing is written here for a normal run.
    stdout.write(
      renderWatchEvent({
        event: "start",
        ...(opts.pinDiagnostics?.length ? { warnings: opts.pinDiagnostics } : {}),
        ...(opts.pinMismatch ? { pinMismatch: opts.pinMismatch } : {}),
      }),
    );
  }
  try {
    opts.syncSurface?.();
    session = createBuildSession({ cwd });
    config = readBuildConfig(cwd);
    if (!opts.json) stdout.write(BUILD_STARTED_LINE);
    try {
      const { written, warnings } = session.buildAll();
      if (opts.json) {
        stdout.write(renderWatchEvent({ event: "build", written, warnings }));
      } else {
        stdout.write(formatBuildLine(written));
        for (const warning of warnings) {
          stderr.write(`defold-typescript watch: ${warning}\n`);
        }
      }
    } catch (buildErr) {
      // A compile failure is non-fatal: report it and fall through to open the
      // watcher. A genuine setup failure (thrown above) still rejects.
      if (!(buildErr instanceof BuildFailureError)) throw buildErr;
      reportFailure(buildErr, "build");
    }
    if (!opts.json) stdout.write(BUILD_FINISHED_LINE);
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
  let reloadBusy = false;
  let attachBusy = false;
  let stopped = false;
  let idleResolvers: Array<() => void> = [];
  const pending = new Set<string>();

  function notifyIdle(): void {
    if (rebuildBusy || syncBusy || resolveBusy || reloadBusy || attachBusy) return;
    const resolvers = idleResolvers;
    idleResolvers = [];
    for (const resolve of resolvers) resolve();
  }

  const pendingReload = new Set<EditorReloadCommand>();
  // Attach is a transition, not a per-rebuild fact: the editor may start, stop
  // or restart at any point during a watch, and only the change is worth a line.
  let attachedBaseUrl: string | null = null;
  let detachNoticed = false;
  let consoleRunning = false;

  function noteAttached(baseUrl: string): void {
    if (attachedBaseUrl === baseUrl) return;
    attachedBaseUrl = baseUrl;
    detachNoticed = false;
    if (!opts.json)
      stderr.write(`defold-typescript watch: attached to Defold editor at ${baseUrl}\n`);
  }

  function noteDetached(): void {
    attachedBaseUrl = null;
    if (detachNoticed) return;
    detachNoticed = true;
    if (!opts.json) stderr.write("defold-typescript watch: no Defold editor detected\n");
  }

  /**
   * A refused reload is not a vanished editor -- discovery just probed this
   * endpoint -- so the wording names it, but both states leave hot reload idle
   * and share the one-notice latch.
   */
  function noteReloadFailed(baseUrl: string): void {
    attachedBaseUrl = null;
    if (detachNoticed) return;
    detachNoticed = true;
    if (!opts.json)
      stderr.write(
        `defold-typescript watch: Defold editor at ${baseUrl} did not accept the reload\n`,
      );
  }

  /**
   * Runtime failures from the running game are content, not status, so they go
   * to stderr in both modes: under `--json` stdout is the machine stream and
   * must stay pure NDJSON, and dropping the errors there instead would leave
   * `--json` strictly less informative with nothing put in their place.
   */
  async function drainConsole(lines: AsyncIterable<string>): Promise<void> {
    try {
      let inError = false;
      for await (const line of lines) {
        if (stopped) return;
        if (isConsoleErrorHeader(line)) {
          inError = true;
        } else if (!inError || !isConsoleContinuation(line)) {
          inError = false;
          continue;
        }
        stderr.write(`${CONSOLE_PREFIX}${line}\n`);
      }
    } finally {
      // The stream ending is the editor quitting, not a watch failure: fall back
      // to unattached so the next rebuild can attach to whatever starts next.
      consoleRunning = false;
      attachedBaseUrl = null;
    }
  }

  function emitReloadEvent(outcome: ReloadOutcome): void {
    if (!opts.json || outcome === "skipped") return;
    stdout.write(
      outcome === "accepted"
        ? renderWatchEvent({ event: "reload" })
        : renderWatchEvent({ event: "reload", error: RELOAD_UNAVAILABLE }),
    );
  }

  // Reading the editor is unconditional -- `--hot-reload` governs whether a
  // reload is *posted*, not whether the editor's console is watched.
  async function ensureAttached(announce = true): Promise<EditorEndpoint | null> {
    const client = opts.editorClient ?? defaultEditorClient;
    const endpoint = await client.resolve(cwd);
    if (endpoint === null) {
      noteDetached();
      return null;
    }
    if (announce) noteAttached(endpoint.baseUrl);
    if (!consoleRunning) {
      consoleRunning = true;
      const lines = await client.openConsole(endpoint);
      if (lines === null) {
        consoleRunning = false;
      } else {
        void drainConsole(lines);
      }
    }
    return endpoint;
  }

  function scheduleAttach(): void {
    if (attachBusy) return;
    attachBusy = true;
    void ensureAttached().finally(() => {
      attachBusy = false;
      notifyIdle();
    });
  }

  async function pushReload(commands: readonly EditorReloadCommand[]): Promise<void> {
    const client = opts.editorClient ?? defaultEditorClient;
    // On this path attachment is the post's outcome, not the probe's: announcing
    // it up front would claim an attachment a refused reload cannot back.
    const endpoint = await ensureAttached(false);
    if (endpoint === null) {
      emitReloadEvent("unavailable");
      return;
    }
    for (const name of commands) {
      const outcome = await client.postCommand(cwd, name);
      if (outcome === "unavailable") {
        noteReloadFailed(endpoint.baseUrl);
      } else {
        noteAttached(endpoint.baseUrl);
      }
      emitReloadEvent(outcome);
    }
  }

  // A latch, not a timer: a burst landing while a reload is in flight collapses
  // into exactly one trailing reload, and a lone save pays no added latency.
  async function drainReloads(): Promise<void> {
    try {
      while (pendingReload.size > 0) {
        const commands = [...pendingReload];
        pendingReload.clear();
        await pushReload(commands);
      }
    } finally {
      reloadBusy = false;
      notifyIdle();
    }
  }

  function scheduleReload(written: readonly string[]): void {
    if (!opts.hotReload || written.length === 0) return;
    for (const command of reloadCommandsFor(written)) pendingReload.add(command);
    if (reloadBusy) return;
    reloadBusy = true;
    void drainReloads();
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
    if (!opts.json) stdout.write(BUILD_STARTED_LINE);
    try {
      const { written } = session.applyEvents(changed, removed);
      stdout.write(
        opts.json
          ? renderWatchEvent({ event: "rebuild", written, changed, removed })
          : formatBuildLine(written),
      );
      // Inside the success branch on purpose: reloading after a failed build
      // would push the previous emit's Lua into the running game.
      scheduleReload(written);
    } catch (err) {
      reportFailure(err, "rebuild");
    }
    if (!opts.json) stdout.write(BUILD_FINISHED_LINE);
    // A posted reload attaches on its own; this covers the rebuilds that post
    // nothing, so an editor started mid-watch is still picked up.
    if (!reloadBusy) scheduleAttach();
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
    reloadBusy = false;
    attachBusy = false;
    notifyIdle();
    resolveDone(0);
  }

  function waitForIdle(): Promise<void> {
    if (!rebuildBusy && !syncBusy && !resolveBusy && !reloadBusy && !attachBusy) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      idleResolvers.push(resolve);
    });
  }

  scheduleAttach();

  return { stop, done, waitForIdle };
}
