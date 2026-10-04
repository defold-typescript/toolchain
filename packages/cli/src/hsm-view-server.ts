import { type FSWatcher, watch } from "node:fs";
import type { Server } from "node:http";
import * as path from "node:path";
import { serve } from "@hono/node-server";
import { type Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { MachineIndex } from "./hsm-view-index";
import { type ClientAssets, renderPage } from "./hsm-view-page";
import type { HsmViewSession, Snapshot } from "./hsm-view-session";
import { type Line, lineStarts, tokenizeLines } from "./hsm-view-tokens";

export type { ClientAssets } from "./hsm-view-page";

export interface HsmViewAppOptions {
  readonly session: HsmViewSession;
  readonly client: ClientAssets;
  readonly title?: string;
}

export interface ServeHsmViewOptions extends HsmViewAppOptions {
  readonly port: number;
}

export interface HsmViewServer {
  readonly url: string;
  close(): Promise<void>;
}

export interface HsmViewFile {
  readonly path: string;
  readonly lines: readonly Line[];
  /** Where each line starts in the file text, so a span's offsets map to a line and column. */
  readonly starts: readonly number[];
}

export interface HsmViewIndex extends MachineIndex {
  readonly machines: readonly string[];
  readonly picked: string | undefined;
  /** Each loaded file, its path relative to the entry file's folder. */
  readonly files: readonly HsmViewFile[];
}

export interface ReloadMessage {
  readonly ok: boolean;
  readonly error?: string;
  readonly snapshot: Snapshot;
}

const HOST = "127.0.0.1";
const RELOAD_DEBOUNCE_MS = 100;

class BadRequest extends Error {}

type Listener = (message: ReloadMessage) => void;

interface Hub {
  subscribe(listener: Listener): () => void;
  broadcast(message: ReloadMessage): void;
  onClose(callback: () => void): () => void;
  close(): void;
}

function createHub(): Hub {
  const listeners = new Set<Listener>();
  const closers = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    broadcast(message) {
      for (const listener of listeners) {
        listener(message);
      }
    },
    onClose(callback) {
      closers.add(callback);
      return () => closers.delete(callback);
    },
    close() {
      for (const callback of closers) {
        callback();
      }
      closers.clear();
      listeners.clear();
    },
  };
}

type Body = Record<string, unknown>;

async function jsonBody(c: Context): Promise<Body> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new BadRequest("request body is not JSON");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new BadRequest("request body must be a JSON object");
  }
  return body as Body;
}

function field<T>(body: Body, name: string, valid: (value: unknown) => value is T): T {
  const value = body[name];
  if (!valid(value)) {
    throw new BadRequest(`missing or invalid "${name}"`);
  }
  return value;
}

const isPresent = (value: unknown): value is unknown => value !== undefined;
const isString = (value: unknown): value is string => typeof value === "string";
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString);
const isEvent = (value: unknown): value is { type: string } =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as { type?: unknown }).type === "string";

function toPosix(rel: string): string {
  return rel.split(path.sep).join("/");
}

function reloadMessage(snapshot: Snapshot): ReloadMessage {
  const failure = snapshot.entries.find((entry) => entry.kind === "error");
  return failure === undefined
    ? { ok: true, snapshot }
    : { ok: false, error: failure.message, snapshot };
}

