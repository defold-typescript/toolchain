import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { debugLaunchConfig } from "./debug-launcher";
import { parseJsoncObject } from "./jsonc-file";
import { writeVscodeLaunch } from "./vscode-debug-scaffold";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-vscode-debug-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe("writeVscodeLaunch", () => {
  test("a comment inside or above an untouched user entry in configurations survives adding ours", () => {
    const userEntry = [
      "    // attach to the running game",
      "    {",
      '      "name": "Attach", // by hand',
      '      "type": "lua-local",',
      '      "request": "attach"',
      "    }",
    ].join("\n");
    mkdirSync(path.join(cwd, ".vscode"));
    writeFileSync(
      path.join(cwd, ".vscode", "launch.json"),
      `{\n  "version": "0.2.0",\n  "configurations": [\n${userEntry}\n  ]\n}\n`,
    );
    const config = { outDir: "out", include: ["src/**/*.ts"] };

    expect(writeVscodeLaunch(cwd, config, "create")).toBe("refreshed");

    const text = readFileSync(path.join(cwd, ".vscode", "launch.json"), "utf8");
    expect(text).toContain(userEntry);
    const launch = parseJsoncObject(text, "launch.json") as { configurations: unknown[] };
    expect(launch.configurations).toHaveLength(2);
    expect(launch.configurations[1]).toEqual(debugLaunchConfig(config));
  });
});
