import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";
import { BUNDLED_LIBRARIES, type BundledLibrary, bundledModules } from "../src/bundled-libraries";

const PACKAGES_ROOT = path.resolve(import.meta.dir, "..", "..");

export const REGENERATE_DECLARATIONS = "bun run --cwd packages/transpiler declarations";

/** Where a library's generated `.d.ts` files live in `@defold-typescript/types`. */
export function libraryDeclarationsDir(library: BundledLibrary): string {
  return path.join(PACKAGES_ROOT, "types", library.id);
}

function header(library: BundledLibrary, name: string): string {
  return `// Generated from packages/${library.id}/src/${name}.ts by \`${REGENERATE_DECLARATIONS}\`; do not edit.\n`;
}

function describeDiagnostic(root: string, d: ts.Diagnostic): string {
  const text = ts.flattenDiagnosticMessageText(d.messageText, "\n");
  if (d.file === undefined || d.start === undefined) {
    return text;
  }
  const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
  return `${path.relative(root, d.file.fileName)}:${line + 1}:${character + 1}: ${text}`;
}

/** The `.d.ts` each module of a library ships as, keyed by module name. */
export function emitLibraryDeclarations(library: BundledLibrary): Record<string, string> {
  const libraryRoot = path.join(PACKAGES_ROOT, library.id);
  const sourceDir = path.join(libraryRoot, "src");
  const parsed = ts.getParsedCommandLineOfConfigFile(
    path.join(libraryRoot, "tsconfig.json"),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(describeDiagnostic(libraryRoot, d));
      },
    },
  );
  if (parsed === undefined) {
    throw new Error(`packages/${library.id}/tsconfig.json did not parse`);
  }
  const names = bundledModules(library).map(({ name }) => name);
  const env = path.join(sourceDir, "env.d.ts");
  const roots = [
    ...names.map((name) => path.join(sourceDir, `${name}.ts`)),
    ...(existsSync(env) ? [env] : []),
  ];
  const program = ts.createProgram(roots, {
    ...parsed.options,
    noEmit: false,
    declaration: true,
    emitDeclarationOnly: true,
    declarationMap: false,
    sourceMap: false,
    outDir: path.join(libraryRoot, ".declarations"),
    rootDir: sourceDir,
  });
  const problems = ts.getPreEmitDiagnostics(program).map((d) => describeDiagnostic(libraryRoot, d));
  if (problems.length > 0) {
    throw new Error(
      `${library.id} declarations: the source does not type-check:\n  ${problems.join("\n  ")}`,
    );
  }

  const emitted: Record<string, string> = {};
  const wanted = new Set(names);
  const result = program.emit(undefined, (fileName, text) => {
    const name = path.basename(fileName, ".d.ts");
    if (wanted.has(name)) {
      emitted[name] = `${header(library, name)}${text}`;
    }
  });
  const emitProblems = result.diagnostics.map((d) => describeDiagnostic(libraryRoot, d));
  if (emitProblems.length > 0) {
    throw new Error(`${library.id} declarations: emit failed:\n  ${emitProblems.join("\n  ")}`);
  }
  return emitted;
}

if (import.meta.main) {
  for (const library of BUNDLED_LIBRARIES) {
    const declarations = emitLibraryDeclarations(library);
    const dir = libraryDeclarationsDir(library);
    mkdirSync(dir, { recursive: true });
    for (const entry of readdirSync(dir)) {
      if (entry.endsWith(".d.ts") && !(path.basename(entry, ".d.ts") in declarations)) {
        rmSync(path.join(dir, entry));
      }
    }
    for (const [name, text] of Object.entries(declarations)) {
      writeFileSync(path.join(dir, `${name}.d.ts`), text);
      process.stdout.write(`wrote packages/types/${library.id}/${name}.d.ts\n`);
    }
  }
}
