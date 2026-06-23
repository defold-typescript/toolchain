import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  buildSignatureIndex,
  indexDeclarationSource,
  luaTypesFile,
} from "../scripts/lua-types-signature-index";
import {
  BASE_SIGNATURES_PATH,
  BIT_SIGNATURES_PATH,
  COROUTINE_SIGNATURES_PATH,
  DEBUG_SIGNATURES_PATH,
  IO_SIGNATURES_PATH,
  loadSignatureFile,
  MATH_SIGNATURES_PATH,
  OS_SIGNATURES_PATH,
  PACKAGE_SIGNATURES_PATH,
  SOCKET_SIGNATURES_PATH,
  STRING_SIGNATURES_PATH,
  TABLE_SIGNATURES_PATH,
} from "../scripts/signature-store-fs";

// Defold runs LuaJIT, so the authoritative type surface is `lua-types`' jit
// composition: `core/index.d.ts` (every `core/*.d.ts`) plus the files
// `special/jit.d.ts` references. We index that whole surface once and check that
// every authored override still resolves against it. The 5.0 variants are Lua 5.0
// only and intentionally excluded.
const LUAJIT_SOURCES = [
  luaTypesFile("core", "coroutine.d.ts"),
  luaTypesFile("core", "debug.d.ts"),
  luaTypesFile("core", "global.d.ts"),
  luaTypesFile("core", "io.d.ts"),
  luaTypesFile("core", "math.d.ts"),
  luaTypesFile("core", "metatable.d.ts"),
  luaTypesFile("core", "modules.d.ts"),
  luaTypesFile("core", "os.d.ts"),
  luaTypesFile("core", "string.d.ts"),
  luaTypesFile("core", "table.d.ts"),
  luaTypesFile("special", "5.1-or-jit.d.ts"),
  luaTypesFile("special", "5.2-or-jit.d.ts"),
  luaTypesFile("special", "5.2-plus-or-jit.d.ts"),
  luaTypesFile("special", "5.3-pre.d.ts"),
  luaTypesFile("special", "5.4-pre.d.ts"),
  luaTypesFile("special", "jit-only.d.ts"),
];

// The `io` handle methods live on the `LuaFile` interface and are authored under
// the `file:` prefix.
const LUA_TYPES_HANDLES = { file: "LuaFile" };

// Stores transcribed from `lua-types`. `socket` is repo-sourced and checked
// separately below.
const LUA_TYPES_STORES = [
  IO_SIGNATURES_PATH,
  STRING_SIGNATURES_PATH,
  TABLE_SIGNATURES_PATH,
  OS_SIGNATURES_PATH,
  COROUTINE_SIGNATURES_PATH,
  MATH_SIGNATURES_PATH,
  BIT_SIGNATURES_PATH,
  DEBUG_SIGNATURES_PATH,
  PACKAGE_SIGNATURES_PATH,
  BASE_SIGNATURES_PATH,
];

// Authored keys with no `lua-types` source in the LuaJIT surface:
// - `module` is only declared in `special/5.2-plus.d.ts`, outside LuaJIT's set.
// - `package.seeall` is not declared anywhere in `lua-types`.
// Both are documented as hand-authored in their store slices. The set is asserted
// exact in both directions below, so a future unsourced override fails loud.
const HAND_AUTHORED_NO_SOURCE = new Set(["module", "package.seeall"]);

const SOCKET_GENERATED = resolve(import.meta.dir, "..", "generated", "socket.d.ts");
const SOCKET_HANDLES = {
  client: "client",
  server: "server",
  master: "master",
  connected: "connected",
  unconnected: "unconnected",
};

const index = buildSignatureIndex(LUAJIT_SOURCES, LUA_TYPES_HANDLES);

function authoredLuaTypesKeys(): string[] {
  const keys: string[] = [];
  for (const path of LUA_TYPES_STORES) {
    keys.push(...Object.keys(loadSignatureFile(path)));
  }
  return keys;
}

describe("lua-types signature drift guard", () => {
  // The override stores deliberately re-simplify overloads (e.g. `io`'s
  // `file:lines` splits one generic method in two; `base` collapses
  // `collectgarbage`'s 7 overloads to one), so the guard pins existence of the
  // FQN — the real rename/removal drift signal — not authored-vs-source overload
  // counts, which never matched and were never meant to.
  test("every authored lua-types-store key resolves in the LuaJIT index", () => {
    const missing = authoredLuaTypesKeys().filter(
      (key) => !HAND_AUTHORED_NO_SOURCE.has(key) && !index.has(key),
    );

    expect(missing).toEqual([]);
  });

  test("socket: every store key resolves in generated/socket.d.ts with a matching overload count", () => {
    const socketIndex = buildSignatureIndex([SOCKET_GENERATED], SOCKET_HANDLES);
    const store = loadSignatureFile(SOCKET_SIGNATURES_PATH);

    const missing: string[] = [];
    const countMismatch: string[] = [];
    for (const [key, override] of Object.entries(store)) {
      const entry = socketIndex.get(key);
      if (!entry) {
        missing.push(key);
        continue;
      }
      if (entry.overloadCount !== override.signatures.length) {
        countMismatch.push(
          `${key}: store ${override.signatures.length} vs source ${entry.overloadCount}`,
        );
      }
    }

    expect(missing).toEqual([]);
    expect(countMismatch).toEqual([]);
    expect(Object.keys(store).length).toBeGreaterThan(0);
  });

  test("HAND_AUTHORED_NO_SOURCE is exact in both directions", () => {
    const authored = new Set(authoredLuaTypesKeys());

    // Every listed key is genuinely authored and genuinely absent from the index.
    const notAuthored = [...HAND_AUTHORED_NO_SOURCE].filter((key) => !authored.has(key));
    const actuallySourced = [...HAND_AUTHORED_NO_SOURCE].filter((key) => index.has(key));
    expect(notAuthored).toEqual([]);
    expect(actuallySourced).toEqual([]);

    // No unlisted authored key is missing — adding an unsourced override later
    // fails here until it is justified and listed.
    const unlistedMissing = [...authored].filter(
      (key) => !HAND_AUTHORED_NO_SOURCE.has(key) && !index.has(key),
    );
    expect(unlistedMissing).toEqual([]);
  });

  test("drift simulation: a source set with string.byte removed reports string.byte drifted", () => {
    const driftedSource =
      "declare namespace string {\n  function char(...args: number[]): string;\n}\n";
    const driftedIndex = indexDeclarationSource("string.d.ts", driftedSource);
    const store = loadSignatureFile(STRING_SIGNATURES_PATH);

    const drifted = Object.keys(store).filter(
      (key) => !HAND_AUTHORED_NO_SOURCE.has(key) && !driftedIndex.has(key),
    );

    expect(drifted).toContain("string.byte");
  });
});
