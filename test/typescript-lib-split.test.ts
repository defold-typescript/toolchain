import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { BUNDLED_LIBRARIES } from "../packages/transpiler/src/bundled-libraries";
import { LUA_COMPILE_LIB } from "../packages/transpiler/src/lua-compile-lib";
import { createTranspileSession } from "../packages/transpiler/src/session";

const repoRoot = join(import.meta.dir, "..");

function resolvedLib(configPath: string): readonly string[] | undefined {
  const host: ts.ParseConfigFileHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    },
  };
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, host);
  if (!parsed) {
    throw new Error(`${configPath} did not parse`);
  }
  return parsed.options.lib;
}

function expectLuaCompileLib(label: string, lib: readonly string[] | undefined): void {
  expect(
    lib,
    `${label} resolves lib to ${JSON.stringify(lib)}; the Lua compile accepts only ${JSON.stringify(LUA_COMPILE_LIB)} (LUA_COMPILE_LIB)`,
  ).toEqual([...LUA_COMPILE_LIB]);
}

describe("Lua-bound tsconfigs use the Lua compile's lib", () => {
  for (const library of BUNDLED_LIBRARIES) {
    test(`every packages/${library.id} tsconfig`, () => {
      const dir = join(repoRoot, "packages", library.id);
      const configs = readdirSync(dir).filter((name) => /^tsconfig.*\.json$/.test(name));
      expect(configs.length).toBeGreaterThan(0);
      for (const name of configs) {
        expectLuaCompileLib(`packages/${library.id}/${name}`, resolvedLib(join(dir, name)));
      }
    });
  }

  test("packages/types/tsconfig.json", () => {
    expectLuaCompileLib(
      "packages/types/tsconfig.json",
      resolvedLib(join(repoRoot, "packages/types/tsconfig.json")),
    );
  });

  test("the scaffolded project's tsconfig", () => {
    const scaffoldPath = join(repoRoot, "packages/cli/src/scaffold-tsconfig.json");
    const converted = ts.convertCompilerOptionsFromJson(
      JSON.parse(readFileSync(scaffoldPath, "utf8")),
      repoRoot,
    );
    expect(converted.errors).toEqual([]);
    expectLuaCompileLib("packages/cli/src/scaffold-tsconfig.json", converted.options.lib);
  });
});

// The build and the editor/watch path both compile user code through the
// session, so its program is where the Lua compile's lib shows.
test("the transpile session compiles against the Lua compile's lib", () => {
  const session = createTranspileSession();
  session.update({ "main.ts": "export const x = 1;" });
  expectLuaCompileLib("the transpile session", session.getProgram()?.getCompilerOptions().lib);
});
