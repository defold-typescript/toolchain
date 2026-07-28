import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { transpileProject } from "@defold-typescript/transpiler";
import { type ExtensionZip, extensionArchiveKey } from "./extension-archive";
import { runResolve } from "./resolve";

const libraryTypesRoot = join(import.meta.dir, "..", "..", "library-types");
const committedDefcon = join(libraryTypesRoot, "generated", "defcon.d.ts");
const generatedDir = join(libraryTypesRoot, "generated");

const defconRegistry = [
  {
    sourceId: "defcon",
    modules: ["defcon.console"],
    generatedStems: { "defcon.console": "defcon" },
  },
];

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "defcon-e2e-"));
}

const someBytes = async (): Promise<Uint8Array> => new TextEncoder().encode("z");

// A fake defcon archive that ships `defcon/console.lua` under the GitHub wrapper
// dir, so the repo-name match verifies against the `defcon.console` module.
function defconArchiveReadZip(url: string): (zipPath: string) => ExtensionZip {
  const key = extensionArchiveKey(url);
  return (zipPath: string) => {
    if (basename(dirname(zipPath)) !== key) {
      throw new Error(`no fake archive for ${zipPath}`);
    }
    return {
      entries: () => ["defcon-2.6.0/defcon/console.lua", "defcon-2.6.0/asset/foo.png"],
      read: (entry: string) => {
        throw new Error(`unexpected read of ${entry}`);
      },
    };
  };
}

async function resolveDefcon(cwd: string): Promise<void> {
  const url = "https://github.com/britzl/defcon/archive/2.6.0.zip";
  writeFileSync(join(cwd, "game.project"), `[project]\ndependencies#0 = ${url}\n`);
  writeFileSync(
    join(cwd, "tsconfig.json"),
    `${JSON.stringify({ compilerOptions: { types: ["@defold-typescript/types"] } }, null, 2)}\n`,
  );
  const result = await runResolve({
    cwd,
    cacheDir: tmp(),
    download: someBytes,
    readZip: defconArchiveReadZip(url),
    libraryRegistry: defconRegistry,
    libraryGeneratedDir: generatedDir,
  });
  expect(result.ok).toBe(true);
  expect(result.libraries).toEqual([
    { url, source: "defcon", modules: ["defcon.console"], provenance: "vendored", verified: true },
  ]);
}

function errorDiagnostics(files: Record<string, string>): string[] {
  return transpileProject({ files })
    .diagnostics.filter((d) => d.category !== "warning")
    .map((d) => d.message);
}

describe("defcon resolves and its materialized types are usable end to end", () => {
  test("runResolve materializes defcon.console.d.ts byte-identical to the committed source", async () => {
    const cwd = tmp();
    await resolveDefcon(cwd);

    const materialized = join(cwd, ".defold-types", "libraries", "defcon.console.d.ts");
    expect(readFileSync(materialized, "utf8")).toBe(readFileSync(committedDefcon, "utf8"));
  });

  test('a consumer compiles against the materialized types and transpiles to require("defcon.console")', async () => {
    const cwd = tmp();
    await resolveDefcon(cwd);
    const defconTypes = readFileSync(
      join(cwd, ".defold-types", "libraries", "defcon.console.d.ts"),
      "utf8",
    );

    const consumer = ['import * as defcon from "defcon.console";', "defcon.start(8000);"].join(
      "\n",
    );

    const project = transpileProject({
      files: { "defcon.console.d.ts": defconTypes, "main.ts": consumer },
    });
    const errors = project.diagnostics.filter((d) => d.category !== "warning");
    expect(errors).toEqual([]);
    expect(project.lua["main.ts"]).toMatchSnapshot();
  });

  test("a consumer that misuses the defcon API produces an error diagnostic (the check is not vacuous)", async () => {
    const cwd = tmp();
    await resolveDefcon(cwd);
    const defconTypes = readFileSync(
      join(cwd, ".defold-types", "libraries", "defcon.console.d.ts"),
      "utf8",
    );

    const misuse = ['import * as defcon from "defcon.console";', 'defcon.start("x");'].join("\n");

    const errors = errorDiagnostics({ "defcon.console.d.ts": defconTypes, "main.ts": misuse });
    expect(errors.length).toBeGreaterThan(0);
  });
});
