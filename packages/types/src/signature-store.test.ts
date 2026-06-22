import { describe, expect, test } from "bun:test";
import {
  COROUTINE_SIGNATURES_PATH,
  IO_SIGNATURES_PATH,
  loadSignatureFile,
  OS_SIGNATURES_PATH,
  STRING_SIGNATURES_PATH,
  TABLE_SIGNATURES_PATH,
} from "../scripts/signature-store-fs";
import { lookupSignature, type SignatureOverride, type SignatureStore } from "./signature-store";

describe("lookupSignature", () => {
  const ioOpen: SignatureOverride = {
    signatures: ["io.open(filename: string, mode?: string): LuaFile | undefined"],
  };
  const store: SignatureStore = { "io.open": ioOpen };

  test("returns the entry for a known fqn and null for an unknown one", () => {
    expect(lookupSignature(store, "io.open")).toBe(ioOpen);
    expect(lookupSignature(store, "missing.fn")).toBeNull();
  });
});

describe("authored io signature store", () => {
  const store = loadSignatureFile(IO_SIGNATURES_PATH);

  test('io.open resolves to the authored "LuaFile | undefined" line', () => {
    const entry = lookupSignature(store, "io.open");
    expect(entry).not.toBeNull();
    expect(entry?.signatures).toContain(
      "io.open(filename: string, mode?: string): LuaFile | undefined",
    );
  });

  test("io.read is overloaded — more than one signature, in authored order", () => {
    const entry = lookupSignature(store, "io.read");
    expect(entry).not.toBeNull();
    expect(entry?.signatures.length).toBeGreaterThan(1);
    expect(entry?.signatures[0]).toBe("io.read(): string | undefined");
  });

  test("every entry typechecks as a SignatureOverride with a non-empty signatures array", () => {
    for (const [fqn, override] of Object.entries(store)) {
      const o: SignatureOverride = override;
      expect(Array.isArray(o.signatures)).toBe(true);
      expect(o.signatures.length).toBeGreaterThan(0);
      for (const sig of o.signatures) {
        expect(typeof sig).toBe("string");
        expect(sig.length).toBeGreaterThan(0);
        expect(fqn.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("authored string signature store", () => {
  const store = loadSignatureFile(STRING_SIGNATURES_PATH);

  test("string.format resolves to the authored variadic line", () => {
    const entry = lookupSignature(store, "string.format");
    expect(entry).not.toBeNull();
    expect(entry?.signatures).toContain(
      "string.format(formatstring: string, ...args: any[]): string",
    );
  });

  test("string.byte is overloaded — two signatures, in authored order", () => {
    const entry = lookupSignature(store, "string.byte");
    expect(entry).not.toBeNull();
    expect(entry?.signatures.length).toBe(2);
    expect(entry?.signatures[0]).toBe("string.byte(s: string, i?: number): number");
  });

  test("every entry typechecks as a SignatureOverride with a non-empty signatures array", () => {
    for (const [fqn, override] of Object.entries(store)) {
      const o: SignatureOverride = override;
      expect(Array.isArray(o.signatures)).toBe(true);
      expect(o.signatures.length).toBeGreaterThan(0);
      for (const sig of o.signatures) {
        expect(typeof sig).toBe("string");
        expect(sig.length).toBeGreaterThan(0);
        expect(fqn.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("authored table signature store", () => {
  const store = loadSignatureFile(TABLE_SIGNATURES_PATH);

  test("table.concat resolves to the authored list/sep/i/j line", () => {
    const entry = lookupSignature(store, "table.concat");
    expect(entry).not.toBeNull();
    expect(entry?.signatures).toContain(
      "table.concat(list: (string | number)[], sep?: string, i?: number, j?: number): string",
    );
  });

  test("table.insert is overloaded — two signatures, (list, value) first", () => {
    const entry = lookupSignature(store, "table.insert");
    expect(entry).not.toBeNull();
    expect(entry?.signatures.length).toBe(2);
    expect(entry?.signatures[0]).toBe("table.insert<T>(list: T[], value: T): void");
    expect(entry?.signatures[1]).toBe("table.insert<T>(list: T[], pos: number, value: T): void");
  });

  test("every entry typechecks as a SignatureOverride with a non-empty signatures array", () => {
    for (const [fqn, override] of Object.entries(store)) {
      const o: SignatureOverride = override;
      expect(Array.isArray(o.signatures)).toBe(true);
      expect(o.signatures.length).toBeGreaterThan(0);
      for (const sig of o.signatures) {
        expect(typeof sig).toBe("string");
        expect(sig.length).toBeGreaterThan(0);
        expect(fqn.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("authored os signature store", () => {
  const store = loadSignatureFile(OS_SIGNATURES_PATH);

  test("os.date is overloaded — two signatures, plain string form first", () => {
    const entry = lookupSignature(store, "os.date");
    expect(entry).not.toBeNull();
    expect(entry?.signatures.length).toBe(2);
    expect(entry?.signatures[0]).toBe("os.date(format?: string, time?: number): string");
    expect(entry?.signatures[1]).toBe('os.date(format: "*t", time?: number): LuaDateInfoResult');
  });

  test("os.execute / os.exit use the LuaJIT (Lua 5.1) variant forms", () => {
    expect(lookupSignature(store, "os.execute")?.signatures).toContain(
      "os.execute(command?: string): number",
    );
    expect(lookupSignature(store, "os.exit")?.signatures).toContain(
      "os.exit(code?: number): never",
    );
  });

  test("every entry typechecks as a SignatureOverride with a non-empty signatures array", () => {
    for (const [fqn, override] of Object.entries(store)) {
      const o: SignatureOverride = override;
      expect(Array.isArray(o.signatures)).toBe(true);
      expect(o.signatures.length).toBeGreaterThan(0);
      for (const sig of o.signatures) {
        expect(typeof sig).toBe("string");
        expect(sig.length).toBeGreaterThan(0);
        expect(fqn.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("authored coroutine signature store", () => {
  const store = loadSignatureFile(COROUTINE_SIGNATURES_PATH);

  test("coroutine.create resolves to the authored LuaThread line", () => {
    const entry = lookupSignature(store, "coroutine.create");
    expect(entry).not.toBeNull();
    expect(entry?.signatures).toContain("coroutine.create(f: (...args: any[]) => any): LuaThread");
  });

  test("every entry typechecks as a SignatureOverride with a non-empty signatures array", () => {
    for (const [fqn, override] of Object.entries(store)) {
      const o: SignatureOverride = override;
      expect(Array.isArray(o.signatures)).toBe(true);
      expect(o.signatures.length).toBeGreaterThan(0);
      for (const sig of o.signatures) {
        expect(typeof sig).toBe("string");
        expect(sig.length).toBeGreaterThan(0);
        expect(fqn.length).toBeGreaterThan(0);
      }
    }
  });
});
