import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generateModuleDeclaration,
  loadApiTargets,
  loadTargetModules,
} from "../packages/types/scripts/regen.ts";
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

  test("rejects when a default-target declaration mismatches its regeneration", () => {
    const e = passingEvidence();
    const result = evaluateReleaseReadiness({
      ...e,
      targets: [
        {
          id: "defold-1.13.0",
          isDefault: true,
          hasCommittedSurface: false,
          missingDeclarations: [],
          mismatchedDeclarations: ["compute.d.ts"],
        },
        { id: "defold-1.12.4", isDefault: false, hasCommittedSurface: true },
      ],
    });
    expect(result.ok).toBe(false);
    const decl = result.problems.find(
      (p) => p.category === "declaration" && /does not match/.test(p.message),
    );
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
  const TARGET_ID = "defold-1.13.0";
  const FIXTURES_DIR = "fixtures/test";

  // A minimal but real Defold doc (one namespace, one function) so the
  // production emitter regenerates a genuine declaration, not an `export {}`
  // stub — the comparison must exercise real bytes.
  function fixtureDoc(namespace: string, fn: string, retType: string): string {
    return JSON.stringify({
      info: { namespace },
      elements: [
        {
          type: "FUNCTION",
          name: `${namespace}.${fn}`,
          parameters: [],
          returnvalues: [{ name: "", types: [retType] }],
        },
      ],
    });
  }

  const twoModuleTargets = [
    {
      id: TARGET_ID,
      default: true,
      source: null,
      generatedDir: "generated",
      fixturesDir: FIXTURES_DIR,
      coreTypesImport: "../src/core-types",
      modules: [
        { namespace: "compute", fixture: "compute_doc.json", outFile: "compute.d.ts" },
        { namespace: "model", fixture: "model_doc.json", outFile: "model.d.ts" },
      ],
    },
  ];

  // The production regeneration for one registered outFile inside a temp root,
  // driven by the same offline path collectTargets uses.
  function regenExpected(root: string, outFile: string): string {
    const target = loadApiTargets(join(root, "packages", "types", "api-targets.json")).find(
      (t) => t.id === TARGET_ID,
    );
    if (target === undefined) throw new Error(`target ${TARGET_ID} not found`);
    const entry = loadTargetModules(target, join(root, "packages", "types")).find(
      (e) => e.outFile === outFile,
    );
    if (entry === undefined) throw new Error(`module ${outFile} not found`);
    return generateModuleDeclaration(entry).contents;
  }

  function withRoot(
    targets: unknown,
    fixtures: Record<string, string>,
    layout: (typesDir: string, root: string) => void,
    run: (root: string) => void,
  ): void {
    const root = mkdtempSync(join(tmpdir(), "readiness-targets-"));
    try {
      const typesDir = join(root, "packages", "types");
      mkdirSync(typesDir, { recursive: true });
      writeFileSync(join(typesDir, "api-targets.json"), JSON.stringify({ targets }));
      const fixturesDir = join(typesDir, FIXTURES_DIR);
      mkdirSync(fixturesDir, { recursive: true });
      for (const [name, content] of Object.entries(fixtures)) {
        writeFileSync(join(fixturesDir, name), content);
      }
      layout(typesDir, root);
      run(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  const baseFixtures = (): Record<string, string> => ({
    "compute_doc.json": fixtureDoc("compute", "ping", "number"),
    "model_doc.json": fixtureDoc("model", "ping", "number"),
  });

  test("a target whose generatedDir does not exist has no committed surface", () => {
    withRoot(
      twoModuleTargets,
      baseFixtures(),
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
      twoModuleTargets,
      baseFixtures(),
      (typesDir, root) => {
        const gen = join(typesDir, "generated");
        mkdirSync(gen, { recursive: true });
        writeFileSync(join(gen, "compute.d.ts"), regenExpected(root, "compute.d.ts"));
        // model.d.ts intentionally absent
      },
      (root) => {
        const target = collectTargets(root)?.[0];
        expect(target?.hasCommittedSurface).toBe(false);
        expect(target?.missingDeclarations).toEqual(["model.d.ts"]);
      },
    );
  });

  test("a declaration with unrelated content is a mismatch, not a real surface", () => {
    withRoot(
      twoModuleTargets,
      baseFixtures(),
      (typesDir, root) => {
        const gen = join(typesDir, "generated");
        mkdirSync(gen, { recursive: true });
        // Unrelated bytes where the fixture regenerates to a real namespace.
        writeFileSync(join(gen, "compute.d.ts"), "export {};\n");
        writeFileSync(join(gen, "model.d.ts"), regenExpected(root, "model.d.ts"));
      },
      (root) => {
        const target = collectTargets(root)?.[0];
        expect(target?.hasCommittedSurface).toBe(false);
        expect(target?.missingDeclarations).toEqual([]);
        expect(target?.mismatchedDeclarations).toEqual(["compute.d.ts"]);
      },
    );
  });

  test("a declaration stale against a changed fixture is a mismatch", () => {
    withRoot(
      twoModuleTargets,
      baseFixtures(),
      (typesDir, root) => {
        const gen = join(typesDir, "generated");
        mkdirSync(gen, { recursive: true });
        // Commit the regeneration of the ORIGINAL fixtures, then change the
        // compute fixture on disk so the registry now resolves to different
        // bytes — the committed file is stale.
        writeFileSync(join(gen, "compute.d.ts"), regenExpected(root, "compute.d.ts"));
        writeFileSync(join(gen, "model.d.ts"), regenExpected(root, "model.d.ts"));
        writeFileSync(
          join(typesDir, FIXTURES_DIR, "compute_doc.json"),
          fixtureDoc("compute", "pong", "string"),
        );
      },
      (root) => {
        const target = collectTargets(root)?.[0];
        expect(target?.hasCommittedSurface).toBe(false);
        expect(target?.mismatchedDeclarations).toEqual(["compute.d.ts"]);
      },
    );
  });

  test("a target whose committed files match their regeneration has a real surface", () => {
    withRoot(
      twoModuleTargets,
      baseFixtures(),
      (typesDir, root) => {
        const gen = join(typesDir, "generated");
        mkdirSync(gen, { recursive: true });
        writeFileSync(join(gen, "compute.d.ts"), regenExpected(root, "compute.d.ts"));
        writeFileSync(join(gen, "model.d.ts"), regenExpected(root, "model.d.ts"));
      },
      (root) => {
        const target = collectTargets(root)?.[0];
        expect(target?.hasCommittedSurface).toBe(true);
        expect(target?.missingDeclarations).toEqual([]);
        expect(target?.mismatchedDeclarations).toEqual([]);
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
