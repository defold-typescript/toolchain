import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { globalFunctionsIn } from "../scripts/augmentation-namespaces";
import {
  type ApiTarget,
  GO_INSTANCE_SRC_AUGMENTATIONS,
  loadApiTargets,
  loadGoInstanceFunctions,
} from "../scripts/regen";
import { versionOf } from "../scripts/target-version";
import { absenceDirectiveLine, partialNamespaceStub, unusedDirectiveLines } from "./absence-proof";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const KINDS_DIR = resolve(PACKAGE_ROOT, "test-d", "kinds");
const REPO_TSCONFIG = resolve(PACKAGE_ROOT, "..", "..", "tsconfig.json");

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

interface CommittedKindTsconfig {
  compilerOptions: Record<string, unknown>;
  include: string[];
}

function committedKindTsconfig(kind: string): CommittedKindTsconfig {
  return JSON.parse(
    readFileSync(resolve(KINDS_DIR, `tsconfig.${kind}.json`), "utf8"),
  ) as CommittedKindTsconfig;
}

// Every function the default target's shipped signatures declare, as the
// `<namespace>.<name>` a script writes. A lifecycle hook is keyed by its bare
// name, so the namespace is put back in front of it.
function declaredFunctions(target: ApiTarget): { namespace: string; ref: string }[] {
  const signatures = JSON.parse(
    readFileSync(resolve(PACKAGE_ROOT, "api-signatures.json"), "utf8"),
  ) as { versions: Record<string, Record<string, string>> };
  const keys = Object.keys(signatures.versions[versionOf(target)] ?? {});
  const seen = new Map<string, { namespace: string; ref: string }>();
  for (const key of keys) {
    const [namespace = "", kind, fqn = ""] = key.split("\0");
    if (kind !== "FUNCTION") continue;
    const ref = fqn.startsWith(`${namespace}.`) ? fqn : `${namespace}.${fqn}`;
    seen.set(ref, { namespace, ref });
  }
  return [...seen.values()].sort((a, b) => a.ref.localeCompare(b.ref));
}

// Type-check one `typeof <ref>` line per function against a kind's committed
// entrypoint alone. A line whose function must be absent carries
// `@ts-expect-error`, so a function the kind still declares reds as an unused
// directive and one it lost reds as a missing member.
function probeKind(kind: string, refs: readonly { ref: string; absent: boolean }[]) {
  const root = mkdtempSync(resolve(KINDS_DIR, `go-instance-${kind}-`));
  try {
    const probe = resolve(root, "probe.ts");
    const lines = refs.flatMap(({ ref, absent }, index) => [
      ...(absent ? [`// @ts-expect-error ${ref} needs a game object`] : []),
      `type _${index} = typeof ${ref};`,
    ]);
    writeFileSync(probe, `export {};\n${lines.join("\n")}\n`);
    const committed = committedKindTsconfig(kind);
    const tsconfigPath = resolve(root, "tsconfig.json");
    writeFileSync(
      tsconfigPath,
      `${JSON.stringify(
        {
          extends: REPO_TSCONFIG,
          compilerOptions: committed.compilerOptions,
          include: [
            ...committed.include
              .filter((entry) => entry.endsWith(".d.ts"))
              .map((entry) => resolve(KINDS_DIR, entry)),
            probe,
          ],
        },
        null,
        2,
      )}\n`,
    );
    return typecheck(tsconfigPath);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("render-script game-object wall", () => {
  const target = loadApiTargets().find((t) => t.default === true) as ApiTarget;
  const manifest = new Set(Object.keys(loadGoInstanceFunctions(target) ?? {}));
  const declared = declaredFunctions(target);
  const walled = declared.filter(({ ref }) => manifest.has(ref));
  const walledNamespaces = new Set(walled.map(({ namespace }) => namespace));
  // A marked augmentation rides no render-script index, so a function only it
  // declares (`go.property`) leaves with it rather than staying.
  const markedFunctions = new Set(
    GO_INSTANCE_SRC_AUGMENTATIONS.flatMap((name) => {
      const path = resolve(PACKAGE_ROOT, "src", `${name}.d.ts`);
      return globalFunctionsIn(path, readFileSync(path, "utf8"));
    }),
  );
  const kept = declared.filter(
    ({ namespace, ref }) =>
      walledNamespaces.has(namespace) && !manifest.has(ref) && !markedFunctions.has(ref),
  );

  test("the render-script kind omits every function that needs a game object and keeps the rest of its namespace", () => {
    expect(walled.length).toBeGreaterThan(0);
    expect(kept.length).toBeGreaterThan(0);
    const { exitCode, output } = probeKind("render-script", [
      ...walled.map(({ ref }) => ({ ref, absent: true })),
      ...kept.map(({ ref }) => ({ ref, absent: false })),
    ]);
    if (exitCode !== 0) {
      throw new Error(`render-script game-object wall probe failed:\n${output}`);
    }
    expect(exitCode).toBe(0);
  });

  test("the script kind still declares every one of them", () => {
    const { exitCode, output } = probeKind(
      "script",
      [...walled, ...kept].map(({ ref }) => ({ ref, absent: false })),
    );
    if (exitCode !== 0) {
      throw new Error(`script kind lost a function that needs a game object:\n${output}`);
    }
    expect(exitCode).toBe(0);
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
