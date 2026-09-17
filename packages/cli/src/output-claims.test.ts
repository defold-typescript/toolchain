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

describe("output claims — the runtime artifacts", () => {
  // A spread pulls the TypeScript standard-library bundle, so the build writes
  // `lualib_bundle.lua` alongside the source's own output.
  const SPREADING =
    'import { defineScript } from "@defold-typescript/types";\n' +
    "const parts = [1, 2];\n" +
    "const all = [...parts, 3];\n" +
    "export default defineScript({ init() { print(all[0]); } });\n";
  const TIMING =
    'import { setTimeout } from "@defold-typescript/types/timers";\n' +
    "setTimeout(() => print(1), 250);\n";
  const HAND_AUTHORED = "local M = {}\nfunction M.helper() end\nreturn M\n";

  function scaffold(source: string): void {
    writeFile("tsconfig.json", TSCONFIG);
    writeFile("src/main.ts", source);
  }

  test("a hand-authored lualib bundle fails the build and is left alone", () => {
    scaffold(SPREADING);
    writeFile("lualib_bundle.lua", HAND_AUTHORED);

    expect(() => runBuild({ cwd })).toThrow(/lualib_bundle\.lua/);
    expect(read("lualib_bundle.lua")).toBe(HAND_AUTHORED);
    expect(existsSync(path.join(cwd, "src/main.ts.script"))).toBe(false);
  });

  test("a hand-authored timers runtime fails the build and is left alone", () => {
    scaffold(TIMING);
    writeFile("defold_typescript_timers.lua", HAND_AUTHORED);

    expect(() => runBuild({ cwd })).toThrow(/defold_typescript_timers\.lua/);
    expect(read("defold_typescript_timers.lua")).toBe(HAND_AUTHORED);
    expect(existsSync(path.join(cwd, "src/main.lua"))).toBe(false);
  });

  test("a generated lualib bundle is still overwritten", () => {
    scaffold(SPREADING);
    writeFile("lualib_bundle.lua", `-- stale\n${GENERATED_BANNER}\n`);

    const result = runBuild({ cwd });

    expect(result.written).toContain("lualib_bundle.lua");
    expect(read("lualib_bundle.lua")).not.toContain("-- stale");
  });

  test("a source compiling to the bundle's path collides with the artifact", () => {
    // An `outDir` strips the include base, so a source named after the bundle
    // lands on the very rel the bundle claims.
    writeFile(
      "tsconfig.json",
      JSON.stringify(
        {
          compilerOptions: { target: "ES2022", module: "ESNext", strict: true, outDir: "build" },
          include: ["src/**/*.ts"],
        },
        null,
        2,
      ),
    );
    writeFile("src/main.ts", SPREADING);
    writeFile("src/lualib_bundle.ts", "export const VALUE = 1;\n");

    // The artifact claims first, so it is the incumbent the source contends with.
    expect(() => runBuild({ cwd })).toThrow(
      /build\/lualib_bundle\.lua is claimed by two sources: the TypeScript standard-library bundle and src\/lualib_bundle\.ts/,
    );
  });

  test("a hand-authored lualib bundle fails a watch build too", () => {
    scaffold(SPREADING);
    writeFile("lualib_bundle.lua", HAND_AUTHORED);

    const session = createBuildSession({ cwd });

    expect(() => session.buildAll()).toThrow(/lualib_bundle\.lua/);
    expect(read("lualib_bundle.lua")).toBe(HAND_AUTHORED);
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
