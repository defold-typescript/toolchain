export type CliCommand = "init" | "build" | "setup-debug" | "defold";

export interface RenderResultInput {
  readonly command: CliCommand;
  readonly written?: readonly string[];
  readonly error?: string;
  readonly defoldVersion?: string;
  readonly apiSurface?: string | null;
  readonly scriptKind?: string | null;
  readonly materializedSurface?: string | null;
  readonly directoryWalls?: readonly { readonly dir: string; readonly kind: string }[];
  readonly installCommand?: string;
  readonly manualSteps?: readonly string[];
  readonly actions?: Record<string, string>;
  readonly addedTo?: string;
  readonly removedFrom?: readonly string[];
  readonly bootPath?: readonly string[];
  readonly subcommand?: string;
  readonly exitCode?: number;
}

export function renderResult(input: RenderResultInput): string {
  const ok = input.error === undefined;
  const base = ok
    ? { command: input.command, ok, written: input.written ?? [] }
    : { command: input.command, ok, error: input.error };
  const withVersion =
    input.defoldVersion === undefined ? base : { ...base, defoldVersion: input.defoldVersion };
  const withSurface =
    "apiSurface" in input ? { ...withVersion, apiSurface: input.apiSurface } : withVersion;
  const withScriptKind =
    "scriptKind" in input ? { ...withSurface, scriptKind: input.scriptKind } : withSurface;
  const withMaterialized =
    "materializedSurface" in input
      ? { ...withScriptKind, materializedSurface: input.materializedSurface }
      : withScriptKind;
  const withWalls =
    "directoryWalls" in input
      ? { ...withMaterialized, directoryWalls: input.directoryWalls }
      : withMaterialized;
  const withInstall =
    "installCommand" in input ? { ...withWalls, installCommand: input.installCommand } : withWalls;
  const withManual =
    "manualSteps" in input ? { ...withInstall, manualSteps: input.manualSteps } : withInstall;
  const withActions = "actions" in input ? { ...withManual, actions: input.actions } : withManual;
  const withAdded = "addedTo" in input ? { ...withActions, addedTo: input.addedTo } : withActions;
  const withRemoved =
    "removedFrom" in input ? { ...withAdded, removedFrom: input.removedFrom } : withAdded;
  const withBoot = "bootPath" in input ? { ...withRemoved, bootPath: input.bootPath } : withRemoved;
  const withSub = "subcommand" in input ? { ...withBoot, subcommand: input.subcommand } : withBoot;
  const payload = "exitCode" in input ? { ...withSub, exitCode: input.exitCode } : withSub;
  return `${JSON.stringify(payload)}\n`;
}

export type WatchEventName = "build" | "rebuild";

export interface RenderWatchEventInput {
  readonly event: WatchEventName;
  readonly written?: readonly string[];
  readonly changed?: readonly string[];
  readonly removed?: readonly string[];
  readonly error?: string;
}

export function renderWatchEvent(input: RenderWatchEventInput): string {
  const ok = input.error === undefined;
  const base = ok
    ? { command: "watch" as const, event: input.event, ok, written: input.written ?? [] }
    : { command: "watch" as const, event: input.event, ok, error: input.error };
  const withChanged = "changed" in input ? { ...base, changed: input.changed } : base;
  const withRemoved = "removed" in input ? { ...withChanged, removed: input.removed } : withChanged;
  return `${JSON.stringify(withRemoved)}\n`;
}
