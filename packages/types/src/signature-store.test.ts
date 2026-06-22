import { describe, expect, test } from "bun:test";
import {
  IO_SIGNATURES_PATH,
  loadSignatureFile,
  STRING_SIGNATURES_PATH,
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
