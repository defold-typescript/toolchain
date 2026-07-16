import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildLlmsFull,
  buildLlmsTxt,
  PACKAGE_TARGET,
} from "../packages/docs-site/scripts/build-llms.ts";
import { buildSignaturesArtifact } from "../packages/types/scripts/generate-api-signatures.ts";
import {
  collectDriftInputs,
  type DriftInputs,
  driftProblems,
  expectedFromModel,
  MODEL_COUPLED_TEST_FILES,
  runBumpCheck,
  testsModelCorrespondenceProblems,
} from "./bump-defold-check.ts";
import { RELEASE_MODEL } from "./release-model.ts";

const REPO_ROOT = join(import.meta.dir, "..");

function matchingDrift(): DriftInputs {
  return {
    llmsTxt: { committed: "llms", fresh: "llms" },
    llmsFull: { committed: "llms-full", fresh: "llms-full" },
    signatures: {
      committed: { versions: { "1.13.0": { a: "x" } } },
      fresh: { versions: { "1.13.0": { a: "x" } } },
    },
  };
}

describe("expectedFromModel", () => {
  test("derives release/baseline from the model's current/previous", () => {
    expect(expectedFromModel(RELEASE_MODEL)).toEqual({
      release: RELEASE_MODEL.current,
      baseline: RELEASE_MODEL.previous,
    });
  });

  test("honors a caller-supplied model over the default", () => {
    expect(expectedFromModel({ current: "9.9.9", previous: "8.8.8" })).toEqual({
      release: "9.9.9",
      baseline: "8.8.8",
    });
  });
});

describe("driftProblems — llms + signatures drift seam", () => {
  test("matching committed vs fresh artifacts yield no problems", () => {
    expect(driftProblems(matchingDrift())).toEqual([]);
  });

  test("a stale committed llms.txt is an llms blocker naming the file", () => {
    const inputs: DriftInputs = { ...matchingDrift(), llmsTxt: { committed: "old", fresh: "new" } };
    const problems = driftProblems(inputs);
    expect(problems.map((p) => p.category)).toEqual(["llms"]);
    expect(problems[0]?.message).toMatch(/llms\.txt/);
  });

  test("a stale committed llms-full.txt is an llms blocker naming the file", () => {
    const inputs: DriftInputs = {
      ...matchingDrift(),
      llmsFull: { committed: "old", fresh: "new" },
    };
    const problems = driftProblems(inputs);
    expect(problems.map((p) => p.category)).toEqual(["llms"]);
    expect(problems[0]?.message).toMatch(/llms-full\.txt/);
  });

  test("a stale committed api-signatures.json is a signatures blocker", () => {
    const inputs: DriftInputs = {
      ...matchingDrift(),
      signatures: {
        committed: { versions: { "1.13.0": { a: "OLD" } } },
        fresh: { versions: { "1.13.0": { a: "NEW" } } },
      },
    };
    const problems = driftProblems(inputs);
    expect(problems.map((p) => p.category)).toEqual(["signatures"]);
    expect(problems[0]?.message).toMatch(/api-signatures\.json/);
  });

  test("signature comparison is order-independent (deep equality, not byte order)", () => {
    const inputs: DriftInputs = {
      ...matchingDrift(),
      signatures: {
        committed: { versions: { "1.13.0": { a: "x", b: "y" } } },
        fresh: { versions: { "1.13.0": { b: "y", a: "x" } } },
      },
    };
    expect(driftProblems(inputs)).toEqual([]);
  });
});

