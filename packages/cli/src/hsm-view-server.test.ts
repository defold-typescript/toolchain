import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  watch,
  writeFileSync,
} from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { requireHsmSourceDir } from "@defold-typescript/transpiler";
import {
  createHsmViewApp,
  type HsmViewIndex,
  serveHsmView,
  type WatchPath,
} from "./hsm-view-server";
import { createSession, type HsmViewSession } from "./hsm-view-session";
import { lineStarts, tokenizeLines } from "./hsm-view-tokens";

const hsmSourceDir = requireHsmSourceDir();
const client = { js: "/*js*/", css: "/*css*/" };

const LAMP = `import { defineMachine } from "@defold-typescript/types/hsm";
import { OFF } from "./shared/names";
export const lamp = defineMachine("lamp")({
  initial: OFF,
  states: {
    off: { on: { TOGGLE: "/on" } },
    on: { on: { TOGGLE: "/off" } },
  },
});
`;

const NAMES = `export const OFF = "/off";
`;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "hsm-view-server-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(rel: string, text: string): string {
  const file = path.join(dir, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}

function lampSession(): HsmViewSession {
  write("shared/names.ts", NAMES);
  return createSession({ file: write("main.ts", LAMP), hsmSourceDir });
}

function post(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

describe("createHsmViewApp", () => {
  test("serves a self-contained page that inlines the client", async () => {
    const app = createHsmViewApp({ session: lampSession(), client });
    const response = await app.request("/");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("/*js*/");
    expect(html).toContain("/*css*/");
    expect(html).toContain('id="root"');
    expect(html).not.toContain("<link");
    expect(html).not.toContain("<script src");
  });

  test("escapes a closing script tag inside the client", async () => {
    const app = createHsmViewApp({
      session: lampSession(),
      client: { js: 'const s = "</script><b>";', css: "" },
    });
    const html = await (await app.request("/")).text();
    expect(html.match(/<\/script/gi)).toHaveLength(1);
  });

  test("returns the index with files relative to the entry folder and colored lines", async () => {
    const session = lampSession();
    const app = createHsmViewApp({ session, client });
    const response = await app.request("/api/index");
    expect(response.status).toBe(200);
    const body = (await response.json()) as HsmViewIndex;
    const index = session.index();
    expect(body.machines).toEqual(["lamp"]);
    expect(body.picked).toBe("lamp");
    expect(body.files).toEqual([
      { path: "main.ts", lines: tokenizeLines(LAMP), starts: lineStarts(LAMP) },
      { path: "shared/names.ts", lines: tokenizeLines(NAMES), starts: lineStarts(NAMES) },
    ]);
    expect(body.states).toEqual(index.states);
    expect(body.onKeys).toEqual(index.onKeys);
    expect(body.rules).toEqual(index.rules);
  });

  test("drives the session through every control route", async () => {
    const app = createHsmViewApp({ session: lampSession(), client });
    const json = async (route: string, body?: unknown) => {
      const response = await app.request(route, body === undefined ? undefined : post(body));
      expect(response.status).toBe(200);
      return response.json();
    };

    expect(await json("/api/start", { ctx: { n: 1, o: { a: 1 } } })).toMatchObject({
      running: true,
      path: "/off",
    });
    expect(await json("/api/send", { event: { type: "TOGGLE" } })).toMatchObject({
      path: "/on",
      fired: ["/off|on|TOGGLE|0"],
    });
    expect(await json("/api/update", { dt: 0.5 })).toMatchObject({ t: 0.5, path: "/on" });
    expect(await json("/api/edit", { path: ["n"], value: 2 })).toMatchObject({
      ctx: { n: 2, o: { a: 1 } },
    });
    expect(await json("/api/snapshot")).toMatchObject({ t: 0.5, ctx: { n: 2 } });
    expect(await json("/api/pick", { name: "lamp" })).toMatchObject({
      picked: "lamp",
      running: true,
      path: "/off",
      ctx: { n: 1 },
    });
  });

  test("answers a malformed request with 400 and a session error with its snapshot", async () => {
    const app = createHsmViewApp({ session: lampSession(), client });
    const status = async (route: string, body: unknown) => {
      const response = await app.request(route, post(body));
      return { status: response.status, body: await response.json() };
    };

    expect(await status("/api/start", "{not json")).toMatchObject({
      status: 400,
      body: { error: expect.any(String) },
    });
    expect(await status("/api/start", {})).toMatchObject({ status: 400 });
    expect(await status("/api/send", { event: { kind: "TOGGLE" } })).toMatchObject({
      status: 400,
    });
    expect(await status("/api/update", { dt: "1" })).toMatchObject({ status: 400 });
    expect(await status("/api/edit", { path: "n", value: 2 })).toMatchObject({ status: 400 });
    expect(await status("/api/pick", { name: 3 })).toMatchObject({ status: 400 });

    await status("/api/start", { ctx: { n: 1, o: { a: 1 } } });
    expect(await status("/api/edit", { path: ["o"], value: 2 })).toMatchObject({
      status: 200,
      body: { error: "ctx path is not a primitive: o", ctx: { o: { a: 1 } } },
    });

    expect((await app.request("/api/nope")).status).toBe(404);
  });
});

interface SseEvent {
  readonly event: string;
  readonly data: unknown;
}

function readEvents(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const queued: SseEvent[] = [];

  const parse = (block: string): SseEvent | undefined => {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        data.push(line.slice(5).trimStart());
      }
    }
    return data.length === 0 ? undefined : { event, data: JSON.parse(data.join("\n")) };
  };

  const next = async (name: string, timeoutMs = 2000): Promise<SseEvent> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const index = queued.findIndex((item) => item.event === name);
      if (index !== -1) {
        return queued.splice(index, 1)[0] as SseEvent;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(`no ${name} event within ${timeoutMs} ms`);
      }
      const chunk = await Promise.race([
        reader.read(),
        new Promise<undefined>((resolve) => setTimeout(resolve, remaining)),
      ]);
      if (chunk === undefined) {
        continue;
      }
      if (chunk.done) {
        throw new Error("event stream closed");
      }
      buffer += decoder.decode(chunk.value, { stream: true });
      let end = buffer.indexOf("\n\n");
      while (end !== -1) {
        const parsed = parse(buffer.slice(0, end));
        if (parsed !== undefined) {
          queued.push(parsed);
        }
        buffer = buffer.slice(end + 2);
        end = buffer.indexOf("\n\n");
      }
    }
  };

  return { next, cancel: () => reader.cancel() };
}

