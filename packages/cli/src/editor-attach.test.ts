import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  EVAL_AUTH_SCHEME,
  EVAL_MULTI_RETURN_EXAMPLE,
  EVAL_NON_SUCCESS_STATUSES,
  EVAL_REQUEST_MEDIA_TYPE,
  EVAL_ROUTE,
  SPEC_BODY,
} from "../test/fixtures/editor-openapi";
import {
  consoleLines,
  consoleWatermark,
  type EditorResponse,
  type EditorTransport,
  evalEditor,
  hotReload,
  openConsoleStream,
  postCommand,
  readEditorPort,
  readEditorToken,
  resolveEditor,
} from "./editor-attach";

function tempProject(): string {
  return mkdtempSync(path.join(os.tmpdir(), "defold-typescript-editor-attach-"));
}

function writePortFile(cwd: string, contents: string): void {
  mkdirSync(path.join(cwd, ".internal"), { recursive: true });
  writeFileSync(path.join(cwd, ".internal", "editor.port"), contents);
}

function writeTokenFile(cwd: string, contents: string): void {
  mkdirSync(path.join(cwd, ".internal"), { recursive: true });
  writeFileSync(path.join(cwd, ".internal", "editor.token"), contents);
}

interface Call {
  readonly url: string;
  readonly method: string;
}

function recordingTransport(respond: (url: string) => EditorResponse): {
  readonly transport: EditorTransport;
  readonly calls: Call[];
} {
  const calls: Call[] = [];
  const transport: EditorTransport = async (url, init) => {
    calls.push({ url, method: init?.method ?? "GET" });
    return respond(url);
  };
  return { transport, calls };
}

function response(status: number, body = ""): EditorResponse {
  return { status, text: async () => body };
}

const rejectingTransport: EditorTransport = async () => {
  throw new Error("connect ECONNREFUSED 127.0.0.1:58433");
};

// Settles only on abort, so it can only complete if the signal actually reached
// the transport init -- a wiring assertion would pass on a forwarded-but-unused
// signal, this cannot.
const abortOnlyTransport: EditorTransport = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      reject(new DOMException("This operation was aborted", "AbortError"));
    });
  });

const DEFOLD_OPENAPI = JSON.stringify({ info: { title: "Defold Editor HTTP API" } });

async function* chunkStream(chunks: readonly string[]): AsyncIterable<string> {
  for (const chunk of chunks) yield chunk;
}

async function* failingStream(chunks: readonly string[]): AsyncIterable<string> {
  for (const chunk of chunks) yield chunk;
  throw new Error("socket hang up");
}

async function collect(lines: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const line of lines) out.push(line);
  return out;
}

describe("readEditorPort", () => {
  test("reads the port a running editor wrote", () => {
    const cwd = tempProject();
    writePortFile(cwd, "58433\n");
    expect(readEditorPort(cwd)).toBe(58433);
  });

  test("returns null when the editor exited and removed its port file", () => {
    expect(readEditorPort(tempProject())).toBeNull();
  });

  test("returns null for an empty or non-numeric port file", () => {
    const empty = tempProject();
    writePortFile(empty, "");
    expect(readEditorPort(empty)).toBeNull();

    const garbage = tempProject();
    writePortFile(garbage, "not-a-port");
    expect(readEditorPort(garbage)).toBeNull();
  });
});

