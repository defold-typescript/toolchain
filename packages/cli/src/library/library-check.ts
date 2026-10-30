// `library check` checks a library data folder the way the running CLI reads it:
// the reader's own checks, the print of every module the folder serves, then one
// compile of every printed declaration, native declaration and usage example
// against the engine types this CLI ships. A declared file TypeScript cannot load
// is a problem of its library. The engine types and the language extensions come
// from this CLI's install, never from beside the data folder.

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import { type LibraryData, LibraryDataError, readLibraryData } from "./library-data";
import { printCorpus } from "./print-corpus";
import { printLibraryModules } from "./print-library";

export interface LibraryProblem {
  library: string;
  check: "data" | "print" | "compile";
  message: string;
}

// Stricter than a scaffolded project, so a declaration that compiles here compiles
// there; usage examples assert the types these flags produce.
const CHECK_OPTIONS: ts.CompilerOptions = {
  strict: true,
  exactOptionalPropertyTypes: true,
  noUncheckedIndexedAccess: true,
  noEmit: true,
  skipLibCheck: false,
  types: [],
  target: ts.ScriptTarget.ES2022,
  lib: ["lib.es2022.d.ts"],
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
};

const TYPES_PACKAGE = "@defold-typescript/types";
const LANGUAGE_EXTENSIONS = "@typescript-to-lua/language-extensions";

// A printed module that is not a fork has no file of its own; it is served from
// this folder, which exists nowhere on disk.
const PRINTED_DIR = "__printed__";

interface CheckInput {
  library: string;
  // The path a problem names, relative to the library folder.
  shown: string;
  contents?: string;
}

// Each package a usage example references resolves from the file that depends on
// it in this CLI's install: the engine types from the CLI itself, the language
// extensions from the transpiler.
function packageAnchors(): Map<string, string> {
  return new Map([
    [TYPES_PACKAGE, fileURLToPath(import.meta.url)],
    [LANGUAGE_EXTENSIONS, fileURLToPath(import.meta.resolve("@defold-typescript/transpiler"))],
  ]);
}

function anchoredPackage(name: string): string | undefined {
  return [TYPES_PACKAGE, LANGUAGE_EXTENSIONS].find(
    (pkg) => name === pkg || name.startsWith(`${pkg}/`),
  );
}

function isRelative(name: string): boolean {
  return name.startsWith("./") || name.startsWith("../");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function libraryModules(library: LibraryData): string[] {
  return [...library.luals, ...library.scriptApi, ...library.authored].map(
    ({ moduleId }) => moduleId,
  );
}

function underFolder(library: LibraryData, file: string): string {
  return file.slice(library.dir.length + 1);
}

// The corpus prints as a whole or not at all, so a failure is printed again one
// module at a time to name each module, and its library, that does not print.
async function printProblems(dataDir: string, libraries: LibraryData[]): Promise<LibraryProblem[]> {
  const problems: LibraryProblem[] = [];
  for (const library of libraries) {
    for (const moduleId of libraryModules(library)) {
      try {
        await printLibraryModules(dataDir, [moduleId], null);
      } catch (error) {
        problems.push({
          library: library.dir,
          check: "print",
          message: `${moduleId}: ${errorMessage(error)}`,
        });
      }
    }
  }
  return problems;
}

// Keyed by absolute file name. A file read from disk carries no contents.
function checkInputs(
  dataDir: string,
  libraries: LibraryData[],
  corpus: ReadonlyMap<string, string>,
): Map<string, CheckInput> {
  const inputs = new Map<string, CheckInput>();
  const add = (fileName: string, input: CheckInput): void => {
    inputs.set(path.resolve(fileName), input);
  };
  for (const library of libraries) {
    const onDisk = (file: string): void =>
      add(path.join(dataDir, file), { library: library.dir, shown: underFolder(library, file) });
    for (const { moduleId } of [...library.luals, ...library.scriptApi]) {
      const contents = corpus.get(moduleId);
      if (contents === undefined) continue;
      add(path.join(dataDir, PRINTED_DIR, `${moduleId}.d.ts`), {
        library: library.dir,
        shown: `printed/${moduleId}.d.ts`,
        contents,
      });
    }
    // A fork prints as itself, so a problem in it names the fork file.
    for (const { moduleId, authored } of library.authored) {
      const contents = corpus.get(moduleId);
      if (contents === undefined) continue;
      add(path.join(dataDir, authored), {
        library: library.dir,
        shown: underFolder(library, authored),
        contents,
      });
    }
    for (const { declaration } of library.native) onDisk(declaration);
    for (const usage of library.usage) onDisk(usage);
  }
  return inputs;
}

function compileHost(inputs: Map<string, CheckInput>, dataDir: string): ts.CompilerHost {
  const anchors = packageAnchors();
  const inputAt = (fileName: string): CheckInput | undefined => inputs.get(path.resolve(fileName));
  const printedDir = path.resolve(dataDir, PRINTED_DIR);
  const dataRoot = `${path.resolve(dataDir)}${path.sep}`;
  const isCheckedFile = (fileName: string): boolean => path.resolve(fileName).startsWith(dataRoot);

  const host = ts.createCompilerHost(CHECK_OPTIONS, true);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);
  const directoryExists = host.directoryExists?.bind(host) ?? ts.sys.directoryExists;
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const contents = inputAt(fileName)?.contents;
    return contents === undefined
      ? getSourceFile(fileName, languageVersion, onError, shouldCreate)
      : ts.createSourceFile(fileName, contents, languageVersion, true);
  };
  host.fileExists = (fileName) => inputAt(fileName)?.contents !== undefined || fileExists(fileName);
  host.readFile = (fileName) => inputAt(fileName)?.contents ?? readFile(fileName);
  // TypeScript skips every file lookup under a directory reported missing.
  host.directoryExists = (directoryName) =>
    path.resolve(directoryName) === printedDir || directoryExists(directoryName);

  // A bare name in a checked file is either one of the anchored packages or a
  // module the printed declarations declare; it never resolves from disk, so
  // nothing beside the data folder is read.
  host.resolveModuleNameLiterals = (literals, containingFile, redirected, options) =>
    literals.map(({ text }) => {
      const pkg = anchoredPackage(text);
      if (pkg !== undefined) {
        return ts.resolveModuleName(text, anchors.get(pkg) as string, options, ts.sys);
      }
      if (isCheckedFile(containingFile) && !isRelative(text)) {
        return { resolvedModule: undefined };
      }
      return ts.resolveModuleName(text, containingFile, options, host, undefined, redirected);
    });
  host.resolveTypeReferenceDirectiveReferences = (
    references,
    containingFile,
    redirected,
    options,
  ) =>
    references.map((reference) => {
      const name = typeof reference === "string" ? reference : reference.fileName;
      const mode = typeof reference === "string" ? undefined : reference.resolutionMode;
      const pkg = anchoredPackage(name);
      if (pkg !== undefined) {
        return ts.resolveTypeReferenceDirective(
          name,
          anchors.get(pkg) as string,
          options,
          ts.sys,
          undefined,
          undefined,
          mode,
        );
      }
      if (isCheckedFile(containingFile)) return { resolvedTypeReferenceDirective: undefined };
      return ts.resolveTypeReferenceDirective(
        name,
        containingFile,
        options,
        host,
        redirected,
        undefined,
        mode,
      );
    });
  return host;
}

