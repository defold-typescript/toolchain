import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  consoleLines,
  consoleWatermark,
  type EditorResponse,
  type EditorTransport,
  hotReload,
  openConsoleStream,
  postCommand,
  readEditorPort,
  resolveEditor,
} from "./editor-attach";

function tempProject(): string {
  return mkdtempSync(path.join(os.tmpdir(), "defold-typescript-editor-attach-"));
}

function writePortFile(cwd: string, contents: string): void {
  mkdirSync(path.join(cwd, ".internal"), { recursive: true });
  writeFileSync(path.join(cwd, ".internal", "editor.port"), contents);
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
