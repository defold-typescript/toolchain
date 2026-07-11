import type { InitOperation } from "./init";

export type CliCommand =
  | "init"
  | "init-agents"
  | "build"
  | "setup-debug"
  | "bob"
  | "wall"
  | "resolve";

export interface ResolvedExtensionReportJson {
  readonly url: string;
  readonly provenance: string;
  readonly namespaces: readonly string[];
  readonly scriptApiCount: number;
  readonly assetOnly: boolean;
  readonly resolvedVersion: string;
  readonly pinnedVersion?: string;
  readonly pinStatus: "unpinned" | "match" | "drift";
}

export interface ResolvedLibraryReportJson {
  readonly url: string;
  readonly source: string;
  readonly modules: readonly string[];
  readonly provenance: string;
  readonly verified: boolean;
}

export interface RenderResultInput {
  readonly command: CliCommand;
  readonly written?: readonly string[];
  readonly operations?: readonly InitOperation[];
  readonly error?: string;
  readonly defoldVersion?: string;
  readonly defoldVersionSource?: string;
  readonly defoldChannel?: string | null;
  readonly defoldSha?: string | null;
  readonly apiSurface?: string | null;
  readonly materializedSurface?: string | null;
  readonly directoryWalls?: readonly { readonly dir: string; readonly kind: string }[];
  readonly eligible?: readonly { readonly dir: string; readonly kind: string }[];
  readonly installCommand?: string;
  readonly manualSteps?: readonly string[];
  readonly actions?: Record<string, string>;
  readonly addedTo?: string;
  readonly removedFrom?: readonly string[];
  readonly bootPath?: readonly string[];
  readonly subcommand?: string;
  readonly exitCode?: number;
  readonly output?: string;
  readonly bobJar?: { readonly path: string | null; readonly cached: boolean };
  readonly java?: string | null;
  readonly extensions?: readonly ResolvedExtensionReportJson[];
  readonly libraries?: readonly ResolvedLibraryReportJson[];
  readonly warnings?: readonly string[];
}

export function renderResult(input: RenderResultInput): string {
  const ok = input.error === undefined;
  const base = ok
    ? { command: input.command, ok, written: input.written ?? [] }
    : { command: input.command, ok, error: input.error };
  const withVersion =
    input.defoldVersion === undefined ? base : { ...base, defoldVersion: input.defoldVersion };
  const withVersionSource =
    "defoldVersionSource" in input
      ? { ...withVersion, defoldVersionSource: input.defoldVersionSource }
      : withVersion;
  const withChannel =
    "defoldChannel" in input
      ? { ...withVersionSource, defoldChannel: input.defoldChannel }
      : withVersionSource;
  const withSha =
    "defoldSha" in input ? { ...withChannel, defoldSha: input.defoldSha } : withChannel;
  const withSurface =
    "apiSurface" in input ? { ...withSha, apiSurface: input.apiSurface } : withSha;
  const withMaterialized =
    "materializedSurface" in input
      ? { ...withSurface, materializedSurface: input.materializedSurface }
      : withSurface;
  const withWalls =
    "directoryWalls" in input
      ? { ...withMaterialized, directoryWalls: input.directoryWalls }
      : withMaterialized;
  const withEligible = "eligible" in input ? { ...withWalls, eligible: input.eligible } : withWalls;
  const withInstall =
    "installCommand" in input
      ? { ...withEligible, installCommand: input.installCommand }
      : withEligible;
  const withManual =
    "manualSteps" in input ? { ...withInstall, manualSteps: input.manualSteps } : withInstall;
  const withActions = "actions" in input ? { ...withManual, actions: input.actions } : withManual;
  const withAdded = "addedTo" in input ? { ...withActions, addedTo: input.addedTo } : withActions;
  const withRemoved =
    "removedFrom" in input ? { ...withAdded, removedFrom: input.removedFrom } : withAdded;
  const withBoot = "bootPath" in input ? { ...withRemoved, bootPath: input.bootPath } : withRemoved;
  const withSub = "subcommand" in input ? { ...withBoot, subcommand: input.subcommand } : withBoot;
  const withExit = "exitCode" in input ? { ...withSub, exitCode: input.exitCode } : withSub;
  const withOutput = "output" in input ? { ...withExit, output: input.output } : withExit;
  const withBobJar = "bobJar" in input ? { ...withOutput, bobJar: input.bobJar } : withOutput;
  const withJava = "java" in input ? { ...withBobJar, java: input.java } : withBobJar;
  const withOperations =
    "operations" in input ? { ...withJava, operations: input.operations } : withJava;
  const withExtensions =
    "extensions" in input ? { ...withOperations, extensions: input.extensions } : withOperations;
  const withLibraries =
    "libraries" in input ? { ...withExtensions, libraries: input.libraries } : withExtensions;
  const payload =
    "warnings" in input ? { ...withLibraries, warnings: input.warnings } : withLibraries;
  return `${JSON.stringify(payload)}\n`;
}

export type WatchEventName = "build" | "rebuild" | "resolve" | "start" | "stop";

export interface WatchErrorEntry {
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly message: string;
}

export interface RenderWatchEventInput {
  readonly event: WatchEventName;
  readonly written?: readonly string[];
  readonly changed?: readonly string[];
  readonly removed?: readonly string[];
  readonly warnings?: readonly string[];
  readonly error?: string;
  readonly errors?: readonly WatchErrorEntry[];
}

export function renderWatchEvent(input: RenderWatchEventInput): string {
  const ok = input.error === undefined && input.errors === undefined;
  const base = ok
    ? { command: "watch" as const, event: input.event, ok, written: input.written ?? [] }
    : { command: "watch" as const, event: input.event, ok };
  const withError = "error" in input ? { ...base, error: input.error } : base;
  const withErrors = "errors" in input ? { ...withError, errors: input.errors } : withError;
  const withChanged = "changed" in input ? { ...withErrors, changed: input.changed } : withErrors;
  const withRemoved = "removed" in input ? { ...withChanged, removed: input.removed } : withChanged;
  const withWarnings =
    "warnings" in input ? { ...withRemoved, warnings: input.warnings } : withRemoved;
  return `${JSON.stringify(withWarnings)}\n`;
}
