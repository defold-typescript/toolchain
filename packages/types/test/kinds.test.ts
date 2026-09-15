import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { absenceDirectiveLine, partialNamespaceStub, unusedDirectiveLines } from "./absence-proof";

const KINDS_DIR = resolve(import.meta.dir, "..", "test-d", "kinds");
const REPO_TSCONFIG = resolve(import.meta.dir, "..", "..", "..", "tsconfig.json");

function typecheck(tsconfig: string): { exitCode: number; output: string } {
  const proc = Bun.spawnSync(["bunx", "tsc", "-p", resolve(KINDS_DIR, tsconfig), "--noEmit"], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  return {
    exitCode: proc.exitCode,
    output: `${proc.stdout.toString()}${proc.stderr.toString()}`,
  };
}

describe("per-kind ambient API wall — consumer tsconfig proof", () => {
  test("script surface accepts universal calls and walls off gui.* and render.*", () => {
    const { exitCode, output } = typecheck("tsconfig.script.json");
    if (exitCode !== 0) {
      throw new Error(
        `script surface proof failed — either gui/render leaked in (unused @ts-expect-error) ` +
          `or a universal call did not resolve:\n${output}`,
      );
    }
    expect(exitCode).toBe(0);
  });

  test("gui-script surface accepts gui.* and universal calls and walls off render.*", () => {
    const { exitCode, output } = typecheck("tsconfig.gui-script.json");
    if (exitCode !== 0) {
      throw new Error(
        `gui-script surface proof failed — either render leaked in (unused @ts-expect-error) ` +
          `or gui/universal calls did not resolve:\n${output}`,
      );
    }
    expect(exitCode).toBe(0);
  });

  test("render-script surface accepts render.* and universal calls and walls off gui.*", () => {
    const { exitCode, output } = typecheck("tsconfig.render-script.json");
    if (exitCode !== 0) {
      throw new Error(
        `render-script surface proof failed — either gui leaked in (unused @ts-expect-error) ` +
          `or render/universal calls did not resolve:\n${output}`,
      );
    }
    expect(exitCode).toBe(0);
  });

  test("editor-script surface accepts editor.* and walls off the runtime namespaces", () => {
    const { exitCode, output } = typecheck("tsconfig.editor-script.json");
    if (exitCode !== 0) {
      throw new Error(
        `editor-script surface proof failed — either go/vmath/msg leaked in ` +
          `(unused @ts-expect-error) or an editor.* call did not resolve:\n${output}`,
      );
    }
    expect(exitCode).toBe(0);
  });

  test("script surface ships ambient hash() unified with the imported branded Hash", () => {
    const { exitCode, output } = typecheck("tsconfig.unified-hash.json");
    if (exitCode !== 0) {
      throw new Error(
        `unified-Hash proof failed — either /script omits ambient hash()/Hash ` +
          `(engine-globals missing from the kind subpath) or the two Hash brands did not unify:\n${output}`,
      );
    }
    expect(exitCode).toBe(0);
  });

  test("script surface ships the Lua stdlib (math/os) alongside the wall", () => {
    const { exitCode, output } = typecheck("tsconfig.script-stdlib.json");
    if (exitCode !== 0) {
      throw new Error(
        `script-stdlib proof failed — either the stdlib (math/os/string/table) is absent ` +
          `from the /script subpath (lua-types reference missing from the kind index) ` +
          `or the gui/render wall leaked:\n${output}`,
      );
    }
    expect(exitCode).toBe(0);
  });

  test("harness can fail: script surface gui.* call without @ts-expect-error errors", () => {
    const { exitCode } = typecheck("tsconfig.script-neg.json");
    expect(exitCode).not.toBe(0);
  });
});

// Each case rebuilds the kind's program from the committed tsconfig's own
// `include`, so it fails both when the shared absence proof was never wired
// into that kind and when the proof stops rejecting a namespace whose proven
// member is missing.
describe("per-kind ambient API wall — a partial extension namespace still fails", () => {
  const PARTIAL_BY_KIND = {
    script: "iac",
    "gui-script": "push",
    "render-script": "webview",
  } as const;

  for (const [kind, namespace] of Object.entries(PARTIAL_BY_KIND)) {
    test(`${kind} program reacts to an ambient ${namespace} that declares no proven member`, () => {
      const root = mkdtempSync(resolve(KINDS_DIR, `partial-${kind}-`));
      try {
        const stub = resolve(root, "partial-namespace.d.ts");
        writeFileSync(stub, partialNamespaceStub(namespace));
        const committed = JSON.parse(
          readFileSync(resolve(KINDS_DIR, `tsconfig.${kind}.json`), "utf8"),
        ) as { compilerOptions: Record<string, unknown>; include: string[] };
        const tsconfigPath = resolve(root, "tsconfig.json");
        writeFileSync(
          tsconfigPath,
          `${JSON.stringify(
            {
              extends: REPO_TSCONFIG,
              compilerOptions: committed.compilerOptions,
              include: [...committed.include.map((entry) => resolve(KINDS_DIR, entry)), stub],
            },
            null,
            2,
          )}\n`,
        );
        const { exitCode, output } = typecheck(tsconfigPath);
        expect(exitCode).not.toBe(0);
        expect(unusedDirectiveLines(output)).toContain(absenceDirectiveLine(namespace));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
