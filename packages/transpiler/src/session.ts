import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import * as ts from "typescript";
import * as tstl from "typescript-to-lua";
import { bundledLibraryLoweringPlugin } from "./bundled-libraries";
import { type CompanionEmitter, createCompanionEmitPlugin } from "./companion-emit";
import { editorScriptErasurePlugin } from "./editor-script-erasure";
import { AMBIENT_FILES, EDITOR_AMBIENT_FILES, isEditorSideSource } from "./kind-surfaces";
import { createLifecycleErasure, type LifecycleErasure } from "./lifecycle-erasure";
import { messageDispatchLoweringPlugin } from "./message-dispatch-lowering";
import { messageGuardLoweringPlugin } from "./message-guard-lowering";
import { nativeGlobalModulesPlugin } from "./native-global-modules";
import { physicsEventGuardLoweringPlugin } from "./physics-event-guard-lowering";
import {
  collectOutputs,
  evaluatePendingProperties,
  type TranspileProjectResult,
} from "./project-output";
import { timersLoweringPlugin } from "./timers-lowering";
import { typeApplicationErasurePlugin } from "./type-application-erasure";
import { windowEventGuardLoweringPlugin } from "./window-event-guard-lowering";

export interface TranspileSession {
  update(changes: Readonly<Record<string, string | null>>): TranspileProjectResult;
  /**
   * The program of the runtime side: every source that is not editor-side, and
   * each helper those import. The CLI's companion, text-property and address
   * scans read it alone, since an editor script never splits and has no
   * properties. Undefined when the last update had no such source.
   */
  getProgram(): ts.Program | undefined;
}

const requireFromHere = createRequire(import.meta.url);

// A function rather than a const because the companion emitter and the
// lifecycle erasure carry the state of one transpile: a shared instance would
// hand an editor rebuild the companions of the rebuild before it. Keep in
// lockstep with the library compile in project-output.ts.
function compilerOptions(
  companionEmit: CompanionEmitter,
  erasure: LifecycleErasure,
): tstl.CompilerOptions {
  return {
    luaTarget: tstl.LuaTarget.Lua51,
    sourceMap: true,
    // Already-resolved CompilerOptions, so the value is the lib file name, not the
    // tsconfig spelling "ES2022". Drops the default `lib.dom`, whose `declare var
    // window` shadows Defold's `window` namespace.
    lib: ["lib.es2022.d.ts"],
    // Don't cross-check the seeded ambient .d.ts surface against itself; only user
    // files matter (mirrors the library compile and the editor's skipLibCheck).
    skipLibCheck: true,
    // TypeScript turns this on under its default `bundler` resolution. With it on,
    // an error that has to name a module-declared type the file does not import
    // (`Url`, `Hash`, `Vector3`) throws inside the checker, which builds a module
    // specifier from an undefined base path and the virtual host's empty current
    // directory. The virtual host reads every `package.json` as empty, so no `#`
    // import resolves with the option on or off.
    resolvePackageJsonImports: false,
    // Defold scripts are not OO: free helper functions never receive a context,
    // so suppress TSTL's implicit `self` parameter and the `_G` call-site filler.
    noImplicitSelf: true,
    luaPlugins: [
      { plugin: erasure.plugin },
      { plugin: editorScriptErasurePlugin },
      { plugin: messageGuardLoweringPlugin },
      { plugin: windowEventGuardLoweringPlugin },
      { plugin: physicsEventGuardLoweringPlugin },
      { plugin: messageDispatchLoweringPlugin },
      { plugin: timersLoweringPlugin },
      { plugin: nativeGlobalModulesPlugin },
      { plugin: bundledLibraryLoweringPlugin },
      { plugin: typeApplicationErasurePlugin },
      { plugin: companionEmit.plugin },
    ],
  };
}

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, "/");
}

interface CollectorFile {
  outPath: string;
  sourceFiles: ts.SourceFile[];
  lua?: string;
  luaSourceMap?: string;
}

function createOutputCollector(): { writeFile: ts.WriteFileCallback; files: CollectorFile[] } {
  const files: CollectorFile[] = [];
  const writeFile: ts.WriteFileCallback = (fileName, data, _bom, _onError, sourceFiles = []) => {
    let file = files.find((f) => f.sourceFiles.some((s) => sourceFiles.includes(s)));
    if (!file) {
      file = { outPath: fileName, sourceFiles: [...sourceFiles] };
      files.push(file);
    } else {
      for (const s of sourceFiles) {
        if (!file.sourceFiles.includes(s)) {
          file.sourceFiles.push(s);
        }
      }
    }
    if (fileName.endsWith(".lua")) {
      file.lua = data;
    } else if (fileName.endsWith(".lua.map")) {
      file.luaSourceMap = data;
    }
  };
  return { writeFile, files };
}

interface SideEmit {
  readonly files: readonly CollectorFile[];
  readonly reported: readonly ts.Diagnostic[];
  readonly companions: ReadonlyMap<string, string>;
}

// One check surface: its own declarations, host and previous program, so a
// rebuild reuses only the program that saw the same declarations.
interface Side {
  program: ts.Program | undefined;
  readonly ambientKeys: readonly string[];
  readonly host: ts.CompilerHost;
  forget(fileName: string): void;
}

