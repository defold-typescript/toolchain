import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectEvidence,
  collectTargets,
  type DocsEvidence,
  evaluateReleaseReadiness,
  type ImportManifestEvidence,
  type ReadinessCategory,
  type ReadinessEvidence,
} from "./defold-release-readiness.ts";

const REPO_ROOT = join(import.meta.dir, "..");

function baseImportManifest(): ImportManifestEvidence {
  return {
    version: "1.13.0",
    baseline: "defold-1.12.4",
    ready: true,
    unknownTypeCount: 0,
    unmappedNamespaceCount: 0,
    declarationNamespaceCount: 42,
  };
}

function baseDocs(): DocsEvidence {
  return {
    canonicalRoutes: ["/api/liveupdate", "/api/model"],
    historicalRoutes: ["/api/defold-1.12.4/liveupdate", "/api/defold-1.12.4/model"],
    searchMachinery: true,
  };
}

// A fully-passing evidence bundle; each test knocks out one dimension to prove
// the gate fails closed and names the blocker.
function passingEvidence(): ReadinessEvidence {
  return {
    expected: { release: "1.13.0", baseline: "1.12.4" },
    importManifest: baseImportManifest(),
    availability: {
      current: "1.13.0",
      baseline: "1.12.4",
      removedSymbols: ["liveupdate.add_mount", "model.material"],
      sinceCurrentSymbols: ["b2d.body.compute_aabb"],
    },
    targets: [
      { id: "defold-1.13.0", isDefault: true, hasCommittedSurface: true },
      { id: "defold-1.12.4", isDefault: false, hasCommittedSurface: true },
    ],
    migrationGuide: {
      headings: ["liveupdate.add_mount", "liveupdate.remove_mount", "model.material"],
    },
    docs: baseDocs(),
    matrix: [
      { version: "1.13.0", surfaceId: "defold-1.13.0", isCurrentStable: true },
      { version: "1.12.4", surfaceId: "defold-1.12.4", isCurrentStable: false },
    ],
  };
}

describe("evaluateReleaseReadiness", () => {
  test("passes when every dimension of committed evidence is present and fresh", () => {
    const result = evaluateReleaseReadiness(passingEvidence());
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
  });

  test("rejects when the import manifest is absent", () => {
    const result = evaluateReleaseReadiness({ ...passingEvidence(), importManifest: null });
    expect(result.ok).toBe(false);
    expect(result.problems.map((p) => p.category)).toContain("import");
  });

  test("rejects when the import manifest is stale (version mismatch)", () => {
    const e = passingEvidence();
    const result = evaluateReleaseReadiness({
      ...e,
      importManifest: { ...baseImportManifest(), version: "1.12.4" },
    });
    expect(result.ok).toBe(false);
    expect(
      result.problems.some(
        (p) => p.category === "import" && /stale|1\.12\.4|1\.13\.0/.test(p.message),
      ),
    ).toBe(true);
  });

  test("rejects when the import manifest is not ready", () => {
    const e = passingEvidence();
    const result = evaluateReleaseReadiness({
      ...e,
      importManifest: { ...baseImportManifest(), ready: false },
    });
    expect(result.ok).toBe(false);
    expect(result.problems.map((p) => p.category)).toContain("import");
  });

  test("rejects when unknown types remain", () => {
    const e = passingEvidence();
    const result = evaluateReleaseReadiness({
      ...e,
      importManifest: { ...baseImportManifest(), unknownTypeCount: 3 },
    });
    expect(result.ok).toBe(false);
    expect(result.problems.map((p) => p.category)).toContain("unknown-type");
    expect(result.problems.find((p) => p.category === "unknown-type")?.message).toMatch(/3/);
  });

  test("rejects when a registered declaration is missing for the default target", () => {
    const e = passingEvidence();
    const result = evaluateReleaseReadiness({
      ...e,
      targets: [
        {
          id: "defold-1.13.0",
          isDefault: true,
          hasCommittedSurface: false,
          missingDeclarations: ["compute.d.ts"],
        },
        { id: "defold-1.12.4", isDefault: false, hasCommittedSurface: true },
      ],
    });
    expect(result.ok).toBe(false);
    const decl = result.problems.find((p) => p.category === "declaration");
    expect(decl?.message).toMatch(/compute\.d\.ts/);
  });

  test("rejects when the historical docs route family is missing", () => {
    const e = passingEvidence();
    const result = evaluateReleaseReadiness({
      ...e,
      docs: { ...baseDocs(), historicalRoutes: [] },
    });
    expect(result.ok).toBe(false);
    expect(result.problems.map((p) => p.category)).toContain("docs-route");
  });

  test("rejects when the search machinery is absent", () => {
    const e = passingEvidence();
    const result = evaluateReleaseReadiness({
      ...e,
      docs: { ...baseDocs(), searchMachinery: false },
    });
    expect(result.ok).toBe(false);
    expect(result.problems.map((p) => p.category)).toContain("search");
  });

  test("rejects when a removed symbol is not covered by the migration guide", () => {
    const e = passingEvidence();
    const result = evaluateReleaseReadiness({
      ...e,
      migrationGuide: { headings: ["liveupdate.add_mount"] }, // model.material missing
    });
    expect(result.ok).toBe(false);
    const problem = result.problems.find((p) => p.category === "migration-guide");
    expect(problem?.message).toMatch(/model\.material/);
  });

  test("rejects when a required target surface is not committed", () => {
    const e = passingEvidence();
    const result = evaluateReleaseReadiness({
      ...e,
      targets: [{ id: "defold-1.13.0", isDefault: true, hasCommittedSurface: true }], // baseline missing
    });
    expect(result.ok).toBe(false);
    expect(result.problems.map((p) => p.category)).toContain("target");
  });

  test("rejects when the integration matrix omits a release", () => {
    const e = passingEvidence();
    const result = evaluateReleaseReadiness({
      ...e,
      matrix: [{ version: "1.13.0", surfaceId: "defold-1.13.0", isCurrentStable: true }],
    });
    expect(result.ok).toBe(false);
    expect(result.problems.map((p) => p.category)).toContain("integration");
  });

  test("names every blocker at once when all evidence is absent", () => {
    const result = evaluateReleaseReadiness({
      expected: { release: "1.13.0", baseline: "1.12.4" },
      importManifest: null,
      availability: null,
      targets: null,
      migrationGuide: null,
      docs: null,
      matrix: null,
    });
    expect(result.ok).toBe(false);
    const cats = new Set(result.problems.map((p) => p.category));
    for (const c of [
      "import",
      "unknown-type",
      "declaration",
      "docs-route",
      "search",
      "migration-guide",
      "target",
      "integration",
    ] satisfies ReadinessCategory[]) {
      expect(cats.has(c)).toBe(true);
    }
  });
});