describe("testsModelCorrespondenceProblems", () => {
  function withFile(name: string, content: string, run: (root: string) => void): void {
    const root = mkdtempSync(join(tmpdir(), "bump-check-corr-"));
    try {
      writeFileSync(join(root, name), content);
      run(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  test("the committed HEAD tree's four version-coupled tests pass the scan", () => {
    expect(testsModelCorrespondenceProblems(REPO_ROOT)).toEqual([]);
  });

  test("names the four version-coupled test files it guards", () => {
    expect(MODEL_COUPLED_TEST_FILES).toEqual([
      "packages/cli/src/defold-version.test.ts",
      "packages/types/scripts/sync-api-docs.test.ts",
      "packages/types/test/api-targets.test.ts",
      "packages/types/test/fixture-surface-enumerate.test.ts",
    ]);
  });

  test("a file deriving its version from a model symbol, with no bare literal, passes", () => {
    withFile(
      "good.test.ts",
      'import { DEFOLD_VERSION } from "x";\nexpect(target).toBe("defold-" + DEFOLD_VERSION);\n',
      (root) => {
        expect(testsModelCorrespondenceProblems(root, RELEASE_MODEL, ["good.test.ts"])).toEqual([]);
      },
    );
  });

  test("a file hardcoding the current version literal is an integration blocker", () => {
    withFile(
      "bad.test.ts",
      'import { DEFOLD_VERSION } from "x";\nexpect(id).toBe("defold-1.13.0");\n',
      (root) => {
        const problems = testsModelCorrespondenceProblems(root, RELEASE_MODEL, ["bad.test.ts"]);
        expect(problems.map((p) => p.category)).toContain("integration");
        expect(problems.some((p) => /1\.13\.0/.test(p.message))).toBe(true);
      },
    );
  });

  test("a current-version literal inside a comment does not trip the scan", () => {
    withFile(
      "commented.test.ts",
      'import { DEFOLD_VERSION } from "x";\n// bumped from 1.13.0 historically\nexpect(id).toBe("defold-" + DEFOLD_VERSION);\n',
      (root) => {
        expect(
          testsModelCorrespondenceProblems(root, RELEASE_MODEL, ["commented.test.ts"]),
        ).toEqual([]);
      },
    );
  });

  test("a file that derives no version from the model is an integration blocker", () => {
    withFile("nomodel.test.ts", "expect(1).toBe(1);\n", (root) => {
      const problems = testsModelCorrespondenceProblems(root, RELEASE_MODEL, ["nomodel.test.ts"]);
      expect(problems.map((p) => p.category)).toContain("integration");
    });
  });

  test("a derived-version symbol appearing only in a comment fails correspondence", () => {
    withFile(
      "commentderive.test.ts",
      "// this test derives from release-model conceptually\nexpect(1).toBe(1);\n",
      (root) => {
        const problems = testsModelCorrespondenceProblems(root, RELEASE_MODEL, [
          "commentderive.test.ts",
        ]);
        expect(problems.map((p) => p.category)).toContain("integration");
        expect(problems.some((p) => /does not derive/.test(p.message))).toBe(true);
      },
    );
  });
});

describe("runBumpCheck — offline integration", () => {
  test("regression lock: the committed HEAD tree reports ok", () => {
    const result = runBumpCheck(REPO_ROOT);
    if (!result.ok) {
      throw new Error(`expected ok, got blockers:\n${JSON.stringify(result.problems, null, 2)}`);
    }
    expect(result.ok).toBe(true);
  });

  test("sources the expected release from the model: a mismatched model blocks on import", () => {
    const result = runBumpCheck(REPO_ROOT, { current: "9.9.9", previous: "8.8.8" });
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.category === "import")).toBe(true);
  });
});

// Build a temp root whose three committed drift artifacts are all fresh-correct,
// then optionally stale exactly one. This drives the real disk-read seam
// (`collectDriftInputs`) rather than hand-built `DriftInputs`.
function freshCorrectRoot(
  overrides: Partial<{ llmsTxt: string; llmsFull: string; signatures: string }> = {},
): string {
  const root = mkdtempSync(join(tmpdir(), "bump-check-seam-"));
  mkdirSync(join(root, "packages/docs"), { recursive: true });
  mkdirSync(join(root, "packages/types"), { recursive: true });
  writeFileSync(
    join(root, "packages/docs/llms.txt"),
    overrides.llmsTxt ?? buildLlmsTxt(PACKAGE_TARGET),
  );
  writeFileSync(
    join(root, "packages/docs/llms-full.txt"),
    overrides.llmsFull ?? buildLlmsFull(PACKAGE_TARGET),
  );
  writeFileSync(
    join(root, "packages/types/api-signatures.json"),
    overrides.signatures ?? JSON.stringify(buildSignaturesArtifact()),
  );
  return root;
}

describe("collectDriftInputs — real disk-read seam", () => {
  test("a stale committed llms.txt read from disk is a single llms blocker naming the file", () => {
    const root = freshCorrectRoot({ llmsTxt: "STALE llms corpus\n" });
    try {
      const problems = driftProblems(collectDriftInputs(root));
      expect(problems.map((p) => p.category)).toEqual(["llms"]);
      expect(problems[0]?.message).toMatch(/llms\.txt/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a stale committed api-signatures.json read from disk is a single signatures blocker", () => {
    const root = freshCorrectRoot({ signatures: JSON.stringify({ versions: { stale: true } }) });
    try {
      const problems = driftProblems(collectDriftInputs(root));
      expect(problems.map((p) => p.category)).toEqual(["signatures"]);
      expect(problems[0]?.message).toMatch(/api-signatures\.json/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("runBumpCheck over a stale root is not ok and carries the named stale blocker", () => {
    const root = freshCorrectRoot({ llmsTxt: "STALE llms corpus\n" });
    try {
      const result = runBumpCheck(root);
      expect(result.ok).toBe(false);
      expect(
        result.problems.some((p) => p.category === "llms" && /llms\.txt/.test(p.message)),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("bump:defold --check command — stale artifact exit code", () => {
  test("a stale committed artifact under the injected check root exits 1 with the named blocker on stdout", () => {
    const root = freshCorrectRoot({ llmsTxt: "STALE llms corpus\n" });
    try {
      const proc = Bun.spawnSync(["bun", "scripts/bump-defold.ts", "--check"], {
        cwd: REPO_ROOT,
        env: { ...process.env, BUMP_DEFOLD_CHECK_ROOT: root },
      });
      const stdout = proc.stdout.toString();
      expect(proc.exitCode).toBe(1);
      expect(stdout).toMatch(/llms\.txt/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("offline discipline", () => {
  test("the check module performs no network or child-process call", () => {
    const source = Bun.file(join(import.meta.dir, "bump-defold-check.ts"));
    // asserted structurally: the offline check never reaches the network path
    // (`fetch`/`fetchVersionInfo`) nor spawns a child (`Bun.spawn`).
    return source.text().then((text) => {
      expect(text).not.toMatch(/\bfetch\s*\(/);
      expect(text).not.toContain("fetchVersionInfo");
      expect(text).not.toContain("Bun.spawn");
    });
  });

  test("the executed dependency boundary fires no network or child-process call at runtime", () => {
    const calls: string[] = [];
    const realFetch = globalThis.fetch;
    const realSpawn = Bun.spawn;
    const realSpawnSync = Bun.spawnSync;
    const trap =
      (name: string) =>
      (...args: unknown[]): never => {
        calls.push(name);
        throw new Error(`offline boundary violated: ${name} was called with ${args.length} arg(s)`);
      };
    try {
      globalThis.fetch = trap("fetch") as unknown as typeof fetch;
      Bun.spawn = trap("Bun.spawn") as unknown as typeof Bun.spawn;
      Bun.spawnSync = trap("Bun.spawnSync") as unknown as typeof Bun.spawnSync;
      const result = runBumpCheck(REPO_ROOT);
      expect(result.ok).toBe(true);
      expect(calls).toEqual([]);
    } finally {
      globalThis.fetch = realFetch;
      Bun.spawn = realSpawn;
      Bun.spawnSync = realSpawnSync;
    }
  });
});
