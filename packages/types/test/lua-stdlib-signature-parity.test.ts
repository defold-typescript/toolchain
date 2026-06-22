import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  IO_SIGNATURES_PATH,
  loadSignatureFile,
  STRING_SIGNATURES_PATH,
} from "../scripts/signature-store-fs";
import { parseDefoldApiDoc } from "../src/api-doc";

const NAMESPACES = [
  { ns: "io", docFixture: "io_doc.json", storePath: IO_SIGNATURES_PATH },
  { ns: "string", docFixture: "string_doc.json", storePath: STRING_SIGNATURES_PATH },
];

async function docFunctionNames(docFixture: string): Promise<string[]> {
  const path = resolve(import.meta.dir, "..", "fixtures", docFixture);
  const module = parseDefoldApiDoc(await Bun.file(path).json());
  return module.functions.map((fn) => fn.name);
}

describe("lua-stdlib signature parity", () => {
  for (const { ns, docFixture, storePath } of NAMESPACES) {
    test(`${ns}: every ${docFixture} FUNCTION element has exactly one store entry`, async () => {
      const store = loadSignatureFile(storePath);
      const names = await docFunctionNames(docFixture);

      const missing = names.filter((name) => !(name in store));
      expect(missing).toEqual([]);
      expect(names.length).toBeGreaterThan(0);
    });

    test(`${ns}: no store key is an orphan — every key names a ${docFixture} FUNCTION element`, async () => {
      const store = loadSignatureFile(storePath);
      const names = new Set(await docFunctionNames(docFixture));

      const orphans = Object.keys(store).filter((key) => !names.has(key));
      expect(orphans).toEqual([]);
    });
  }

  test("string covers all 14 string.* doc functions with zero orphans", async () => {
    const store = loadSignatureFile(STRING_SIGNATURES_PATH);
    const names = await docFunctionNames("string_doc.json");

    expect(names.length).toBe(14);
    const missing = names.filter((name) => !(name in store));
    const orphans = Object.keys(store).filter((key) => !names.includes(key));
    expect(missing).toEqual([]);
    expect(orphans).toEqual([]);
  });
});
