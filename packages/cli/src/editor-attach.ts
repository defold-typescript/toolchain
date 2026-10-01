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
 * `accepted` (an answered post: 200, 202 or 422) and `skipped` (403) are both
 * successful outcomes: the editor answers 403 when no game is running or nothing
 * is dirty, which is the common case during a watch and must stay silent. Only
 * `unavailable` is worth reporting. Whether an answered command itself succeeded
 * is the {@link CommandResult}'s to say, not the outcome's.
 */
export type ReloadOutcome = "accepted" | "skipped" | "unavailable";

export interface EditorPosition {
  /** Zero-based, as in LSP: the editor builds it from its own cursor range. */
  readonly line: number;
  readonly character: number;
}

export interface EditorIssue {
  readonly message: string;
  readonly severity: string;
  /** A project path such as `/main/main.script`. */
  readonly resource?: string;
  readonly range?: { readonly start: EditorPosition; readonly end: EditorPosition };
}

/** The verdict a Defold 1.13.2+ editor returns once a command has finished. */
export interface CommandResult {
  readonly success: boolean;
  readonly issues: readonly EditorIssue[];
  /** The running engine's URL, read only from a `run` answer. */
  readonly targetUrl?: string;
}

export interface CommandAnswer {
  readonly outcome: ReloadOutcome;
  /** `null` when the editor queued the command (202) or its body did not parse. */
  readonly result: CommandResult | null;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePosition(value: unknown): EditorPosition | null {
  if (!isRecord(value)) return null;
  const { line, character } = value;
  return typeof line === "number" && typeof character === "number" ? { line, character } : null;
}

function parseIssue(value: unknown): EditorIssue | null {
  if (!isRecord(value)) return null;
  const { message, severity, resource, range } = value;
  if (typeof message !== "string" || typeof severity !== "string") return null;
  const start = isRecord(range) ? parsePosition(range.start) : null;
  const end = isRecord(range) ? parsePosition(range.end) : null;
  return {
    message,
    severity,
    ...(typeof resource === "string" ? { resource } : {}),
    ...(start !== null && end !== null ? { range: { start, end } } : {}),
  };
}

/**
 * An unreadable body yields `null` rather than a throw: the editor did answer,
 * so the post is not "no editor", it only carries no verdict to report.
 */
function parseCommandResult(body: string, readTarget: boolean): CommandResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.success !== "boolean") return null;
  const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
  const targetUrl =
    readTarget && isRecord(parsed.target) && typeof parsed.target.url === "string"
      ? parsed.target.url
      : undefined;
  return {
    success: parsed.success,
    issues: issues.map(parseIssue).filter((issue): issue is EditorIssue => issue !== null),
    ...(targetUrl === undefined ? {} : { targetUrl }),
  };
}

/**
 * `<resource>:<line>: <severity>: <message>`, with the line one-based so it
 * reads like a console error location and `mapConsoleLine` can map it.
 */
export function formatEditorIssue(issue: EditorIssue): string {
  const line = issue.range === undefined ? "" : `:${issue.range.start.line + 1}`;
  const location = issue.resource === undefined ? "" : `${issue.resource}${line}: `;
  return `${location}${issue.severity}: ${issue.message}`;
}

/** A failed result's issues; nothing for a successful result or none at all. */
export function editorIssues(result: CommandResult | null): readonly EditorIssue[] {
  return result === null || result.success ? [] : result.issues;
}

interface SendOptions {
  /** Appended to `/command/<name>` as is, without the leading `?`. */
  readonly query?: string;
  /** Only `run` answers with a `target`; every other command ignores one. */
  readonly readTarget?: boolean;
}

/**
 * `null` for no editor: no port file, or a transport that threw. Otherwise the
 * status, plus the parsed `{ success, issues }` body for a finished command
 * (200 or 422), which every caller reads the same way.
 */
