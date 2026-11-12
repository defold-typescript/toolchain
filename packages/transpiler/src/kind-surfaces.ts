import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import * as ts from "typescript";
import { BUNDLED_LIBRARIES } from "./bundled-libraries";
import { EDITOR_SCRIPT_SPECIFIER } from "./editor-script-erasure";

const requireFromHere = createRequire(import.meta.url);
const TYPES_PKG_ROOT = path.dirname(
  requireFromHere.resolve("@defold-typescript/types/package.json"),
);
const TSTL_LANG_EXT_ROOT = path.dirname(
  requireFromHere.resolve("@typescript-to-lua/language-extensions/package.json"),
);

const TYPES_KEY_PREFIX = "node_modules/@defold-typescript/types/";
const LANGUAGE_EXTENSIONS_KEY = "node_modules/@typescript-to-lua/language-extensions/index.d.ts";
const ROOT_INDEX = "index.d.ts";
const EDITOR_KIND_INDEX = "generated/kinds/editor-script.d.ts";

function readAmbient(rel: string): string {
  return readFileSync(path.join(TYPES_PKG_ROOT, rel), "utf8");
}

function readLanguageExtensions(): string {
  return readFileSync(path.join(TSTL_LANG_EXT_ROOT, "index.d.ts"), "utf8");
}

// lua-types is a dependency of @defold-typescript/types, not the transpiler, so
// resolve it from the types package root where it is installed.
const LUA_TYPES_ROOT = path.dirname(
  createRequire(path.join(TYPES_PKG_ROOT, "package.json")).resolve("lua-types/package.json"),
);

// Follow the triple-slash `path` reference graph from the 5.1 + LuaJIT entry
// files so the virtual program sees exactly the Lua 5.1 surface (single-arg
// `randomseed`) and never the conflicting 5.2–5.5 global declarations.
const LUA_TYPES_ENTRY_FILES = ["5.1.d.ts", "special/jit-only.d.ts"];
const REFERENCE_PATH_RE = /\/\/\/\s*<reference\s+path="([^"]+)"\s*\/>/g;
const LUA_TYPES_REFERENCE_PREFIX = "lua-types/";

function collectLuaTypesClosure(entries: readonly string[]): Record<string, string> {
  const files: Record<string, string> = {};
  const visit = (rel: string): void => {
    const key = `node_modules/lua-types/${rel}`;
    if (key in files) return;
    const source = readFileSync(path.join(LUA_TYPES_ROOT, rel), "utf8");
    files[key] = source;
    const dir = path.posix.dirname(rel);
    for (const match of source.matchAll(REFERENCE_PATH_RE)) {
      const ref = match[1];
      if (!ref) continue;
      visit(path.posix.normalize(path.posix.join(dir, ref)));
    }
  };
  for (const entry of entries) visit(entry);
  return files;
}

// A relative specifier inside the types package, resolved the way `tsc` does
// (`.ts` before `.d.ts`, a `.js` spelling standing for either). A JSON import
// carries no declarations, so it is not followed.
function resolveTypesImport(fromRel: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".") || specifier.endsWith(".json")) {
    return undefined;
  }
  const target = path.posix.join(path.posix.dirname(fromRel), specifier);
  const stem = target.endsWith(".js") ? target.slice(0, -".js".length) : target;
  const resolved = [`${stem}.ts`, `${stem}.d.ts`].find((candidate) =>
    existsSync(path.join(TYPES_PKG_ROOT, candidate)),
  );
  if (resolved === undefined) {
    throw new Error(
      `@defold-typescript/transpiler: ${fromRel} imports ${specifier}, which resolves to no file in @defold-typescript/types`,
    );
  }
  return resolved;
}

/**
 * Every file `tsc` loads from one types-package entry, keyed in the
 * `node_modules/...` layout the virtual program reads: each relative import
 * (side-effect, `import type` and `export ... from` alike) and the Lua standard
 * library each `lua-types/<x>` type reference names.
 */
