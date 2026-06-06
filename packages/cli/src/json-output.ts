export type CliCommand = "init" | "build" | "setup-debug";

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
  const payload =
    "manualSteps" in input ? { ...withInstall, manualSteps: input.manualSteps } : withInstall;
  return `${JSON.stringify(payload)}\n`;
}