function engineTypesFile(): string {
  const anchor = packageAnchors().get(TYPES_PACKAGE) as string;
  const resolved = ts.resolveTypeReferenceDirective(TYPES_PACKAGE, anchor, CHECK_OPTIONS, ts.sys)
    .resolvedTypeReferenceDirective?.resolvedFileName;
  if (resolved === undefined) throw new Error(`this CLI's install holds no ${TYPES_PACKAGE}`);
  return resolved;
}

function compileProblems(inputs: Map<string, CheckInput>, dataDir: string): LibraryProblem[] {
  const program = ts.createProgram({
    rootNames: [engineTypesFile(), ...inputs.keys()],
    options: CHECK_OPTIONS,
    host: compileHost(inputs, dataDir),
  });
  const problems: LibraryProblem[] = [];
  for (const [fileName, input] of inputs) {
    const sourceFile = program.getSourceFile(fileName);
    if (sourceFile === undefined) {
      problems.push({
        library: input.library,
        check: "compile",
        message: `${input.shown} cannot be loaded: it is missing or is not a TypeScript file`,
      });
      continue;
    }
    const diagnostics = [
      ...program.getSyntacticDiagnostics(sourceFile),
      ...program.getSemanticDiagnostics(sourceFile),
    ];
    for (const diagnostic of diagnostics) {
      if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
      const { line } = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
      problems.push({
        library: input.library,
        check: "compile",
        message: `${input.shown}:${line + 1} ${text}`,
      });
    }
  }
  return problems;
}

/**
 * Every problem in the data folder at `dataDir`, in library order: one `data`
 * problem when the reader refuses it, else a `print` problem per module that does
 * not print, else every compile error in the printed declarations, the native
 * declarations and the usage examples, and one compile problem per such file
 * TypeScript cannot load. Empty when the folder is clean.
 */
export async function checkLibraryData(dataDir: string): Promise<LibraryProblem[]> {
  let libraries: LibraryData[];
  try {
    libraries = readLibraryData(dataDir);
  } catch (error) {
    if (!(error instanceof LibraryDataError)) throw error;
    return [{ library: error.library, check: "data", message: error.message }];
  }
  let corpus: ReadonlyMap<string, string>;
  try {
    corpus = await printCorpus(dataDir);
  } catch (error) {
    const problems = await printProblems(dataDir, libraries);
    if (problems.length === 0) throw error;
    return problems;
  }
  return compileProblems(checkInputs(dataDir, libraries, corpus), dataDir);
}