describe("serveHsmView", () => {
  let server: Awaited<ReturnType<typeof serveHsmView>> | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  async function openEvents(url: string) {
    const response = await fetch(`${url}/api/events`);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const events = readEvents(response.body as ReadableStream<Uint8Array>);
    await events.next("ready");
    return events;
  }

  async function mainText(url: string): Promise<string> {
    const index = (await (await fetch(`${url}/api/index`)).json()) as HsmViewIndex;
    const main = index.files.find((file) => file.path === "main.ts");
    return (main?.lines ?? []).map((line) => line.map((run) => run.text).join("")).join("\n");
  }

  test("listens on 127.0.0.1 and pushes a reload after the machine file changes", async () => {
    server = await serveHsmView({ session: lampSession(), client, port: 0 });
    expect(new URL(server.url).hostname).toBe("127.0.0.1");
    const events = await openEvents(server.url);

    const edited = LAMP.replace('"/on" } },\n    on', '"/on" } },\n    // edited\n    on');
    write("main.ts", edited);
    const reload = await events.next("reload");
    expect(reload.data).toMatchObject({ ok: true, snapshot: { picked: "lamp" } });
    expect(await mainText(server.url)).toBe(edited);
    await events.cancel();
  });

  test("reports a failed reload and keeps the last good source", async () => {
    server = await serveHsmView({ session: lampSession(), client, port: 0 });
    const events = await openEvents(server.url);

    write("main.ts", `${LAMP}export const broken = ;\n`);
    const reload = await events.next("reload");
    expect(reload.data).toMatchObject({ ok: false, error: expect.stringContaining("main.ts") });
    expect(await mainText(server.url)).toBe(LAMP);
    await events.cancel();
  });

  test("starts watching a file the edit newly imports", async () => {
    server = await serveHsmView({ session: lampSession(), client, port: 0 });
    const events = await openEvents(server.url);

    write("extra.ts", "export const EXTRA = 1;\n");
    write("main.ts", `import { EXTRA } from "./extra";\n${LAMP}export const extra = EXTRA;\n`);
    expect((await events.next("reload")).data).toMatchObject({ ok: true });

    write("extra.ts", "export const EXTRA = ;\n");
    const reload = await events.next("reload");
    expect(reload.data).toMatchObject({ ok: false, error: expect.stringContaining("extra.ts") });
    await events.cancel();
  });

  test("recovers when a deleted import comes back", async () => {
    server = await serveHsmView({ session: lampSession(), client, port: 0 });
    const events = await openEvents(server.url);

    rmSync(path.join(dir, "shared/names.ts"));
    expect((await events.next("reload")).data).toMatchObject({ ok: false });

    write("shared/names.ts", NAMES);
    expect((await events.next("reload")).data).toMatchObject({ ok: true });

    write("shared/names.ts", "export const OFF = ;\n");
    const reload = await events.next("reload");
    expect(reload.data).toMatchObject({ ok: false, error: expect.stringContaining("names.ts") });
    await events.cancel();
  });

  test("recovers when the deleted file's folder comes back", async () => {
    server = await serveHsmView({ session: lampSession(), client, port: 0 });
    const events = await openEvents(server.url);

    // Once a session has loaded, Bun's watcher on a file reports no event when its whole
    // folder is removed, so saving the entry file is what brings the loss to the server.
    rmSync(path.join(dir, "shared"), { recursive: true });
    write("main.ts", LAMP);
    expect((await events.next("reload")).data).toMatchObject({ ok: false });

    write("shared/names.ts", NAMES);
    const deadline = Date.now() + 2000;
    let recovered = false;
    while (!recovered) {
      const reload = await events.next("reload", Math.max(1, deadline - Date.now()));
      recovered = (reload.data as { ok: boolean }).ok;
    }
    expect(recovered).toBe(true);
    await events.cancel();
  });

  test("reloads when the missing file's folder appears before its watcher opens", async () => {
    let armed = false;
    // Only the fallback watchers open folders, so the first folder watched once armed is the
    // nearest folder chosen for the missing import; creating `shared/` before it opens means
    // that watcher never sees it.
    const watchPath: WatchPath = (target, listener) => {
      if (armed && existsSync(target) && statSync(target).isDirectory()) {
        armed = false;
        mkdirSync(path.join(dir, "shared"));
        // A folder watcher on macOS still reports a change made a few milliseconds before it
        // opened; waiting past that window makes the missed event as real as on Linux.
        Bun.sleepSync(250);
      }
      return watch(target, listener);
    };
    server = await serveHsmView({ session: lampSession(), client, port: 0, watchPath });
    const events = await openEvents(server.url);

    rmSync(path.join(dir, "shared"), { recursive: true });
    armed = true;
    write("main.ts", LAMP);
    expect((await events.next("reload")).data).toMatchObject({ ok: false });
    expect((await events.next("reload")).data).toMatchObject({ ok: false });

    write("shared/names.ts", NAMES);
    const deadline = Date.now() + 2000;
    let recovered = false;
    while (!recovered) {
      const reload = await events.next("reload", Math.max(1, deadline - Date.now()));
      recovered = (reload.data as { ok: boolean }).ok;
    }
    expect(recovered).toBe(true);
    await events.cancel();
  });
});
