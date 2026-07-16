import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
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
});
