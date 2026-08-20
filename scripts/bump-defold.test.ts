import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import {
  applyTargetOps,
  applyVersionRotation,
  BUMP_STAGES,
  type BumpIO,
  type BumpStageId,
  BumpValidationError,
  importResult,
  planBump,
  remainingHumanDecisions,
  runBump,
  runBumpCli,
  spawn,
  stageCommand,
} from "./bump-defold.ts";
import { EXTENSION_PINS, fixtureDir, RELEASE_MODEL, targetMetaFor } from "./release-model.ts";

const REPO = path.resolve(import.meta.dir, "..");

function tmpCopies(): { versionFile: string; syncFile: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "bump-rot-"));
  const versionFile = path.join(dir, "defold-version.ts");
  const syncFile = path.join(dir, "sync-api-docs.ts");
  writeFileSync(
    versionFile,
    readFileSync(path.join(REPO, "packages/cli/src/defold-version.ts"), "utf8"),
  );
  writeFileSync(
    syncFile,
    readFileSync(path.join(REPO, "packages/types/scripts/sync-api-docs.ts"), "utf8"),
  );
  return { versionFile, syncFile };
}

function sink(): { io: BumpIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (text) => out.push(text), stderr: (text) => err.push(text) }, out, err };
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// The rotation tests copy the *real* version files, so their target has to sit
// ahead of whatever is pinned today — a literal goes stale (and silently turns
// into a no-op bump) the moment the pin reaches it.
const [MAJOR, MINOR, PATCH] = RELEASE_MODEL.current.split(".").map(Number) as [
  number,
  number,
  number,
];
const NEXT_PATCH = `${MAJOR}.${MINOR}.${PATCH + 1}`;
const NEXT_MINOR = `${MAJOR}.${MINOR + 1}.0`;

// A frozen model for the tests that drive a synthetic registry: the registry
// contents and the plan must describe the same world, and pinning both makes the
// assertions readable and independent of the live pin.
const FIXED_MODEL = { current: "1.13.0", previous: "1.12.4", all: ["1.13.0", "1.12.4"] } as const;

