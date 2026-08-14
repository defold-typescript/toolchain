import {
  type EditorEndpoint,
  isConsoleContinuation,
  isConsoleErrorHeader,
  type ReloadOutcome,
} from "./editor-attach";
import { renderResult } from "./json-output";
import { defaultEditorClient, type EditorReloadCommand, type WatchEditorClient } from "./watch";

export interface RunReloadOptions {
  readonly cwd: string;
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
  readonly editorClient?: WatchEditorClient;
  readonly extensions?: boolean;
  readonly waitMs?: number;
  readonly json?: boolean;
  readonly attachTimeoutMs?: number;
}

export const DEFAULT_RELOAD_WAIT_MS = 2000;

/**
 * Bounds editor discovery and console attachment, matching `build`'s
 * `EDITOR_PROBE_TIMEOUT_MS`. `--wait` governs a later, different interval: how
 * long an *open* console is read. Neither transport times out on its own, so a
 * stale `.internal/editor.port` naming a process that listens but never answers
 * would otherwise park a one-shot command forever.
 */
export const ATTACH_TIMEOUT_MS = 2000;

const CONSOLE_PREFIX = "defold-typescript reload: editor: ";

const UNAVAILABLE = "no running Defold editor accepted the reload";
const REFUSED = "the Defold editor refused the reload: no game running, or nothing to reload";
const REPORTED_ERROR = "the reloaded code reported an error";
const UNOBSERVABLE =
  "the editor console could not be opened, so nothing was observed for this reload";

/**
 * Whether the window the caller asked for was actually read. `skipped` is the
 * deliberate `--wait 0` opt-out and stays a success; `failed` is a window that
 * was requested and could not be had, which is not the same fact as a window
 * that was read and stayed quiet.
 */
type ConsoleState = "observed" | "skipped" | "failed";

/**
 * Races one attach call against a deadline that aborts the shared controller. A
 * rejection lands in the same place as a refusal, because to this command they
 * are the same outcome: no usable answer. `onLate` releases a value that arrives
 * after the deadline -- an unreleased stream keeps the process alive.
 */
async function bounded<T extends object>(
  start: () => Promise<T | null>,
  abort: AbortController,
  timeoutMs: number,
  onLate: (value: T) => void,
): Promise<T | null> {
  const settled = Promise.resolve()
    .then(start)
    .catch(() => null);
  let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timer = null;
    abort.abort();
  }, timeoutMs);
  const result = await Promise.race([
    settled,
    new Promise<null>((resolve) => {
      abort.signal.addEventListener("abort", () => resolve(null));
    }),
  ]);
  if (timer !== null) clearTimeout(timer);
  if (result === null) {
    void settled.then((late) => {
      if (late !== null) onLate(late);
    });
  }
  return result;
}

/**
 * Reads whole console lines until the window closes, keeping only error headers
 * and the traceback frames under them -- the same level filter a watch applies,
 * because the alternative is every per-frame INFO line.
 *
 * The window, not the stream, ends the read: `/console/stream` stays open for
 * the editor's whole session, so a reload that logged nothing would otherwise
 * park here forever.
 */
async function drainWindow(
  reader: AsyncIterator<string>,
  waitMs: number,
  abort: AbortController,
): Promise<string[]> {
  const captured: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<"expired">((resolve) => {
    timer = setTimeout(() => resolve("expired"), waitMs);
  });
  try {
    let inError = false;
    for (;;) {
      const next = await Promise.race([reader.next(), expiry]);
      if (next === "expired" || next.done === true) return captured;
      const line = next.value;
      if (isConsoleErrorHeader(line)) {
        inError = true;
      } else if (!inError || !isConsoleContinuation(line)) {
        inError = false;
        continue;
      }
      captured.push(line);
    }
  } catch {
    // An aborted stream rejects rather than ending; the window closing is the
    // ordinary end of this read, not a failure of the reload.
    return captured;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    // Order matters, as in `watch`: the abort unparks a stream waiting on the
    // socket, and `return()` closes one that is mid-chunk. An unreleased reader
    // keeps the process alive after the window is over.
    abort.abort();
    void reader.return?.(undefined);
  }
}

