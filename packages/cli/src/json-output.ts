export type CliCommand = "init" | "build" | "setup-debug" | "defold";

export interface RenderResultInput {
  readonly command: CliCommand;
  readonly written?: readonly string[];
  readonly error?: string;
  readonly defoldVersion?: string;
  readonly apiSurface?: string | null;
  readonly scriptKind?: string | null;
  readonly materializedSurface?: string | null;
  readonly installCommand?: string;
  readonly manualSteps?: readonly string[];
  readonly actions?: Record<string, string>;
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
  const withInstall =
    "installCommand" in input
      ? { ...withMaterialized, installCommand: input.installCommand }
      : withMaterialized;
  const withManual =
    "manualSteps" in input ? { ...withInstall, manualSteps: input.manualSteps } : withInstall;
  const withActions = "actions" in input ? { ...withManual, actions: input.actions } : withManual;
  const withSub =
    "subcommand" in input ? { ...withActions, subcommand: input.subcommand } : withActions;
  const payload = "exitCode" in input ? { ...withSub, exitCode: input.exitCode } : withSub;
  return `${JSON.stringify(payload)}\n`;
}
