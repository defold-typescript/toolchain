import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { hsmModules } from "@defold-typescript/transpiler";
import * as ts from "typescript";

const HSM_ROOT = path.resolve(import.meta.dir, "..");
const SOURCE_DIR = path.join(HSM_ROOT, "src");

export const HSM_DECLARATIONS_DIR = path.resolve(HSM_ROOT, "..", "types", "hsm");

function header(name: string): string {
  return `// Generated from packages/hsm/src/${name}.ts by \`bun run --cwd packages/hsm declarations\`; do not edit.\n`;
}

function describeDiagnostic(d: ts.Diagnostic): string {
  const text = ts.flattenDiagnosticMessageText(d.messageText, "\n");
  if (d.file === undefined || d.start === undefined) {
    return text;
  }
  const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
  return `${path.relative(HSM_ROOT, d.file.fileName)}:${line + 1}:${character + 1}: ${text}`;
}

/** The `.d.ts` each hsm module ships as, keyed by module name. */
export function emitHsmDeclarations(): Record<string, string> {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    path.join(HSM_ROOT, "tsconfig.json"),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(describeDiagnostic(d));
      },
    },
  );
  if (parsed === undefined) {
    throw new Error("packages/hsm/tsconfig.json did not parse");
  }
  const names = hsmModules().map(({ name }) => name);
  const roots = [
    ...names.map((name) => path.join(SOURCE_DIR, `${name}.ts`)),
    path.join(SOURCE_DIR, "env.d.ts"),
  ];
  const program = ts.createProgram(roots, {
    ...parsed.options,
    noEmit: false,
    declaration: true,
    emitDeclarationOnly: true,
    declarationMap: false,
    sourceMap: false,
    outDir: path.join(HSM_ROOT, ".declarations"),
    rootDir: SOURCE_DIR,
  });
  const problems = ts.getPreEmitDiagnostics(program).map(describeDiagnostic);
  if (problems.length > 0) {
    throw new Error(
      `hsm declarations: the source does not type-check:\n  ${problems.join("\n  ")}`,
    );
  }

  const emitted: Record<string, string> = {};
  const wanted = new Set(names);
  const result = program.emit(undefined, (fileName, text) => {
    const name = path.basename(fileName, ".d.ts");
    if (wanted.has(name)) {
      emitted[name] = `${header(name)}${text}`;
    }
  });
  const emitProblems = result.diagnostics.map(describeDiagnostic);
  if (emitProblems.length > 0) {
    throw new Error(`hsm declarations: emit failed:\n  ${emitProblems.join("\n  ")}`);
  }
  return emitted;
}

if (import.meta.main) {
  const declarations = emitHsmDeclarations();
  mkdirSync(HSM_DECLARATIONS_DIR, { recursive: true });
  for (const entry of readdirSync(HSM_DECLARATIONS_DIR)) {
    if (entry.endsWith(".d.ts") && !(path.basename(entry, ".d.ts") in declarations)) {
      rmSync(path.join(HSM_DECLARATIONS_DIR, entry));
    }
  }
  for (const [name, text] of Object.entries(declarations)) {
    writeFileSync(path.join(HSM_DECLARATIONS_DIR, `${name}.d.ts`), text);
    process.stdout.write(`wrote packages/types/hsm/${name}.d.ts\n`);
  }
}
