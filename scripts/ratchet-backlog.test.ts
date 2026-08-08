import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AUTHORED_FLOOR_MANIFEST_FILE } from "../packages/library-types/scripts/authored-parity.ts";
import { FLOOR_MANIFEST_FILE } from "../packages/library-types/scripts/fidelity-floor.ts";
import { collectOpenSlots, openSlots, RATCHET_SOURCES } from "./ratchet-backlog.ts";

const REPO_ROOT = join(import.meta.dir, "..");

// The shape the planning pass parses: one open slot per line, nothing else on stdout.
const LINE_SHAPE = /^[A-Za-z0-9._-]+\.json: \S+ [a-zA-Z]+ [0-9.]+ \(target 1\)$/;

// Spelled out rather than imported so relocating either manifest reds this suite.
const MANIFEST_DIR = join("packages", "library-types");

function tempRoot(fidelity: unknown, authored: unknown): string {
  const root = mkdtempSync(join(tmpdir(), "ratchet-backlog-"));
  const dir = join(root, MANIFEST_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, FLOOR_MANIFEST_FILE), `${JSON.stringify(fidelity, null, 2)}\n`);
  writeFileSync(join(dir, AUTHORED_FLOOR_MANIFEST_FILE), `${JSON.stringify(authored, null, 2)}\n`);
  return root;
}

describe("openSlots — below-target classification", () => {
  test("a flat manifest reports only the below-target key, with its axis, value and target", () => {
    expect(openSlots("m.json", { "a.json": 1, "b.json": 0.5 })).toEqual([
      "m.json: b.json coverage 0.5 (target 1)",
    ]);
  });

  test("a flat manifest at target reports nothing", () => {
    expect(openSlots("m.json", { "a.json": 1, "b.json": 1 })).toEqual([]);
  });

  test("an axis manifest reports only the below-target axis", () => {
    expect(openSlots("m.json", { "k.json": { callable: 1, field: 0 } })).toEqual([
      "m.json: k.json field 0 (target 1)",
    ]);
  });

  test("both axes below target report in key-then-declaration order", () => {
    expect(openSlots("m.json", { "k.json": { callable: 0.5, field: 0.25 } })).toEqual([
      "m.json: k.json callable 0.5 (target 1)",
      "m.json: k.json field 0.25 (target 1)",
    ]);
  });

  test("an axis beyond callable/field is reported — the walk is over the entry's own keys", () => {
    expect(openSlots("m.json", { "k.json": { callable: 1, field: 1, doc: 0.5 } })).toEqual([
      "m.json: k.json doc 0.5 (target 1)",
    ]);
  });

  test("a value exactly at target is never reported", () => {
    expect(openSlots("m.json", { "flat.json": 1, "axis.json": { callable: 1, field: 1 } })).toEqual(
      [],
    );
  });
});

describe("collectOpenSlots — both manifests through the production parsers", () => {
  test("a below-target slot in each manifest is reported, each line naming its manifest", () => {
    const root = tempRoot(
      { "fidelity/a.json": 0.75 },
      { "fidelity/authored/b.json": { callable: 1, field: 0.5 } },
    );
    try {
      expect(collectOpenSlots(root)).toEqual([
        `${AUTHORED_FLOOR_MANIFEST_FILE}: fidelity/authored/b.json field 0.5 (target 1)`,
        `${FLOOR_MANIFEST_FILE}: fidelity/a.json coverage 0.75 (target 1)`,
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("manifests entirely at target yield no lines", () => {
    const root = tempRoot(
      { "fidelity/a.json": 1 },
      { "fidelity/authored/b.json": { callable: 1, field: 1 } },
    );
    try {
      expect(collectOpenSlots(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a malformed manifest propagates the parser's error instead of reading as satisfied", () => {
    const root = tempRoot(
      { "fidelity/a.json": 1 },
      { "fidelity/authored/b.json": { callable: 1 } },
    );
    try {
      expect(() => collectOpenSlots(root)).toThrow(/missing its "field" axis/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a single source id restricts the walk to that manifest", () => {
    const root = tempRoot(
      { "fidelity/a.json": 0.75 },
      { "fidelity/authored/b.json": { callable: 1, field: 0.5 } },
    );
    try {
      expect(collectOpenSlots(root, "fidelity-floor")).toEqual([
        `${FLOOR_MANIFEST_FILE}: fidelity/a.json coverage 0.75 (target 1)`,
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("CLI contract — what the planning pass consumes", () => {
  for (const source of RATCHET_SOURCES) {
    test(`\`${source.id}\` exits 0 and prints only conforming lines`, () => {
      const proc = Bun.spawnSync(["bun", "scripts/ratchet-backlog.ts", source.id], {
        cwd: REPO_ROOT,
      });
      expect(proc.exitCode).toBe(0);
      const lines = proc.stdout.toString().split("\n").filter(Boolean);
      for (const line of lines) expect(line).toMatch(LINE_SHAPE);
    });
  }

  test("an unknown source id exits non-zero with empty stdout", () => {
    const proc = Bun.spawnSync(["bun", "scripts/ratchet-backlog.ts", "no-such-source"], {
      cwd: REPO_ROOT,
    });
    expect(proc.exitCode).not.toBe(0);
    expect(proc.stdout.toString()).toBe("");
    expect(proc.stderr.toString()).not.toBe("");
  });

  test("a missing source id exits non-zero with empty stdout", () => {
    const proc = Bun.spawnSync(["bun", "scripts/ratchet-backlog.ts"], { cwd: REPO_ROOT });
    expect(proc.exitCode).not.toBe(0);
    expect(proc.stdout.toString()).toBe("");
    expect(proc.stderr.toString()).not.toBe("");
  });
});
