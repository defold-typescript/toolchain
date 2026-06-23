import { describe, expect, test } from "bun:test";
import {
  buildSignatureIndex,
  indexDeclarationSource,
  luaTypesFile,
} from "./lua-types-signature-index";

describe("buildSignatureIndex", () => {
  test("core/string.d.ts: string.byte has 2 overloads, string.char has 1", () => {
    const index = buildSignatureIndex([luaTypesFile("core", "string.d.ts")]);

    expect(index.get("string.byte")?.overloadCount).toBe(2);
    expect(index.get("string.char")?.overloadCount).toBe(1);
  });

  test("core/io.d.ts with { file: LuaFile }: io.read=3 and LuaFile methods re-key to file:*", () => {
    const index = buildSignatureIndex([luaTypesFile("core", "io.d.ts")], { file: "LuaFile" });

    expect(index.get("io.read")?.overloadCount).toBe(3);
    expect(index.get("file:read")?.overloadCount).toBe(3);
    // The interface name itself must not survive as a namespace prefix.
    expect(index.has("LuaFile.read")).toBe(false);
  });

  test("core/modules.d.ts: non-callable package.path is a value entry (overloadCount 1)", () => {
    const index = buildSignatureIndex([luaTypesFile("core", "modules.d.ts")]);

    expect(index.get("package.path")?.overloadCount).toBe(1);
  });

  test("core/global.d.ts: top-level pcall is keyed bare, not global.pcall", () => {
    const index = buildSignatureIndex([luaTypesFile("core", "global.d.ts")]);

    expect(index.has("pcall")).toBe(true);
    expect(index.has("global.pcall")).toBe(false);
  });

  test("a source missing byte omits string.byte (the index reflects source state)", () => {
    const source = "declare namespace string {\n  function char(...args: number[]): string;\n}\n";
    const index = indexDeclarationSource("string.d.ts", source);

    expect(index.has("string.char")).toBe(true);
    expect(index.has("string.byte")).toBe(false);
  });
});