export function createTranspileSession(): TranspileSession {
  const userFiles = new Map<string, string>();
  const libCache = new Map<string, ts.SourceFile>();

  function createSide(ambient: Readonly<Record<string, string>>): Side {
    const sourceFileCache = new Map<string, ts.SourceFile>();

    function mergedContent(normalized: string): string | undefined {
      if (userFiles.has(normalized)) {
        return userFiles.get(normalized);
      }
      return ambient[normalized];
    }

    const getSourceFile: ts.CompilerHost["getSourceFile"] = (fileName) => {
      const normalized = normalizeSlashes(fileName);
      const content = mergedContent(normalized);
      if (content !== undefined) {
        const cached = sourceFileCache.get(normalized);
        if (cached) {
          return cached;
        }
        const created = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, false);
        sourceFileCache.set(normalized, created);
        return created;
      }

      let filePath: string | undefined;
      if (fileName.startsWith("lib.")) {
        const typeScriptDir = path.dirname(requireFromHere.resolve("typescript"));
        filePath = path.join(typeScriptDir, fileName);
      }
      if (fileName.includes("language-extensions")) {
        const dtsName = fileName.replace(/(\.d)?(\.ts)$/, ".d.ts");
        filePath = path.resolve(dtsName);
      }
      if (filePath !== undefined) {
        const cached = libCache.get(fileName);
        if (cached) {
          return cached;
        }
        const fileContent = readFileSync(filePath, "utf8");
        const created = ts.createSourceFile(filePath, fileContent, ts.ScriptTarget.Latest, false);
        libCache.set(fileName, created);
        return created;
      }
      return undefined;
    };

    const host: ts.CompilerHost = {
      fileExists: (fileName) =>
        mergedContent(normalizeSlashes(fileName)) !== undefined || ts.sys.fileExists(fileName),
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => "",
      getDefaultLibFileName: ts.getDefaultLibFileName,
      readFile: () => "",
      getNewLine: () => "\n",
      useCaseSensitiveFileNames: () => false,
      writeFile() {},
      getSourceFile,
    };

    return {
      program: undefined,
      ambientKeys: Object.keys(ambient).map(normalizeSlashes),
      host,
      forget: (fileName) => sourceFileCache.delete(fileName),
    };
  }

  const runtime = createSide(AMBIENT_FILES);
  const editor = createSide(EDITOR_AMBIENT_FILES);

  function emitSide(
    side: Side,
    userRoots: readonly string[],
    userKeys: ReadonlySet<string>,
  ): SideEmit {
    const companionEmit = createCompanionEmitPlugin();
    const erasure = createLifecycleErasure();
    const program = ts.createProgram(
      [...side.ambientKeys, ...userRoots],
      compilerOptions(companionEmit, erasure),
      side.host,
      side.program,
    );
    side.program = program;

    const preEmitDiagnostics = ts.getPreEmitDiagnostics(program);
    let collector = createOutputCollector();
    const { diagnostics: transpileDiagnostics } = new tstl.Transpiler().emit({
      program,
      writeFile: collector.writeFile,
    });
    const reported = [...preEmitDiagnostics, ...transpileDiagnostics];

    if (erasure.pending.size > 0) {
      const emitted = collectOutputs(collector.files, [], userKeys, companionEmit.companions);
      const evaluated = evaluatePendingProperties(erasure.pending, emitted);
      reported.push(...evaluated.diagnostics);
      erasure.pending.clear();
      erasure.setEvaluatedDefaults(evaluated.values);
      companionEmit.reset();
      collector = createOutputCollector();
      new tstl.Transpiler().emit({ program, writeFile: collector.writeFile });
    }

    return { files: collector.files, reported, companions: companionEmit.companions };
  }

  // The editor side goes first: which helpers it reaches is known only from its
  // program, and every user file it reaches leaves the runtime side's roots. A
  // runtime source that imports one of them pulls it back in, so a helper both
  // sides import is checked against both surfaces.
  function update(changes: Readonly<Record<string, string | null>>): TranspileProjectResult {
    for (const [name, value] of Object.entries(changes)) {
      const normalized = normalizeSlashes(name);
      if (value === null) {
        userFiles.delete(normalized);
      } else {
        userFiles.set(normalized, value);
      }
      runtime.forget(normalized);
      editor.forget(normalized);
    }

    const userKeys = new Set(userFiles.keys());
    const editorRoots = [...userFiles]
      .filter(([, text]) => isEditorSideSource(text))
      .map(([name]) => name);

    const editorReached = new Set<string>();
    let editorEmit: SideEmit | undefined;
    if (editorRoots.length > 0) {
      editorEmit = emitSide(editor, editorRoots, userKeys);
      for (const sourceFile of editor.program?.getSourceFiles() ?? []) {
        if (userKeys.has(sourceFile.fileName)) {
          editorReached.add(sourceFile.fileName);
        }
      }
    } else {
      editor.program = undefined;
    }

    const runtimeRoots = [...userKeys].filter((name) => !editorReached.has(name));
    let runtimeEmit: SideEmit | undefined;
    if (runtimeRoots.length > 0) {
      runtimeEmit = emitSide(runtime, runtimeRoots, userKeys);
    } else {
      runtime.program = undefined;
    }

    // A file both programs emit takes the runtime side's chunk, and the runtime
    // side's files come last so its lualib bundle is the one kept.
    const runtimeEmitted = new Set(
      (runtimeEmit?.files ?? []).flatMap((file) => file.sourceFiles.map((s) => s.fileName)),
    );
    const editorFiles = (editorEmit?.files ?? []).filter(
      (file) =>
        file.sourceFiles.length === 0 ||
        !file.sourceFiles.some((s) => runtimeEmitted.has(s.fileName)),
    );
    const files = [...editorFiles, ...(runtimeEmit?.files ?? [])];
    const companions = new Map([
      ...(editorEmit?.companions ?? []),
      ...(runtimeEmit?.companions ?? []),
    ]);
    const diagnostics = [
      ...ts.sortAndDeduplicateDiagnostics([
        ...(editorEmit?.reported ?? []),
        ...(runtimeEmit?.reported ?? []),
      ]),
    ];
    return collectOutputs(files, diagnostics, userKeys, companions);
  }

  return {
    update,
    getProgram: () => runtime.program,
  };
}
