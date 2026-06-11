import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { materializeVersionedSurface } from "../scripts/materialize-version";
import { loadApiTargets } from "../scripts/regen";
import { SYNC_MANIFEST, type ZipAccessor } from "../scripts/sync-api-docs";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const VERSIONS_DIR = resolve(PACKAGE_ROOT, "test-d", "versions");

function typecheck(tsconfigPath: string): { exitCode: number; output: string } {
  const proc = Bun.spawnSync(["bunx", "tsc", "-p", tsconfigPath, "--noEmit"], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  return {
    exitCode: proc.exitCode,
    output: `${proc.stdout.toString()}${proc.stderr.toString()}`,
  };
}

const noDownload = async (): Promise<Uint8Array> => {
  throw new Error("download should not be called");
};

function labelRefDocZip(opts: { dropSetText?: boolean } = {}): {
  fakeZip: ZipAccessor;
  cacheDir: string;
} {
  const version = "1.9.8";
  const labelEntry = SYNC_MANIFEST.find((e) => e.namespace === "label");
  if (!labelEntry) throw new Error("no label SYNC_MANIFEST entry");
  const doc = JSON.parse(
    readFileSync(resolve(PACKAGE_ROOT, "fixtures", "label_doc.json"), "utf8"),
  ) as { elements: { name: string }[] };
  if (opts.dropSetText) {
    doc.elements = doc.elements.filter((e) => e.name !== "label.set_text");
  }
  const json = JSON.stringify(doc);
  const fakeZip: ZipAccessor = {
    has: (e) => e === labelEntry.zipEntry,
    entries: () => [labelEntry.zipEntry],
    read: (e) => {
      if (e !== labelEntry.zipEntry) throw new Error(`unexpected zip entry ${e}`);
      return json;
    },
  };
  const cacheDir = mkdtempSync(resolve(PACKAGE_ROOT, "ref-doc-cache-"));
  mkdirSync(resolve(cacheDir, version), { recursive: true });
  writeFileSync(resolve(cacheDir, version, "ref-doc.zip"), "seeded");
  return { fakeZip, cacheDir };
}

// Materialize a real ref-doc-sourced defold-1.9.8 surface (label, with
// set_text dropped) into a faux @types package three levels under the package
// root, so the target's `../../../src/core-types` import resolves to the real
// core-types and `@typescript-to-lua/language-extensions` resolves via the
// package's node_modules. Returns the materialize root for tsconfig wiring.
async function materializeProofSurface(): Promise<{ root: string; cacheDir: string }> {
  const target = loadApiTargets().find((t) => t.id === "defold-1.9.8");
  if (!target) throw new Error("no defold-1.9.8 target");
  const { fakeZip, cacheDir } = labelRefDocZip({ dropSetText: true });
  const root = mkdtempSync(resolve(PACKAGE_ROOT, "mat-proof-"));
  const destDir = resolve(root, "versions", "defold-1.9.8");
  await materializeVersionedSurface(target, {
    destDir,
    resolveOpts: { cacheDir, readZip: () => fakeZip, download: noDownload },
  });
  return { root, cacheDir };
}

function writeProofConfig(root: string, proof: string): string {
  writeFileSync(resolve(root, "proof.ts"), proof);
  const tsconfigPath = resolve(root, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    `${JSON.stringify(
      {
        extends: "../../../tsconfig.json",
        compilerOptions: { noEmit: true, typeRoots: ["versions"], types: ["defold-1.9.8"] },
        include: ["proof.ts"],
      },
      null,
      2,
    )}\n`,
  );
  return tsconfigPath;
}

const SHARED_MEMBER = 'const _t: string = label.get_text("score");\nvoid _t;\n';
const CURRENT_ONLY_CALL = 'label.set_text("score", "x");\n';

describe("versioned API surface — consumer tsconfig proof", () => {
  test("current surface accepts the current-only member", () => {
    const { exitCode, output } = typecheck(resolve(VERSIONS_DIR, "tsconfig.current.json"));
    if (exitCode !== 0) {
      throw new Error(`current surface should accept label.set_text, but tsc failed:\n${output}`);
    }
    expect(exitCode).toBe(0);
  });

  test("real defold-1.9.8 surface rejects the current-only member, accepts the shared member", async () => {
    const { root, cacheDir } = await materializeProofSurface();
    try {
      const tsconfigPath = writeProofConfig(
        root,
        `export {};\n${SHARED_MEMBER}// @ts-expect-error set_text is absent on defold-1.9.8\n${CURRENT_ONLY_CALL}`,
      );
      const { exitCode, output } = typecheck(tsconfigPath);
      if (exitCode !== 0) {
        throw new Error(
          `defold-1.9.8 proof failed — either set_text leaked in (unused @ts-expect-error) ` +
            `or get_text did not resolve:\n${output}`,
        );
      }
      expect(exitCode).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  test("harness can fail: defold-1.9.8 surface call without @ts-expect-error errors", async () => {
    const { root, cacheDir } = await materializeProofSurface();
    try {
      const tsconfigPath = writeProofConfig(
        root,
        `export {};\n${SHARED_MEMBER}${CURRENT_ONLY_CALL}`,
      );
      const { exitCode } = typecheck(tsconfigPath);
      expect(exitCode).not.toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });
});