describe("planBump", () => {
  test("a same-minor target plans an in-place patch with no demotion", () => {
    const plan = planBump(NEXT_PATCH);
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

  test("stages are the five side-effecting units in order, regen last", () => {
    expect([...BUMP_STAGES]).toEqual(["import", "rotate", "sync", "target-metadata", "regen"]);
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
    expect(ran).toEqual(["import", "rotate", "sync", "target-metadata", "regen"]);
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

describe("remainingHumanDecisions", () => {
  const [pin] = EXTENSION_PINS;
  if (!pin) throw new Error("EXTENSION_PINS is empty");

  test("a minor bump reports an extension-release-tag reconfirmation naming a pinned tag", () => {
    const decisions = remainingHumanDecisions(planBump("1.14.0"));
    const entry = decisions.find((d) => /extension release tag/i.test(d));
    expect(entry).toBeDefined();
    expect(entry).toContain(`${pin.namespace}@${pin.tag}`);
  });

  test("a patch bump carries the same extension-tag entry — it is unconditional", () => {
    const decisions = remainingHumanDecisions(planBump(NEXT_PATCH));
    const entry = decisions.find((d) => /extension release tag/i.test(d));
    expect(entry).toBeDefined();
    expect(entry).toContain(`${pin.namespace}@${pin.tag}`);
  });

  test("the import-manifest reconfirmation survives alongside the new extension-tag line", () => {
    const joined = remainingHumanDecisions(planBump("1.14.0")).join("\n");
    expect(joined).toMatch(/manifest.*tag/i);
    expect(joined).toContain("import-manifest.json");
  });
});

describe("applyVersionRotation", () => {
  test("a patch rotates the current in place and leaves no old fixture token", () => {
    const { versionFile, syncFile } = tmpCopies();
    applyVersionRotation(planBump(NEXT_PATCH), { versionFile, syncFile });
    const version = readFileSync(versionFile, "utf8");
    expect(version).toContain(`DEFOLD_VERSIONS = ["${NEXT_PATCH}", "${RELEASE_MODEL.previous}"]`);
    const sync = readFileSync(syncFile, "utf8");
    expect(sync).toContain(`DEFOLD_VERSION = "${NEXT_PATCH}"`);
    expect(sync).not.toContain(`defold-${RELEASE_MODEL.current}`);
  });

  test("a minor prepends the new version and demotes the prior current", () => {
    const { versionFile, syncFile } = tmpCopies();
    applyVersionRotation(planBump(NEXT_MINOR), { versionFile, syncFile });
    const version = readFileSync(versionFile, "utf8");
    expect(version).toContain(`DEFOLD_VERSIONS = ["${NEXT_MINOR}", "${RELEASE_MODEL.current}"]`);
    const sync = readFileSync(syncFile, "utf8");
    expect(sync).toContain(`DEFOLD_VERSION = "${NEXT_MINOR}"`);
  });

  test("both core and extension fixture templates retarget the new dir", () => {
    const { versionFile, syncFile } = tmpCopies();
    applyVersionRotation(planBump(NEXT_MINOR), { versionFile, syncFile });
    const sync = readFileSync(syncFile, "utf8");
    expect(occurrences(sync, `fixtures/defold-${NEXT_MINOR}/`)).toBe(2);
    expect(occurrences(sync, `fixtures/defold-${RELEASE_MODEL.current}/`)).toBe(0);
  });
});

describe("applyTargetOps against a temporary registry", () => {
  function tmpTargets(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "bump-tgt-"));
    const targetsPath = path.join(dir, "api-targets.json");
    const registry = {
      targets: [
        {
          id: "defold-1.13.0",
          default: true,
          fixturesDir: "fixtures/defold-1.13.0",
          generatedDir: "generated",
          coreTypesImport: "../src/core-types",
          source: null,
          modules: [{ namespace: "b2d", fixture: "b2d_doc.json", outFile: "b2d.d.ts" }],
        },
        {
          id: "defold-1.12.4",
          default: false,
          fixturesDir: "fixtures/defold-1.12.4",
          generatedDir: "generated/versions/defold-1.12.4",
          coreTypesImport: "../../../src/core-types",
          source: null,
          modules: [{ namespace: "b2d", fixture: "b2d_doc.json", outFile: "b2d.d.ts" }],
        },
      ],
    };
    writeFileSync(targetsPath, `${JSON.stringify(registry, null, 2)}\n`);
    return targetsPath;
  }

  test("a patch swaps the default in place and adds no target", () => {
    const targetsPath = tmpTargets();
    applyTargetOps(planBump("1.13.1", FIXED_MODEL), targetsPath);
    const registry = JSON.parse(readFileSync(targetsPath, "utf8")) as {
      targets: Array<{
        id: string;
        default: boolean;
        fixturesDir: string;
        generatedDir: string;
        coreTypesImport: string;
      }>;
    };
    expect(registry.targets.length).toBe(2);
    const def = registry.targets.find((target) => target.default);
    expect(def?.id).toBe("defold-1.13.1");
    expect(def?.fixturesDir).toBe(fixtureDir("1.13.1"));
    expect(def?.generatedDir).toBe("generated");
    expect(def?.coreTypesImport).toBe("../src/core-types");
  });

  test("a minor inserts the new default at index 0 and demotes the prior default", () => {
    const targetsPath = tmpTargets();
    applyTargetOps(planBump("1.14.0", FIXED_MODEL), targetsPath);
    const registry = JSON.parse(readFileSync(targetsPath, "utf8")) as {
      targets: Array<{
        id: string;
        default: boolean;
        generatedDir: string;
        coreTypesImport: string;
      }>;
    };
    expect(registry.targets.length).toBe(3);
    expect(registry.targets[0]?.id).toBe("defold-1.14.0");
    expect(registry.targets[0]?.default).toBe(true);
    const demoted = registry.targets.find((target) => target.id === "defold-1.13.0");
    expect(demoted?.default).toBe(false);
    expect(demoted?.generatedDir).toBe("generated/versions/defold-1.13.0");
    expect(demoted?.coreTypesImport).toBe("../../../src/core-types");
  });
});

describe("importResult", () => {
  test("a blocked manifest surfaces the unknown-type symbol and unmapped namespace", () => {
    const manifest = {
      version: "1.14.0",
      ready: false,
      blockers: {
        unknownTypes: [{ namespace: "gui", symbol: "new_widget", tokens: ["Widget"] }],
        unmappedFunctionNamespaces: [
          { namespace: "physics2d", entries: ["shove"], symbols: ["shove"] },
        ],
      },
    };
    const outcome = importResult({ exitCode: 1, stdout: JSON.stringify(manifest) });
    expect(outcome.ready).toBe(false);
    expect(outcome.ok).toBe(false);
    const joined = outcome.blockers.join(" ");
    expect(joined).toContain("new_widget");
    expect(joined).toContain("physics2d");
  });

  test("a ready manifest carries no blockers", () => {
    const manifest = {
      version: "1.14.0",
      ready: true,
      blockers: { unknownTypes: [], unmappedFunctionNamespaces: [] },
    };
    const outcome = importResult({ exitCode: 0, stdout: JSON.stringify(manifest) });
    expect(outcome.ready).toBe(true);
    expect(outcome.blockers).toEqual([]);
  });
});

describe("runBumpCli --json", () => {
  const readyRunStage: (stage: BumpStageId) => { ok: boolean; ready?: boolean } = (stage) =>
    stage === "import" ? { ok: true, ready: true } : { ok: true };

  test("a ready run writes exactly one JSON document to stdout", () => {
    const { io, out } = sink();
    const code = runBumpCli(["--to", "1.14.0", "--json"], io, readyRunStage);
    expect(code).toBe(0);
    const stdout = out.join("").trim();
    expect(stdout.split("\n").filter(Boolean).length).toBe(1);
    const parsed = JSON.parse(stdout) as { command: string; ok: boolean };
    expect(parsed.command).toBe("bump:defold");
    expect(parsed.ok).toBe(true);
  });

  test("a failed run also writes exactly one JSON document to stdout", () => {
    const { io, out } = sink();
    const code = runBumpCli(["--to", "1.14.0", "--json"], io, (stage) => {
      if (stage === "import") return { ok: true, ready: true };
      if (stage === "sync") return { ok: false };
      return { ok: true };
    });
    expect(code).toBe(1);
    const stdout = out.join("").trim();
    expect(stdout.split("\n").filter(Boolean).length).toBe(1);
    const parsed = JSON.parse(stdout) as { ok: boolean; failedStage: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.failedStage).toBe("sync");
  });
});

describe("spawn IO seam", () => {
  test("a child's stdout is routed to the stderr sink, never stdout", () => {
    const { io, out, err } = sink();
    const result = spawn(["bun", "-e", "console.log('noise')"], io);
    expect(result.exitCode).toBe(0);
    expect(err.join("")).toContain("noise");
    expect(out.join("")).toBe("");
  });

  test("a captured child returns its stdout without echoing to either sink", () => {
    const { io, out } = sink();
    const result = spawn(["bun", "-e", "console.log('captured')"], io, { capture: true });
    expect(result.stdout).toContain("captured");
    expect(out.join("")).toBe("");
  });
});

describe("runBump thrown-stage structuring", () => {
  test("a stage that throws yields ok:false with the failed stage and never proceeds", () => {
    const summary = runBump({
      to: "1.14.0",
      runStage: (stage) => {
        if (stage === "import") return { ok: true, ready: true };
        if (stage === "sync") throw new Error("boom");
        return { ok: true };
      },
    });
    expect(summary.ok).toBe(false);
    expect(summary.failedStage).toBe("sync");
    expect(summary.error).toContain("boom");
    expect(summary.ran).not.toContain("target-metadata");
    expect(summary.ran).not.toContain("regen");
  });
});

describe("stage commands", () => {
  // A stage that spawns a command bun cannot resolve does not fail loudly: bun
  // prints its usage banner and exits 0, so the orchestrator records the stage as
  // successful while nothing ran. Resolving every argv against the things this
  // repo can actually execute is what turns that silent no-op into a red test.
  test("every spawning stage names a runnable script", async () => {
    const pkg = (await Bun.file("package.json").json()) as { scripts?: Record<string, string> };
    const scripts = pkg.scripts ?? {};
    const spawning = BUMP_STAGES.filter((stage) => stageCommand(stage, "1.0.0") !== undefined);
    expect(spawning.length).toBeGreaterThan(0);

    for (const stage of spawning) {
      const command = stageCommand(stage, "1.0.0") as readonly string[];
      const [runner, first, second] = command;
      if (runner === "bunx") continue;
      expect(runner).toBe("bun");
      if (first === "run") {
        expect(second).toBeDefined();
        expect(Object.keys(scripts)).toContain(second as string);
      } else {
        expect(first).toBeDefined();
        expect(await Bun.file(first as string).exists()).toBe(true);
      }
    }
  });

  test("the sync stage runs the types-package sync script", () => {
    expect(stageCommand("sync", "1.0.0")).toEqual([
      "bun",
      "packages/types/scripts/sync-api-docs.ts",
    ]);
  });
});

describe("harness discoverability", () => {
  test("root package.json declares the bump:defold script", async () => {
    const pkg = (await Bun.file("package.json").json()) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["bump:defold"]).toBe("bun scripts/bump-defold.ts");
  });
});
