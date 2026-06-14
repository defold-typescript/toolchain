import * as ts from "typescript";
import * as tstl from "typescript-to-lua";
import { lifecycleErasurePlugin } from "./lifecycle-erasure";
import { messageDispatchLoweringPlugin } from "./message-dispatch-lowering";
import { messageGuardLoweringPlugin } from "./message-guard-lowering";
import { timersLoweringPlugin } from "./timers-lowering";
import { windowEventGuardLoweringPlugin } from "./window-event-guard-lowering";

// The same lua plugins the build path lists (transpile.ts / session.ts), so the
// editor and the build agree on what is unsupported.
const LUA_PLUGINS: tstl.Plugin[] = [
  lifecycleErasurePlugin,
  messageGuardLoweringPlugin,
  windowEventGuardLoweringPlugin,
  messageDispatchLoweringPlugin,
  timersLoweringPlugin,
];

const noopWriteFile: ts.WriteFileCallback = () => {};

function isAmbient(fileName: string): boolean {
  return /[\\/]node_modules[\\/]/.test(fileName) || /(^|[\\/])lib\.[^\\/]*\.d\.ts$/.test(fileName);
}

// Run the build path's TSTL diagnostic pass against an already-open `ts.Program`
// (e.g. the editor's), returning the raw, span-bearing diagnostics so a squiggle
// can land on the offending source. Restricts to `sourceFile` when given and
// drops diagnostics on lib/`node_modules` ambients.
export function getProgramDiagnostics(
  program: ts.Program,
  sourceFile?: ts.SourceFile,
): ts.Diagnostic[] {
  const { diagnostics } = tstl.getProgramTranspileResult(ts.sys, noopWriteFile, {
    program,
    plugins: LUA_PLUGINS,
    ...(sourceFile ? { sourceFiles: [sourceFile] } : {}),
  });
  return diagnostics.filter((d) => d.file !== undefined && !isAmbient(d.file.fileName));
}
