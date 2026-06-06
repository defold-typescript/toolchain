import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import type { RegistryTarget } from "./api-registry";
import { CURRENT_STABLE_SURFACE_ID, selectApiSurface } from "./api-surface";
import {
  type DefoldIo,
  defaultDefoldIo,
  isDefoldSubcommand,
  runDefoldCommand,
} from "./bob-command";
import { runBuild } from "./build";
import { readCliVersion } from "./cli-version";
import { readDefoldVersionPin, resolveDefoldVersion } from "./defold-version";
import { runInit } from "./init";
import { installHint } from "./install-reminder";
import { renderResult } from "./json-output";
import {
  ensureMaterializedReference,
  materializeApiSurface,
  materializeRefDocSurface,
  type RefDocResolveOptions,
  resolveCurrentSurfaceGeneratedDir,
} from "./materialize";
import { detectScriptKinds, selectScriptKind } from "./script-kind";
import { runSetupDebug } from "./setup-debug";
import {
  type RunWatchHandle,
  type RunWatchOptions,
  recursiveWatcherFactory,
  runWatch,
  type WatcherFactory,
} from "./watch";

export interface DispatchIo {
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
}

export interface DispatchInternals {
  readonly watcherFactory?: WatcherFactory;
  readonly componentWatcherFactory?: WatcherFactory;
  readonly debounceMs?: number;
  readonly onWatchStart?: (handle: RunWatchHandle) => void;
  readonly sourceGeneratedDir?: string;
  readonly resolveOpts?: RefDocResolveOptions;
  readonly refDocRegistry?: readonly RegistryTarget[];
  readonly cliVersion?: string;
  readonly defoldIo?: Partial<DefoldIo>;
}

const USAGE = "Usage: defold-typescript <init|build|watch|setup-debug|defold> [path]\n";
const DEFOLD_USAGE = "Usage: defold-typescript defold <resolve|build|bundle> [path]\n";

function parseDefoldVersionFlag(argv: string[]): { flag: string | undefined; rest: string[] } {
  let flag: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--defold-version") {
      flag = argv[i + 1];
      i++;
    } else if (arg?.startsWith("--defold-version=")) {
      flag = arg.slice("--defold-version=".length);
    } else if (arg !== undefined) {
      rest.push(arg);
    }
  }
  return { flag, rest };
}

function parseScriptFlag(argv: string[]): { script: string | undefined; rest: string[] } {
  let script: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--script") {
      script = argv[i + 1];
      i++;
    } else if (arg?.startsWith("--script=")) {
      script = arg.slice("--script=".length);
    } else if (arg !== undefined) {
      rest.push(arg);
    }
  }
  return { script, rest };
}

function parseValueFlag(
  argv: string[],
  name: string,
): { value: string | undefined; rest: string[] } {
  const long = `--${name}`;
  const eq = `${long}=`;
  let value: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === long) {
      value = argv[i + 1];
      i++;
    } else if (arg?.startsWith(eq)) {
      value = arg.slice(eq.length);
    } else if (arg !== undefined) {
      rest.push(arg);
    }
  }
  return { value, rest };
}

function readProjectPin(cwd: string): string | undefined {
  const pkgPath = path.join(cwd, "package.json");
  if (!existsSync(pkgPath)) {
    return undefined;
  }
  try {
    return readDefoldVersionPin(JSON.parse(readFileSync(pkgPath, "utf8")));
  } catch {
    return undefined;
  }
}