describe("resolveEditor", () => {
  test("returns the endpoint when the probe reports a Defold editor", async () => {
    const cwd = tempProject();
    writePortFile(cwd, "58433");
    const { transport, calls } = recordingTransport(() => response(200, DEFOLD_OPENAPI));

    expect(await resolveEditor(cwd, transport)).toEqual({ baseUrl: "http://localhost:58433" });
    expect(calls).toEqual([{ url: "http://localhost:58433/openapi.json", method: "GET" }]);
  });

  test("returns null when the port was reused by an unrelated local process", async () => {
    const cwd = tempProject();
    writePortFile(cwd, "58433");
    const { transport } = recordingTransport(() =>
      response(200, JSON.stringify({ info: { title: "Some Other Local Service" } })),
    );

    expect(await resolveEditor(cwd, transport)).toBeNull();
  });

  test("returns null when nothing is listening on the port", async () => {
    const cwd = tempProject();
    writePortFile(cwd, "58433");

    expect(await resolveEditor(cwd, rejectingTransport)).toBeNull();
  });

  test("returns null without probing when there is no port file", async () => {
    const { transport, calls } = recordingTransport(() => response(200, DEFOLD_OPENAPI));

    expect(await resolveEditor(tempProject(), transport)).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe("hotReload", () => {
  test("maps 202 to accepted", async () => {
    const cwd = tempProject();
    writePortFile(cwd, "58433");
    const { transport, calls } = recordingTransport(() => response(202));

    expect(await hotReload(cwd, transport)).toBe("accepted");
    expect(calls).toEqual([{ url: "http://localhost:58433/command/hot-reload", method: "POST" }]);
  });

  test("maps 403 to skipped: no game running, or nothing dirty", async () => {
    const cwd = tempProject();
    writePortFile(cwd, "58433");
    const { transport } = recordingTransport(() => response(403));

    expect(await hotReload(cwd, transport)).toBe("skipped");
  });

  test("maps any other status to unavailable", async () => {
    const cwd = tempProject();
    writePortFile(cwd, "58433");
    const { transport } = recordingTransport(() => response(500));

    expect(await hotReload(cwd, transport)).toBe("unavailable");
  });

  test("maps a transport rejection to unavailable", async () => {
    const cwd = tempProject();
    writePortFile(cwd, "58433");

    expect(await hotReload(cwd, rejectingTransport)).toBe("unavailable");
  });

  test("posts nothing at all when there is no port file", async () => {
    const { transport, calls } = recordingTransport(() => response(202));

    expect(await hotReload(tempProject(), transport)).toBe("unavailable");
    expect(calls).toEqual([]);
  });

  test("re-reads the port on every call, so a restarted editor is reached", async () => {
    const cwd = tempProject();
    writePortFile(cwd, "58433");
    const { transport, calls } = recordingTransport(() => response(202));

    await hotReload(cwd, transport);
    writePortFile(cwd, "56483");
    await hotReload(cwd, transport);

    expect(calls.map((c) => c.url)).toEqual([
      "http://localhost:58433/command/hot-reload",
      "http://localhost:56483/command/hot-reload",
    ]);
  });
});

describe("postCommand", () => {
  test("targets /command/<name> so any editor command is reachable", async () => {
    const cwd = tempProject();
    writePortFile(cwd, "58433");
    const { transport, calls } = recordingTransport(() => response(202));

    expect(await postCommand(cwd, "reload-extensions", transport)).toBe("accepted");
    expect(calls).toEqual([
      { url: "http://localhost:58433/command/reload-extensions", method: "POST" },
    ]);
  });

  test("a caller that aborts abandons a post the editor never answers", async () => {
    const cwd = tempProject();
    writePortFile(cwd, "58433");
    const controller = new AbortController();

    const outcome = postCommand(cwd, "hot-reload", abortOnlyTransport, controller.signal);
    controller.abort();

    expect(await outcome).toBe("unavailable");
  });

  test("a signal that never aborts leaves the ordinary outcome alone", async () => {
    const cwd = tempProject();
    writePortFile(cwd, "58433");
    const { transport } = recordingTransport(() => response(202));

    const outcome = await postCommand(cwd, "hot-reload", transport, new AbortController().signal);

    expect(outcome).toBe("accepted");
  });
});

describe("consoleWatermark", () => {
  const endpoint = { baseUrl: "http://localhost:58433" };

  test("counts the console lines the editor has already recorded", async () => {
    const { transport, calls } = recordingTransport(() =>
      response(200, JSON.stringify({ lines: ["one", "two", "three"] })),
    );

    expect(await consoleWatermark(endpoint, transport)).toBe(3);
    expect(calls).toEqual([{ url: "http://localhost:58433/console", method: "GET" }]);
  });

  test("returns 0 when the editor went away, so live output is never suppressed", async () => {
    expect(await consoleWatermark(endpoint, rejectingTransport)).toBe(0);
  });

  test("returns 0 for a non-OK status or an unreadable body", async () => {
    const { transport: failed } = recordingTransport(() => response(500));
    expect(await consoleWatermark(endpoint, failed)).toBe(0);

    const { transport: garbage } = recordingTransport(() => response(200, "<html>"));
    expect(await consoleWatermark(endpoint, garbage)).toBe(0);
  });
});

describe("openConsoleStream", () => {
  const endpoint = { baseUrl: "http://localhost:58433" };

  test("opens /console/stream and hands back the response body", async () => {
    const body = chunkStream(["live\n"]);
    const { transport, calls } = recordingTransport(() => ({
      status: 200,
      text: async () => "",
      body,
    }));

    expect(await openConsoleStream(endpoint, transport)).toBe(body);
    expect(calls).toEqual([{ url: "http://localhost:58433/console/stream", method: "GET" }]);
  });

  test("returns null when the stream cannot be opened", async () => {
    expect(await openConsoleStream(endpoint, rejectingTransport)).toBeNull();
  });
});

describe("consoleLines", () => {
  test("drops the replayed history prefix and keeps the live tail", async () => {
    const stream = chunkStream(["old-1\nold-2\nlive-1\nlive-2\n"]);

    expect(await collect(consoleLines(stream, 2))).toEqual(["live-1", "live-2"]);
  });

  test("yields every line at a watermark of 0", async () => {
    const stream = chunkStream(["first\nsecond\n"]);

    expect(await collect(consoleLines(stream, 0))).toEqual(["first", "second"]);
  });

  test("reassembles lines split across chunk boundaries, including an unterminated tail", async () => {
    const stream = chunkStream(["hel", "lo\nwor", "ld"]);

    expect(await collect(consoleLines(stream, 0))).toEqual(["hello", "world"]);
  });

  test("decodes byte chunks, including a multi-byte character split across them", async () => {
    const bytes = new TextEncoder().encode("héllo\n");
    async function* split(): AsyncIterable<Uint8Array> {
      yield bytes.slice(0, 2);
      yield bytes.slice(2);
    }

    expect(await collect(consoleLines(split(), 0))).toEqual(["héllo"]);
  });

  test("ends normally when the editor quits mid-watch", async () => {
    const stream = failingStream(["live-1\nlive-2\n"]);

    expect(await collect(consoleLines(stream, 0))).toEqual(["live-1", "live-2"]);
  });

  test("ends normally on an empty stream", async () => {
    expect(await collect(consoleLines(chunkStream([]), 3))).toEqual([]);
  });
});

describe("readEditorToken", () => {
  test("reads the per-session token a running editor wrote", () => {
    const cwd = tempProject();
    writeTokenFile(cwd, "6ee9f0b3-3f5e-4a1e-9a0f-2c7d4b8e1a55\n");
    expect(readEditorToken(cwd)).toBe("6ee9f0b3-3f5e-4a1e-9a0f-2c7d4b8e1a55");
  });

  test("returns null when the editor exited and removed its token file", () => {
    expect(readEditorToken(tempProject())).toBeNull();
  });

  test("returns null for an empty or whitespace-only token file", () => {
    const empty = tempProject();
    writeTokenFile(empty, "");
    expect(readEditorToken(empty)).toBeNull();

    const blank = tempProject();
    writeTokenFile(blank, "  \n\t\n");
    expect(readEditorToken(blank)).toBeNull();
  });
});

const TOKEN = "6ee9f0b3-3f5e-4a1e-9a0f-2c7d4b8e1a55";

interface EvalCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>> | undefined;
  readonly body: string | undefined;
}

function evalTransport(evalResponse: EditorResponse | (() => EditorResponse)): {
  readonly transport: EditorTransport;
  readonly calls: EvalCall[];
} {
  const calls: EvalCall[] = [];
  const transport: EditorTransport = async (url, init) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      headers: init?.headers,
      body: init?.body,
    });
    if (url.endsWith("/openapi.json")) return response(200, SPEC_BODY);
    return typeof evalResponse === "function" ? evalResponse() : evalResponse;
  };
  return { transport, calls };
}