function collectTypesClosure(entry: string): Record<string, string> {
  const files: Record<string, string> = {};
  const luaEntries: string[] = [];
  const pending = [entry];
  for (let rel = pending.pop(); rel !== undefined; rel = pending.pop()) {
    const key = `${TYPES_KEY_PREFIX}${rel}`;
    if (key in files) {
      continue;
    }
    const source = readAmbient(rel);
    files[key] = source;
    const { importedFiles, typeReferenceDirectives } = ts.preProcessFile(source, true, false);
    for (const { fileName } of importedFiles) {
      const target = resolveTypesImport(rel, fileName);
      if (target !== undefined) {
        pending.push(target);
      }
    }
    for (const { fileName } of typeReferenceDirectives) {
      if (fileName.startsWith(LUA_TYPES_REFERENCE_PREFIX)) {
        luaEntries.push(`${fileName.slice(LUA_TYPES_REFERENCE_PREFIX.length)}.d.ts`);
      }
    }
  }
  return { ...files, ...collectLuaTypesClosure(luaEntries) };
}

function buildAmbientFiles(): Record<string, string> {
  const files: Record<string, string> = {
    [LANGUAGE_EXTENSIONS_KEY]: readLanguageExtensions(),
    "node_modules/@defold-typescript/types/src/core-types.ts": readAmbient("src/core-types.ts"),
    "node_modules/@defold-typescript/types/src/engine-globals.d.ts":
      readAmbient("src/engine-globals.d.ts"),
    "node_modules/@defold-typescript/types/src/go-overloads.d.ts":
      readAmbient("src/go-overloads.d.ts"),
    "node_modules/@defold-typescript/types/src/custom-messages.d.ts": readAmbient(
      "src/custom-messages.d.ts",
    ),
    "node_modules/@defold-typescript/types/src/msg-overloads.d.ts":
      readAmbient("src/msg-overloads.d.ts"),
    "node_modules/@defold-typescript/types/src/message-guard.d.ts":
      readAmbient("src/message-guard.d.ts"),
    "node_modules/@defold-typescript/types/src/window-event-guard.d.ts": readAmbient(
      "src/window-event-guard.d.ts",
    ),
    "node_modules/@defold-typescript/types/src/message-dispatch.d.ts": readAmbient(
      "src/message-dispatch.d.ts",
    ),
    "node_modules/@defold-typescript/types/src/lifecycle.ts": readAmbient("src/lifecycle.ts"),
    // Ambient `declare module "@defold-typescript/types/timers"` so user code
    // type-resolves the polyfill import in the virtual program; the lowering
    // rewrites the specifier to a flat require at emit.
    "node_modules/@defold-typescript/types/src/timers.d.ts": readAmbient("src/timers.d.ts"),
    // Mirror the consumer-facing re-exports of the real package index so a user
    // file can `import { defineScript }` and `import type { Hash, Vector3 }`.
    "node_modules/@defold-typescript/types/index.ts": [
      'export { defineGuiScript, defineRenderScript, defineScript } from "./src/lifecycle";',
      'export type { GuiScriptHooks, InputAction, InputTouch, RenderScriptHooks, ScriptHooks, ScriptProperties, ScriptProperty } from "./src/lifecycle";',
      'export type { Hash, Matrix4, Quaternion, Url, Vector, Vector3, Vector4 } from "./src/core-types";',
      "",
    ].join("\n"),
    // Published subpath entrypoints that exist as package exports. The per-kind
    // ones mirror slice A's generated `generateKindIndex` output by re-exporting
    // only the matching factory, so a walled source's subpath import resolves to
    // it and the call-site erasure fires (otherwise the import lowers to a broken
    // `require("@defold-typescript/types/gui-script")`); their namespaces are
    // already seeded ambiently below. The `core-types` entry mirrors the
    // package's `exports` map so a materialized surface's published-subpath brand
    // import resolves in-process. It re-exports rather than copies: a second copy
    // would mint `unique symbol` brands that never unify with the package index's.
    // The editor-script subpath belongs to the editor surface, below.
    "node_modules/@defold-typescript/types/core-types.d.ts": 'export * from "./src/core-types";\n',
    "node_modules/@defold-typescript/types/script.d.ts":
      'export { defineScript } from "./src/lifecycle.js";\nexport type { ScriptProperties, ScriptProperty } from "./src/lifecycle.js";\n',
    "node_modules/@defold-typescript/types/gui-script.d.ts":
      'export { defineGuiScript } from "./src/lifecycle.js";\nexport type { ScriptProperties, ScriptProperty } from "./src/lifecycle.js";\n',
    "node_modules/@defold-typescript/types/render-script.d.ts":
      'export { defineRenderScript } from "./src/lifecycle.js";\nexport type { ScriptProperties, ScriptProperty } from "./src/lifecycle.js";\n',
  };
  // The generated declarations of each bundled library, at the paths the
  // package `exports` map names, so the build types user code against the same
  // `.d.ts` tsserver reads. A library's own `.ts` compiles separately, in
  // `compileLibraryModules`.
  for (const { id } of BUNDLED_LIBRARIES) {
    for (const entry of readdirSync(path.join(TYPES_PKG_ROOT, id))) {
      if (entry.endsWith(".d.ts")) {
        files[`node_modules/@defold-typescript/types/${id}/${entry}`] = readAmbient(
          `${id}/${entry}`,
        );
      }
    }
  }
  // Seed the Lua 5.1 standard library (math/os/string/table/coroutine + base
  // globals) so user code can call e.g. `math.randomseed(os.time())`.
  Object.assign(files, collectLuaTypesClosure(LUA_TYPES_ENTRY_FILES));
  // Seed every generated namespace so real multi-namespace user code (sprite,
  // physics, label, ...) resolves — not just the historical vmath/msg/go subset.
  for (const entry of readdirSync(path.join(TYPES_PKG_ROOT, "generated"))) {
    if (entry.endsWith(".d.ts")) {
      files[`node_modules/@defold-typescript/types/generated/${entry}`] = readAmbient(
        `generated/${entry}`,
      );
    }
  }
  // Seed every hand-authored `src/*.d.ts` augmentation (overloads + guards) so
  // the virtual program mirrors index.d.ts's `import "./src/*"` set. Enumerated
  // rather than hard-listed so a new augmentation (e.g. socket-types,
  // vmath-overloads) can't silently drop out of the transpiler surface while
  // still type-checking under the editor's index.d.ts.
  for (const entry of readdirSync(path.join(TYPES_PKG_ROOT, "src"))) {
    if (entry.endsWith(".d.ts")) {
      files[`node_modules/@defold-typescript/types/src/${entry}`] = readAmbient(`src/${entry}`);
    }
  }
  return files;
}