export function dispatch(
  argv: string[],
  io: DispatchIo,
  internals?: DispatchInternals,
): number | Promise<number> {
  const json = argv.includes("--json");

  if (argv.includes("--version") || argv.includes("-v")) {
    const version = internals?.cliVersion ?? readCliVersion();
    io.stdout.write(
      json
        ? `{"command":"version","ok":true,"version":${JSON.stringify(version)}}\n`
        : `defold-typescript ${version}\n`,
    );
    return 0;
  }

  const force = argv.includes("--force");
  const suppressInstallReminder = argv.includes("--suppress-install-reminder");
  const { flag: defoldVersionFlag, rest: afterVersionArgs } = parseDefoldVersionFlag(argv);
  const { script: scriptFlag, rest: afterScriptArgs } = parseScriptFlag(afterVersionArgs);
  const { value: javaFlag, rest: afterJavaArgs } = parseValueFlag(afterScriptArgs, "java");
  const { value: buildServerFlag, rest: nonFlagArgs } = parseValueFlag(
    afterJavaArgs,
    "build-server",
  );
  const positional = nonFlagArgs.filter(
    (a) => a !== "--json" && a !== "--force" && a !== "--suppress-install-reminder",
  );
  const [command, ...rest] = positional;
  const cwd = rest[0] ? path.resolve(rest[0]) : process.cwd();

  const pin = readProjectPin(cwd);
  const resolvedVersion = resolveDefoldVersion({
    ...(defoldVersionFlag !== undefined ? { flag: defoldVersionFlag } : {}),
    ...(pin !== undefined ? { pin } : {}),
  }).version;
  const surface = selectApiSurface(resolvedVersion);
  const apiSurface = surface.surfaceId;

  if (command === "init") {
    try {
      const { written, scriptKind } = runInit({ cwd, force });
      if (json) {
        io.stdout.write(
          renderResult({
            command: "init",
            written,
            defoldVersion: resolvedVersion,
            apiSurface,
            scriptKind,
            installCommand: installHint(),
          }),
        );
      } else {
        io.stdout.write(
          `defold-typescript init: wrote ${written.length} files: ${written.join(", ")}\n`,
        );
        if (!suppressInstallReminder) {
          io.stdout.write(`Next: run \`${installHint()}\` to install dependencies.\n`);
        }
      }
      return 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (json) {
        io.stdout.write(renderResult({ command: "init", error: message }));
      } else {
        io.stderr.write(`${message}\n`);
      }
      return 1;
    }
  }

  if (command === "setup-debug") {
    return (async (): Promise<number> => {
      const result = await runSetupDebug({
        cwd,
        json,
        ...(scriptFlag !== undefined ? { script: scriptFlag } : {}),
      });
      if (json) {
        io.stdout.write(
          renderResult(
            result.ok
              ? {
                  command: "setup-debug",
                  written: result.written,
                  actions: result.actions,
                  manualSteps: result.manualSteps,
                  ...(result.addedTo !== undefined ? { addedTo: result.addedTo } : {}),
                  removedFrom: result.removedFrom ?? [],
                  bootPath: result.bootPath ?? [],
                }
              : { command: "setup-debug", error: result.error ?? "setup-debug failed" },
          ),
        );
      } else if (result.ok) {
        io.stdout.write(
          `defold-typescript setup-debug: wrote ${result.written.length} files: ${result.written.join(", ")}\n`,
        );
        if (result.addedTo !== undefined) {
          io.stdout.write(`Debugger bootstrap added to: ${result.addedTo}\n`);
        }
        if (result.removedFrom !== undefined && result.removedFrom.length > 0) {
          io.stdout.write(`Removed stale bootstrap from: ${result.removedFrom.join(", ")}\n`);
        }
        if (result.bootPath !== undefined && result.bootPath.length > 0) {
          io.stdout.write(`Boot path: ${result.bootPath.join(" -> ")}\n`);
        }
        io.stdout.write("Remaining manual steps:\n");
        for (const step of result.manualSteps) {
          io.stdout.write(`  - ${step}\n`);
        }
      } else {
        io.stderr.write(`${result.error}\n`);
      }
      return result.ok ? 0 : 1;
    })();
  }

  if (command === "build") {
    const scriptKind = selectScriptKind(detectScriptKinds(cwd));
    const reportBuild = (written: readonly string[], materializedDir: string | null): number => {
      ensureMaterializedReference(cwd, materializedDir);
      if (json) {
        io.stdout.write(
          renderResult({
            command: "build",
            written,
            defoldVersion: resolvedVersion,
            apiSurface,
            scriptKind,
            materializedSurface: materializedDir,
          }),
        );
      } else {
        io.stdout.write(
          `defold-typescript build: wrote ${written.length} files: ${written.join(", ")}\n`,
        );
      }
      return 0;
    };
    const reportError = (err: unknown): number => {
      const message = err instanceof Error ? err.message : String(err);
      if (json) {
        io.stdout.write(renderResult({ command: "build", error: message }));
      } else {
        io.stderr.write(`${message}\n`);
      }
      return 1;
    };

    const isRefDocSurface =
      surface.available &&
      surface.surfaceId !== null &&
      surface.surfaceId !== CURRENT_STABLE_SURFACE_ID;

    if (isRefDocSurface) {
      const surfaceId = surface.surfaceId as string;
      return (async (): Promise<number> => {
        try {
          const { written } = runBuild({ cwd });
          const { materializedDir } = await materializeRefDocSurface({
            cwd,
            surfaceId,
            scriptKind,
            ...(internals?.resolveOpts ? { resolveOpts: internals.resolveOpts } : {}),
            ...(internals?.refDocRegistry ? { registry: internals.refDocRegistry } : {}),
          });
          if (!json && materializedDir === null) {
            io.stderr.write(
              `defold-typescript build: could not materialize ${surfaceId}; the default surface stays active\n`,
            );
          }
          return reportBuild(written, materializedDir);
        } catch (err) {
          return reportError(err);
        }
      })();
    }

    try {
      const { written } = runBuild({ cwd });
      const sourceGeneratedDir =
        internals?.sourceGeneratedDir ?? resolveCurrentSurfaceGeneratedDir();
      const { materializedDir } = materializeApiSurface({
        cwd,
        surface,
        sourceGeneratedDir,
        scriptKind,
      });
      return reportBuild(written, materializedDir);
    } catch (err) {
      return reportError(err);
    }
  }

  if (command === "watch") {
    const isRefDocSurface =
      surface.available &&
      surface.surfaceId !== null &&
      surface.surfaceId !== CURRENT_STABLE_SURFACE_ID;

    let syncSurface: (() => void) | undefined;
    let componentWatcherFactory: WatcherFactory | undefined;
    if (!isRefDocSurface) {
      const sourceGeneratedDir =
        internals?.sourceGeneratedDir ?? resolveCurrentSurfaceGeneratedDir();
      syncSurface = (): void => {
        const scriptKind = selectScriptKind(detectScriptKinds(cwd));
        const { materializedDir } = materializeApiSurface({
          cwd,
          surface,
          sourceGeneratedDir,
          scriptKind,
        });
        ensureMaterializedReference(cwd, materializedDir);
      };
      componentWatcherFactory = internals
        ? internals.componentWatcherFactory
        : recursiveWatcherFactory;
    }

    const launchWatch = (): Promise<number> => {
      const watchOpts: RunWatchOptions = {
        cwd,
        stdout: io.stdout,
        stderr: io.stderr,
        ...(internals?.watcherFactory ? { watcherFactory: internals.watcherFactory } : {}),
        ...(internals?.debounceMs !== undefined ? { debounceMs: internals.debounceMs } : {}),
        ...(syncSurface ? { syncSurface } : {}),
        ...(componentWatcherFactory ? { componentWatcherFactory } : {}),
      };
      const handle = runWatch(watchOpts);
      if (internals) {
        internals.onWatchStart?.(handle);
      } else {
        process.once("SIGINT", () => handle.stop());
      }
      return handle.done.catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        io.stderr.write(`${message}\n`);
        return 1;
      });
    };

    // A pinned ref-doc surface is generated on the fly, so it has no
    // `syncSurface`; narrow it once at startup the same way `build` does, then
    // start the watcher. A single detected kind drops the forbidden restricted
    // namespaces; mixed/none keeps the full surface. Live re-narrowing of
    // ref-doc surfaces stays deferred.
    if (isRefDocSurface) {
      const surfaceId = surface.surfaceId as string;
      const scriptKind = selectScriptKind(detectScriptKinds(cwd));
      return (async (): Promise<number> => {
        const { materializedDir } = await materializeRefDocSurface({
          cwd,
          surfaceId,
          scriptKind,
          ...(internals?.resolveOpts ? { resolveOpts: internals.resolveOpts } : {}),
          ...(internals?.refDocRegistry ? { registry: internals.refDocRegistry } : {}),
        });
        ensureMaterializedReference(cwd, materializedDir);
        return launchWatch();
      })();
    }

    return launchWatch();
  }

  if (command === "defold") {
    const subcommand = rest[0];
    const defoldCwd = rest[1] ? path.resolve(rest[1]) : process.cwd();
    if (!isDefoldSubcommand(subcommand)) {
      io.stderr.write(DEFOLD_USAGE);
      return 1;
    }
    const javaOverride = javaFlag ?? process.env.DEFOLD_JAVA;
    const defoldIo: DefoldIo = { ...defaultDefoldIo(), ...internals?.defoldIo };
    return (async (): Promise<number> => {
      try {
        const result = await runDefoldCommand({
          cwd: defoldCwd,
          subcommand,
          ...(javaOverride !== undefined ? { java: javaOverride } : {}),
          ...(buildServerFlag !== undefined ? { buildServer: buildServerFlag } : {}),
          io: defoldIo,
        });
        if (json) {
          io.stdout.write(
            renderResult(
              result.ok
                ? { command: "defold", subcommand: result.subcommand, exitCode: result.exitCode }
                : {
                    command: "defold",
                    subcommand: result.subcommand,
                    exitCode: result.exitCode,
                    error: `bob ${result.subcommand} exited with code ${result.exitCode}`,
                  },
            ),
          );
        } else if (!result.ok) {
          io.stderr.write(
            `defold-typescript defold ${result.subcommand}: bob exited with code ${result.exitCode}\n`,
          );
        }
        return result.exitCode;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (json) {
          io.stdout.write(renderResult({ command: "defold", subcommand, error: message }));
        } else {
          io.stderr.write(`${message}\n`);
        }
        return 1;
      }
    })();
  }

  io.stderr.write(USAGE);
  return 1;
}
