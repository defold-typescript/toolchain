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
import { type DefoldChannel, readDefoldChannelPin, resolveDefoldChannel } from "./defold-channel";
import { readDefoldVersionPin, resolveDefoldVersion } from "./defold-version";
import type { DownloadExtensionArchive, ReadExtensionZip } from "./extension-archive";
import { runInit } from "./init";
import { runInitAgents } from "./init-agents";
import { installHint } from "./install-reminder";
import { detectInstalledEditorVersion } from "./installed-editor-version";
import { renderResult } from "./json-output";
import type { VendoredLibrary } from "./library-match";
import {
  ensureMaterializedReference,
  materializeApiSurface,
  materializeRefDocSurface,
  type RefDocResolveOptions,
  resolveCurrentSurfaceGeneratedDir,
} from "./materialize";
import { runResolve } from "./resolve";
import { runSetupDebug } from "./setup-debug";
import { applyWallSelection, currentWalledDirs, eligibleWalls } from "./wall";
import { type CheckboxPrompt, runWallInteractive } from "./wall-interactive";
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
  readonly resolveInternals?: {
    readonly download?: DownloadExtensionArchive;
    readonly readZip?: ReadExtensionZip;
    readonly cacheDir?: string;
    readonly libraryRegistry?: readonly VendoredLibrary[];
    readonly libraryGeneratedDir?: string | null;
  };
  // Reads the installed Defold editor's `config` and returns its `version` key,
  // or null when no installed editor is detected. The default is the live
  // filesystem probe; tests inject a fixed value to keep the dispatch path
  // deterministic. Detection is the lowest-precedence Defold version source
  // (below the package.json pin, above the hardcoded default).
  readonly detectEditorVersion?: () => string | null;
  // `wall` takes its target directories as positionals (not a cwd path arg like
  // the other commands), so tests inject the project root and TTY state here.
  readonly cwd?: string;
  readonly isTty?: boolean;
  readonly wallCheckbox?: CheckboxPrompt;
}

const USAGE =
  "Usage: defold-typescript <init|init-agents|build|watch|wall|setup-debug|resolve|defold> [path]\n";
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