// The file `tsc` reads under `types: ["@defold-typescript/types/editor-script"]`,
// with everything it reaches: the editor and editor-VM namespaces, their
// overloads and globals, and the editor-script factory and hook types in
// `src/editor.ts`.
const EDITOR_KIND_CLOSURE = collectTypesClosure(EDITOR_KIND_INDEX);

/**
 * The declarations an editor-side source is checked against: the closure of the
 * editor-script kind index, and the editor-script subpath.
 */
export const EDITOR_AMBIENT_FILES: Readonly<Record<string, string>> = {
  [LANGUAGE_EXTENSIONS_KEY]: readLanguageExtensions(),
  ...EDITOR_KIND_CLOSURE,
  "node_modules/@defold-typescript/types/editor-script.d.ts": [
    'export { defineEditorCommand, defineEditorScript } from "./src/editor.js";',
    'export type { EditorCommand, EditorCommandQuery, EditorNode, EditorScriptModule } from "./src/editor.js";',
    "",
  ].join("\n"),
};

// What the editor-script kind reaches and the root index, which the game
// runtime's kinds share, does not.
function editorOnlyKeys(): Set<string> {
  const runtime = collectTypesClosure(ROOT_INDEX);
  return new Set(Object.keys(EDITOR_KIND_CLOSURE).filter((key) => !(key in runtime)));
}

function buildRuntimeAmbientFiles(): Record<string, string> {
  const editorOnly = editorOnlyKeys();
  return Object.fromEntries(
    Object.entries(buildAmbientFiles()).filter(([key]) => !editorOnly.has(key)),
  );
}

/**
 * The declarations every source that is not editor-side is checked against: the
 * game runtime's namespaces, augmentations and per-kind subpaths, with nothing
 * only the editor-script kind reaches.
 */
export const AMBIENT_FILES: Readonly<Record<string, string>> = buildRuntimeAmbientFiles();

/**
 * Whether a source is editor-side on its own: it imports the editor-script
 * subpath (a type-only import included) or names it in a type reference. A
 * source an editor-side one imports is editor-side too, which only a program
 * can tell.
 */
export function isEditorSideSource(text: string): boolean {
  const { importedFiles, typeReferenceDirectives } = ts.preProcessFile(text, true, false);
  return [...importedFiles, ...typeReferenceDirectives].some(
    ({ fileName }) => fileName === EDITOR_SCRIPT_SPECIFIER,
  );
}
