import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import type * as ts from "typescript";
import * as tstl from "typescript-to-lua";
import {
  findDirectGoPropertyCalls,
  GO_PROPERTY_DIRECT_CALL_MESSAGE,
} from "./go-property-direct-call";
import { lifecycleErasurePlugin } from "./lifecycle-erasure";
import { messageDispatchLoweringPlugin } from "./message-dispatch-lowering";
import { messageGuardLoweringPlugin } from "./message-guard-lowering";

export interface TranspileResult {
  readonly lua: string;
  readonly sourceMap: string;
  readonly diagnostics: readonly string[];
}

export interface TranspileDiagnostic {
  readonly file?: string;
  readonly message: string;
  // Present only on advisory diagnostics (e.g. the deprecated direct
  // `go.property` call). Absent means a hard failure, so `collectFailures`
  // keeps treating uncategorized diagnostics as fatal.
  readonly category?: "warning";
}

export interface TranspileProjectInput {
  readonly files: Readonly<Record<string, string>>;
}

export interface TranspileProjectResult {
  readonly lua: Readonly<Record<string, string>>;
  readonly sourceMaps: Readonly<Record<string, string>>;
  readonly diagnostics: readonly TranspileDiagnostic[];
  // TSTL synthesizes this bundle (no user source) whenever a lualib feature
  // (`Object.keys`, spread, `__TS__TypeOf`, ...) is used; the emitted
  // `require("lualib_bundle")` only resolves in Defold if the CLI writes it to
  // the output root. Absent when no feature pulls it in.
  readonly lualib?: string;
}

function flattenDiagnosticMessage(
  text: string | { messageText: string | { messageText: string } },
): string {
  if (typeof text === "string") {
    return text;
  }
  return flattenDiagnosticMessage(text.messageText);
}

const requireFromHere = createRequire(import.meta.url);
const TYPES_PKG_ROOT = path.dirname(
  requireFromHere.resolve("@defold-typescript/types/package.json"),
);
const TSTL_LANG_EXT_ROOT = path.dirname(
  requireFromHere.resolve("@typescript-to-lua/language-extensions/package.json"),
);

function readAmbient(rel: string): string {
  return readFileSync(path.join(TYPES_PKG_ROOT, rel), "utf8");
}

function buildAmbientFiles(): Record<string, string> {
  const files: Record<string, string> = {
    "node_modules/@typescript-to-lua/language-extensions/index.d.ts": readFileSync(
      path.join(TSTL_LANG_EXT_ROOT, "index.d.ts"),
      "utf8",
    ),
    "node_modules/@defold-typescript/types/src/core-types.ts": readAmbient("src/core-types.ts"),
    "node_modules/@defold-typescript/types/src/engine-globals.d.ts":
      readAmbient("src/engine-globals.d.ts"),
    "node_modules/@defold-typescript/types/src/go-overloads.d.ts":
      readAmbient("src/go-overloads.d.ts"),
    "node_modules/@defold-typescript/types/src/msg-overloads.d.ts":
      readAmbient("src/msg-overloads.d.ts"),
    "node_modules/@defold-typescript/types/src/message-guard.d.ts":
      readAmbient("src/message-guard.d.ts"),
    "node_modules/@defold-typescript/types/src/message-dispatch.d.ts": readAmbient(
      "src/message-dispatch.d.ts",
    ),
    "node_modules/@defold-typescript/types/src/lifecycle.ts": readAmbient("src/lifecycle.ts"),
    // Mirror the consumer-facing re-exports of the real package index so a user
    // file can `import { defineScript }` and `import type { Hash, Vector3 }`.
    "node_modules/@defold-typescript/types/index.ts": [
      'export { defineGuiScript, defineRenderScript, defineScript } from "./src/lifecycle";',
      'export type { GuiScriptHooks, InputAction, InputTouch, RenderScriptHooks, ScriptHooks, ScriptProperties, ScriptProperty } from "./src/lifecycle";',
      'export type { Hash, Matrix4, Quaternion, Url, Vector, Vector3, Vector4 } from "./src/core-types";',
      "",
    ].join("\n"),
    // Per-kind subpath entrypoints exist as package exports for the editor.
    // Their namespaces are already seeded ambiently below; mirror slice A's
    // generated `generateKindIndex` output by re-exporting only the matching
    // factory, so a walled source's subpath import resolves to it and the
    // call-site erasure fires (otherwise the import lowers to a broken
    // `require("@defold-typescript/types/gui-script")`).
    "node_modules/@defold-typescript/types/script.d.ts":
      'export { defineScript } from "./src/lifecycle.js";\nexport type { ScriptProperties, ScriptProperty } from "./src/lifecycle.js";\n',
    "node_modules/@defold-typescript/types/gui-script.d.ts":
      'export { defineGuiScript } from "./src/lifecycle.js";\nexport type { ScriptProperties, ScriptProperty } from "./src/lifecycle.js";\n',
    "node_modules/@defold-typescript/types/render-script.d.ts":
      'export { defineRenderScript } from "./src/lifecycle.js";\nexport type { ScriptProperties, ScriptProperty } from "./src/lifecycle.js";\n',
  };
  // Seed every generated namespace so real multi-namespace user code (sprite,
  // physics, label, ...) resolves — not just the historical vmath/msg/go subset.
  for (const entry of readdirSync(path.join(TYPES_PKG_ROOT, "generated"))) {
    if (entry.endsWith(".d.ts")) {
      files[`node_modules/@defold-typescript/types/generated/${entry}`] = readAmbient(
        `generated/${entry}`,
      );
    }
  }
  return files;
}

