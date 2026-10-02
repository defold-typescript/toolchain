import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runInit } from "./init";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
const TYPES_PKG = path.join(REPO_ROOT, "packages", "types");
const BIN_DIR = path.join(REPO_ROOT, "node_modules", ".bin");

function linkTypes(cwd: string): void {
  const scope = path.join(cwd, "node_modules", "@defold-typescript");
  mkdirSync(scope, { recursive: true });
  symlinkSync(TYPES_PKG, path.join(scope, "types"), "dir");
}

function run(cmd: string, args: string[], cwd: string): { code: number; output: string } {
  const proc = Bun.spawnSync([path.join(BIN_DIR, cmd), ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: proc.exitCode, output: `${proc.stdout.toString()}${proc.stderr.toString()}` };
}

describe("scaffolded project is clean out of the box", () => {
  test("tsc --noEmit passes on a freshly scaffolded project", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-clean-tsc-"));
    try {
      runInit({ cwd });
      linkTypes(cwd);

      const { code, output } = run("tsc", ["--noEmit", "-p", "tsconfig.json"], cwd);
      if (code !== 0) {
        throw new Error(`tsc reported errors on the scaffold:\n${output}`);
      }
      expect(code).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("tsc --noEmit resolves Lua stdlib globals in scaffolded source", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-clean-lua-"));
    try {
      runInit({ cwd });
      linkTypes(cwd);
      writeFileSync(path.join(cwd, "src", "lua-global.ts"), "export const n = math.floor(1.5);\n");

      const { code, output } = run("tsc", ["--noEmit", "-p", "tsconfig.json"], cwd);
      if (code !== 0) {
        throw new Error(`tsc could not resolve the Lua stdlib globals on the scaffold:\n${output}`);
      }
      expect(code).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("tsc --noEmit resolves the hsm imports through the types package exports", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-clean-hsm-"));
    try {
      runInit({ cwd });
      linkTypes(cwd);
      writeFileSync(
        path.join(cwd, "src", "machine.ts"),
        [
          'import { defineMachine } from "@defold-typescript/types/hsm";',
          'import { type MessageEvent, messageEvents } from "@defold-typescript/types/hsm/defold";',
          "",
          'type DoorEvent = MessageEvent<"trigger_response"> | { type: "CLOSE" };',
          "",
          "export const doorMachine = defineMachine<{}, DoorEvent>()({",
          '  initial: "closed",',
          "  states: {",
          '    closed: { on: { trigger_response: "open" } },',
          '    open: { on: { CLOSE: "closed" } },',
          "  },",
          "});",
          "",
          'export const doorEvents = messageEvents(["trigger_response"]);',
          "",
          "const broken = defineMachine<{}, DoorEvent>()({",
          '  initial: "closed",',
          '  states: { closed: { on: { CLOSE: "nowhere" } } },',
          "});",
          "// @ts-expect-error an unknown target makes the result a MachineConfigError, so the import is not `any`",
          "broken.start({});",
          "",
        ].join("\n"),
      );

      const { code, output } = run("tsc", ["--noEmit", "-p", "tsconfig.json"], cwd);
      if (code !== 0) {
        throw new Error(`tsc could not type the hsm imports on the scaffold:\n${output}`);
      }
      expect(code).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("biome check passes on the scaffolded source surface", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-clean-biome-"));
    try {
      runInit({ cwd });

      const { code, output } = run("biome", ["check", "src"], cwd);
      if (code !== 0) {
        throw new Error(`biome reported violations on the scaffold:\n${output}`);
      }
      expect(code).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
