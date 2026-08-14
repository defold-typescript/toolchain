import { describe, expect, test } from "bun:test";
import type { EditorEndpoint, ReloadOutcome } from "./editor-attach";
import { runReload } from "./reload";
import type { EditorReloadCommand, WatchEditorClient } from "./watch";

/**
 * A window long enough that any test reaching it would time out rather than
 * pass: every case that must return without draining asserts by completing.
 */
const NEVER_ELAPSES_MS = 600_000;
const SHORT_WINDOW_MS = 25;

interface FakeConsole {
  readonly items: AsyncIterable<string>;
  push(...lines: string[]): void;
  end(): void;
  released(): Promise<void>;
}

function makeConsole(signal?: AbortSignal): FakeConsole {
  const queue: string[] = [];
  let wake: (() => void) | null = null;
  let ended = false;
  let markReleased!: () => void;
  const released = new Promise<void>((resolve) => {
    markReleased = resolve;
  });

  const resume = (): void => {
    const pending = wake;
    wake = null;
    pending?.();
  };

  async function* iterate(): AsyncGenerator<string> {
    for (;;) {
      while (queue.length > 0) yield queue.shift() as string;
      if (ended) return;
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  }

  // A real `/console/stream` ends only when its request is cancelled, so the
  // fake unparks on the signal alone: dropping the abort wiring leaves this
  // stream parked forever, exactly as it would in production.
  signal?.addEventListener("abort", () => {
    ended = true;
    resume();
  });

  return {
    items: {
      [Symbol.asyncIterator]: (): AsyncIterator<string> => {
        const inner = iterate();
        return {
          next: () => inner.next(),
          return(value) {
            markReleased();
            return inner.return(value as never);
          },
          throw: (reason) => inner.throw(reason),
        };
      },
    },
    push(...lines) {
      queue.push(...lines);
      resume();
    },
    end() {
      ended = true;
      resume();
    },
    released: () => released,
  };
}

/**
 * The ways a client can fail to hand back a readable console, each a production
 * path: the method is optional on `WatchEditorClient`, `createWatchEditorClient`
 * returns `null` for a non-200, the underlying `fetch` can reject, and a stale
 * port can leave the call pending forever.
 */
type ConsoleBehavior = "stream" | "absent" | "null" | "reject" | "deferred";

interface FakeEditor {
  readonly client: WatchEditorClient;
  readonly posts: EditorReloadCommand[];
  readonly consoles: FakeConsole[];
  consoleCalls(): number;
  /** Settles a `deferred` attachment after the deadline has already passed. */
  settleConsole(): FakeConsole;
}

function makeEditor(opts?: {
  readonly baseUrl?: string | null;
  readonly outcome?: ReloadOutcome;
  readonly onConsole?: (console: FakeConsole) => void;
  readonly console?: ConsoleBehavior;
  readonly resolveNeverSettles?: boolean;
}): FakeEditor {
  const baseUrl = opts?.baseUrl === undefined ? "http://localhost:4242" : opts.baseUrl;
  const outcome = opts?.outcome ?? "accepted";
  const behavior = opts?.console ?? "stream";
  const posts: EditorReloadCommand[] = [];
  const consoles: FakeConsole[] = [];
  let calls = 0;
  let settle: ((value: AsyncIterable<string> | null) => void) | null = null;
  let lastSignal: AbortSignal | undefined;

  const openConsole = async (
    _endpoint: EditorEndpoint,
    signal?: AbortSignal,
  ): Promise<AsyncIterable<string> | null> => {
    calls += 1;
    lastSignal = signal;
    if (behavior === "null") return null;
    if (behavior === "reject") throw new Error("the editor refused the console stream");
    if (behavior === "deferred") {
      return await new Promise<AsyncIterable<string> | null>((resolve) => {
        settle = resolve;
      });
    }
    const stream = makeConsole(signal);
    consoles.push(stream);
    opts?.onConsole?.(stream);
    return stream.items;
  };

  const client: WatchEditorClient = {
    async resolve(_cwd, _signal): Promise<EditorEndpoint | null> {
      if (opts?.resolveNeverSettles === true) return await new Promise<never>(() => {});
      return baseUrl === null ? null : { baseUrl };
    },
    async postCommand(_cwd, name): Promise<ReloadOutcome> {
      posts.push(name);
      return outcome;
    },
    ...(behavior === "absent" ? {} : { openConsole }),
  };
  return {
    client,
    posts,
    consoles,
    consoleCalls: () => calls,
    settleConsole(): FakeConsole {
      const stream = makeConsole(lastSignal);
      consoles.push(stream);
      settle?.(stream.items);
      return stream;
    },
  };
}

function captureStreams(): {
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
  out(): string;
  err(): string;
} {
  let outText = "";
  let errText = "";
  const sink = (append: (chunk: string) => void): NodeJS.WritableStream =>
    ({
      write(chunk: string | Uint8Array): boolean {
        append(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
        return true;
      },
    }) as unknown as NodeJS.WritableStream;
  return {
    stdout: sink((c) => {
      outText += c;
    }),
    stderr: sink((c) => {
      errText += c;
    }),
    out: () => outText,
    err: () => errText,
  };
}

describe("runReload", () => {
  test("reports no editor and never posts when none resolves", async () => {
    const editor = makeEditor({ baseUrl: null });
    const io = captureStreams();

    const code = await runReload({
      cwd: "/project",
      stdout: io.stdout,
      stderr: io.stderr,
      editorClient: editor.client,
      waitMs: NEVER_ELAPSES_MS,
    });

    expect(code).toBe(1);
    expect(editor.posts).toEqual([]);
    expect(editor.consoles.length).toBe(0);
    expect(io.err()).toContain("no running Defold editor");
  });

  test("a quiet console within the window exits 0 without claiming success", async () => {
    const editor = makeEditor();
    const io = captureStreams();

    const code = await runReload({
      cwd: "/project",
      stdout: io.stdout,
      stderr: io.stderr,
      editorClient: editor.client,
      waitMs: SHORT_WINDOW_MS,
    });

    expect(code).toBe(0);
    expect(editor.posts).toEqual(["hot-reload"]);
    expect(io.out()).toContain("no error observed");
    expect(io.out()).not.toContain("reload succeeded");
  });

  test("an error header and its traceback are captured in order and exit 1", async () => {
    const editor = makeEditor({
      onConsole: (stream) => {
        stream.push("ERROR:SCRIPT: /main/main.script:12: attempt to index a nil value");
        stream.push("  stack traceback:");
        stream.end();
      },
    });
    const io = captureStreams();

    const code = await runReload({
      cwd: "/project",
      stdout: io.stdout,
      stderr: io.stderr,
      editorClient: editor.client,
      waitMs: NEVER_ELAPSES_MS,
    });

    expect(code).toBe(1);
    const header = io.err().indexOf("attempt to index a nil value");
    const traceback = io.err().indexOf("stack traceback:");
    expect(header).toBeGreaterThan(-1);
    expect(traceback).toBeGreaterThan(header);
  });

  test("info lines are filtered out and leave the reload quiet", async () => {
    const editor = makeEditor({
      onConsole: (stream) => {
        stream.push("INFO:DLIB: SSDP started");
        stream.push("DEBUG:SCRIPT: frame 1");
        stream.end();
      },
    });
    const io = captureStreams();

    const code = await runReload({
      cwd: "/project",
      stdout: io.stdout,
      stderr: io.stderr,
      editorClient: editor.client,
      waitMs: NEVER_ELAPSES_MS,
    });

    expect(code).toBe(0);
    expect(io.err()).not.toContain("SSDP started");
    expect(io.err()).not.toContain("frame 1");
  });

  test("a refused post releases the console without draining and exits 1", async () => {
    const editor = makeEditor({ outcome: "skipped" });
    const io = captureStreams();

    const code = await runReload({
      cwd: "/project",
      stdout: io.stdout,
      stderr: io.stderr,
      editorClient: editor.client,
      waitMs: NEVER_ELAPSES_MS,
    });

    expect(code).toBe(1);
    expect(editor.posts).toEqual(["hot-reload"]);
    await editor.consoles[0]?.released();
    expect(io.err()).toContain("refused");
  });

  test("--extensions posts reload-extensions instead of hot-reload", async () => {
    const editor = makeEditor();
    const io = captureStreams();

    await runReload({
      cwd: "/project",
      stdout: io.stdout,
      stderr: io.stderr,
      editorClient: editor.client,
      extensions: true,
      waitMs: SHORT_WINDOW_MS,
    });

    expect(editor.posts).toEqual(["reload-extensions"]);
  });

  test("a zero wait window posts without opening a console stream", async () => {
    const editor = makeEditor();
    const io = captureStreams();

    const code = await runReload({
      cwd: "/project",
      stdout: io.stdout,
      stderr: io.stderr,
      editorClient: editor.client,
      waitMs: 0,
    });

    expect(code).toBe(0);
    expect(editor.posts).toEqual(["hot-reload"]);
    expect(editor.consoles.length).toBe(0);
  });

  test("the window closes a live but quiet stream and releases its reader", async () => {
    const editor = makeEditor();
    const io = captureStreams();

    const code = await runReload({
      cwd: "/project",
      stdout: io.stdout,
      stderr: io.stderr,
      editorClient: editor.client,
      waitMs: SHORT_WINDOW_MS,
    });

    expect(code).toBe(0);
    await editor.consoles[0]?.released();
  });

  test("--json writes one result line carrying the outcome and captured errors", async () => {
    const editor = makeEditor({
      onConsole: (stream) => {
        stream.push("ERROR:SCRIPT: /main/main.script:12: boom");
        stream.end();
      },
    });
    const io = captureStreams();

    const code = await runReload({
      cwd: "/project",
      stdout: io.stdout,
      stderr: io.stderr,
      editorClient: editor.client,
      json: true,
      waitMs: NEVER_ELAPSES_MS,
    });

    expect(code).toBe(1);
    const lines = io.out().trim().split("\n");
    expect(lines.length).toBe(1);
    const payload = JSON.parse(lines[0] as string) as {
      command: string;
      ok: boolean;
      outcome: string;
      consoleErrors: string[];
    };
    expect(payload.command).toBe("reload");
    expect(payload.outcome).toBe("accepted");
    expect(payload.ok).toBe(false);
    expect(payload.consoleErrors.some((l) => l.includes("boom"))).toBe(true);
  });

  const UNOBSERVABLE = "console could not be opened";

  for (const behavior of ["absent", "null", "reject"] as const) {
    test(`a requested window whose console ${behavior} still posts, then exits 1 as unobserved`, async () => {
      const editor = makeEditor({ console: behavior });
      const io = captureStreams();

      const code = await runReload({
        cwd: "/project",
        stdout: io.stdout,
        stderr: io.stderr,
        editorClient: editor.client,
        waitMs: SHORT_WINDOW_MS,
      });

      expect(code).toBe(1);
      expect(editor.posts).toEqual(["hot-reload"]);
      expect(io.err()).toContain(UNOBSERVABLE);
      expect(io.out()).not.toContain("no error observed");
    });

    test(`--json marks the ${behavior} console unobserved while preserving the outcome`, async () => {
      const editor = makeEditor({ console: behavior });
      const io = captureStreams();

      const code = await runReload({
        cwd: "/project",
        stdout: io.stdout,
        stderr: io.stderr,
        editorClient: editor.client,
        json: true,
        waitMs: SHORT_WINDOW_MS,
      });

      expect(code).toBe(1);
      const lines = io.out().trim().split("\n");
      expect(lines.length).toBe(1);
      const payload = JSON.parse(lines[0] as string) as {
        ok: boolean;
        outcome: string;
        consoleObserved: boolean;
      };
      expect(payload.ok).toBe(false);
      expect(payload.outcome).toBe("accepted");
      expect(payload.consoleObserved).toBe(false);
    });
  }

  test("--wait 0 opts out of the console rather than failing on one that would reject", async () => {
    const editor = makeEditor({ console: "reject" });
    const io = captureStreams();

    const code = await runReload({
      cwd: "/project",
      stdout: io.stdout,
      stderr: io.stderr,
      editorClient: editor.client,
      json: true,
      waitMs: 0,
    });

    expect(code).toBe(0);
    expect(editor.posts).toEqual(["hot-reload"]);
    expect(editor.consoleCalls()).toBe(0);
    const payload = JSON.parse(io.out().trim()) as { ok: boolean; consoleObserved: boolean };
    expect(payload.ok).toBe(true);
    expect(payload.consoleObserved).toBe(false);
  });

  test("a quiet window that was actually read reports the console as observed", async () => {
    const editor = makeEditor();
    const io = captureStreams();

    const code = await runReload({
      cwd: "/project",
      stdout: io.stdout,
      stderr: io.stderr,
      editorClient: editor.client,
      json: true,
      waitMs: SHORT_WINDOW_MS,
    });

    expect(code).toBe(0);
    const payload = JSON.parse(io.out().trim()) as { ok: boolean; consoleObserved: boolean };
    expect(payload.ok).toBe(true);
    expect(payload.consoleObserved).toBe(true);
  });

  test("a refused post outranks an unopenable console", async () => {
    const editor = makeEditor({ outcome: "skipped", console: "null" });
    const io = captureStreams();

    const code = await runReload({
      cwd: "/project",
      stdout: io.stdout,
      stderr: io.stderr,
      editorClient: editor.client,
      waitMs: SHORT_WINDOW_MS,
    });

    expect(code).toBe(1);
    expect(io.err()).toContain("refused");
    expect(io.err()).not.toContain(UNOBSERVABLE);
  });

  test("a never-answering editor ends within the attach deadline without posting", async () => {
    const editor = makeEditor({ resolveNeverSettles: true });
    const io = captureStreams();

    const code = await runReload({
      cwd: "/project",
      stdout: io.stdout,
      stderr: io.stderr,
      editorClient: editor.client,
      waitMs: NEVER_ELAPSES_MS,
      attachTimeoutMs: SHORT_WINDOW_MS,
    });

    expect(code).toBe(1);
    expect(editor.posts).toEqual([]);
    expect(io.err()).toContain("no running Defold editor");
  });

  test("an attachment past the deadline is unobservable, and its late stream is released", async () => {
    const editor = makeEditor({ console: "deferred" });
    const io = captureStreams();

    const code = await runReload({
      cwd: "/project",
      stdout: io.stdout,
      stderr: io.stderr,
      editorClient: editor.client,
      waitMs: NEVER_ELAPSES_MS,
      attachTimeoutMs: SHORT_WINDOW_MS,
    });

    expect(code).toBe(1);
    expect(editor.posts).toEqual(["hot-reload"]);
    expect(io.err()).toContain(UNOBSERVABLE);

    await editor.settleConsole().released();
  });
});
