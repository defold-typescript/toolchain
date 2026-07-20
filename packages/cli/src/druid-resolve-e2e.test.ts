import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { transpileProject } from "@defold-typescript/transpiler";
import { type ExtensionZip, extensionArchiveKey } from "./extension-archive";
import { runResolve } from "./resolve";

const libraryTypesRoot = join(import.meta.dir, "..", "..", "library-types");
const committedDruid = join(libraryTypesRoot, "generated", "druid.d.ts");
const generatedDir = join(libraryTypesRoot, "generated");

const druidRegistry = [
  { sourceId: "druid", modules: ["druid.druid"], generatedStems: { "druid.druid": "druid" } },
];

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "druid-e2e-"));
}

const someBytes = async (): Promise<Uint8Array> => new TextEncoder().encode("z");

// A fake druid archive that ships `druid/druid.lua` under the GitHub wrapper
// dir, so the repo-name match verifies against the `druid.druid` module.
function druidArchiveReadZip(url: string): (zipPath: string) => ExtensionZip {
  const key = extensionArchiveKey(url);
  return (zipPath: string) => {
    if (basename(dirname(zipPath)) !== key) {
      throw new Error(`no fake archive for ${zipPath}`);
    }
    return {
      entries: () => ["druid-1.2.5/druid/druid.lua", "druid-1.2.5/asset/foo.png"],
      read: (entry: string) => {
        throw new Error(`unexpected read of ${entry}`);
      },
    };
  };
}

async function resolveDruid(cwd: string): Promise<void> {
  const url = "https://github.com/Insality/druid/archive/1.2.5.zip";
  writeFileSync(join(cwd, "game.project"), `[project]\ndependencies#0 = ${url}\n`);
  writeFileSync(
    join(cwd, "tsconfig.json"),
    `${JSON.stringify({ compilerOptions: { types: ["@defold-typescript/types"] } }, null, 2)}\n`,
  );
  const result = await runResolve({
    cwd,
    cacheDir: tmp(),
    download: someBytes,
    readZip: druidArchiveReadZip(url),
    libraryRegistry: druidRegistry,
    libraryGeneratedDir: generatedDir,
  });
  expect(result.ok).toBe(true);
  expect(result.libraries).toEqual([
    { url, source: "druid", modules: ["druid.druid"], provenance: "vendored", verified: true },
  ]);
}

function errorDiagnostics(files: Record<string, string>): string[] {
  return transpileProject({ files })
    .diagnostics.filter((d) => d.category !== "warning")
    .map((d) => d.message);
}

describe("druid resolves and its materialized types are usable end to end", () => {
  test("runResolve materializes druid.druid.d.ts byte-identical to the committed source", async () => {
    const cwd = tmp();
    await resolveDruid(cwd);

    const materialized = join(cwd, ".defold-types", "libraries", "druid.druid.d.ts");
    expect(readFileSync(materialized, "utf8")).toBe(readFileSync(committedDruid, "utf8"));
  });

  test('a consumer compiles against the materialized types and transpiles to require("druid.druid")', async () => {
    const cwd = tmp();
    await resolveDruid(cwd);
    const druidTypes = readFileSync(
      join(cwd, ".defold-types", "libraries", "druid.druid.d.ts"),
      "utf8",
    );

    const consumer = [
      'import * as druid from "druid.druid";',
      "declare const context: LuaTable;",
      "const instance = druid.new(context, undefined);",
      "instance.update(0.016);",
    ].join("\n");

    const project = transpileProject({
      files: { "druid.druid.d.ts": druidTypes, "main.ts": consumer },
    });
    const errors = project.diagnostics.filter((d) => d.category !== "warning");
    expect(errors).toEqual([]);
    expect(project.lua["main.ts"]).toMatchSnapshot();
  });

  test("a consumer that misuses the druid API produces an error diagnostic (the check is not vacuous)", async () => {
    const cwd = tmp();
    await resolveDruid(cwd);
    const druidTypes = readFileSync(
      join(cwd, ".defold-types", "libraries", "druid.druid.d.ts"),
      "utf8",
    );

    const misuse = [
      'import * as druid from "druid.druid";',
      "declare const context: LuaTable;",
      "const instance = druid.new(context, undefined);",
      'instance.update("not a number");',
    ].join("\n");

    const errors = errorDiagnostics({ "druid.druid.d.ts": druidTypes, "main.ts": misuse });
    expect(errors.length).toBeGreaterThan(0);
  });
});
