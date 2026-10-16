import * as path from "node:path";
import * as ts from "typescript";
import { hasRootOwnedTranspilerSources, PINNED_KIND_SUBPATHS } from "./directory-walls";
import { TYPES_PACKAGE } from "./materialize";
import { currentWallConfigs, type WallConfig } from "./wall";

export interface WallCheckDiagnostic {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  // A TypeScript error code, or 0 for a finding the check itself reports.
  readonly code: number;
  readonly message: string;
}

export interface WallCheckProgram {
  readonly dir: string;
  readonly kind: string;
  readonly diagnostics: readonly WallCheckDiagnostic[];
}

export interface WallCheckResult {
  readonly programs: readonly WallCheckProgram[];
}

function toRel(cwd: string, fileName: string): string {
  return path.relative(cwd, fileName).split(path.sep).join("/");
}

function toDiagnostic(cwd: string, configRel: string, d: ts.Diagnostic): WallCheckDiagnostic {
  const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
  if (d.file === undefined || d.start === undefined) {
    return { file: configRel, line: 1, column: 1, code: d.code, message };
  }
  const { line, character } = ts.getLineAndCharacterOfPosition(d.file, d.start);
  return {
    file: toRel(cwd, d.file.fileName),
    line: line + 1,
    column: character + 1,
    code: d.code,
    message,
  };
}

// A user source the wall governs — not a lib file, an installed package or a
// materialized surface, whose own imports are not the user's to fix.
function isUserSource(cwd: string, program: ts.Program, sourceFile: ts.SourceFile): boolean {
  if (program.isSourceFileDefaultLibrary(sourceFile)) {
    return false;
  }
  const rel = toRel(cwd, sourceFile.fileName);
  return (
    !rel.startsWith("../") &&
    !path.isAbsolute(rel) &&
    !rel.split("/").some((segment) => segment === "node_modules" || segment.startsWith("."))
  );
}

// Every file in a wall's program shares its ambient namespaces, so one import of
// the main entry or another kind's subpath anywhere in the program, a helper
// included, loads that surface into the whole wall and the narrowing no longer
// holds. A `/// <reference types>` directive naming one loads it the same way.
// The type checker cannot see this: the widened program checks clean.
function wideningReferences(
  cwd: string,
  program: ts.Program,
  wall: WallConfig,
): WallCheckDiagnostic[] {
  const widening = new Set([
    TYPES_PACKAGE,
    ...PINNED_KIND_SUBPATHS.filter((kind) => kind !== wall.kind).map(
      (kind) => `${TYPES_PACKAGE}/${kind}`,
    ),
  ]);
  const found: WallCheckDiagnostic[] = [];
  for (const sourceFile of program.getSourceFiles()) {
    if (!isUserSource(cwd, program, sourceFile)) {
      continue;
    }
    const { typeReferenceDirectives, importedFiles } = ts.preProcessFile(sourceFile.text);
    const refs = [
      ...typeReferenceDirectives.map((ref) => ({ ref, verb: "references" })),
      ...importedFiles.map((ref) => ({ ref, verb: "imports" })),
    ];
    for (const { ref, verb } of refs) {
      if (!widening.has(ref.fileName)) {
        continue;
      }
      const { line, character } = ts.getLineAndCharacterOfPosition(sourceFile, ref.pos);
      found.push({
        file: toRel(cwd, sourceFile.fileName),
        line: line + 1,
        column: character + 1,
        code: 0,
        message: `${verb} "${ref.fileName}", which loads more namespaces into the ${wall.kind} wall ${wall.dir}; import from "${TYPES_PACKAGE}/${wall.kind}" instead`,
      });
    }
  }
  return found;
}

function readRootReferences(rootPath: string): string[] {
  const { config } = ts.readConfigFile(rootPath, ts.sys.readFile);
  const references = (config as { references?: unknown } | undefined)?.references;
  if (!Array.isArray(references)) {
    return [];
  }
  return references
    .map((ref) => (ref as { path?: unknown }).path)
    .filter((ref): ref is string => typeof ref === "string");
}

// The earlier release's walls are composite projects the root references. This
// check cannot read that shape (a composite wall cannot follow an import out of
// its directory), so it names the command that rewrites it instead of running.
function oldShapeDiagnostic(cwd: string, walls: readonly WallConfig[]): WallCheckDiagnostic | null {
  const dirs = walls.map((wall) => wall.dir);
  const composite = walls.find((wall) => wall.composite);
  const referenced = readRootReferences(path.join(cwd, "tsconfig.json")).some((ref) =>
    dirs.includes(ref),
  );
  if (composite === undefined && !referenced) {
    return null;
  }
  return {
    file: composite === undefined ? "tsconfig.json" : `${composite.dir}/tsconfig.json`,
    line: 1,
    column: 1,
    code: 0,
    message: `walls written by an earlier release are composite projects the root references; run \`defold-typescript wall ${dirs.join(" ")}\` to rewrite them`,
  };
}

// TS18003, "No inputs were found": a wall whose sources all sit in nested walls
// it excludes has an empty program, which has nothing to check.
const NO_INPUTS = 18003;

function checkProgram(
  cwd: string,
  dir: string,
): {
  program: ts.Program | null;
  diagnostics: WallCheckDiagnostic[];
} {
  const configRel = dir === "." ? "tsconfig.json" : `${dir}/tsconfig.json`;
  const unrecoverable: ts.Diagnostic[] = [];
  const parsed = ts.getParsedCommandLineOfConfigFile(
    path.join(cwd, configRel),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => unrecoverable.push(d),
    },
  );
  if (parsed === undefined) {
    return {
      program: null,
      diagnostics: unrecoverable.map((d) => toDiagnostic(cwd, configRel, d)),
    };
  }
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    ...(parsed.projectReferences === undefined
      ? {}
      : { projectReferences: parsed.projectReferences }),
    configFileParsingDiagnostics: parsed.errors,
  });
  // `getPreEmitDiagnostics` already carries `configFileParsingDiagnostics`.
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.category === ts.DiagnosticCategory.Error && d.code !== NO_INPUTS)
    .map((d) => toDiagnostic(cwd, configRel, d));
  return { program, diagnostics };
}

// One program per wall plus the root, each labelled, so a helper the render wall
// rejects and the gui wall accepts is reported once, under render. The root is
// skipped when it owns no source, since its program would be empty.
export function runWallCheck(cwd: string): WallCheckResult {
  const walls = currentWallConfigs(cwd);
  const oldShape = oldShapeDiagnostic(cwd, walls);
  if (oldShape !== null) {
    return { programs: [{ dir: ".", kind: "full", diagnostics: [oldShape] }] };
  }

  const programs: WallCheckProgram[] = [];
  for (const wall of walls) {
    const { program, diagnostics } = checkProgram(cwd, wall.dir);
    programs.push({
      dir: wall.dir,
      kind: wall.kind,
      diagnostics:
        program === null
          ? diagnostics
          : [...diagnostics, ...wideningReferences(cwd, program, wall)],
    });
  }
  if (
    hasRootOwnedTranspilerSources(
      cwd,
      walls.map((wall) => wall.dir),
    )
  ) {
    programs.push({ dir: ".", kind: "full", diagnostics: checkProgram(cwd, ".").diagnostics });
  }
  return { programs };
}
