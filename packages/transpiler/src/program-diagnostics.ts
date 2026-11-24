import * as ts from "typescript";
import * as tstl from "typescript-to-lua";
import { findMissingJsGlobals } from "./js-runtime-globals";
import { createLifecycleErasure } from "./lifecycle-erasure";
import { findLuaGlobalShadows, type GlobalShadowsMode } from "./lua-global-shadows";
import { messageDispatchLoweringPlugin } from "./message-dispatch-lowering";
import { messageGuardLoweringPlugin } from "./message-guard-lowering";
import { physicsEventGuardLoweringPlugin } from "./physics-event-guard-lowering";
import { timersLoweringPlugin } from "./timers-lowering";
import { typeApplicationErasurePlugin } from "./type-application-erasure";
import { windowEventGuardLoweringPlugin } from "./window-event-guard-lowering";

// The same lua plugins the build path lists (transpile.ts / session.ts), so the
// editor and the build agree on what is unsupported. The erasure is built per
// call: the editor never evaluates, so the scripts it records as pending would
// otherwise pile up across calls.
function luaPlugins(): tstl.Plugin[] {
  return [
    createLifecycleErasure().plugin,
    messageGuardLoweringPlugin,
    windowEventGuardLoweringPlugin,
    physicsEventGuardLoweringPlugin,
    messageDispatchLoweringPlugin,
    timersLoweringPlugin,
    typeApplicationErasurePlugin,
  ];
}

const noopWriteFile: ts.WriteFileCallback = () => {};

function isAmbient(fileName: string): boolean {
  return /[\\/]node_modules[\\/]/.test(fileName) || /(^|[\\/])lib\.[^\\/]*\.d\.ts$/.test(fileName);
}

// Run the build path's TSTL diagnostic pass, its missing JavaScript global check
// and its Lua global shadow scan against an already-open `ts.Program` (e.g. the
// editor's), returning the raw, span-bearing diagnostics so a squiggle can land
// on the offending source. Restricts to `sourceFile` when given and drops
// diagnostics on lib/`node_modules` ambients. `globalShadows` picks the shadow
// scan's category, as it does for the build.
export function getProgramDiagnostics(
  program: ts.Program,
  sourceFile?: ts.SourceFile,
  options: { readonly globalShadows?: GlobalShadowsMode } = {},
): ts.Diagnostic[] {
  const { diagnostics } = tstl.getProgramTranspileResult(ts.sys, noopWriteFile, {
    program,
    plugins: luaPlugins(),
    ...(sourceFile ? { sourceFiles: [sourceFile] } : {}),
  });
  const scanned = sourceFile
    ? [sourceFile]
    : program.getSourceFiles().filter((s) => !s.isDeclarationFile && !isAmbient(s.fileName));
  return [
    ...diagnostics.filter((d) => d.file !== undefined && !isAmbient(d.file.fileName)),
    ...scanned.flatMap((s) => findMissingJsGlobals(program, s)),
    ...scanned.flatMap((s) => findLuaGlobalShadows(program, s, options.globalShadows)),
  ];
}
