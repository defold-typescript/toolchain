import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { loadSignatures } from "../scripts/signature-store-io";
import { parseDefoldApiDoc } from "../src/api-doc";

const IO_DOC = resolve(import.meta.dir, "..", "fixtures", "io_doc.json");

async function ioFunctionNames(): Promise<string[]> {
  const module = parseDefoldApiDoc(await Bun.file(IO_DOC).json());
  return module.functions.map((fn) => fn.name);
}

describe("lua-stdlib signature parity — io store covers io_doc.json", () => {
  test("every io_doc.json FUNCTION element has exactly one store entry", async () => {
    const store = loadSignatures();
    const names = await ioFunctionNames();

    const missing = names.filter((name) => !(name in store));
    expect(missing).toEqual([]);
    expect(names.length).toBeGreaterThan(0);
  });

  test("no store key is an orphan — every key names an io_doc.json FUNCTION element", async () => {
    const store = loadSignatures();
    const names = new Set(await ioFunctionNames());

    const orphans = Object.keys(store).filter((key) => !names.has(key));
    expect(orphans).toEqual([]);
  });
});
