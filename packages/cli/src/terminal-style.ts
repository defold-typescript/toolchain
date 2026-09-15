export type Severity = "error" | "warning";

export const SGR_ERROR = "\x1b[1;31m";
export const SGR_WARNING = "\x1b[1;33m";
export const SGR_RESET = "\x1b[0m";

export interface ColorPolicyInput {
  readonly stream: { readonly isTTY?: boolean };
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly noColor: boolean;
  readonly json: boolean;
}

// FORCE_COLOR is deliberately ignored: agent shells export it, and honoring it
// would put escapes into piped output and test captures.
export function colorEnabled({ stream, env, noColor, json }: ColorPolicyInput): boolean {
  if (noColor || json) return false;
  if (stream.isTTY !== true) return false;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  if (env.TERM === "dumb") return false;
  return true;
}

const PREFIX = /^defold-typescript(?: [a-z-]+)*: /;

export function severityLine(message: string, severity: Severity, color: boolean): string {
  const prefix = message.match(PREFIX)?.[0] ?? "";
  let rest = message.slice(prefix.length);
  if (rest.startsWith(`${severity}: `)) rest = rest.slice(severity.length + 2);
  const word = color
    ? `${severity === "error" ? SGR_ERROR : SGR_WARNING}${severity}${SGR_RESET}`
    : severity;
  return `${prefix}${word}: ${rest}`;
}

const CONSOLE_TAG = /^(ERROR|WARNING):/;

export function colorConsoleTag(line: string, color: boolean): string {
  if (!color) return line;
  const tag = line.match(CONSOLE_TAG)?.[1];
  if (tag === undefined) return line;
  const sgr = tag === "ERROR" ? SGR_ERROR : SGR_WARNING;
  return `${sgr}${tag}${SGR_RESET}${line.slice(tag.length)}`;
}