function readyProject(): string {
  const cwd = tempProject();
  writePortFile(cwd, "58433");
  writeTokenFile(cwd, `${TOKEN}\n`);
  return cwd;
}

describe("evalEditor", () => {
  test("never touches the network when no editor is open on this project", async () => {
    const { transport, calls } = evalTransport(response(200, "=> 1.13.1\n"));

    expect(await evalEditor(tempProject(), "return editor.version", transport)).toBeNull();
    expect(calls).toEqual([]);
  });

  test("sends the request the editor's own spec describes and resolves the returned value", async () => {
    const cwd = readyProject();
    const { transport, calls } = evalTransport(response(200, "=> 1.13.1\n"));

    expect(await evalEditor(cwd, "return editor.version", transport)).toBe("1.13.1");
    expect(calls).toEqual([
      {
        url: "http://localhost:58433/openapi.json",
        method: "GET",
        headers: undefined,
        body: undefined,
      },
      {
        url: `http://localhost:58433${EVAL_ROUTE}`,
        method: "POST",
        headers: {
          Authorization: `${EVAL_AUTH_SCHEME.replace(/^./, (c) => c.toUpperCase())} ${TOKEN}`,
          "Content-Type": EVAL_REQUEST_MEDIA_TYPE,
        },
        body: "return editor.version",
      },
    ]);
  });

  test("resolves null when the port belongs to an unrelated local process", async () => {
    const cwd = readyProject();
    const calls: string[] = [];
    const transport: EditorTransport = async (url) => {
      calls.push(url);
      return response(200, JSON.stringify({ info: { title: "Some Other Local Service" } }));
    };

    expect(await evalEditor(cwd, "return editor.version", transport)).toBeNull();
    expect(calls).toEqual(["http://localhost:58433/openapi.json"]);
  });

  test("resolves null without posting when the token file is gone", async () => {
    const cwd = tempProject();
    writePortFile(cwd, "58433");
    const { transport, calls } = evalTransport(response(200, "=> 1.13.1\n"));

    expect(await evalEditor(cwd, "return editor.version", transport)).toBeNull();
    expect(calls.map((call) => call.url)).toEqual(["http://localhost:58433/openapi.json"]);
  });

  test("resolves null for the non-success statuses the spec documents", async () => {
    for (const status of EVAL_NON_SUCCESS_STATUSES) {
      const cwd = readyProject();
      const { transport } = evalTransport(response(status, "eval:1 boom\n"));

      expect(await evalEditor(cwd, "return editor.version", transport)).toBeNull();
    }
  });

  test("resolves null when a 200 body returned nothing at all", async () => {
    const cwd = readyProject();
    const { transport } = evalTransport(response(200, "hi\n"));

    expect(await evalEditor(cwd, 'print("hi")', transport)).toBeNull();
  });

  test("resolves null for the spec's own multi-value example", async () => {
    const cwd = readyProject();
    const { transport } = evalTransport(response(200, EVAL_MULTI_RETURN_EXAMPLE));

    expect(EVAL_MULTI_RETURN_EXAMPLE).toContain("=> ");
    expect(await evalEditor(cwd, "print('hi') return 1, 2", transport)).toBeNull();
  });

  test("resolves null when nothing is listening on the port", async () => {
    expect(
      await evalEditor(readyProject(), "return editor.version", rejectingTransport),
    ).toBeNull();
  });

  test("resolves null when the caller aborts mid-flight", async () => {
    const cwd = readyProject();
    const controller = new AbortController();
    const pending = evalEditor(cwd, "return editor.version", abortOnlyTransport, controller.signal);
    controller.abort();

    expect(await pending).toBeNull();
  });
});
