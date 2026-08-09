import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  type AuthoredTarget,
  PARITY_VERDICT_REASONS,
  readAuthoredTargets,
} from "./sync-authored-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const TARGETS = readAuthoredTargets(PACKAGE_ROOT);

const DEFCON: AuthoredTarget = {
  repo: "https://github.com/britzl/defcon",
  ref: "2.6.0",
  license: "MIT",
  authored: "fixtures/authored/defcon.console.d.ts",
  moduleId: "defcon.console",
  namespace: "defcon",
  generated: "generated/defcon.d.ts",
  apiDoc: "api-doc/defcon.json",
  fidelity: "fidelity/defcon.json",
  upstreamLua: ["fixtures/upstream-lua/defcon/defcon/console.lua"],
};

function writeConfig(config: unknown): string {
  const root = mkdtempSync(join(tmpdir(), "authored-parity-coverage-"));
  writeFileSync(join(root, "authored-targets.json"), JSON.stringify(config));
  return root;
}

describe("every authored target declares a parity decision", () => {
  test("no entry is silently unexamined — it measures, or it records why it cannot", () => {
    const undecided = TARGETS.filter(
      (entry) => entry.upstreamLua.length === 0 && entry.parityVerdict === undefined,
    ).map(
      (entry) =>
        `${entry.moduleId}: declares neither upstreamLua nor parityVerdict — vendor its upstream .lua or record why it cannot be measured`,
    );
    expect(undecided).toEqual([]);
  });

  // The corpus now carries no verdict at all, so the exclusivity below can only be
  // read off the measured side. The verdict side keeps its teeth through the
  // synthetic registries further down, which drive `readAuthoredTargets` directly.
  test("the corpus is non-trivial and wholly measured — no entry rests on an excuse", () => {
    expect(TARGETS.length).toBeGreaterThan(0);
    expect(TARGETS.filter((entry) => entry.upstreamLua.length > 0).length).toBe(TARGETS.length);
    expect(
      TARGETS.filter((entry) => entry.parityVerdict !== undefined).map((entry) => entry.moduleId),
    ).toEqual([]);
  });

  test("a measured target carries no verdict — the two declarations are exclusive", () => {
    const both = TARGETS.filter(
      (entry) => entry.upstreamLua.length > 0 && entry.parityVerdict !== undefined,
    ).map((entry) => entry.moduleId);
    expect(both).toEqual([]);
  });

  test("readAuthoredTargets rejects an entry declaring neither, naming it", () => {
    const root = writeConfig({ targets: [{ ...DEFCON, upstreamLua: [] }] });
    expect(() => readAuthoredTargets(root)).toThrow(/defcon\.console/);
    expect(() => readAuthoredTargets(root)).toThrow(/parityVerdict/);
  });

  test("readAuthoredTargets rejects an entry declaring both, naming it", () => {
    const root = writeConfig({
      targets: [{ ...DEFCON, parityVerdict: { reason: "no-module-file", note: "n/a" } }],
    });
    expect(() => readAuthoredTargets(root)).toThrow(/defcon\.console/);
    expect(() => readAuthoredTargets(root)).toThrow(/both/);
  });
});

describe("a parity verdict is a chosen category, not free prose", () => {
  test("every committed verdict names a reason from the closed vocabulary", () => {
    const offenders = TARGETS.filter((entry) => entry.parityVerdict !== undefined)
      .filter(
        (entry) =>
          !(PARITY_VERDICT_REASONS as readonly string[]).includes(
            entry.parityVerdict?.reason as string,
          ),
      )
      .map((entry) => `${entry.moduleId}: ${entry.parityVerdict?.reason}`);
    expect(offenders).toEqual([]);
  });

  test("every committed verdict carries a non-empty note", () => {
    const silent = TARGETS.filter((entry) => entry.parityVerdict !== undefined)
      .filter((entry) => (entry.parityVerdict?.note ?? "").trim() === "")
      .map((entry) => entry.moduleId);
    expect(silent).toEqual([]);
  });

  test("an unknown reason throws, naming the entry and the reason", () => {
    const root = writeConfig({
      targets: [
        { ...DEFCON, upstreamLua: [], parityVerdict: { reason: "too-hard", note: "later" } },
      ],
    });
    expect(() => readAuthoredTargets(root)).toThrow(/defcon\.console/);
    expect(() => readAuthoredTargets(root)).toThrow(/too-hard/);
  });

  test("an empty note throws, so the escape hatch cannot be silent", () => {
    const root = writeConfig({
      targets: [
        { ...DEFCON, upstreamLua: [], parityVerdict: { reason: "no-module-file", note: "  " } },
      ],
    });
    expect(() => readAuthoredTargets(root)).toThrow(/defcon\.console/);
    expect(() => readAuthoredTargets(root)).toThrow(/note/);
  });

  test("the vocabulary is exactly the three recorded reasons", () => {
    expect([...PARITY_VERDICT_REASONS].sort()).toEqual([
      "no-module-file",
      "unparseable-shape",
      "unresolved-path",
    ]);
  });
});

describe("the concrete targets whose excuses the survey retired", () => {
  function verdict(moduleId: string) {
    const found = TARGETS.find((entry) => entry.moduleId === moduleId);
    if (!found) throw new Error(`authored-targets.json declares no ${moduleId}`);
    return found;
  }

  test("the callable-module sources are measured now, their excuse having been retired", () => {
    for (const [moduleId, upstream] of [
      ["boom.boom", "fixtures/upstream-lua/boom/boom/boom.lua"],
      ["in.accelerometer", "fixtures/upstream-lua/defold-input/in/accelerometer.lua"],
    ] as const) {
      const entry = verdict(moduleId);
      expect(entry.parityVerdict).toBeUndefined();
      expect(entry.upstreamLua).toEqual([upstream]);
      expect(existsSync(join(PACKAGE_ROOT, upstream))).toBe(true);
    }
  });

  // The reason the corpus now carries no verdict at all: `starly.starly` was the last
  // target holding one, and it was dropped rather than measured — its upstream and its
  // author's account are both gone, and the only surviving copy is an unaffiliated
  // third-party mirror. A registry that names it again would be shipping types for a
  // library nobody can obtain.
  test("`unresolved-path` survives with no corpus user, its one holder having been dropped", () => {
    expect(PARITY_VERDICT_REASONS).toContain("unresolved-path");
    expect(TARGETS.map((entry) => entry.namespace)).not.toContain("starly");
    expect(
      TARGETS.filter((entry) => entry.parityVerdict?.reason === "unresolved-path").map(
        (entry) => entry.moduleId,
      ),
    ).toEqual([]);
  });

  test("`unparseable-shape` survives with no corpus user, now describing a refused metatable", () => {
    expect(PARITY_VERDICT_REASONS).toContain("unparseable-shape");
    expect(
      TARGETS.filter((entry) => entry.parityVerdict?.reason === "unparseable-shape").map(
        (entry) => entry.moduleId,
      ),
    ).toEqual([]);
  });
});