function buildApp(options: HsmViewAppOptions, hub: Hub): Hono {
  const { session, client } = options;
  const coloredLines = new Map<
    string,
    { readonly text: string; readonly lines: Line[]; readonly starts: number[] }
  >();

  const linesOf = (file: string, text: string): { lines: Line[]; starts: number[] } => {
    const cached = coloredLines.get(file);
    if (cached?.text === text) {
      return cached;
    }
    const colored = { text, lines: tokenizeLines(text), starts: lineStarts(text) };
    coloredLines.set(file, colored);
    return colored;
  };

  const entry = session.index().files[0];
  const title =
    options.title ?? (entry === undefined ? "hsm-view" : `${path.basename(entry.path)} - hsm-view`);
  const page = renderPage({ title, client });

  const app = new Hono();

  app.onError((thrown, c) => {
    if (thrown instanceof BadRequest) {
      return c.json({ error: thrown.message }, 400);
    }
    return c.json({ error: thrown instanceof Error ? thrown.message : String(thrown) }, 500);
  });

  app.notFound((c) => c.json({ error: `not found: ${c.req.path}` }, 404));

  app.get("/", (c) => c.html(page));

  app.get("/api/index", (c) => {
    const { files, ...index } = session.index();
    const { machines, picked } = session.snapshot();
    const dir = files[0] === undefined ? process.cwd() : path.dirname(files[0].path);
    const body: HsmViewIndex = {
      ...index,
      machines,
      picked,
      files: files.map((file) => {
        const { lines, starts } = linesOf(file.path, file.text);
        return { path: toPosix(path.relative(dir, file.path)), lines, starts };
      }),
    };
    return c.json(body);
  });

  app.get("/api/snapshot", (c) => c.json(session.snapshot()));

  app.post("/api/start", async (c) => {
    const body = await jsonBody(c);
    return c.json(session.start(field(body, "ctx", isPresent)));
  });

  app.post("/api/send", async (c) => {
    const body = await jsonBody(c);
    return c.json(session.send(field(body, "event", isEvent)));
  });

  app.post("/api/update", async (c) => {
    const body = await jsonBody(c);
    return c.json(session.update(field(body, "dt", isFiniteNumber)));
  });

  app.post("/api/edit", async (c) => {
    const body = await jsonBody(c);
    return c.json(
      session.editCtx(field(body, "path", isStringList), field(body, "value", isPresent)),
    );
  });

  app.post("/api/pick", async (c) => {
    const body = await jsonBody(c);
    return c.json(session.pick(field(body, "name", isString)));
  });

  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = hub.subscribe((message) => {
        void stream.writeSSE({ event: "reload", data: JSON.stringify(message) });
      });
      let release: () => void = () => {};
      const done = new Promise<void>((resolve) => {
        release = resolve;
      });
      const stopWaiting = hub.onClose(release);
      stream.onAbort(release);
      await stream.writeSSE({ event: "ready", data: "{}" });
      await done;
      unsubscribe();
      stopWaiting();
    }),
  );

  return app;
}

/** The viewer's routes; `GET /api/events` stays open but only `serveHsmView` pushes reloads. */
export function createHsmViewApp(options: HsmViewAppOptions): Hono {
  return buildApp(options, createHub());
}

/** Serves the viewer on `127.0.0.1` and reloads the session whenever a loaded file changes. */
export function serveHsmView(options: ServeHsmViewOptions): Promise<HsmViewServer> {
  const { session } = options;
  const hub = createHub();
  const app = buildApp(options, hub);
  const watchers: FSWatcher[] = [];
  let pending: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const unwatch = (): void => {
    for (const watcher of watchers.splice(0)) {
      watcher.close();
    }
  };

  const reloadNow = (): void => {
    pending = undefined;
    if (closed) {
      return;
    }
    const message = reloadMessage(session.reload());
    watchFiles();
    hub.broadcast(message);
  };

  const scheduleReload = (): void => {
    if (pending !== undefined) {
      clearTimeout(pending);
    }
    pending = setTimeout(reloadNow, RELOAD_DEBOUNCE_MS);
  };

  // Editors that save by replacing the file leave the old watcher on a dead inode,
  // so every reload watches the whole file set afresh.
  function watchFiles(): void {
    unwatch();
    for (const file of session.index().files) {
      try {
        watchers.push(watch(file.path, scheduleReload));
      } catch {
        // A file removed since the last load has nothing to watch until an import brings it back.
      }
    }
  }

  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port: options.port, hostname: HOST }, (info) => {
      watchFiles();
      resolve({
        url: `http://${HOST}:${info.port}`,
        close: () =>
          new Promise<void>((done) => {
            closed = true;
            if (pending !== undefined) {
              clearTimeout(pending);
            }
            unwatch();
            hub.close();
            const http = server as Server;
            http.close(() => done());
            http.closeAllConnections?.();
          }),
      });
    });
    server.once("error", reject);
  });
}