describe("collectTargets — physical committed-surface verification", () => {
  function withRoot(
    targets: unknown,
    layout: (typesDir: string) => void,
    run: (root: string) => void,
  ): void {
    const root = mkdtempSync(join(tmpdir(), "readiness-targets-"));
    try {
      const typesDir = join(root, "packages", "types");
      mkdirSync(typesDir, { recursive: true });
      writeFileSync(join(typesDir, "api-targets.json"), JSON.stringify({ targets }));
      layout(typesDir);
      run(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  const oneModuleTarget = [
    {
      id: "defold-1.13.0",
      default: true,
      source: null,
      generatedDir: "generated",
      modules: [
        { namespace: "compute", outFile: "compute.d.ts" },
        { namespace: "model", outFile: "model.d.ts" },
      ],
    },
  ];

  test("a target whose generatedDir does not exist has no committed surface", () => {
    withRoot(
      oneModuleTarget,
      () => {
        // deliberately do not create generated/
      },
      (root) => {
        const target = collectTargets(root)?.[0];
        expect(target?.hasCommittedSurface).toBe(false);
        expect(target?.missingDeclarations).toEqual(["compute.d.ts", "model.d.ts"]);
      },
    );
  });

  test("a target missing one registered outFile has no committed surface and names it", () => {
    withRoot(
      oneModuleTarget,
      (typesDir) => {
        const gen = join(typesDir, "generated");
        mkdirSync(gen, { recursive: true });
        writeFileSync(join(gen, "compute.d.ts"), "export {};\n");
        // model.d.ts intentionally absent
      },
      (root) => {
        const target = collectTargets(root)?.[0];
        expect(target?.hasCommittedSurface).toBe(false);
        expect(target?.missingDeclarations).toEqual(["model.d.ts"]);
      },
    );
  });

  test("a target with every registered outFile present has a real committed surface", () => {
    withRoot(
      oneModuleTarget,
      (typesDir) => {
        const gen = join(typesDir, "generated");
        mkdirSync(gen, { recursive: true });
        writeFileSync(join(gen, "compute.d.ts"), "export {};\n");
        writeFileSync(join(gen, "model.d.ts"), "export {};\n");
      },
      (root) => {
        const target = collectTargets(root)?.[0];
        expect(target?.hasCommittedSurface).toBe(true);
        expect(target?.missingDeclarations).toEqual([]);
      },
    );
  });

  test("regression lock: the real repo tree at HEAD reports ready", () => {
    const evidence = collectEvidence(REPO_ROOT, { release: "1.13.0", baseline: "1.12.4" });
    const result = evaluateReleaseReadiness(evidence);
    if (!result.ok) {
      throw new Error(`expected ready, got blockers:\n${JSON.stringify(result.problems, null, 2)}`);
    }
    expect(result.ok).toBe(true);
  });
});