/**
 * Posts a single reload and then reads the editor console for a bounded window,
 * because HTTP 202 only means the editor queued the command: a Lua error in the
 * reloaded chunk reaches the console, never the response. The window is a
 * heuristic -- an error thrown after it closes is missed -- so nothing here
 * claims the reload succeeded, only that no error was observed in time.
 */
export async function runReload(opts: RunReloadOptions): Promise<number> {
  const { cwd, stdout, stderr } = opts;
  const client = opts.editorClient ?? defaultEditorClient;
  const waitMs = opts.waitMs ?? DEFAULT_RELOAD_WAIT_MS;
  const command: EditorReloadCommand =
    opts.extensions === true ? "reload-extensions" : "hot-reload";
  const abort = new AbortController();
  const attachTimeoutMs = opts.attachTimeoutMs ?? ATTACH_TIMEOUT_MS;

  const report = (
    outcome: ReloadOutcome,
    errors: readonly string[],
    consoleObserved: boolean,
    error?: string,
  ): number => {
    if (opts.json === true) {
      stdout.write(
        renderResult({
          command: "reload",
          outcome,
          consoleErrors: errors,
          consoleObserved,
          ...(error === undefined ? {} : { error }),
        }),
      );
      return error === undefined ? 0 : 1;
    }
    for (const line of errors) stderr.write(`${CONSOLE_PREFIX}${line}\n`);
    if (error !== undefined) stderr.write(`defold-typescript reload: ${error}\n`);
    return error === undefined ? 0 : 1;
  };

  const endpoint: EditorEndpoint | null = await bounded<EditorEndpoint>(
    () => client.resolve(cwd, abort.signal),
    abort,
    attachTimeoutMs,
    () => {},
  );
  if (endpoint === null) {
    abort.abort();
    return report("unavailable", [], false, UNAVAILABLE);
  }

  // Opened before the post, never after: `openConsole` reads the watermark it
  // skips history with, so a stream opened afterwards would count the reload's
  // own error as history and drop it.
  const openConsole = client.openConsole;
  const wantsConsole = waitMs > 0;
  const lines =
    wantsConsole && openConsole !== undefined
      ? await bounded<AsyncIterable<string>>(
          () => openConsole.call(client, endpoint, abort.signal),
          abort,
          attachTimeoutMs,
          (late) => {
            void late[Symbol.asyncIterator]().return?.(undefined);
          },
        )
      : null;
  const reader = lines === null ? null : lines[Symbol.asyncIterator]();
  const consoleState: ConsoleState = !wantsConsole
    ? "skipped"
    : reader === null
      ? "failed"
      : "observed";
  const observed = consoleState === "observed";

  const outcome = await client.postCommand(cwd, command);
  if (outcome !== "accepted") {
    abort.abort();
    void reader?.return?.(undefined);
    return report(outcome, [], observed, outcome === "skipped" ? REFUSED : UNAVAILABLE);
  }

  if (!opts.json) {
    stdout.write(
      `defold-typescript reload: Defold editor at ${endpoint.baseUrl}: posted ${command}\n`,
    );
  }

  // The post is the command's primary job and it landed, so the editor's answer
  // is preserved; the exit status is what carries the inability to observe.
  if (consoleState === "failed") {
    abort.abort();
    return report("accepted", [], false, UNOBSERVABLE);
  }

  const captured = reader === null ? [] : await drainWindow(reader, waitMs, abort);
  abort.abort();

  if (captured.length > 0) return report("accepted", captured, observed, REPORTED_ERROR);

  if (!opts.json) {
    stdout.write(
      observed
        ? `defold-typescript reload: no error observed within ${waitMs}ms (later errors are not covered)\n`
        : "defold-typescript reload: no error observed; the console was not read\n",
    );
  }
  return report("accepted", [], observed);
}
