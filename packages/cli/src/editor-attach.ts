import { readFileSync } from "node:fs";
import * as path from "node:path";

/** The subset of a `fetch` response this module reads, so tests can inject one. */
export interface EditorResponse {
  readonly status: number;
  text(): Promise<string>;
  readonly body?: AsyncIterable<Uint8Array | string> | null;
}

export type EditorTransport = (
  url: string,
  init?: {
    readonly method?: string;
    readonly signal?: AbortSignal | undefined;
    readonly headers?: Readonly<Record<string, string>>;
    readonly body?: string;
  },
) => Promise<EditorResponse>;

export interface EditorEndpoint {
  readonly baseUrl: string;
}

/**
 * `accepted` (202) and `skipped` (403) are both successful outcomes: the editor
 * answers 403 when no game is running or nothing is dirty, which is the common
 * case during a watch and must stay silent. Only `unavailable` is worth
 * reporting.
 */
export type ReloadOutcome = "accepted" | "skipped" | "unavailable";

export const EDITOR_PORT_FILE = path.join(".internal", "editor.port");

export const EDITOR_TOKEN_FILE = path.join(".internal", "editor.token");

export const EDITOR_API_TITLE = "Defold Editor HTTP API";

const defaultTransport: EditorTransport = (url, init) =>
  fetch(url, {
    ...(init?.method === undefined ? {} : { method: init.method }),
    ...(init?.headers === undefined ? {} : { headers: init.headers }),
    ...(init?.body === undefined ? {} : { body: init.body }),
    signal: init?.signal ?? null,
  });

/**
 * The port a running editor published, or `null` when no editor is open. Both
 * `.internal/editor.port` and its sibling token are removed on a clean exit, so
 * an absent, empty, or half-written file is the ordinary "no editor" state and
 * never an error.
 */
