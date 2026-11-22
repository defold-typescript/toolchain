import { dirname, resolve } from "node:path";
import ts from "typescript";
import { PROBE_URLS } from "./contexts";

// What the checker makes of one probe call: the errors it reports on the call,
// and the signature it resolves the call to when there are none.
export interface CheckedCall {
  readonly errors: readonly string[];
  readonly signature?: ts.Signature;
}

export interface CallCheck {
  readonly checker: ts.TypeChecker;
  readonly calls: readonly CheckedCall[];
  // The errors the checker reports on each of the declarations.
  readonly declarations: readonly (readonly string[])[];
}

const CALLS_FILE = "probe-calls.ts";

// `program` with each of `files` read in place of what is on disk; a file not
// on disk is added as a root. Every other file keeps its parsed source.
export function overlayProgram(
  program: ts.Program,
  files: ReadonlyMap<string, string>,
): ts.Program {
  const options = program.getCompilerOptions();
  const overlay = new Map([...files].map(([path, text]) => [resolve(path), text]));
  const host = ts.createCompilerHost(options, true);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  const added = [...overlay.keys()].filter((path) => !fileExists(path));
  host.fileExists = (name) => overlay.has(resolve(name)) || fileExists(name);
  host.readFile = (name) => overlay.get(resolve(name)) ?? readFile(name);
  host.getSourceFile = (name, languageVersion, onError, shouldCreate) => {
    const text = overlay.get(resolve(name));
    if (text !== undefined) return ts.createSourceFile(name, text, languageVersion, true);
    return (
      program.getSourceFile(name) ?? getSourceFile(name, languageVersion, onError, shouldCreate)
    );
  };
  return ts.createProgram({
    rootNames: [...program.getRootFileNames(), ...added],
    options,
    host,
    oldProgram: program,
  });
}

// Checks each call as a statement of one module beside the surface entry,
// after the probe urls and `fresh` as a probe script declares them, and after
// `declarations`, one statement each, which the calls may refer to.
export function checkCalls(
  program: ts.Program,
  calls: readonly string[],
  declarations: readonly string[] = [],
): CallCheck {
  const [entry] = program.getRootFileNames();
  if (entry === undefined) throw new Error("api-probe: the surface program has no root");
  const file = resolve(dirname(entry), CALLS_FILE);
  const prelude = [
    "export declare function fresh(prefix: string, suffix?: string): string;",
    ...Object.entries(PROBE_URLS).map(
      ([id, address]) => `export const ${id} = msg.url(${JSON.stringify(address)});`,
    ),
  ];
  const head = prelude.length + declarations.length;
  const text = [...prelude, ...declarations, ...calls.map((call) => `${call};`)].join("\n");
  const checked = overlayProgram(program, new Map([[file, text]]));
  const source = checked.getSourceFile(file);
  if (source === undefined) throw new Error(`api-probe: ${file} is not in the call check`);
  const statements = source.statements;
  if (statements.length !== head + calls.length) {
    throw new Error(
      `api-probe: the call check parsed ${statements.length} statements for ${prelude.length} prelude lines, ${declarations.length} declarations and ${calls.length} calls`,
    );
  }
  const errors = calls.map((): string[] => []);
  const declared = declarations.map((): string[] => []);
  const diagnostics = [
    ...checked.getSyntacticDiagnostics(source),
    ...checked.getSemanticDiagnostics(source),
  ];
  for (const diagnostic of diagnostics) {
    const start = diagnostic.start ?? 0;
    const at = statements.findIndex(
      (statement) => start >= statement.getStart(source) && start < statement.end,
    );
    const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
    if (at < prelude.length) throw new Error(`api-probe: the call check's prelude fails: ${text}`);
    (at < head ? declared[at - prelude.length] : errors[at - head])?.push(text);
  }
  const checker = checked.getTypeChecker();
  return {
    checker,
    calls: calls.map((_, i) => {
      const statement = statements[head + i];
      const expression =
        statement !== undefined && ts.isExpressionStatement(statement)
          ? statement.expression
          : undefined;
      const failed = errors[i] ?? [];
      if (failed.length > 0 || expression === undefined || !ts.isCallExpression(expression)) {
        return { errors: failed };
      }
      const signature = checker.getResolvedSignature(expression);
      return signature === undefined ? { errors: failed } : { errors: failed, signature };
    }),
    declarations: declared,
  };
}
