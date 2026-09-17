import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runBuild } from "./build";
import { GENERATED_BANNER } from "./build-output";
import { createBuildSession } from "./build-session";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-claims-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function writeFile(rel: string, contents: string): void {
  const abs = path.join(cwd, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
}

function read(rel: string): string {
  return readFileSync(path.join(cwd, rel), "utf8");
}

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: { target: "ES2022", module: "ESNext", strict: true },
    include: ["src/**/*.ts"],
  },
  null,
  2,
);

const DOOR =
  'import { defineScript } from "@defold-typescript/types";\n' +
  "export const DOOR_SPEED = 3;\n" +
  "export default defineScript({ init() { print(DOOR_SPEED); } });\n";

function scaffoldDoor(): void {
  writeFile("tsconfig.json", TSCONFIG);
  writeFile("src/doors/door.ts", DOOR);
}

describe("output claims — the companion's path", () => {
  test("an unclaimed companion path is written", () => {
    scaffoldDoor();

    const result = runBuild({ cwd });

    expect(result.written).toContain("src/doors/door.lua");
    expect(read("src/doors/door.lua")).toContain("____exports.DOOR_SPEED");
  });

  test("a generated file at the companion path is overwritten", () => {
    scaffoldDoor();
    writeFile("src/doors/door.lua", `-- stale\n${GENERATED_BANNER}\n`);

    const result = runBuild({ cwd });

    expect(result.written).toContain("src/doors/door.lua");
    expect(read("src/doors/door.lua")).not.toContain("-- stale");
  });

  test("a hand-authored file at the companion path fails the build and is left alone", () => {
    scaffoldDoor();
    const handAuthored = "local M = {}\nfunction M.open() end\nreturn M\n";
    writeFile("src/doors/door.lua", handAuthored);

    expect(() => runBuild({ cwd })).toThrow(/src\/doors\/door\.lua/);
    expect(read("src/doors/door.lua")).toBe(handAuthored);
    expect(existsSync(path.join(cwd, "src/doors/door.ts.script"))).toBe(false);
  });

  test("the hand-authored failure names the script and its exports", () => {
    scaffoldDoor();
    writeFile("src/doors/door.lua", "local M = {}\nreturn M\n");

    expect(() => runBuild({ cwd })).toThrow(/src\/doors\/door\.ts/);
    expect(() => runBuild({ cwd })).toThrow(/DOOR_SPEED/);
  });
});

describe("output claims — two sources on one path", () => {
  // Two include roots collapsing under one outDir is the shape that reaches a
  // shared output rel without either source being renamed.
  function scaffoldCollision(): void {
    writeFile(
      "tsconfig.json",
      JSON.stringify(
        {
          compilerOptions: { target: "ES2022", module: "ESNext", strict: true, outDir: "build" },
          include: ["src/**/*.ts", "vendor/**/*.ts"],
        },
        null,
        2,
      ),
    );
    writeFile("src/shared.ts", "export const VALUE = 1;\n");
    writeFile("vendor/shared.ts", "export const VALUE = 2;\n");
  }

  test("a second claimant fails the build and leaves the contested file unchanged", () => {
    scaffoldCollision();
    writeFile("build/shared.lua", `-- first\n${GENERATED_BANNER}\n`);

    expect(() => runBuild({ cwd })).toThrow(/build\/shared\.lua/);
    expect(read("build/shared.lua")).toContain("-- first");
  });

  test("the collision names both sources", () => {
    scaffoldCollision();

    expect(() => runBuild({ cwd })).toThrow(/src\/shared\.ts/);
    expect(() => runBuild({ cwd })).toThrow(/vendor\/shared\.ts/);
  });
});

describe("output claims — the watch rebuild path", () => {
  test("a hand-authored companion path fails a watch build too", () => {
    scaffoldDoor();
    const handAuthored = "local M = {}\nreturn M\n";
    writeFile("src/doors/door.lua", handAuthored);

    const session = createBuildSession({ cwd });

    expect(() => session.buildAll()).toThrow(/src\/doors\/door\.lua/);
    expect(read("src/doors/door.lua")).toBe(handAuthored);
  });
});