function readProjectChannelPin(cwd: string): DefoldChannel | undefined {
  const pkgPath = path.join(cwd, "package.json");
  if (!existsSync(pkgPath)) {
    return undefined;
  }
  try {
    return readDefoldChannelPin(JSON.parse(readFileSync(pkgPath, "utf8")));
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
  const wallRemove = argv.includes("--remove");
  const wallList = argv.includes("--list");
  const frozen = argv.includes("--frozen");
  const { flag: defoldVersionFlag, rest: afterVersionArgs } = parseDefoldVersionFlag(argv);
  const { script: scriptFlag, rest: afterScriptArgs } = parseScriptFlag(afterVersionArgs);
  const { value: javaFlag, rest: afterJavaArgs } = parseValueFlag(afterScriptArgs, "java");
  const { value: buildServerFlag, rest: afterBuildServerArgs } = parseValueFlag(
    afterJavaArgs,
    "build-server",
  );
  const { value: channelFlag, rest: afterChannelArgs } = parseValueFlag(
    afterBuildServerArgs,
    "channel",
  );
  const { value: templateFlag, rest: nonFlagArgs } = parseValueFlag(afterChannelArgs, "template");
  const positional = nonFlagArgs.filter(
    (a) =>
      a !== "--json" &&
      a !== "--force" &&
      a !== "--suppress-install-reminder" &&
      a !== "--remove" &&
      a !== "--list" &&
      a !== "--frozen",
  );
  const [command, ...rest] = positional;
  const cwd = rest[0] ? path.resolve(rest[0]) : process.cwd();

  const pin = readProjectPin(cwd);
  let detected: string | undefined;
  if (defoldVersionFlag === undefined && pin === undefined) {
    const result = (internals?.detectEditorVersion ?? detectInstalledEditorVersion)();
    if (result !== null) {
      detected = result;
    }
  }
  const resolved = resolveDefoldVersion({
    ...(defoldVersionFlag !== undefined ? { flag: defoldVersionFlag } : {}),
    ...(pin !== undefined ? { pin } : {}),
    ...(detected !== undefined ? { detected } : {}),
  });
  const resolvedVersion = resolved.version;
  const resolvedVersionSource = resolved.source;
  const channelPin = readProjectChannelPin(cwd);
  const resolvedChannel = resolveDefoldChannel({
    ...(channelFlag !== undefined ? { flag: channelFlag } : {}),
    ...(channelPin !== undefined ? { pin: channelPin } : {}),
  }).channel;
  // Thread the resolved channel into ref-doc resolution; any test-injected
  // download/readZip/fetchChannelInfo still wins (spread after).
  const refDocResolveOpts: RefDocResolveOptions = {
    channel: resolvedChannel,
    ...internals?.resolveOpts,
  };
  const surface = selectApiSurface(resolvedVersion);
  const apiSurface = surface.surfaceId;

  if (command === "init") {
    try {
      if (rest[0] === undefined) {
        throw new Error(
          'defold-typescript init: a destination folder is required. Pass "." for the current folder, or a path like "my-game".',
        );
      }
      const { written, operations } = runInit({
        cwd,
        force,
        ...(templateFlag !== undefined ? { template: templateFlag } : {}),
      });
      if (json) {
        io.stdout.write(
          renderResult({
            command: "init",
            written,
            operations,
            defoldVersion: resolvedVersion,
            defoldVersionSource: resolvedVersionSource,
            defoldChannel: resolvedChannel,
            apiSurface,
            installCommand: installHint(),
          }),
        );
      } else {
        io.stdout.write(
          `defold-typescript init: wrote ${written.length} files: ${written.join(", ")}\n`,
        );
        for (const op of operations) {
          io.stdout.write(`  ${op.target}: ${op.status}${op.detail ? ` — ${op.detail}` : ""}\n`);
        }
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

  if (command === "init-agents") {
    try {
      if (rest[0] === undefined) {
        throw new Error(
          'defold-typescript init-agents: a destination folder is required. Pass "." for the current folder, or a path like "my-game".',
        );
      }
      const { written } = runInitAgents({ cwd });
      if (json) {
        io.stdout.write(renderResult({ command: "init-agents", written }));
      } else {
        io.stdout.write(
          `defold-typescript init-agents: wrote ${written.length} files: ${written.join(", ")}\n`,
        );
      }
      return 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (json) {
        io.stdout.write(renderResult({ command: "init-agents", error: message }));
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
    const reportBuild = (
      written: readonly string[],
      warnings: readonly string[],
      materializedDir: string | null,
    ): number => {
      ensureMaterializedReference(cwd, materializedDir);
      // walls are opt-in via the wall command
      if (json) {
        io.stdout.write(
          renderResult({
            command: "build",
            written,
            warnings,
            defoldVersion: resolvedVersion,
            defoldVersionSource: resolvedVersionSource,
            defoldChannel: resolvedChannel,
            apiSurface,
            materializedSurface: materializedDir,
          }),
        );
      } else {
        io.stdout.write(
          `defold-typescript build: wrote ${written.length} files: ${written.join(", ")}\n`,
        );
        for (const warning of warnings) {
          io.stderr.write(`defold-typescript build: ${warning}\n`);
        }
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
          const { written, warnings } = runBuild({ cwd });
          const { materializedDir } = await materializeRefDocSurface({
            cwd,
            surfaceId,
            resolveOpts: refDocResolveOpts,
            ...(internals?.refDocRegistry ? { registry: internals.refDocRegistry } : {}),
          });
          if (!json && materializedDir === null) {
            io.stderr.write(
              `defold-typescript build: could not materialize ${surfaceId}; the default surface stays active\n`,
            );
          }
          return reportBuild(written, warnings, materializedDir);
        } catch (err) {
          return reportError(err);
        }
      })();
    }

    try {
      const { written, warnings } = runBuild({ cwd });
      const sourceGeneratedDir =
        internals?.sourceGeneratedDir ?? resolveCurrentSurfaceGeneratedDir();
      const { materializedDir } = materializeApiSurface({
        cwd,
        surface,
        sourceGeneratedDir,
      });
      return reportBuild(written, warnings, materializedDir);
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
    let resolveSurface: (() => void | Promise<void>) | undefined;
    if (!isRefDocSurface) {
      const sourceGeneratedDir =
        internals?.sourceGeneratedDir ?? resolveCurrentSurfaceGeneratedDir();
      syncSurface = (): void => {
        const { materializedDir } = materializeApiSurface({
          cwd,
          surface,
          sourceGeneratedDir,
        });
        ensureMaterializedReference(cwd, materializedDir);
        // walls are opt-in via the wall command
      };
      componentWatcherFactory = internals
        ? internals.componentWatcherFactory
        : recursiveWatcherFactory;
      const resolveSeams = internals?.resolveInternals;
      resolveSurface = async (): Promise<void> => {
        const result = await runResolve({
          cwd,
          ...(resolveSeams?.cacheDir !== undefined ? { cacheDir: resolveSeams.cacheDir } : {}),
          ...(resolveSeams?.download ? { download: resolveSeams.download } : {}),
          ...(resolveSeams?.readZip ? { readZip: resolveSeams.readZip } : {}),
          ...(resolveSeams?.libraryRegistry
            ? { libraryRegistry: resolveSeams.libraryRegistry }
            : {}),
          ...(resolveSeams?.libraryGeneratedDir !== undefined
            ? { libraryGeneratedDir: resolveSeams.libraryGeneratedDir }
            : {}),
        });
        if (json) {
          io.stdout.write(
            renderResult(
              result.ok
                ? {
                    command: "resolve",
                    materializedSurface: result.materializedSurface,
                    extensions: result.extensions,
                    libraries: result.libraries,
                  }
                : { command: "resolve", error: result.error ?? "resolve failed" },
            ),
          );
        } else if (!result.ok) {
          io.stderr.write(`${result.error ?? "resolve failed"}\n`);
        } else if (result.materializedSurface !== null) {
          io.stdout.write(`defold-typescript resolve: wrote ${result.materializedSurface}\n`);
        }
      };
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
        ...(resolveSurface ? { resolveSurface } : {}),
        ...(json ? { json: true } : {}),
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
    // `syncSurface`; generate it once at startup the same way `build` does, then
    // start the watcher. The full surface materializes; walls are opt-in via the
    // wall command.
    if (isRefDocSurface) {
      const surfaceId = surface.surfaceId as string;
      return (async (): Promise<number> => {
        const { materializedDir } = await materializeRefDocSurface({
          cwd,
          surfaceId,
          resolveOpts: refDocResolveOpts,
          ...(internals?.refDocRegistry ? { registry: internals.refDocRegistry } : {}),
        });
        ensureMaterializedReference(cwd, materializedDir);
        return launchWatch();
      })();
    }

    return launchWatch();
  }

  if (command === "wall") {
    const wallCwd = internals?.cwd ?? process.cwd();
    const dirs = rest;
    const toJsonWall = (w: { dir: string; kind: string }): { dir: string; kind: string } => ({
      dir: w.dir,
      kind: w.kind,
    });
    const reportWalls = (walls: { dir: string; kind: string }[]): void => {
      if (json) {
        io.stdout.write(renderResult({ command: "wall", directoryWalls: walls.map(toJsonWall) }));
      } else if (walls.length === 0) {
        io.stdout.write("defold-typescript wall: no directories walled\n");
      } else {
        io.stdout.write(`defold-typescript wall: walled ${walls.map((w) => w.dir).join(", ")}\n`);
      }
    };

    if (wallList) {
      const current = currentWalledDirs(wallCwd);
      const eligible = eligibleWalls(wallCwd);
      const currentWalls = eligible.filter((w) => current.includes(w.dir));
      if (json) {
        io.stdout.write(
          renderResult({
            command: "wall",
            directoryWalls: currentWalls.map(toJsonWall),
            eligible: eligible.map(toJsonWall),
          }),
        );
      } else {
        io.stdout.write(
          `defold-typescript wall: walled [${current.join(", ")}]; eligible [${eligible
            .map((w) => w.dir)
            .join(", ")}]\n`,
        );
      }
      return 0;
    }

    if (dirs.length > 0) {
      try {
        const current = currentWalledDirs(wallCwd);
        const desired = wallRemove
          ? current.filter((d) => !dirs.includes(d))
          : [...current, ...dirs];
        reportWalls(applyWallSelection(wallCwd, desired));
        return 0;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (json) {
          io.stdout.write(renderResult({ command: "wall", error: message }));
        } else {
          io.stderr.write(`${message}\n`);
        }
        return 1;
      }
    }

    // `--json` is machine-driven intent, so it never prompts even on a TTY.
    const interactive = !json && (internals?.isTty ?? Boolean(process.stdout.isTTY));
    if (!interactive) {
      io.stderr.write(
        "defold-typescript wall: no directory given; pass <dir> or run in a terminal for the interactive menu\n",
      );
      return 1;
    }
    return (async (): Promise<number> => {
      try {
        reportWalls(
          await runWallInteractive(
            wallCwd,
            internals?.wallCheckbox ? { checkbox: internals.wallCheckbox } : {},
          ),
        );
        return 0;
      } catch (err) {
        io.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
        return 1;
      }
    })();
  }

  if (command === "resolve") {
    const seams = internals?.resolveInternals;
    return (async (): Promise<number> => {
      const result = await runResolve({
        cwd,
        ...(seams?.cacheDir !== undefined ? { cacheDir: seams.cacheDir } : {}),
        ...(seams?.download ? { download: seams.download } : {}),
        ...(seams?.readZip ? { readZip: seams.readZip } : {}),
        ...(seams?.libraryRegistry ? { libraryRegistry: seams.libraryRegistry } : {}),
        ...(seams?.libraryGeneratedDir !== undefined
          ? { libraryGeneratedDir: seams.libraryGeneratedDir }
          : {}),
        ...(frozen ? { freeze: true } : {}),
      });
      if (json) {
        io.stdout.write(
          renderResult(
            result.ok
              ? {
                  command: "resolve",
                  materializedSurface: result.materializedSurface,
                  extensions: result.extensions,
                  libraries: result.libraries,
                }
              : { command: "resolve", error: result.error ?? "resolve failed" },
          ),
        );
        if (frozen && result.ok) {
          const drifted = result.extensions.filter((e) => e.pinStatus === "drift");
          if (drifted.length > 0) {
            io.stderr.write(
              `defold-typescript resolve: ${drifted.length} extension pin(s) drifted:\n`,
            );
            for (const ext of drifted) {
              io.stderr.write(
                `  ${ext.url}: ${ext.pinnedVersion ?? "(none)"} -> ${ext.resolvedVersion}\n`,
              );
            }
          }
        }
      } else if (result.ok) {
        if (result.extensions.length === 0) {
          io.stdout.write("defold-typescript resolve: no extension dependencies declared\n");
        } else {
          for (const ext of result.extensions) {
            if (ext.assetOnly) {
              const library = result.libraries.find((lib) => lib.url === ext.url);
              if (library?.verified) {
                io.stdout.write(
                  `  ${library.modules.join(", ")} <- ${ext.url} (vendored library)\n`,
                );
              } else if (library !== undefined) {
                io.stderr.write(
                  `defold-typescript resolve: unverified library match for ${ext.url}: repo name matched but no shipped module path was found in the archive; not materialized\n`,
                );
              } else {
                io.stdout.write(`  ${ext.url}: asset-only, skipped\n`);
              }
            } else {
              io.stdout.write(
                `  ${ext.namespaces.join(", ")} <- ${ext.url} (${ext.scriptApiCount} .script_api, ${ext.provenance})\n`,
              );
            }
          }
          if (result.materializedSurface !== null) {
            io.stdout.write(`defold-typescript resolve: wrote ${result.materializedSurface}\n`);
          }
        }
        const drifted = result.extensions.filter((e) => e.pinStatus === "drift");
        for (const ext of drifted) {
          io.stderr.write(
            `defold-typescript resolve: pin drift for ${ext.url}: ${ext.pinnedVersion ?? "(none)"} -> ${ext.resolvedVersion}\n`,
          );
        }
      } else {
        io.stderr.write(`${result.error}\n`);
      }
      if (!result.ok) {
        return 1;
      }
      const drifted = result.extensions.filter((e) => e.pinStatus === "drift");
      return frozen && drifted.length > 0 ? 1 : 0;
    })();
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
          capture: json,
          ...(javaOverride !== undefined ? { java: javaOverride } : {}),
          ...(buildServerFlag !== undefined ? { buildServer: buildServerFlag } : {}),
          io: defoldIo,
        });
        if (json) {
          const withOutput = result.output !== undefined ? { output: result.output } : {};
          io.stdout.write(
            renderResult(
              result.ok
                ? {
                    command: "defold",
                    subcommand: result.subcommand,
                    exitCode: result.exitCode,
                    ...withOutput,
                  }
                : {
                    command: "defold",
                    subcommand: result.subcommand,
                    exitCode: result.exitCode,
                    error: `bob ${result.subcommand} exited with code ${result.exitCode}`,
                    ...withOutput,
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
