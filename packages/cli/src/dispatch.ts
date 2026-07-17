import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import type { RegistryTarget } from "./api-registry";
import { CURRENT_STABLE_SURFACE_ID, selectApiSurface } from "./api-surface";
import {
  type DefoldIo,
  defaultDefoldIo,
  isBobSubcommand,
  prepareBobRun,
  reportBobStatus,
  runBobCommand,
} from "./bob-command";
import { readCliVersion } from "./cli-version";
import {
  type DefoldChannel,
  describeInstalledPinMismatch,
  describeTargetOverride,
  diagnoseDefoldNamespace,
  fetchChannelInfo,
  fetchVersionInfo,
  type ResolvedTargetHead,
  readDefoldTargetPin,
  resolveDefoldTarget,
  resolveTargetHead,
} from "./defold-target";
import {
  defaultRunEngine,
  launchEngine,
  type RunEngine,
  type Runnable,
  resolveRunnable,
} from "./engine-launch";
import type { DownloadExtensionArchive, ReadExtensionZip } from "./extension-archive";
import { COMMAND_NAMES, renderHelp, renderHelpJson } from "./help";
import { runInit } from "./init";
import { runInitAgents } from "./init-agents";
import { installHint } from "./install-reminder";
import { detectInstalledEditorVersion } from "./installed-editor-version";
import { renderResult } from "./json-output";
import type { VendoredLibrary } from "./library-match";
import type { RefDocResolveOptions } from "./materialize";
import { runSetTarget } from "./set-target";
import { runSetupDebug } from "./setup-debug";
import { runUpgrade, type UpgradeIo } from "./upgrade";
import type { CheckboxPrompt } from "./wall-interactive";
import type { RunWatchHandle, RunWatchOptions, WatcherFactory } from "./watch";

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
  // Resolves a channel (stable/beta/alpha) to its head `{version, sha1}` via
  // `d.defold.com/<channel>/info.json`. Injected by tests so the `--defold-target`
  // head probe stays deterministic and offline. Version targets never call it.
  readonly fetchChannelInfo?: (
    channel: DefoldChannel,
  ) => Promise<{ version: string; sha1: string }>;
  // Resolves a pinned version to its archive sha via the Defold git tag. Injected
  // by tests so the bob artifact probe stays deterministic and offline. Channel
  // targets never call it.
  readonly fetchVersionInfo?: (version: string) => Promise<{ sha1: string }>;
  // Launch seams for the top-level `run` command: platform/arch/probe drive the
  // pure `resolveRunnable`, and spawn/copyAside/chmod drive `launchEngine`. Tests
  // inject a deterministic subset over `defaultRunEngine`, mirroring `defoldIo`.
  readonly runInternals?: Partial<RunEngine>;
  // Seams for the only verb that goes online: `fetch` resolves the latest release
  // from the npm registry, `spawn` runs the hand-off and the install, and `env`
  // carries the `npm_config_user_agent` the runner is detected from.
  readonly upgradeInternals?: Partial<UpgradeIo>;
}

const USAGE =
  "Usage: defold-typescript <init|init-agents|build|watch|wall|setup-debug|resolve|bob|run> [path]\n";
const BOB_USAGE = "Usage: defold-typescript bob <resolve|build|bundle|status|run> [path]\n";

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

