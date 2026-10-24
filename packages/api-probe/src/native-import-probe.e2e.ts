import { beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type BobCommandResult, defaultDefoldIo, runBobCommand } from "../../cli/src/bob-command";
import { runBuild } from "../../cli/src/build";
import { targetPlatform } from "../../cli/src/debug-launcher";
import { launchEngine } from "../../cli/src/engine-launch";
import { BUILD_SERVER, builtEngine, captureSpawn, engineHead } from "./run-probe";
import { probeTarget } from "./witness";

const FIXTURE_DIR = resolve(import.meta.dir, "..", "native-import-project");
const SETUP_TIMEOUT = 900_000;
const UUID_RE =
  /native-import-probe: [0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

const head = engineHead(probeTarget());

function fixtureCopy(): string {
  const cwd = mkdtempSync(join(tmpdir(), "defold-native-import-probe-"));
  cpSync(FIXTURE_DIR, cwd, { recursive: true });
  return cwd;
}

function bob(cwd: string, subcommand: "resolve" | "build"): Promise<BobCommandResult> {
  return runBobCommand({
    cwd,
    subcommand,
    capture: true,
    head,
    io: defaultDefoldIo(),
    buildServer: BUILD_SERVER,
  });
}

// What a failed bob command reports: `ok` plus the captured output, so an
// assertion failure prints bob's own error rather than a bare boolean.
function verdict(result: BobCommandResult): { ok: boolean; output: string } {
  return { ok: result.ok, output: result.ok ? "" : (result.output ?? "") };
}

let premiseResolve: BobCommandResult;
let premiseBuild: BobCommandResult;
let loweredResolve: BobCommandResult;
let loweredBuild: BobCommandResult;
let runtimeLog: string[] = [];

beforeAll(async () => {
  // The premise copy witnesses bob's require scan, not our CLI: the bad
  // require is injected into the built script chunk after `runBuild`, exactly
  // what a tagged module would have emitted without the lowering. A loose
  // unreferenced `.lua` never enters bob's build set, so it witnesses nothing.
  const premiseCwd = fixtureCopy();
  runBuild({ cwd: premiseCwd });
  const premiseScript = join(premiseCwd, "main", "native_import.ts.script");
  writeFileSync(premiseScript, `require("no_such_module")\n${readFileSync(premiseScript, "utf8")}`);
  premiseResolve = await bob(premiseCwd, "resolve");
  premiseBuild = await bob(premiseCwd, "build");

  const cwd = fixtureCopy();
  runBuild({ cwd });
  loweredResolve = await bob(cwd, "resolve");
  loweredBuild = await bob(cwd, "build");
  if (!loweredBuild.ok) return;

  const output: string[] = [];
  await launchEngine(
    {
      enginePath: builtEngine(cwd),
      projectcPath: join(cwd, "build", "default", "game.projectc"),
      target: targetPlatform(process.platform, process.arch),
      warnings: [],
    },
    {
      platform: process.platform,
      spawn: captureSpawn(cwd, output, 120_000),
      chmod: (path, mode) => chmodSync(path, mode),
    },
  );
  runtimeLog = output;
}, SETUP_TIMEOUT);

describe("native-import probe", () => {
  test("bob rejects a require with no file behind it", () => {
    expect(verdict(premiseResolve)).toEqual({ ok: true, output: "" });
    expect(premiseBuild.ok).toBe(false);
    expect(premiseBuild.output ?? "").toContain("no_such_module");
    expect(premiseBuild.output ?? "").toContain("can't be found");
  });

  test("the lowered output passes bob", () => {
    expect(verdict(loweredResolve)).toEqual({ ok: true, output: "" });
    expect(verdict(loweredBuild)).toEqual({ ok: true, output: "" });
  });

  test("the aliased module answers at runtime", () => {
    expect(runtimeLog.find((line) => UUID_RE.test(line)) ?? runtimeLog.join("\n")).toMatch(UUID_RE);
  });
});
