import { dirname, resolve } from "node:path";
import { readCliVersion } from "../cli-version";
import { libraryDataFromFlag } from "../data-folder-flag";

export interface ToolData {
  /** The data folder `--data` selects: every file describing a library. */
  dataDir: string;
  /** The directory holding `--data`, where the regenerated `api-doc/` and `fidelity/` go. */
  reportRoot: string;
}

function dataFlagValue(argv: readonly string[]): string | undefined {
  let value: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--data") {
      value = argv[i + 1];
      i++;
    } else if (arg?.startsWith("--data=")) {
      value = arg.slice("--data=".length);
    }
  }
  return value;
}

/**
 * The library tools' `--data <dir>`, read by the rule `library check --data` uses.
 * `tool` names the tool file in the error, so the refusal says how to run it.
 */
export function toolDataFromArgv(
  argv: readonly string[],
  cwd: string,
  tool: string,
): ToolData | { error: string } {
  const value = dataFlagValue(argv);
  if (value === undefined || value === "" || value.startsWith("-")) {
    return {
      error: `${tool} needs the library data directory; use: bun ${tool} --data <dir>`,
    };
  }
  const selected = libraryDataFromFlag(`${tool}: --data`, value, cwd, readCliVersion());
  if ("error" in selected) return selected;
  return { dataDir: selected.dir, reportRoot: dirname(resolve(cwd, value)) };
}

/** `toolDataFromArgv` over this process's arguments, exiting 1 with the error. */
export function toolDataOrExit(tool: string): ToolData {
  const result = toolDataFromArgv(process.argv.slice(2), process.cwd(), tool);
  if ("error" in result) {
    console.error(result.error);
    process.exit(1);
  }
  return result;
}
