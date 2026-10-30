import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { transpileProject } from "@defold-typescript/transpiler";
import { readCliVersion } from "./cli-version";
import {
  type DownloadExtensionArchive,
  type ExtensionZip,
  extensionArchiveKey,
} from "./extension-archive";
import { LIBRARY_DATA_DIR } from "./library/package-root";
import { printedModule } from "./library/print-corpus";
import { librariesDirName } from "./library-materialize";
import { runResolve } from "./resolve";

// The materialized library surface carries the generating toolchain version;
// these tests defend other behavior, so they derive the name from production.
const LIBRARIES_DIR = librariesDirName(readCliVersion());

const libraryDataDir = LIBRARY_DATA_DIR;
const vendoredDruid = join(libraryDataDir, "fixtures", "luals", "druid");

const druidRegistry = [
  { sourceId: "druid", modules: ["druid.druid"], namespaces: { "druid.druid": "druid" } },
];

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "druid-e2e-"));
}

const someBytes: DownloadExtensionArchive = async () => ({
  status: "ok",
  bytes: new TextEncoder().encode("z"),
});

// A fake druid archive holding the vendored druid sources under the GitHub
// wrapper dir, so the repo-name match verifies against the `druid.druid` module
// and `resolve` prints it from the archive.
function druidArchiveReadZip(url: string): (zipPath: string) => ExtensionZip {
  const key = extensionArchiveKey(url);
  const files = new Map<string, string>();
  for (const entry of readdirSync(vendoredDruid, { recursive: true }).map(String)) {
    if (statSync(join(vendoredDruid, entry)).isFile()) {
      files.set(
        `druid-1.2.5/${entry.replace(/\\/g, "/")}`,
        readFileSync(join(vendoredDruid, entry), "utf8"),
      );
    }
  }
  return (zipPath: string) => {
    if (basename(dirname(zipPath)) !== key) {
      throw new Error(`no fake archive for ${zipPath}`);
    }
    return {
      entries: () => [...files.keys(), "druid-1.2.5/asset/foo.png"],
      comment: () => "",
      bytes: () => new Uint8Array(0),
      read: (entry: string) => {
        const text = files.get(entry);
        if (text === undefined) throw new Error(`unexpected read of ${entry}`);
        return text;
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
    libraryDataDir,
  });
  expect(result.ok).toBe(true);
  expect(result.libraries).toEqual([
    { url, source: "druid", modules: ["druid.druid"], provenance: "vendored", verified: true },
  ]);
  expect(result.warnings.filter((warning) => warning.startsWith("printed "))).toEqual([]);
}

function errorDiagnostics(files: Record<string, string>): string[] {
  return transpileProject({ files })
    .diagnostics.filter((d) => d.category !== "warning")
    .map((d) => d.message);
}

describe("druid resolves and its materialized types are usable end to end", () => {
  test("runResolve materializes druid.druid.d.ts byte-identical to the pinned print", async () => {
    const cwd = tmp();
    await resolveDruid(cwd);

    const materialized = join(cwd, ".defold-types", LIBRARIES_DIR, "druid.druid.d.ts");
    expect(readFileSync(materialized, "utf8")).toBe(
      await printedModule(libraryDataDir, "druid.druid"),
    );
  });

  test('a consumer compiles against the materialized types and transpiles to require("druid.druid")', async () => {
    const cwd = tmp();
    await resolveDruid(cwd);
    const druidTypes = readFileSync(
      join(cwd, ".defold-types", LIBRARIES_DIR, "druid.druid.d.ts"),
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
      join(cwd, ".defold-types", LIBRARIES_DIR, "druid.druid.d.ts"),
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
