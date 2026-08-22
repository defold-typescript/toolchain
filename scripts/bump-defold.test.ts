import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import {
  parseApiTargetsRegistry,
  resolvableTargetVersions,
} from "../packages/cli/src/api-registry.ts";
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
import {
  compareVersions,
  EXTENSION_PINS,
  fixtureDir,
  RELEASE_MODEL,
  targetMetaFor,
} from "./release-model.ts";

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

// The newest pinned release outside the current minor line, computed here rather
// than read back from `retainedVersions` so the retention assertions do not
// restate the function they check.
const PREVIOUS_MINOR_RELEASE = RELEASE_MODEL.all.find(
  (version) => version.split(".").slice(0, 2).join(".") !== `${MAJOR}.${MINOR}`,
) as string;

// A frozen model for the tests that drive a synthetic registry: the registry
// contents and the plan must describe the same world, and pinning both makes the
// assertions readable and independent of the live pin.
const FIXED_MODEL = { current: "1.13.0", previous: "1.12.4", all: ["1.13.0", "1.12.4"] } as const;

describe("planBump", () => {
  test("a same-minor target plans add-default plus demote, never a lone rewrite", () => {
    const plan = planBump(NEXT_PATCH);
    expect(plan.transition).toBe("patch");
    expect(plan.targetOps.map((op) => op.kind)).toEqual(["add-default", "demote"]);
  });

  test("the patch demote op matches targetMetaFor(predecessor, { isDefault: false })", () => {
    const plan = planBump(NEXT_PATCH);
    const demote = plan.targetOps.find((op) => op.kind === "demote");
    expect(demote).toBeDefined();
    expect(demote?.version).toBe(RELEASE_MODEL.current);
    expect(demote?.meta).toEqual(targetMetaFor(RELEASE_MODEL.current, { isDefault: false }));
  });

  test("a patch retains the current release and the previous minor as the pre-baked pair", () => {
    const plan = planBump(NEXT_PATCH);
    expect(plan.prebaked).toEqual([NEXT_PATCH, PREVIOUS_MINOR_RELEASE]);
    expect(plan.demotedFromPrebaked).toContain(RELEASE_MODEL.current);
  });

  test("a new-minor target plans add-default plus demote-prior", () => {
    const plan = planBump("1.14.0");
    expect(plan.transition).toBe("minor");
    const kinds = plan.targetOps.map((op) => op.kind);
    expect(kinds).toContain("add-default");
    expect(kinds).toContain("demote");
  });

  test("a minor retains the outgoing current as the previous minor", () => {
    const plan = planBump("1.14.0");
    expect(plan.prebaked).toEqual(["1.14.0", RELEASE_MODEL.current]);
    expect(plan.demotedFromPrebaked).not.toContain(RELEASE_MODEL.current);
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

  test("a patch bump reports the demoted surface for review, just as a minor does", () => {
    const joined = remainingHumanDecisions(planBump(NEXT_PATCH)).join("\n");
    expect(joined).toContain(`demoted defold-${RELEASE_MODEL.current} surface`);
  });

  test("a bump names every version the retention rule drops from the pre-baked set", () => {
    const plan = planBump(NEXT_PATCH);
    const entry = remainingHumanDecisions(plan).find((d) => /pre-baked/i.test(d));
    expect(entry).toBeDefined();
    for (const version of plan.demotedFromPrebaked) {
      expect(entry).toContain(version);
    }
  });

  test("the import-manifest reconfirmation survives alongside the new extension-tag line", () => {
    const joined = remainingHumanDecisions(planBump("1.14.0")).join("\n");
    expect(joined).toMatch(/manifest.*tag/i);
    expect(joined).toContain("import-manifest.json");
  });
});

describe("applyVersionRotation", () => {
  test("a patch rotates to the retained pair and leaves no old fixture token", () => {
    const { versionFile, syncFile } = tmpCopies();
    applyVersionRotation(planBump(NEXT_PATCH), { versionFile, syncFile });
    const version = readFileSync(versionFile, "utf8");
    expect(version).toContain(`DEFOLD_VERSIONS = ["${NEXT_PATCH}", "${PREVIOUS_MINOR_RELEASE}"]`);
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

  test("a patch adds the new default and keeps its predecessor as a demoted target", () => {
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
    expect(registry.targets.length).toBe(3);
    const def = registry.targets.find((target) => target.default);
    expect(def?.id).toBe("defold-1.13.1");
    expect(def?.fixturesDir).toBe(fixtureDir("1.13.1"));
    expect(def?.generatedDir).toBe("generated");
    expect(def?.coreTypesImport).toBe("../src/core-types");

    const demoted = registry.targets.find((target) => target.id === "defold-1.13.0");
    expect(demoted).toBeDefined();
    expect(demoted?.default).toBe(false);
    expect(demoted?.generatedDir).toBe("generated/versions/defold-1.13.0");
    expect(demoted?.coreTypesImport).toBe("../../../src/core-types");
  });

  // The predecessor's inputs are what make its demoted surface regenerable; a
  // bump that repointed `fixturesDir` at the incoming release would leave the
  // demoted target reading the wrong release's documents.
  test("a patch never repoints the predecessor's fixturesDir", () => {
    const targetsPath = tmpTargets();
    applyTargetOps(planBump("1.13.1", FIXED_MODEL), targetsPath);
    const registry = JSON.parse(readFileSync(targetsPath, "utf8")) as {
      targets: Array<{ id: string; fixturesDir: string }>;
    };
    const demoted = registry.targets.find((target) => target.id === "defold-1.13.0");
    expect(demoted?.fixturesDir).toBe(fixtureDir("1.13.0"));
    const def = registry.targets.find((target) => target.id === "defold-1.13.1");
    expect(def?.fixturesDir).toBe(fixtureDir("1.13.1"));
    expect(new Set(registry.targets.map((target) => target.fixturesDir)).size).toBe(
      registry.targets.length,
    );
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

// The op-shape tests above run against a synthetic two-target registry, which
// cannot show the relationship this block is about: the real registry already
// holds more surfaces than the pre-baked tuple does. Copying the shipped file is
// what makes "strictly a superset" observable.
function tmpRealTargets(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "bump-real-tgt-"));
  const targetsPath = path.join(dir, "api-targets.json");
  writeFileSync(
    targetsPath,
    readFileSync(path.join(REPO, "packages/types/api-targets.json"), "utf8"),
  );
  return targetsPath;
}

function readRegistry(targetsPath: string) {
  return parseApiTargetsRegistry(readFileSync(targetsPath, "utf8"));
}

// The tuple as the rotation writer left it, read back out of its own output
// rather than re-derived from the plan — otherwise the assertions would only
// restate `retainedVersions`.
function readRotatedTuple(versionFile: string): string[] {
  const match = readFileSync(versionFile, "utf8").match(/DEFOLD_VERSIONS = \[([^\]]*)\]/);
  if (!match?.[1]) throw new Error("no DEFOLD_VERSIONS tuple in the rotated file");
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1] as string);
}

describe("post-rotation tuple/registry contract", () => {
  function rotate() {
    const { versionFile, syncFile } = tmpCopies();
    const targetsPath = tmpRealTargets();
    const before = readRegistry(targetsPath).map((target) => target.id);
    const plan = planBump(NEXT_PATCH);
    applyVersionRotation(plan, { versionFile, syncFile });
    applyTargetOps(plan, targetsPath);
    const registry = readRegistry(targetsPath);
    return {
      plan,
      before,
      targetsPath,
      registry,
      surfaces: registry.filter((target) => (target.source ?? null) === null),
      tuple: readRotatedTuple(versionFile),
    };
  }

  test("every rotated tuple entry keeps a committed surface", () => {
    const { surfaces, tuple } = rotate();
    const ids = new Set(surfaces.map((target) => target.id));
    expect(tuple.filter((version) => !ids.has(`defold-${version}`))).toEqual([]);
  });

  test("the registry is a strict superset of the tuple, not its equal", () => {
    const { surfaces, tuple } = rotate();
    expect(surfaces.length).toBeGreaterThan(tuple.length);
  });

  test("every committed surface outside the tuple is a non-default demoted target", () => {
    const { surfaces, tuple } = rotate();
    const outside = surfaces.filter((target) => !tuple.includes(target.id.replace(/^defold-/, "")));
    expect(outside.length).toBeGreaterThan(0);
    for (const target of outside) {
      expect(target.default === true).toBe(false);
      expect(target.generatedDir).toBe(`generated/versions/${target.id}`);
    }
  });

  test("exactly one default remains and it is the tuple head", () => {
    const { registry, tuple } = rotate();
    const defaults = registry.filter((target) => target.default === true).map((t) => t.id);
    expect(defaults).toEqual([`defold-${tuple[0]}`]);
  });

  test("the rotation prepends the incoming release and removes nothing", () => {
    const { registry, before, plan } = rotate();
    expect(registry.map((target) => target.id)).toEqual([`defold-${plan.to}`, ...before]);
  });

  test("the rotated tuple stays strictly descending", () => {
    const { tuple } = rotate();
    for (let index = 1; index < tuple.length; index += 1) {
      expect(compareVersions(tuple[index - 1] as string, tuple[index] as string)).toBeGreaterThan(
        0,
      );
    }
  });

  // The predecessor leaves the pre-baked pair on a patch bump. What must survive
  // is selectability, and `set-target` decides that from the registry — so the
  // check runs through the same derivation rather than a local scan.
  test("the predecessor dropped from the tuple is still a selectable target", () => {
    const { registry, tuple } = rotate();
    expect(tuple).not.toContain(RELEASE_MODEL.current);
    expect(resolvableTargetVersions(registry)).toContain(RELEASE_MODEL.current);
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
