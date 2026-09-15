import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveTypesPackageRoot } from "./api-registry";
import { emitExtensionDeclarationFromDoc } from "./extension-emit";

interface GoldenManifestModule {
  EXTENSION_GOLDENS_DIR: string;
  EXTENSION_GOLDEN_MANIFEST: readonly {
    namespace: string;
    doc: { info: { namespace: string } };
    outFile: string;
  }[];
}

const typesRoot = resolveTypesPackageRoot();
if (typesRoot === null) {
  throw new Error("@defold-typescript/types must resolve in the monorepo");
}
const { EXTENSION_GOLDENS_DIR, EXTENSION_GOLDEN_MANIFEST } = (await import(
  join(typesRoot, "scripts", "extension-goldens.ts")
)) as GoldenManifestModule;

describe("extension golden parity", () => {
  test("the golden manifest is not empty", () => {
    expect(EXTENSION_GOLDEN_MANIFEST.length).toBeGreaterThan(0);
  });

  for (const entry of EXTENSION_GOLDEN_MANIFEST) {
    test(`${entry.namespace}: resolve emit is byte-equal to the committed extension golden`, async () => {
      const golden = readFileSync(join(typesRoot, EXTENSION_GOLDENS_DIR, entry.outFile), "utf8");
      const { namespace, contents, dropped } = await emitExtensionDeclarationFromDoc(entry.doc);
      expect(namespace).toBe(entry.namespace);
      expect(contents).toBe(golden);
      expect(dropped).toEqual([]);
    });
  }
});
