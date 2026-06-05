import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import * as ts from "typescript";
import * as tstl from "typescript-to-lua";
import { lifecycleErasurePlugin } from "./lifecycle-erasure";
import { messageDispatchLoweringPlugin } from "./message-dispatch-lowering";
import { messageGuardLoweringPlugin } from "./message-guard-lowering";
import { AMBIENT_FILES, collectOutputs, type TranspileProjectResult } from "./transpile";

export interface TranspileSession {
  update(changes: Readonly<Record<string, string | null>>): TranspileProjectResult;
  getProgram(): ts.Program | undefined;
}

const requireFromHere = createRequire(import.meta.url);

const COMPILER_OPTIONS: tstl.CompilerOptions = {
  luaTarget: tstl.LuaTarget.Lua54,
  sourceMap: true,
  // Don't cross-check the seeded ambient .d.ts surface against itself; only user
  // files matter (mirrors transpileProject and the editor's skipLibCheck).
  skipLibCheck: true,
  // Defold scripts are not OO: free helper functions never receive a context,
  // so suppress TSTL's implicit `self` parameter and the `_G` call-site filler.
  noImplicitSelf: true,
  luaPlugins: [
    { plugin: lifecycleErasurePlugin },
    { plugin: messageGuardLoweringPlugin },
    { plugin: messageDispatchLoweringPlugin },
  ],
};

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

export function createTranspileSession(): TranspileSession {
  const userFiles = new Map<string, string>();
  const sourceFileCache = new Map<string, ts.SourceFile>();
  const libCache = new Map<string, ts.SourceFile>();
  let program: ts.Program | undefined;

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

  function mergedContent(normalized: string): string | undefined {
    if (userFiles.has(normalized)) {
      return userFiles.get(normalized);
    }
    return AMBIENT_FILES[normalized];
  }

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

  function update(changes: Readonly<Record<string, string | null>>): TranspileProjectResult {
    for (const [name, value] of Object.entries(changes)) {
      const normalized = normalizeSlashes(name);
      if (value === null) {
        userFiles.delete(normalized);
        sourceFileCache.delete(normalized);
      } else {
        userFiles.set(normalized, value);
        sourceFileCache.delete(normalized);
      }
    }

    const userKeys = new Set(userFiles.keys());
    const rootNames = [...Object.keys(AMBIENT_FILES).map(normalizeSlashes), ...userKeys];

    program = ts.createProgram(rootNames, COMPILER_OPTIONS, host, program);

    const preEmitDiagnostics = ts.getPreEmitDiagnostics(program);
    const collector = createOutputCollector();
    const { diagnostics: transpileDiagnostics } = new tstl.Transpiler().emit({
      program,
      writeFile: collector.writeFile,
    });
    const diagnostics = [
      ...ts.sortAndDeduplicateDiagnostics([...preEmitDiagnostics, ...transpileDiagnostics]),
    ];

    return collectOutputs(collector.files, diagnostics, userKeys);
  }

  return {
    update,
    getProgram: () => program,
  };
}
