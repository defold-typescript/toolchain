// The declarations a dependency ships for itself: every `types/*.d.ts` at its
// archive root. `resolve` installs them in place of anything else the dependency
// would contribute, but only once they compile against the engine surface — the
// scaffolded project sets `skipLibCheck`, so a name the engine surface lacks
// (ts-defold's `hash`, `vmath.vector3`) would otherwise type as `any` silently.

import * as path from "node:path";
import { archiveWrapperOf } from "@defold-typescript/transpiler";
import * as ts from "typescript";

const SHIPPED_PATH = /^types\/[^/\\]+\.d\.ts$/;

const VIRTUAL_DIR = "__shipped_declarations__";

const CHECK_OPTIONS: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  skipLibCheck: false,
  types: [],
  target: ts.ScriptTarget.ESNext,
  lib: ["lib.esnext.d.ts"],
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
};

export interface ShippedDeclarationFile {
  readonly entry: string;
  readonly contents: string;
}

// Archive entry paths, sorted. Only the `types/` folder's own files count: a
// nested folder or a `.d.ts` elsewhere in the archive is not a shipped surface.
// A name holding `\` is skipped too, since Windows reads it as a folder.
export function locateShippedDeclarations(entries: readonly string[]): string[] {
  const wrapper = archiveWrapperOf(entries);
  return entries
    .filter((entry) =>
      SHIPPED_PATH.test(wrapper === undefined ? entry : entry.slice(wrapper.length + 1)),
    )
    .sort();
}

// One call checks one dependency's files together, served under their own
// names in one virtual folder, so a relative reference between them (`export *
// from "./foo"`, `typeof import("./index")`) resolves as it will once
// installed. Each entry maps to its error messages, empty when the file is
// clean.
export function checkShippedDeclarations(
  files: readonly ShippedDeclarationFile[],
  typesRoot: string,
): Map<string, string[]> {
  const messages = new Map<string, string[]>(files.map(({ entry }) => [entry, []]));
  if (files.length === 0) {
    return messages;
  }
  const virtualDir = path.join(typesRoot, VIRTUAL_DIR);
  // Entries come from one archive's `types/` folder, so basenames are unique.
  const byPath = new Map(
    files.map((file) => [path.resolve(virtualDir, path.posix.basename(file.entry)), file]),
  );
  const shippedAt = (fileName: string): ShippedDeclarationFile | undefined =>
    byPath.get(path.resolve(fileName));

  const host = ts.createCompilerHost(CHECK_OPTIONS, true);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);
  const directoryExists = host.directoryExists?.bind(host) ?? ts.sys.directoryExists;
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const shipped = shippedAt(fileName);
    return shipped === undefined
      ? getSourceFile(fileName, languageVersion, onError, shouldCreate)
      : ts.createSourceFile(fileName, shipped.contents, languageVersion, true);
  };
  host.fileExists = (fileName) => shippedAt(fileName) !== undefined || fileExists(fileName);
  host.readFile = (fileName) => shippedAt(fileName)?.contents ?? readFile(fileName);
  // TypeScript skips every file lookup under a directory reported missing, and
  // the virtual folder exists nowhere on disk.
  host.directoryExists = (directoryName) =>
    path.resolve(directoryName) === virtualDir || directoryExists(directoryName);

  const program = ts.createProgram({
    rootNames: [path.join(typesRoot, "index.d.ts"), ...byPath.keys()],
    options: CHECK_OPTIONS,
    host,
  });
  for (const sourceFile of program.getSourceFiles()) {
    const shipped = shippedAt(sourceFile.fileName);
    if (shipped === undefined) {
      continue;
    }
    const diagnostics = [
      ...program.getSyntacticDiagnostics(sourceFile),
      ...program.getSemanticDiagnostics(sourceFile),
    ];
    for (const diagnostic of diagnostics) {
      if (diagnostic.category !== ts.DiagnosticCategory.Error) {
        continue;
      }
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
      messages.get(shipped.entry)?.push(`${shipped.entry}(${line + 1},${character + 1}): ${text}`);
    }
  }
  return messages;
}
