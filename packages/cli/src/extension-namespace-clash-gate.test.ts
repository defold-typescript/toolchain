import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import * as ts from "typescript";
import { emitExtensionDeclarationFromDoc } from "./extension-emit";
import { loadLibraryIndexSlotClassifications } from "./library-registry";
import { resolveCurrentSurfaceGeneratedDir } from "./materialize";

const REPO_ROOT = join(import.meta.dir, "../../..");
const LIBRARY_TYPES_DIR = join(REPO_ROOT, "packages/library-types");
const TYPES_INDEX = join(REPO_ROOT, "packages/types/index.d.ts");
const CORE_TYPES = join(REPO_ROOT, "packages/types/src/core-types");
const EXTENSION_CORE_TYPES_IMPORT = '"../src/core-types"';

interface ExtensionManifest {
  libraries: { docs: { page: string; namespace: string }[] }[];
}

// A curated doc joins when its namespace is declared twice: by another curated
// doc, or by the engine surface the editor and `build` type-check against.
function sharedNamespaceDocs(): { page: string; namespace: string }[] {
  const manifest = JSON.parse(
    readFileSync(join(LIBRARY_TYPES_DIR, "defold-extensions.json"), "utf8"),
  ) as ExtensionManifest;
  const docs = manifest.libraries.flatMap((library) => library.docs);
  const surface = resolveCurrentSurfaceGeneratedDir();
  if (surface === null) throw new Error("no default engine surface is registered");
  const declarers = new Map<string, number>();
  for (const { namespace } of docs) declarers.set(namespace, (declarers.get(namespace) ?? 0) + 1);
  return docs.filter(
    ({ namespace }) =>
      (declarers.get(namespace) ?? 0) > 1 ||
      existsSync(join(surface, `${namespace.replaceAll(".", "_")}.d.ts`)),
  );
}

function compilerOptions(): ts.CompilerOptions {
  const parsed = ts.getParsedCommandLineOfConfigFile(join(REPO_ROOT, "tsconfig.json"), undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    },
  });
  if (parsed === undefined) throw new Error("root tsconfig.json did not parse");
  return { ...parsed.options, skipLibCheck: false, noEmit: true, types: [] };
}

function describeDiagnostic(diagnostic: ts.Diagnostic): string {
  const file = diagnostic.file === undefined ? "(global)" : basename(diagnostic.file.fileName);
  const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  return `${file} TS${diagnostic.code}: ${text}`;
}

describe("extension namespace clash gate", () => {
  test("every curated doc sharing a namespace compiles beside the engine surface", async () => {
    const members = sharedNamespaceDocs();
    expect(members).not.toEqual([]);

    const dir = mkdtempSync(join(tmpdir(), "extension-namespace-clash-"));
    try {
      const files: string[] = [];
      const classifications = loadLibraryIndexSlotClassifications(LIBRARY_TYPES_DIR);
      for (const { page } of members) {
        const doc = JSON.parse(
          readFileSync(
            join(LIBRARY_TYPES_DIR, "defold-extensions", "api-doc", `${page}.json`),
            "utf8",
          ),
        ) as { info: { namespace: string } };
        const { contents, deprecatedGlobal } = await emitExtensionDeclarationFromDoc(
          doc,
          [page],
          classifications,
        );
        for (const [file, text] of [
          [join(dir, `${page}.d.ts`), contents],
          [join(dir, `${page}.global.d.ts`), deprecatedGlobal],
        ] as const) {
          if (text === undefined) continue;
          writeFileSync(
            file,
            text.replaceAll(EXTENSION_CORE_TYPES_IMPORT, JSON.stringify(CORE_TYPES)),
          );
          files.push(file);
        }
      }
      expect(files.filter((file) => file.endsWith(".global.d.ts"))).not.toEqual([]);

      const program = ts.createProgram([TYPES_INDEX, ...files], compilerOptions());
      const diagnostics = ts.getPreEmitDiagnostics(program).map(describeDiagnostic);
      if (diagnostics.length > 0) {
        throw new Error(
          `these shared-namespace extension declarations clash:\n${diagnostics.join("\n")}`,
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
