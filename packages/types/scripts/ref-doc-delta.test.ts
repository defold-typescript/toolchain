import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  collectElementNames,
  parseRefDocDeltaArgs,
  selectRefDocDeltaTarget,
  verifyRefDocDelta,
} from "./ref-doc-delta";
import type { ApiTarget } from "./regen";
import type { SyncManifestEntry, ZipAccessor } from "./sync-api-docs";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const VERSION = "1.9.8";
const TARGET: ApiTarget = {
  id: "defold-1.9.8",
  fixturesDir: "fixtures/defold-1.9.8",
  generatedDir: "generated/versions/defold-1.9.8",
  coreTypesImport: "../../../src/core-types",
  source: { kind: "ref-doc", version: VERSION },
  modules: [{ namespace: "label", fixture: "label_doc.json", outFile: "label.d.ts" }],
};
const CURRENT_TARGET: ApiTarget = {
  id: "defold-1.12.4",
  fixturesDir: "fixtures",
  generatedDir: "generated",
  coreTypesImport: "../src/core-types",
  source: null,
  modules: [{ namespace: "label", fixture: "label_doc.json", outFile: "label.d.ts" }],
};
const SYNC_MANIFEST: readonly SyncManifestEntry[] = [
  { namespace: "label", zipEntry: "label.json", fixture: "fixtures/label_doc.json" },
];

function labelDoc(names: readonly string[]): unknown {
  return {
    info: { namespace: "label", brief: "", description: "" },
    elements: names.map((name) => ({ type: "FUNCTION", name })),
  };
}

function fakeResolveOpts(doc: unknown): {
  cacheDir: string;
  readZip: () => ZipAccessor;
  syncManifest: readonly SyncManifestEntry[];
} {
  const cacheDir = mkdtempSync(resolve(PACKAGE_ROOT, "ref-doc-delta-cache-"));
  mkdirSync(resolve(cacheDir, VERSION), { recursive: true });
  writeFileSync(resolve(cacheDir, VERSION, "ref-doc.zip"), "seeded");
  return {
    cacheDir,
    readZip: () => ({
      has: (entry) => entry === "label.json",
      entries: () => ["label.json"],
      read: (entry) => {
        if (entry !== "label.json") throw new Error(`unexpected entry ${entry}`);
        return JSON.stringify(doc);
      },
    }),
    syncManifest: SYNC_MANIFEST,
  };
}

async function withReportDoc<T>(
  doc: unknown,
  run: (resolveOpts: ReturnType<typeof fakeResolveOpts>) => Promise<T>,
): Promise<T> {
  const resolveOpts = fakeResolveOpts(doc);
  try {
    return await run(resolveOpts);
  } finally {
    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  }
}

describe("ref-doc delta verifier", () => {
  test("reports ok when expected present FQNs exist and expected absent FQNs are missing", async () => {
    const currentNames = collectElementNames(
      JSON.parse(readFileSync(resolve(PACKAGE_ROOT, "fixtures", "label_doc.json"), "utf8")),
    );
    expect(currentNames.has("label.get_text")).toBe(true);
    expect(currentNames.has("label.set_text")).toBe(true);

    const report = await withReportDoc(labelDoc(["label.get_text"]), (resolveOpts) =>
      verifyRefDocDelta({
        target: TARGET,
        namespace: "label",
        present: ["label.get_text"],
        absent: ["label.set_text"],
        resolveOpts,
      }),
    );

    expect(report).toMatchObject({
      ok: true,
      targetId: "defold-1.9.8",
      version: "1.9.8",
      namespace: "label",
      provenance: "cache",
      missingPresent: [],
      unexpectedPresent: [],
    });
  });

  test("reports a named missing-present entry", async () => {
    const report = await withReportDoc(labelDoc([]), (resolveOpts) =>
      verifyRefDocDelta({
        target: TARGET,
        namespace: "label",
        present: ["label.get_text"],
        absent: ["label.set_text"],
        resolveOpts,
      }),
    );

    expect(report.ok).toBe(false);
    expect(report.missingPresent).toEqual(["label.get_text"]);
    expect(report.unexpectedPresent).toEqual([]);
  });

  test("reports a named unexpected-present entry", async () => {
    const report = await withReportDoc(
      labelDoc(["label.get_text", "label.set_text"]),
      (resolveOpts) =>
        verifyRefDocDelta({
          target: TARGET,
          namespace: "label",
          present: ["label.get_text"],
          absent: ["label.set_text"],
          resolveOpts,
        }),
    );

    expect(report.ok).toBe(false);
    expect(report.missingPresent).toEqual([]);
    expect(report.unexpectedPresent).toEqual(["label.set_text"]);
  });

  test("parses CLI args and rejects a non-ref-doc target", () => {
    expect(
      parseRefDocDeltaArgs([
        "--target",
        "defold-1.9.8",
        "--namespace",
        "label",
        "--present",
        "label.get_text",
        "--absent",
        "label.set_text",
        "--json",
      ]),
    ).toEqual({
      target: "defold-1.9.8",
      namespace: "label",
      present: ["label.get_text"],
      absent: ["label.set_text"],
      json: true,
    });

    expect(() => selectRefDocDeltaTarget([CURRENT_TARGET], "defold-1.12.4")).toThrow(
      'target "defold-1.12.4" is not ref-doc sourced',
    );
  });

  test("advisory command is wired but not part of CI", () => {
    const rootPackage = JSON.parse(
      readFileSync(resolve(PACKAGE_ROOT, "..", "..", "package.json"), "utf8"),
    );
    const typesPackage = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, "package.json"), "utf8"));
    const mise = readFileSync(resolve(PACKAGE_ROOT, "..", "..", "mise.toml"), "utf8");

    expect(typesPackage.scripts["ref-doc-delta"]).toContain("scripts/ref-doc-delta.ts");
    expect(rootPackage.scripts["ref-doc-delta"]).toBe("bun --cwd packages/types run ref-doc-delta");
    expect(mise).toContain("[tasks.ref-doc-delta]");
    expect(mise).toContain("Advisory live ref-doc delta verifier");
    expect(rootPackage.scripts.test).not.toContain("ref-doc-delta");
    expect(rootPackage.scripts.typecheck).not.toContain("ref-doc-delta");
    expect(rootPackage.scripts.lint).not.toContain("ref-doc-delta");
  });
});