export function readEditorPort(cwd: string): number | null {
  let raw: string;
  try {
    raw = readFileSync(path.join(cwd, EDITOR_PORT_FILE), "utf8");
  } catch {
    return null;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const port = Number(trimmed);
  return port > 0 && port <= 65535 ? port : null;
}

/**
 * The per-session token a running editor published, or `null` when no editor is
 * open. `.internal/editor.token` is written and removed alongside the port file,
 * so an absent, empty, or half-written file is the ordinary "no editor" state
 * and never an error -- this runs on the build hot path and must not throw.
 */
export function readEditorToken(cwd: string): string | null {
  let raw: string;
  try {
    raw = readFileSync(path.join(cwd, EDITOR_TOKEN_FILE), "utf8");
  } catch {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Confirms the port actually belongs to a Defold editor before anything is sent
 * to it: the port is random per session and the file outlives a crash, so a
 * stale port can point at an unrelated local process.
 */
export async function resolveEditor(
  cwd: string,
  transport: EditorTransport = defaultTransport,
  signal?: AbortSignal,
): Promise<EditorEndpoint | null> {
  const port = readEditorPort(cwd);
  if (port === null) return null;
  const baseUrl = `http://localhost:${port}`;
  try {
    const res = await transport(`${baseUrl}/openapi.json`, { method: "GET", signal });
    if (res.status !== 200) return null;
    const doc = JSON.parse(await res.text()) as { info?: { title?: unknown } };
    return doc.info?.title === EDITOR_API_TITLE ? { baseUrl } : null;
  } catch {
    return null;
  }
}

const EVAL_RETURN_PREFIX = "=> ";

/**
 * `/eval` answers `text/plain`: the printed output first, then one
 * `=> <tostring(value)>` line per returned value. Only the *trailing* run of
 * prefixed lines is read back, so printed text that happens to start with the
 * marker widens the run and the caller sees an unusable multi-value answer
 * rather than a confidently wrong one.
 */
function parseEvalReturns(body: string): string[] {
  const lines = body.split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const returns: string[] = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line === undefined || !line.startsWith(EVAL_RETURN_PREFIX)) break;
    returns.unshift(line.slice(EVAL_RETURN_PREFIX.length));
  }
  return returns;
}

/**
 * Evaluates `expr` in the editor's extension runtime and resolves the single
 * value it returned, or `null` for every other outcome.
 *
 * `/eval` reaches `editor.execute`, so this is arbitrary local code execution.
 * It is only ever addressed at `localhost`, on a port this project's own
 * `.internal/` published, authenticated with that same directory's per-session
 * token: reaching it already requires read access to the project. Nothing here
 * may be routed to, or reachable from, a network-facing surface.
 *
 * Absent port file short-circuits before any transport call at all, which is
 * what keeps the common no-editor case off the network on the build hot path.
 * Nothing throws and nothing propagates: a probe must never fail a build.
 */
export async function evalEditor(
  cwd: string,
  expr: string,
  transport: EditorTransport = defaultTransport,
  signal?: AbortSignal,
): Promise<string | null> {
  if (readEditorPort(cwd) === null) return null;
  try {
    const endpoint = await resolveEditor(cwd, transport, signal);
    if (endpoint === null) return null;
    const token = readEditorToken(cwd);
    if (token === null) return null;
    const res = await transport(`${endpoint.baseUrl}/eval`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
      body: expr,
      signal,
    });
    if (res.status !== 200) return null;
    const returns = parseEvalReturns(await res.text());
    return returns.length === 1 ? (returns[0] ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Posts `/command/<name>`. The port is re-read per call and never memoized: a
 * restarted editor gets a new random port, and a cached one would post into a
 * dead socket or another project's editor.
 */
export async function postCommand(
  cwd: string,
  name: string,
  transport: EditorTransport = defaultTransport,
  signal?: AbortSignal,
): Promise<ReloadOutcome> {
  const port = readEditorPort(cwd);
  if (port === null) return "unavailable";
  try {
    const res = await transport(`http://localhost:${port}/command/${name}`, {
      method: "POST",
      signal,
    });
    if (res.status === 202) return "accepted";
    if (res.status === 403) return "skipped";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

export function hotReload(
  cwd: string,
  transport: EditorTransport = defaultTransport,
  signal?: AbortSignal,
): Promise<ReloadOutcome> {
  return postCommand(cwd, "hot-reload", transport, signal);
}

/**
 * How many lines the editor's console already holds. `/console/stream` replays
 * that whole history on connect, so this count is what the reader drops.
 *
 * A line logged between this call and the stream opening is printed twice. That
 * is the deliberate trade: the alternative is a timing heuristic, which is not
 * deterministically testable. Failing to 0 is equally deliberate -- a watermark
 * error must never suppress live output permanently.
 */
export async function consoleWatermark(
  endpoint: EditorEndpoint,
  transport: EditorTransport = defaultTransport,
  signal?: AbortSignal,
): Promise<number> {
  try {
    const res = await transport(`${endpoint.baseUrl}/console`, { method: "GET", signal });
    if (res.status !== 200) return 0;
    const doc = JSON.parse(await res.text()) as { lines?: unknown };
    return Array.isArray(doc.lines) ? doc.lines.length : 0;
  } catch {
    return 0;
  }
}

export async function openConsoleStream(
  endpoint: EditorEndpoint,
  transport: EditorTransport = defaultTransport,
  signal?: AbortSignal,
): Promise<AsyncIterable<Uint8Array | string> | null> {
  try {
    const res = await transport(`${endpoint.baseUrl}/console/stream`, { method: "GET", signal });
    if (res.status !== 200) return null;
    return res.body ?? null;
  } catch {
    return null;
  }
}

/**
 * Whole console lines from a chunked stream, minus the first `skip` of them.
 * An editor quitting mid-watch ends the reader normally rather than throwing --
 * that is an ordinary transition, not a failure of the watch.
 */
// The engine tags every console line with its level, so the level is the filter:
// a watch that echoed the whole stream would drown in per-frame INFO lines.
export function isConsoleErrorHeader(line: string): boolean {
  return /^(?:ERROR|WARNING):/.test(line);
}

// A traceback frame is indented and carries no level of its own, so it is only
// meaningful as a continuation of the header above it.
export function isConsoleContinuation(line: string): boolean {
  return /^\s/.test(line) || /^stack traceback/i.test(line);
}

export async function* consoleLines(
  chunks: AsyncIterable<Uint8Array | string>,
  skip: number,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  let seen = 0;
  try {
    for await (const chunk of chunks) {
      buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        seen += 1;
        if (seen > skip) yield line;
        newline = buffer.indexOf("\n");
      }
    }
  } catch {
    return;
  }
  if (buffer.length > 0) {
    seen += 1;
    if (seen > skip) yield buffer;
  }
}
