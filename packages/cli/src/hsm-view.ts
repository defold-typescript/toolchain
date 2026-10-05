import { existsSync, statSync } from "node:fs";
import * as path from "node:path";
import { requireHsmSourceDir } from "@defold-typescript/transpiler";
import { loadClientAssets } from "./hsm-view-client-assets";
import type { ClientAssets } from "./hsm-view-page";
import { type HsmViewServer, type ServeHsmViewOptions, serveHsmView } from "./hsm-view-server";
import { createSession } from "./hsm-view-session";
import { renderResult } from "./json-output";

export const HSM_VIEW_USAGE = "defold-typescript hsm-view <file> [name]";

export interface RunHsmViewOptions {
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

/** Serves the viewer for `file` until stopped; every reason it cannot start is one exit 1. */
export async function runHsmView(options: RunHsmViewOptions): Promise<number> {
  const { json, io } = options;
  const fail = (message: string): number => {
    if (json) {
      io.stdout.write(renderResult({ command: "hsm-view", error: message }));
    } else {
      options.writeError(`defold-typescript hsm-view: ${message}`);
    }
    return 1;
  };

  if (options.file === undefined) {
    return fail(`pass a file; usage: ${HSM_VIEW_USAGE}`);
  }
  const file = path.resolve(options.cwd, options.file);
  if (!existsSync(file) || !statSync(file).isFile()) {
    return fail(`${file} does not exist`);
  }

  let session: ReturnType<typeof createSession>;
  let client: ClientAssets;
  try {
    session = createSession({ file, hsmSourceDir: requireHsmSourceDir() });
    client = (options.client ?? loadClientAssets)();
  } catch (thrown) {
    return fail(messageOf(thrown));
  }

  const { machines } = session.snapshot();
  const [first] = machines;
  if (first === undefined) {
    return fail(`${file} defines no machine`);
  }
  if (options.name !== undefined) {
    if (!machines.includes(options.name)) {
      return fail(
        `no machine named "${options.name}" in ${file}; machines: ${machines.join(", ")}`,
      );
    }
    session.pick(options.name);
  }
  const machine = options.name ?? first;

  let server: HsmViewServer;
  try {
    server = await (options.serve ?? serveHsmView)({
      session,
      client,
      port: 0,
      title: path.basename(file),
    });
  } catch (thrown) {
    return fail(`could not start the viewer: ${messageOf(thrown)}`);
  }
  if (json) {
    io.stdout.write(renderResult({ command: "hsm-view", machine, url: server.url }));
  } else {
    io.stdout.write(`hsm-view: ${file} at ${server.url} (Ctrl+C stops)\n`);
  }
  await (options.stopped ?? untilSignal());
  await server.close();
  return 0;
}