async function sendCommand(
  cwd: string,
  name: string,
  transport: EditorTransport,
  signal: AbortSignal | undefined,
  options: SendOptions = {},
): Promise<{ readonly status: number; readonly result: CommandResult | null } | null> {
  const port = readEditorPort(cwd);
  if (port === null) return null;
  const query = options.query === undefined ? "" : `?${options.query}`;
  try {
    const res = await transport(`http://localhost:${port}/command/${name}${query}`, {
      method: "POST",
      signal,
    });
    if (res.status !== 200 && res.status !== 422) return { status: res.status, result: null };
    const body = await res.text().catch(() => "");
    return { status: res.status, result: parseCommandResult(body, options.readTarget === true) };
  } catch {
    return null;
  }
}

/**
 * Posts `/command/<name>`. The port is re-read per call and never memoized: a
 * restarted editor gets a new random port, and a cached one would post into a
 * dead socket or another project's editor.
 *
 * Editors before 1.13.2 answer 202 once the command is queued. 1.13.2 and later
 * answer after it finishes: 200 on success and 422 on failure, both with a
 * `{ success, issues }` body.
 */
export async function postCommand(
  cwd: string,
  name: string,
  transport: EditorTransport = defaultTransport,
  signal?: AbortSignal,
): Promise<CommandAnswer> {
  const sent = await sendCommand(cwd, name, transport, signal);
  if (sent === null) return { outcome: "unavailable", result: null };
  if (sent.status === 200 || sent.status === 422)
    return { outcome: "accepted", result: sent.result };
  if (sent.status === 202) return { outcome: "accepted", result: null };
  if (sent.status === 403) return { outcome: "skipped", result: null };
  return { outcome: "unavailable", result: null };
}

/**
 * `unsupported` is an editor that answered but has no `/command/compile` --
 * anything before Defold 1.13.2 answers 404. It is kept apart from
 * `unavailable` because the fix differs: upgrade the editor, not open one.
 */
export type CompileOutcome = "compiled" | "unsupported" | "skipped" | "unavailable";

export interface CompileAnswer {
  readonly outcome: CompileOutcome;
  /** `null` unless the editor finished the compile and its body parsed. */
  readonly result: CommandResult | null;
}

/**
 * Asks the attached editor to compile the project without running it. The post
 * has no deadline: 1.13.2 answers only once the compile has finished, however
 * long a large project takes.
 */
export async function compileInEditor(
  cwd: string,
  transport: EditorTransport = defaultTransport,
  signal?: AbortSignal,
): Promise<CompileAnswer> {
  const sent = await sendCommand(cwd, "compile", transport, signal);
  if (sent === null) return { outcome: "unavailable", result: null };
  if (sent.status === 200 || sent.status === 422)
    return { outcome: "compiled", result: sent.result };
  if (sent.status === 404) return { outcome: "unsupported", result: null };
  if (sent.status === 403) return { outcome: "skipped", result: null };
  return { outcome: "unavailable", result: null };
}

/** The {@link CompileOutcome} statuses, with `ran` for an answered run. */
export type RunOutcome = "ran" | "unsupported" | "skipped" | "unavailable";

export interface RunAnswer {
  readonly outcome: RunOutcome;
  /** `null` unless the editor finished the run and its body parsed. */
  readonly result: CommandResult | null;
}

/**
 * Asks the attached editor to build and launch the game. The editor answers
 * once the engine has reported its URL or its own wait for it has ended, so the
 * post has no deadline of its own; a run the engine never reported carries an
 * issue and no `targetUrl`.
 */
export async function runInEditor(
  cwd: string,
  options: { readonly focus: boolean },
  transport: EditorTransport = defaultTransport,
  signal?: AbortSignal,
): Promise<RunAnswer> {
  const sent = await sendCommand(cwd, "run", transport, signal, {
    query: `focus=${options.focus}`,
    readTarget: true,
  });
  if (sent === null) return { outcome: "unavailable", result: null };
  if (sent.status === 200 || sent.status === 422) return { outcome: "ran", result: sent.result };
  if (sent.status === 404) return { outcome: "unsupported", result: null };
  if (sent.status === 403) return { outcome: "skipped", result: null };
  return { outcome: "unavailable", result: null };
}

export function hotReload(
  cwd: string,
  transport: EditorTransport = defaultTransport,
  signal?: AbortSignal,
): Promise<CommandAnswer> {
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