export const AMBIENT_FILES: Readonly<Record<string, string>> = buildAmbientFiles();

interface CollectableFile {
  readonly outPath: string;
  readonly sourceFiles: readonly ts.SourceFile[];
  readonly lua?: string;
  readonly luaSourceMap?: string;
}

const LUALIB_BUNDLE_NAME = "lualib_bundle.lua";

function isLualibBundle(file: CollectableFile): boolean {
  return file.sourceFiles.length === 0 && file.outPath.endsWith(LUALIB_BUNDLE_NAME);
}

export function collectOutputs(
  transpiledFiles: readonly CollectableFile[],
  diagnostics: readonly ts.Diagnostic[],
  userKeys: ReadonlySet<string>,
): TranspileProjectResult {
  const lua: Record<string, string> = {};
  const sourceMaps: Record<string, string> = {};
  let lualib: string | undefined;
  for (const file of transpiledFiles) {
    if (isLualibBundle(file) && typeof file.lua === "string") {
      lualib = file.lua;
      continue;
    }
    const userSource = file.sourceFiles.find((s) => userKeys.has(s.fileName));
    if (!userSource || typeof file.lua !== "string") {
      continue;
    }
    lua[userSource.fileName] = file.lua;
    if (typeof file.luaSourceMap === "string") {
      sourceMaps[userSource.fileName] = file.luaSourceMap;
    }
  }

  const collectedDiagnostics: TranspileDiagnostic[] = diagnostics.map((d) => {
    const fileName = d.file?.fileName;
    const message = flattenDiagnosticMessage(d.messageText);
    return fileName !== undefined && userKeys.has(fileName)
      ? { file: fileName, message }
      : { message };
  });

  // Advisory scan of the user TypeScript AST for the deprecated direct
  // `go.property` call. Run here (shared by transpileProject and the watch
  // session) so both paths report it identically.
  const scanned = new Set<string>();
  for (const file of transpiledFiles) {
    for (const sourceFile of file.sourceFiles) {
      if (!userKeys.has(sourceFile.fileName) || scanned.has(sourceFile.fileName)) {
        continue;
      }
      scanned.add(sourceFile.fileName);
      if (findDirectGoPropertyCalls(sourceFile).length > 0) {
        collectedDiagnostics.push({
          file: sourceFile.fileName,
          message: GO_PROPERTY_DIRECT_CALL_MESSAGE,
          category: "warning",
        });
      }
    }
  }

  return {
    lua,
    sourceMaps,
    diagnostics: collectedDiagnostics,
    ...(lualib !== undefined ? { lualib } : {}),
  };
}

export function transpileProject(input: TranspileProjectInput): TranspileProjectResult {
  const userKeys = new Set(Object.keys(input.files));
  const merged: Record<string, string> = { ...AMBIENT_FILES, ...input.files };

  const result = tstl.transpileVirtualProject(merged, {
    luaTarget: tstl.LuaTarget.Lua51,
    sourceMap: true,
    // Don't cross-check the seeded ambient .d.ts surface against itself; we only
    // care about diagnostics on user files (mirrors the editor's skipLibCheck).
    skipLibCheck: true,
    // Defold scripts are not OO: free helper functions never receive a context,
    // so suppress TSTL's implicit `self` parameter and the `_G` call-site filler.
    noImplicitSelf: true,
    luaPlugins: [
      { plugin: lifecycleErasurePlugin },
      { plugin: messageGuardLoweringPlugin },
      { plugin: messageDispatchLoweringPlugin },
    ],
  });

  return collectOutputs(result.transpiledFiles, result.diagnostics, userKeys);
}

export function transpile(source: string): TranspileResult {
  const project = transpileProject({ files: { "main.ts": source } });
  return {
    lua: project.lua["main.ts"] ?? "",
    sourceMap: project.sourceMaps["main.ts"] ?? "",
    diagnostics: project.diagnostics.map((d) => d.message),
  };
}