function readPackageJson(cwd: string): unknown {
  const pkgPath = path.join(cwd, "package.json");
  if (!existsSync(pkgPath)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(pkgPath, "utf8"));
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

  if (argv.includes("--help") || argv.includes("-h")) {
    const subject = argv.find((a) => COMMAND_NAMES.has(a)) ?? null;
    io.stdout.write(json ? renderHelpJson(subject) : renderHelp(subject));
    return 0;
  }

  const force = argv.includes("--force");
  const suppressInstallReminder = argv.includes("--suppress-install-reminder");
  const wallRemove = argv.includes("--remove");
  const wallList = argv.includes("--list");
  const frozen = argv.includes("--frozen");
  const { value: defoldTargetFlag, rest: afterTargetArgs } = parseValueFlag(argv, "defold-target");
  const { script: scriptFlag, rest: afterScriptArgs } = parseScriptFlag(afterTargetArgs);
  const { value: javaFlag, rest: afterJavaArgs } = parseValueFlag(afterScriptArgs, "java");
  const { value: buildServerFlag, rest: afterBuildServerArgs } = parseValueFlag(
    afterJavaArgs,
    "build-server",
  );
  const { value: templateFlag, rest: nonFlagArgs } = parseValueFlag(
    afterBuildServerArgs,
    "template",
  );
  const positional = nonFlagArgs.filter(
    (a) =>
      a !== "--json" &&
      a !== "--force" &&
      a !== "--suppress-install-reminder" &&
      a !== "--remove" &&
      a !== "--list" &&
      a !== "--frozen" &&
      a !== "--detected" &&
      a !== "--detect",
  );
  const [command, ...rest] = positional;
  const cwd = rest[0] ? path.resolve(rest[0]) : process.cwd();

  // Hard cutover: the two-flag surface collapsed into `--defold-target`. Reject
  // the removed flags before any resolution so the pointer is unambiguous.
  const removedTargetFlag = argv.find(
    (a) =>
      a === "--defold-version" ||
      a === "--channel" ||
      a.startsWith("--defold-version=") ||
      a.startsWith("--channel="),
  );
  if (removedTargetFlag !== undefined) {
    const message =
      "defold-typescript: --defold-version/--channel were removed; use --defold-target <version|stable|beta|alpha>";
    if (json) {
      io.stdout.write(renderResult({ command: "build", error: message }));
    } else {
      io.stderr.write(`${message}\n`);
    }
    return 1;
  }

  if (command === "set-target") {
    // Pin writer, not a target resolver: it never runs the resolution machinery
    // below. With `--detected` the sole positional is the path; otherwise the
    // token leads and the path trails.
    const detectedMode = argv.includes("--detected") || argv.includes("--detect");
    const usageError = (): number => {
      const message =
        "defold-typescript set-target: pass a version|stable|beta|alpha token, or --detected, and an optional path.";
      if (json) {
        io.stdout.write(renderResult({ command: "set-target", error: message }));
      } else {
        io.stderr.write(`${message}\n`);
      }
      return 1;
    };
    if (detectedMode && rest.length > 1) {
      return usageError();
    }
    if (!detectedMode && rest[0] === undefined) {
      return usageError();
    }
    const token = detectedMode ? undefined : rest[0];
    const pathArg = detectedMode ? rest[0] : rest[1];
    const setTargetCwd = pathArg ? path.resolve(pathArg) : process.cwd();
    const result = runSetTarget({
      cwd: setTargetCwd,
      ...(token !== undefined ? { token } : {}),
      ...(detectedMode
        ? { detected: true, detect: internals?.detectEditorVersion ?? detectInstalledEditorVersion }
        : {}),
    });
    if (json) {
      io.stdout.write(
        renderResult({
          command: "set-target",
          ...(result.error !== undefined ? { error: result.error } : {}),
          written: result.written,
          ...(result.from !== undefined ? { from: result.from } : {}),
          ...(result.to !== undefined ? { to: result.to } : {}),
        }),
      );
    } else if (!result.ok) {
      io.stderr.write(`${result.error}\n`);
    } else if (result.written.length === 0) {
      io.stdout.write(`defold-typescript set-target: already ${result.to}\n`);
    } else {
      io.stdout.write(
        `defold-typescript set-target: ${result.from ?? "(unset)"} -> ${result.to}\n`,
      );
    }
    return result.ok ? 0 : 1;
  }

  // One read of package.json feeds both the pin and its diagnostics, so every
  // target-resolving command reports a bad namespace key from the same place.
  // A JSON run folds these into its `warnings` payload instead (see below).
  const pkg = readPackageJson(cwd);
  const pin = readDefoldTargetPin(pkg);
  const targetDiagnostics = [
    ...diagnoseDefoldNamespace(pkg),
    ...describeTargetOverride(defoldTargetFlag, pin),
  ];
  if (!json && command !== undefined) {
    for (const diagnostic of targetDiagnostics) {
      io.stderr.write(`defold-typescript ${command}: ${diagnostic}\n`);
    }
  }
  // The installed editor feeds two sites now — the no-flag/no-pin resolution
  // fallback below and the pin-drift check after `target` resolves — so read it
  // at most once and memoize.
  let installedEditorRead = false;
  let installedEditorVersion: string | null = null;
  const detectInstalled = (): string | null => {
    if (!installedEditorRead) {
      installedEditorVersion = (internals?.detectEditorVersion ?? detectInstalledEditorVersion)();
      installedEditorRead = true;
    }
    return installedEditorVersion;
  };
  let detected: string | undefined;
  if (defoldTargetFlag === undefined && pin === undefined) {
    const result = detectInstalled();
    if (result !== null) {
      detected = result;
    }
  }
  let target: ReturnType<typeof resolveDefoldTarget>;
  try {
    target = resolveDefoldTarget({
      ...(defoldTargetFlag !== undefined ? { flag: defoldTargetFlag } : {}),
      ...(pin !== undefined ? { pin } : {}),
      ...(detected !== undefined ? { detected } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) {
      io.stdout.write(renderResult({ command: "build", error: message }));
    } else {
      io.stderr.write(`${message}\n`);
    }
    return 1;
  }
  const targetSource = target.source;
  // A concrete-version pin can silently lag the installed editor after an upgrade;
  // warn (build/upgrade only) so the user knows `set-target --detected` exists. A
  // channel pin tracks its head, and a flag override is covered by the override
  // notice, so both stay out of this gate — leaving `pinnedVersion` undefined keeps
  // the editor undetected for them.
  const pinnedVersion =
    (command === "build" || command === "upgrade") &&
    target.kind === "version" &&
    target.source === "pin"
      ? target.version
      : undefined;
  const installedForDrift =
    pinnedVersion !== undefined ? (detectInstalled() ?? undefined) : undefined;
  const driftNotice = describeInstalledPinMismatch(installedForDrift, pinnedVersion);
  const pinMismatch =
    installedForDrift !== undefined && pinnedVersion !== undefined && driftNotice.length > 0
      ? { installed: installedForDrift, pinned: pinnedVersion }
      : undefined;
  const channelFetch =
    internals?.fetchChannelInfo ?? internals?.resolveOpts?.fetchChannelInfo ?? fetchChannelInfo;
  const versionFetch = internals?.fetchVersionInfo ?? fetchVersionInfo;
  // A version target's head is synchronous (no channel info.json probe); a
  // channel target resolves its head — `{version, sha}` — via the fetch above.
  const syncHead: ResolvedTargetHead | undefined =
    target.kind === "version" ? { version: target.version, channel: null, sha: null } : undefined;
  const resolveHead = (): Promise<ResolvedTargetHead> =>
    resolveTargetHead(target, { fetchChannelInfo: channelFetch, fetchVersionInfo: versionFetch });
  // Ref-doc resolution addresses the channel head; the fetch seam in
  // `internals.resolveOpts` (spread last) still wins for tests.
  const refDocOptsFor = (head: ResolvedTargetHead): RefDocResolveOptions => ({
    ...(head.channel ? { channel: head.channel } : {}),
    ...internals?.resolveOpts,
  });

  if (command === "init") {
    const runInitFlow = (head: ResolvedTargetHead): number => {
      try {
        if (rest[0] === undefined) {
          throw new Error(
            'defold-typescript init: a destination folder is required. Pass "." for the current folder, or a path like "my-game".',
          );
        }
        const { written, operations, warnings } = runInit({
          cwd,
          force,
          ...(templateFlag !== undefined ? { template: templateFlag } : {}),
        });
        const initWarnings = [...targetDiagnostics, ...warnings];
        if (json) {
          io.stdout.write(
            renderResult({
              command: "init",
              written,
              operations,
              ...(initWarnings.length > 0 ? { warnings: initWarnings } : {}),
              defoldVersion: head.version,
              defoldVersionSource: targetSource,
              defoldChannel: head.channel,
              defoldSha: head.sha,
              apiSurface: selectApiSurface(head.version).surfaceId,
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
          for (const warning of warnings) {
            io.stderr.write(`defold-typescript init: ${warning}\n`);
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
    };
    return syncHead !== undefined
      ? runInitFlow(syncHead)
      : (async (): Promise<number> => runInitFlow(await resolveHead()))();
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
    return (async (): Promise<number> => {
      const { runBuild } = await import("./build");
      const {
        ensureMaterializedReference,
        materializeApiSurface,
        materializeRefDocSurface,
        resolveRegisteredSurfaceGeneratedDir,
      } = await import("./materialize");

      let head: ResolvedTargetHead;
      try {
        head = syncHead ?? (await resolveHead());
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (json) {
          io.stdout.write(renderResult({ command: "build", error: message }));
        } else {
          io.stderr.write(`${message}\n`);
        }
        return 1;
      }
      const surface = selectApiSurface(head.version);
      const apiSurface = surface.surfaceId;
      const refDocResolveOpts = refDocOptsFor(head);
      const sourceGeneratedDir =
        internals?.sourceGeneratedDir ?? resolveRegisteredSurfaceGeneratedDir(surface.surfaceId);

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
              warnings: [...driftNotice, ...targetDiagnostics, ...warnings],
              defoldVersion: head.version,
              defoldVersionSource: targetSource,
              defoldChannel: head.channel,
              defoldSha: head.sha,
              apiSurface,
              materializedSurface: materializedDir,
              ...(pinMismatch ? { pinMismatch } : {}),
            }),
          );
        } else {
          io.stdout.write(
            `defold-typescript build: wrote ${written.length} files: ${written.join(", ")}\n`,
          );
          for (const notice of driftNotice) {
            io.stderr.write(`defold-typescript build: ${notice}\n`);
          }
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
        surface.surfaceId !== CURRENT_STABLE_SURFACE_ID &&
        sourceGeneratedDir === null;

      if (isRefDocSurface) {
        const surfaceId = surface.surfaceId as string;
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
      }

      try {
        const { written, warnings } = runBuild({ cwd });
        const { materializedDir } = materializeApiSurface({
          cwd,
          surface,
          sourceGeneratedDir,
        });
        return reportBuild(written, warnings, materializedDir);
      } catch (err) {
        return reportError(err);
      }
    })();
  }

  if (command === "watch") {
    return (async (): Promise<number> => {
      const { recursiveWatcherFactory, runWatch } = await import("./watch");
      const {
        ensureMaterializedReference,
        materializeApiSurface,
        materializeRefDocSurface,
        resolveRegisteredSurfaceGeneratedDir,
      } = await import("./materialize");
      const { runResolve } = await import("./resolve");

      let head: ResolvedTargetHead;
      try {
        head = syncHead ?? (await resolveHead());
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        io.stderr.write(`${message}\n`);
        return 1;
      }
      const surface = selectApiSurface(head.version);
      const refDocResolveOpts = refDocOptsFor(head);
      const sourceGeneratedDir =
        internals?.sourceGeneratedDir ?? resolveRegisteredSurfaceGeneratedDir(surface.surfaceId);

      const isRefDocSurface =
        surface.available &&
        surface.surfaceId !== null &&
        surface.surfaceId !== CURRENT_STABLE_SURFACE_ID &&
        sourceGeneratedDir === null;

      let syncSurface: (() => void) | undefined;
      let componentWatcherFactory: WatcherFactory | undefined;
      let resolveSurface: (() => void | Promise<void>) | undefined;
      if (!isRefDocSurface) {
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
          ...(targetDiagnostics.length > 0 ? { pinDiagnostics: targetDiagnostics } : {}),
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
      // `syncSurface`; generate it once at startup the same way `build` does,
      // then start the watcher. The full surface materializes; walls are opt-in
      // via the wall command.
      if (isRefDocSurface) {
        const surfaceId = surface.surfaceId as string;
        const { materializedDir } = await materializeRefDocSurface({
          cwd,
          surfaceId,
          resolveOpts: refDocResolveOpts,
          ...(internals?.refDocRegistry ? { registry: internals.refDocRegistry } : {}),
        });
        ensureMaterializedReference(cwd, materializedDir);
        return launchWatch();
      }

      return launchWatch();
    })();
  }

  if (command === "wall") {
    return (async (): Promise<number> => {
      const { applyWallSelection, currentWalledDirs, eligibleWalls } = await import("./wall");
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
      const { runWallInteractive } = await import("./wall-interactive");
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
      const { runResolve } = await import("./resolve");
      let head: ResolvedTargetHead;
      try {
        head = syncHead ?? (await resolveHead());
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (json) {
          io.stdout.write(renderResult({ command: "resolve", error: message }));
        } else {
          io.stderr.write(`${message}\n`);
        }
        return 1;
      }
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
                  ...(targetDiagnostics.length > 0 ? { warnings: targetDiagnostics } : {}),
                  defoldVersion: head.version,
                  defoldVersionSource: targetSource,
                  defoldChannel: head.channel,
                  defoldSha: head.sha,
                  apiSurface: selectApiSurface(head.version).surfaceId,
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

  if (command === "bob") {
    const subcommand = rest[0];
    const bobCwd = rest[1] ? path.resolve(rest[1]) : process.cwd();
    const defoldIo: DefoldIo = { ...defaultDefoldIo(), ...internals?.defoldIo };

    if (subcommand === "status") {
      return (async (): Promise<number> => {
        const status = await reportBobStatus({
          target,
          cacheDir: defoldIo.cacheDir,
          io: {
            fetchChannelInfo: channelFetch,
            fetchVersionInfo: versionFetch,
            probe: defoldIo.probe,
            javaProbe: defoldIo.javaProbe,
            ...(defoldIo.bundledJava !== undefined ? { bundledJava: defoldIo.bundledJava } : {}),
          },
        });
        if (json) {
          io.stdout.write(
            renderResult(
              status.ok
                ? {
                    command: "bob",
                    subcommand: "status",
                    ...(status.version !== null ? { defoldVersion: status.version } : {}),
                    defoldVersionSource: targetSource,
                    defoldChannel: status.channel,
                    defoldSha: status.sha,
                    bobJar: status.bobJar,
                    java: status.java,
                  }
                : {
                    command: "bob",
                    subcommand: "status",
                    error: status.error ?? "bob status failed",
                  },
            ),
          );
        } else {
          const selector = target.kind === "version" ? target.version : target.channel;
          io.stdout.write("defold-typescript bob status:\n");
          io.stdout.write(`  target: ${selector} (${targetSource})\n`);
          io.stdout.write(`  version: ${status.version ?? "(unresolved)"}\n`);
          io.stdout.write(`  channel: ${status.channel ?? "(none)"}\n`);
          io.stdout.write(`  sha: ${status.sha ?? "(unresolved)"}\n`);
          io.stdout.write(
            `  bob.jar: ${status.bobJar.path ?? "(unresolved)"} ${status.bobJar.cached ? "(cached)" : "(not cached)"}\n`,
          );
          io.stdout.write(`  java: ${status.java ?? "(not found)"}\n`);
          if (!status.ok) {
            io.stderr.write(`${status.error ?? "bob status failed"}\n`);
          }
        }
        return status.ok ? 0 : 1;
      })();
    }

    if (subcommand === "run") {
      const runEngine: RunEngine = { ...defaultRunEngine(), ...internals?.runInternals };
      const javaOverride = javaFlag ?? process.env.DEFOLD_JAVA;
      return (async (): Promise<number> => {
        try {
          const head = await resolveHead();
          if (head.sha === null) {
            throw new Error(
              `defold-typescript bob: could not resolve an artifact sha for Defold ${head.version}.`,
            );
          }
          const prepared = await prepareBobRun({
            cwd: bobCwd,
            head: { version: head.version, channel: head.channel, sha: head.sha },
            ...(javaOverride !== undefined ? { java: javaOverride } : {}),
            ...(buildServerFlag !== undefined ? { buildServer: buildServerFlag } : {}),
            io: { ...defoldIo, platform: runEngine.platform, arch: runEngine.arch },
          });
          if (!prepared.ok || prepared.runnable === undefined) {
            // A failed build short-circuits with Bob's exit code; an engine-ensure
            // failure (download offline, no engine) returns 1 with its error.
            const failedBuild = prepared.buildExitCode !== 0;
            if (json) {
              io.stdout.write(
                renderResult({
                  command: "bob",
                  subcommand: "run",
                  build: { exitCode: prepared.buildExitCode },
                  error: prepared.error ?? `bob build exited with code ${prepared.buildExitCode}`,
                }),
              );
            } else {
              io.stderr.write(
                `${
                  prepared.error ??
                  `defold-typescript bob run: bob build exited with code ${prepared.buildExitCode}`
                }\n`,
              );
            }
            return failedBuild ? prepared.buildExitCode : 1;
          }
          const { runnable } = prepared;
          for (const warning of runnable.warnings) {
            io.stderr.write(`defold-typescript bob run: ${warning}\n`);
          }
          const exitCode = await launchEngine(runnable, {
            platform: runEngine.platform,
            spawn: runEngine.spawn,
            copyAside: runEngine.copyAside,
            chmod: runEngine.chmod,
          });
          if (json) {
            io.stdout.write(
              renderResult({
                command: "bob",
                subcommand: "run",
                build: { exitCode: prepared.buildExitCode },
                launch: { enginePath: runnable.enginePath, exitCode },
              }),
            );
          }
          return exitCode;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (json) {
            io.stdout.write(renderResult({ command: "bob", subcommand: "run", error: message }));
          } else {
            io.stderr.write(`${message}\n`);
          }
          return 1;
        }
      })();
    }

    if (!isBobSubcommand(subcommand)) {
      io.stderr.write(BOB_USAGE);
      return 1;
    }
    const javaOverride = javaFlag ?? process.env.DEFOLD_JAVA;
    return (async (): Promise<number> => {
      try {
        const head = await resolveHead();
        if (head.sha === null) {
          throw new Error(
            `defold-typescript bob: could not resolve an artifact sha for Defold ${head.version}.`,
          );
        }
        const result = await runBobCommand({
          cwd: bobCwd,
          subcommand,
          capture: json,
          ...(javaOverride !== undefined ? { java: javaOverride } : {}),
          ...(buildServerFlag !== undefined ? { buildServer: buildServerFlag } : {}),
          head: { version: head.version, channel: head.channel, sha: head.sha },
          io: defoldIo,
        });
        if (json) {
          const withOutput = result.output !== undefined ? { output: result.output } : {};
          const headFields = {
            defoldVersion: result.defoldVersion,
            defoldVersionSource: targetSource,
            defoldChannel: result.defoldChannel,
            defoldSha: result.defoldSha,
          };
          io.stdout.write(
            renderResult(
              result.ok
                ? {
                    command: "bob",
                    subcommand: result.subcommand,
                    exitCode: result.exitCode,
                    ...headFields,
                    ...withOutput,
                  }
                : {
                    command: "bob",
                    subcommand: result.subcommand,
                    exitCode: result.exitCode,
                    error: `bob ${result.subcommand} exited with code ${result.exitCode}`,
                    ...headFields,
                    ...withOutput,
                  },
            ),
          );
        } else if (!result.ok) {
          io.stderr.write(
            `defold-typescript bob ${result.subcommand}: bob exited with code ${result.exitCode}\n`,
          );
        }
        return result.exitCode;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (json) {
          io.stdout.write(renderResult({ command: "bob", subcommand, error: message }));
        } else {
          io.stderr.write(`${message}\n`);
        }
        return 1;
      }
    })();
  }

  if (command === "run") {
    const engine: RunEngine = { ...defaultRunEngine(), ...internals?.runInternals };
    const dashIndex = rest.indexOf("--");
    const runArgs = dashIndex === -1 ? rest : rest.slice(0, dashIndex);
    const extraArgs = dashIndex === -1 ? [] : rest.slice(dashIndex + 1);
    const runCwd = runArgs[0] ? path.resolve(runArgs[0]) : process.cwd();

    let runnable: Runnable;
    try {
      runnable = resolveRunnable({
        cwd: runCwd,
        platform: engine.platform,
        arch: engine.arch,
        probe: engine.probe,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (json) {
        io.stdout.write(renderResult({ command: "run", error: message }));
      } else {
        io.stderr.write(`${message}\n`);
      }
      return 1;
    }

    for (const warning of runnable.warnings) {
      io.stderr.write(`defold-typescript run: ${warning}\n`);
    }

    return launchEngine(runnable, {
      platform: engine.platform,
      spawn: engine.spawn,
      extraArgs,
      copyAside: engine.copyAside,
      chmod: engine.chmod,
    }).then((exitCode) => {
      if (json) {
        io.stdout.write(
          renderResult({
            command: "run",
            enginePath: runnable.enginePath,
            projectc: runnable.projectcPath,
            exitCode,
          }),
        );
      }
      return exitCode;
    });
  }

  if (command === "upgrade" || command === "update") {
    return (async (): Promise<number> => {
      const running = internals?.cliVersion ?? readCliVersion();
      try {
        const outcome = await runUpgrade({
          cwd,
          running,
          capture: json,
          ...(internals?.upgradeInternals ? { io: internals.upgradeInternals } : {}),
        });
        if (json) {
          io.stdout.write(
            renderResult({
              command: "upgrade",
              written: outcome.written,
              from: outcome.from,
              to: outcome.to,
              handedOff: outcome.handedOff,
              ...(driftNotice.length > 0 ? { warnings: driftNotice } : {}),
              ...(pinMismatch ? { pinMismatch } : {}),
              ...(outcome.error !== undefined ? { error: outcome.error } : {}),
              ...(outcome.output !== undefined ? { output: outcome.output } : {}),
            }),
          );
        } else if (outcome.error !== undefined) {
          io.stderr.write(`${outcome.error}\n`);
        } else {
          for (const notice of driftNotice) {
            io.stderr.write(`defold-typescript upgrade: ${notice}\n`);
          }
          io.stdout.write(
            `defold-typescript upgrade: ${outcome.from} -> ${outcome.to}${
              outcome.handedOff ? "" : " (already latest; re-scaffolded managed files)"
            }\n`,
          );
        }
        return outcome.exitCode;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (json) {
          io.stdout.write(renderResult({ command: "upgrade", error: message }));
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
