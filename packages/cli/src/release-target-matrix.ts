import { Writable } from "node:stream";
import { selectApiSurface } from "./api-surface";
import { bobCachePath, resolveBobJar } from "./bob";
import type { DefoldIo } from "./bob-command";
import { DEFOLD_VERSIONS } from "./defold-version";
import { type DispatchInternals, dispatch } from "./dispatch";
import { resolveRegisteredSurfaceGeneratedDir } from "./materialize";
import type { RunWatchHandle, Watcher, WatcherFactory } from "./watch";

// The exact release targets a promotion is gated against: the current stable
// release and the immediately-preceding one, each backed by a committed surface.
export interface ReleaseTargetSpec {
  readonly version: string;
  readonly surfaceId: string;
  readonly isCurrentStable: boolean;
}

export const RELEASE_TARGET_MATRIX: readonly ReleaseTargetSpec[] = DEFOLD_VERSIONS.map(
  (version, i) => ({
    version,
    surfaceId: `defold-${version}`,
    isCurrentStable: i === 0,
  }),
);

export const MATRIX_COMMANDS = [
  "init",
  "build",
  "watch",
  "resolve",
  "bob status",
  "bob resolve",
  "bob build",
  "bob bundle",
] as const;
export type MatrixCommand = (typeof MATRIX_COMMANDS)[number];

// The surface-bearing commands report `apiSurface`; the bob commands report a
// resolved archive SHA instead (a version target only fetches the SHA when an
// archive is actually needed).
const SURFACE_BEARING: ReadonlySet<MatrixCommand> = new Set(["init", "build", "watch", "resolve"]);
const SHA_BEARING: ReadonlySet<MatrixCommand> = new Set([
  "bob status",
  "bob resolve",
  "bob build",
  "bob bundle",
]);

export function isSurfaceBearing(command: MatrixCommand): boolean {
  return SURFACE_BEARING.has(command);
}
export function isShaBearing(command: MatrixCommand): boolean {
  return SHA_BEARING.has(command);
}

export interface MatrixCommandRecord {
  readonly command: MatrixCommand;
  readonly version: string;
  readonly apiSurface: string | null;
  readonly sha: string | null;
  readonly ok: boolean;
}

export interface SurfaceSelection {
  readonly surfaceId: string | null;
  readonly available: boolean;
  readonly generatedDir: string | null;
}

// Which committed generated `.d.ts` set backs a target. Current-stable and the
// previous release both resolve to a committed directory; an unregistered
// version resolves to nothing (a project pinned to it would not type-check).
export function selectMatrixSurface(version: string): SurfaceSelection {
  const selected = selectApiSurface(version);
  return {
    surfaceId: selected.surfaceId,
    available: selected.available,
    generatedDir: resolveRegisteredSurfaceGeneratedDir(selected.surfaceId),
  };
}

// The cached Bob artifact is addressed by the resolved commit SHA, so a patched
// release (new SHA at the same semantic version) never collides with a pre-patch
// entry.
export function bobArtifactIdentity(sha: string, cacheDir: string): string {
  return bobCachePath({ sha1: sha, cacheDir });
}

export function isReusableBobArtifact(
  sha: string,
  cacheDir: string,
  probe: (candidate: string) => boolean,
): boolean {
  return resolveBobJar({ sha1: sha, cacheDir, probe }).cached;
}

export interface MatrixCommandContext {
  readonly cwd: string;
  readonly sha: string;
  readonly cacheDir: string;
  readonly spawn: DefoldIo["spawn"];
  readonly download: DefoldIo["download"];
  readonly probe: DefoldIo["probe"];
  readonly javaProbe?: DefoldIo["javaProbe"];
}

interface Capture {
  readonly io: { stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream };
  out(): string;
}

function captureStreams(): Capture {
  const chunks: Buffer[] = [];
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      cb();
    },
  });
  const stderr = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  return { io: { stdout, stderr }, out: () => Buffer.concat(chunks).toString("utf8") };
}

function baseInternals(ctx: MatrixCommandContext): DispatchInternals {
  return {
    fetchVersionInfo: async () => ({ sha1: ctx.sha }),
    defoldIo: {
      cacheDir: ctx.cacheDir,
      probe: ctx.probe,
      javaProbe: ctx.javaProbe ?? (() => true),
      spawn: ctx.spawn,
      download: ctx.download,
    },
  };
}

interface Envelope {
  readonly ok?: boolean;
  readonly defoldVersion?: string;
  readonly apiSurface?: string | null;
  readonly defoldSha?: string | null;
}

function lastJsonLine(out: string): Envelope {
  const lines = out.trimEnd().split("\n").filter(Boolean);
  const last = lines[lines.length - 1] ?? "{}";
  return JSON.parse(last) as Envelope;
}

// Runs one CLI command against the given target with fully-injected archive and
// process I/O and returns what the command reported (version, surface, SHA). The
// bob subcommands drive real jar resolution and spawn capture; `watch` drives a
// bounded synthetic watcher.
export async function runMatrixCommand(
  command: MatrixCommand,
  version: string,
  ctx: MatrixCommandContext,
): Promise<MatrixCommandRecord> {
  const surfaceId = selectMatrixSurface(version).surfaceId;

  if (command === "watch") {
    const capture = captureStreams();
    const factory: WatcherFactory = (_root, _onEvent): Watcher => ({ close() {} });
    let resolveHandle: (h: RunWatchHandle) => void = () => {};
    const ready = new Promise<RunWatchHandle>((resolve) => {
      resolveHandle = resolve;
    });
    const internals: DispatchInternals = {
      ...baseInternals(ctx),
      watcherFactory: factory,
      onWatchStart: (h) => resolveHandle(h),
    };
    const result = Promise.resolve(
      dispatch(["watch", ctx.cwd, "--defold-target", version, "--json"], capture.io, internals),
    );
    const handle = await ready;
    await handle.waitForIdle();
    handle.stop();
    const code = await result;
    return { command, version, apiSurface: surfaceId, sha: null, ok: code === 0 };
  }

  const capture = captureStreams();
  const internals = baseInternals(ctx);
  const argv =
    command === "init"
      ? [
          "init",
          ctx.cwd,
          "--defold-target",
          version,
          "--json",
          "--force",
          "--suppress-install-reminder",
        ]
      : command === "build"
        ? ["build", ctx.cwd, "--defold-target", version, "--json"]
        : command === "resolve"
          ? ["resolve", ctx.cwd, "--defold-target", version, "--json"]
          : ["bob", command.slice("bob ".length), ctx.cwd, "--defold-target", version, "--json"];

  const code = await Promise.resolve(dispatch(argv, capture.io, internals));
  const envelope = lastJsonLine(capture.out());
  return {
    command,
    version: envelope.defoldVersion ?? version,
    apiSurface: isShaBearing(command) ? surfaceId : (envelope.apiSurface ?? null),
    sha: envelope.defoldSha ?? null,
    ok: code === 0 && envelope.ok !== false,
  };
}
