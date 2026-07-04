import { describe, expect, test } from "bun:test";
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

describe("authored base signature store (bare global keys)", () => {
  const store = loadSignatureFile(BASE_SIGNATURES_PATH);

  test("pcall resolves to the LuaMultiReturn-strengthened authored form", () => {
    const entry = lookupSignature(store, "pcall");
    expect(entry).not.toBeNull();
    expect(entry?.signatures[0]).toContain("LuaMultiReturn");
    expect(entry?.signatures[0]).toBe(
      "pcall<A extends any[], R>(f: (...args: A) => R, ...args: A): LuaMultiReturn<[true, R] | [false, string]>",
    );
  });

  test("select resolves to the authored union-indexed form", () => {
    const entry = lookupSignature(store, "select");
    expect(entry).not.toBeNull();
    expect(entry?.signatures).toContain('select(n: number | "#", ...args: any[]): any');
  });

  test("unpack resolves to its Lua-5.1 authored form (not 5.2's table.unpack)", () => {
    const entry = lookupSignature(store, "unpack");
    expect(entry).not.toBeNull();
    expect(entry?.signatures).toContain("unpack<T extends any[]>(list: T): LuaMultiReturn<T>");
  });

  test("type resolves to its closed value-to-string union (matching lua-types)", () => {
    const entry = lookupSignature(store, "type");
    expect(entry).not.toBeNull();
    expect(entry?.signatures).toContain(
      'type(v: any): "nil" | "number" | "string" | "boolean" | "table" | "function" | "thread" | "userdata"',
    );
  });

  test("every key is a bare global (no namespace prefix) — the one unprefixed store", () => {
    const keys = Object.keys(store);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).toMatch(/^[a-z]+$/);
    }
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

describe("authored socket signature store", () => {
  const store = loadSignatureFile(SOCKET_SIGNATURES_PATH);

  test("a top-level fn strengthens past the thin ref-doc — socket.gettime gains a number return", () => {
    expect(lookupSignature(store, "socket.gettime")?.signatures).toContain(
      "socket.gettime(): number",
    );
    expect(lookupSignature(store, "socket.connect")?.signatures).toContain(
      "socket.connect(address: string, port: number, locaddr?: string, locport?: number, family?: string): LuaMultiReturn<[client | unknown, string | unknown]>",
    );
  });

  test("receiver methods key on the verbatim fixture name with typed (non-unknown) params", () => {
    expect(lookupSignature(store, "client:receive")?.signatures).toContain(
      "client:receive(pattern?: string | number, prefix?: string): LuaMultiReturn<[string | unknown, string | unknown, string | unknown]>",
    );
    expect(lookupSignature(store, "master:bind")?.signatures).toContain(
      "master:bind(address: string, port: number): LuaMultiReturn<[number | unknown, string | unknown]>",
    );
  });

  test("a socket.dns.* sub-namespace key keeps its two-dot shape (no accidental flatten)", () => {
    const entry = lookupSignature(store, "socket.dns.toip");
    expect(entry).not.toBeNull();
    expect(entry?.signatures).toContain(
      "socket.dns.toip(address: string): LuaMultiReturn<[string | unknown, Record<string | number, unknown> | string]>",
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

describe("authored math signature store", () => {
  const store = loadSignatureFile(MATH_SIGNATURES_PATH);

  test("math.random resolves to the authored optional-arg form with a number return", () => {
    const entry = lookupSignature(store, "math.random");
    expect(entry).not.toBeNull();
    expect(entry?.signatures).toContain("math.random(m?: number, n?: number): number");
  });

  test("math.modf resolves to the authored LuaMultiReturn tuple", () => {
    const entry = lookupSignature(store, "math.modf");
    expect(entry).not.toBeNull();
    expect(entry?.signatures).toContain("math.modf(x: number): LuaMultiReturn<[number, number]>");
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

describe("authored bit signature store", () => {
  const store = loadSignatureFile(BIT_SIGNATURES_PATH);

  test("bit.tohex resolves to the authored optional-second-arg form", () => {
    const entry = lookupSignature(store, "bit.tohex");
    expect(entry).not.toBeNull();
    expect(entry?.signatures).toContain("bit.tohex(x: number, n?: number): string");
  });

  test("bit.bor resolves to the authored variadic form", () => {
    const entry = lookupSignature(store, "bit.bor");
    expect(entry).not.toBeNull();
    expect(entry?.signatures).toContain("bit.bor(x: number, ...rest: number[]): number");
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

describe("authored debug signature store", () => {
  const store = loadSignatureFile(DEBUG_SIGNATURES_PATH);

  test("debug.getinfo collapses to a single user-facing overload", () => {
    const entry = lookupSignature(store, "debug.getinfo");
    expect(entry).not.toBeNull();
    expect(entry?.signatures.length).toBe(1);
    expect(entry?.signatures[0]).toBe(
      "debug.getinfo(f: Function | number, what?: string): FunctionInfo",
    );
  });

  test("debug.traceback resolves to the authored message/level form", () => {
    const entry = lookupSignature(store, "debug.traceback");
    expect(entry).not.toBeNull();
    expect(entry?.signatures).toContain(
      "debug.traceback(message?: string, level?: number): string",
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

describe("authored package signature store", () => {
  const store = loadSignatureFile(PACKAGE_SIGNATURES_PATH);

  test("package.path and package.loaded are typed-value (non-callable) forms", () => {
    expect(lookupSignature(store, "package.path")?.signatures).toContain("package.path: string");
    expect(lookupSignature(store, "package.loaded")?.signatures).toContain(
      "package.loaded: Record<string, any>",
    );
  });

  test("package.loadlib is a true call signature", () => {
    const entry = lookupSignature(store, "package.loadlib");
    expect(entry).not.toBeNull();
    expect(entry?.signatures[0]).toMatch(/^package\.loadlib\(.*\):/);
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
