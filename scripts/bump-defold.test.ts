import { describe, expect, test } from "bun:test";
import {
  BUMP_STAGES,
  type BumpStageId,
  BumpValidationError,
  planBump,
  runBump,
} from "./bump-defold.ts";
import { RELEASE_MODEL, targetMetaFor } from "./release-model.ts";

describe("planBump", () => {
  test("a same-minor target plans an in-place patch with no demotion", () => {
    const plan = planBump("1.13.1");
    expect(plan.transition).toBe("patch");
    const kinds = plan.targetOps.map((op) => op.kind);
    expect(kinds).toContain("in-place");
    expect(kinds).not.toContain("demote");
    expect(kinds).not.toContain("add-default");
  });

  test("a new-minor target plans add-default plus demote-prior", () => {
    const plan = planBump("1.14.0");
    expect(plan.transition).toBe("minor");
    const kinds = plan.targetOps.map((op) => op.kind);
    expect(kinds).toContain("add-default");
    expect(kinds).toContain("demote");
    expect(kinds).not.toContain("in-place");
  });

  test("the minor demote op matches targetMetaFor(prior-default, { isDefault: false })", () => {
    const plan = planBump("1.14.0");
    const demote = plan.targetOps.find((op) => op.kind === "demote");
    expect(demote).toBeDefined();
    expect(demote?.version).toBe(RELEASE_MODEL.current);
    expect(demote?.meta).toEqual(targetMetaFor(RELEASE_MODEL.current, { isDefault: false }));
    expect(demote?.meta.default).toBe(false);
    expect(demote?.meta.generatedDir).toBe(`generated/versions/defold-${RELEASE_MODEL.current}`);
    expect(demote?.meta.coreTypesImport).toBe("../../../src/core-types");
  });

  test("rejects a no-op bump (target equals the current default)", () => {
    expect(() => planBump(RELEASE_MODEL.current)).toThrow(BumpValidationError);
  });

  test("rejects a downgrade below the current default", () => {
    expect(() => planBump("1.12.0")).toThrow(BumpValidationError);
  });

  test("stages are the four side-effecting units in order, regen last", () => {
    expect([...BUMP_STAGES]).toEqual(["import", "sync", "target-metadata", "regen"]);
    expect(BUMP_STAGES.at(-1)).toBe("regen");
    expect(BUMP_STAGES).not.toContain("validate");
  });
});

describe("runBump", () => {
  test("a blocked import aborts before any subsequent write", () => {
    const ran: BumpStageId[] = [];
    const summary = runBump({
      to: "1.14.0",
      runStage: (stage) => {
        ran.push(stage);
        if (stage === "import") {
          return { ok: true, ready: false, blockers: ["unmapped namespace 'foo'"] };
        }
        return { ok: true };
      },
    });
    expect(summary.ok).toBe(false);
    expect(summary.failedStage).toBe("import");
    expect(ran).toEqual(["import"]);
    expect(ran).not.toContain("target-metadata");
    expect(ran).not.toContain("regen");
    expect(summary.blockers).toContain("unmapped namespace 'foo'");
  });

  test("a failing stage exits non-zero and names the failed stage", () => {
    const summary = runBump({
      to: "1.14.0",
      runStage: (stage) => {
        if (stage === "import") return { ok: true, ready: true };
        if (stage === "sync") return { ok: false };
        return { ok: true };
      },
    });
    expect(summary.ok).toBe(false);
    expect(summary.failedStage).toBe("sync");
  });

  test("a ready full run runs every stage and reports the genuine manual decisions", () => {
    const ran: BumpStageId[] = [];
    const summary = runBump({
      to: "1.14.0",
      runStage: (stage) => {
        ran.push(stage);
        if (stage === "import") return { ok: true, ready: true };
        return { ok: true };
      },
    });
    expect(summary.ok).toBe(true);
    expect(ran).toEqual(["import", "sync", "target-metadata", "regen"]);
    expect(summary.remainingHumanDecisions.length).toBeGreaterThan(0);
    const joined = summary.remainingHumanDecisions.join("\n");
    expect(joined).toContain("api-migrations.json");
    expect(joined).toMatch(/manifest.*tag/i);
    expect(joined).toMatch(/upgrade guide/i);
  });

  test("a validation failure reports the validate stage without running anything", () => {
    const ran: BumpStageId[] = [];
    const summary = runBump({
      to: RELEASE_MODEL.current,
      runStage: (stage) => {
        ran.push(stage);
        return { ok: true };
      },
    });
    expect(summary.ok).toBe(false);
    expect(summary.failedStage).toBe("validate");
    expect(ran).toEqual([]);
  });
});

describe("harness discoverability", () => {
  test("root package.json declares the bump:defold script", async () => {
    const pkg = (await Bun.file("package.json").json()) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["bump:defold"]).toBe("bun scripts/bump-defold.ts");
  });
});
