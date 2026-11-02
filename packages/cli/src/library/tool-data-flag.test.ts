import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readCliVersion } from "../cli-version";
import { toolDataFromArgv } from "./tool-data-flag";

const TOOL = "packages/cli/src/library/sync-library-types.ts";

function dataRoot(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "tool-data-flag-")));
  const dir = join(root, "data");
  for (const library of ["alpha", "beta"]) {
    mkdirSync(join(dir, "0.1.0", library), { recursive: true });
    writeFileSync(join(dir, "0.1.0", library, "library.json"), "{}\n");
  }
  mkdirSync(join(dir, "0.0.1"), { recursive: true });
  return dir;
}

describe("toolDataFromArgv", () => {
  test("selects the newest data folder and reports beside the --data directory", () => {
    const dir = dataRoot();
    expect(toolDataFromArgv(["--data", dir], "/unrelated", TOOL)).toEqual({
      dataDir: join(dir, "0.1.0"),
      reportRoot: dirname(dir),
    });
  });

  test("reads the --data=<dir> form", () => {
    const dir = dataRoot();
    expect(toolDataFromArgv(["--check", `--data=${dir}`], "/unrelated", TOOL)).toEqual({
      dataDir: join(dir, "0.1.0"),
      reportRoot: dirname(dir),
    });
  });

  test("resolves a relative --data against cwd", () => {
    const dir = dataRoot();
    expect(toolDataFromArgv(["--data", "data"], dirname(dir), TOOL)).toEqual({
      dataDir: join(dir, "0.1.0"),
      reportRoot: dirname(dir),
    });
  });

  test("refuses a run without --data, naming the tool", () => {
    const result = toolDataFromArgv(["--check"], dirname(dataRoot()), TOOL);
    expect("error" in result && result.error).toContain(TOOL);
    expect("error" in result && result.error).toContain("--data <dir>");
  });

  test("refuses a --data with no value", () => {
    const result = toolDataFromArgv(["--data", "--check"], dirname(dataRoot()), TOOL);
    expect("error" in result && result.error).toContain("--data <dir>");
  });

  test("refuses a directory holding no data folder with the shared message", () => {
    const empty = realpathSync(mkdtempSync(join(tmpdir(), "tool-data-flag-empty-")));
    const result = toolDataFromArgv(["--data", empty], "/unrelated", TOOL);
    expect(result).toEqual({
      error: `defold-typescript ${TOOL}: --data ${empty} holds no data folder for CLI version ${readCliVersion()}`,
    });
  });
});
