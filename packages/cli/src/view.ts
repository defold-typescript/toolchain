import { existsSync, statSync } from "node:fs";
import * as path from "node:path";
import { ECS_LIBRARY, HSM_LIBRARY, requireLibrarySourceDir } from "@defold-typescript/transpiler";
import { consoleLines, openConsoleStream, resolveEditor } from "./editor-attach";
import { loadClientAssets } from "./hsm-view-client-assets";
import type { ClientAssets } from "./hsm-view-page";
import {
  type HsmViewServer,
  type HsmViewTab,
  type ServeHsmViewOptions,
  serveHsmView,
} from "./hsm-view-server";
import { createSession, type HsmViewSession } from "./hsm-view-session";
import { renderResult } from "./json-output";

export const VIEW_USAGE = "defold-typescript view <file> [name]";

const EDITOR_RETRY_MS = 2000;

export interface RunViewOptions {
  readonly cwd: string;
  readonly file: string | undefined;
  readonly name?: string;
  readonly json: boolean;
  readonly io: { readonly stdout: NodeJS.WritableStream };
  readonly writeError: (message: string) => void;
  /** Settles when the viewer should shut down; by default on SIGINT or SIGTERM. */
  readonly stopped?: Promise<void>;
  readonly client?: () => ClientAssets;
  readonly serve?: (options: ServeHsmViewOptions) => Promise<HsmViewServer>;
}

function messageOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

function untilSignal(): Promise<void> {
  return new Promise((resolve) => {
    const stop = (): void => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      resolve();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const done = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done);
  });
}

/**
 * Every line of the editor console from its first, so an attach made mid-run still learns each
 * instance's last state. A missing editor or a closed stream is retried, never an error.
 */
async function* followEditorConsole(cwd: string, signal: AbortSignal): AsyncGenerator<string> {
  while (!signal.aborted) {
    const endpoint = await resolveEditor(cwd, undefined, signal);
    const chunks = endpoint === null ? null : await openConsoleStream(endpoint, undefined, signal);
    if (chunks !== null) {
      yield* consoleLines(chunks, 0);
    }
    await pause(EDITOR_RETRY_MS, signal);
  }
}

function listed(names: readonly string[]): string {
  return names.length === 0 ? "none" : names.join(", ");
}

/**
 * Picks every machine and world called `name` and returns the tab the page opens on: Machines when
 * a machine matched or the file creates no world, else Worlds, since a world drives the run.
 */
function pickOpening(
  session: HsmViewSession,
  file: string,
  name: string | undefined,
): HsmViewTab | { readonly error: string } {
  const { machines, worlds } = session.snapshot();
  if (name === undefined) {
    return worlds.length === 0 ? "machines" : "worlds";
  }
  const machine = machines.includes(name);
  const world = worlds.includes(name);
  if (!machine && !world) {
    return {
      error: `no machine or world named "${name}" in ${file}; machines: ${listed(machines)}; worlds: ${listed(worlds)}`,
    };
  }
  if (machine) {
    session.pick(name);
  }
  if (world) {
    session.pickWorld(name);
  }
  return machine ? "machines" : "worlds";
}

/** Serves the viewer for `file` until stopped; every reason it cannot start is one exit 1. */
export async function runView(options: RunViewOptions): Promise<number> {
  const { json, io } = options;
  const fail = (message: string): number => {
    if (json) {
      io.stdout.write(renderResult({ command: "view", error: message }));
    } else {
      options.writeError(`defold-typescript view: ${message}`);
    }
    return 1;
  };

  if (options.file === undefined) {
    return fail(`pass a file; usage: ${VIEW_USAGE}`);
  }
  const file = path.resolve(options.cwd, options.file);
  if (!existsSync(file) || !statSync(file).isFile()) {
    return fail(`${file} does not exist`);
  }

  let session: ReturnType<typeof createSession>;
  let client: ClientAssets;
  try {
    session = createSession({
      file,
      hsmSourceDir: requireLibrarySourceDir(HSM_LIBRARY),
      ecsSourceDir: requireLibrarySourceDir(ECS_LIBRARY),
    });
    client = (options.client ?? loadClientAssets)();
  } catch (thrown) {
    return fail(messageOf(thrown));
  }

  const tab = pickOpening(session, file, options.name);
  if (typeof tab !== "string") {
    return fail(tab.error);
  }

  let server: HsmViewServer;
  try {
    server = await (options.serve ?? serveHsmView)({
      session,
      client,
      port: 0,
      opening: { tab },
      follow: (signal) => followEditorConsole(options.cwd, signal),
    });
  } catch (thrown) {
    return fail(`could not start the viewer: ${messageOf(thrown)}`);
  }
  if (json) {
    const { picked, world } = session.snapshot();
    io.stdout.write(
      renderResult({
        command: "view",
        ...(picked === undefined ? {} : { machine: picked }),
        ...(world === undefined ? {} : { world }),
        url: server.url,
      }),
    );
  } else {
    io.stdout.write(`view: ${file} at ${server.url} (Ctrl+C stops)\n`);
  }
  await (options.stopped ?? untilSignal());
  await server.close();
  return 0;
}
