import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AUTHORED_FLOOR_MANIFEST_FILE } from "../packages/library-types/scripts/authored-parity.ts";
import { FLOOR_MANIFEST_FILE } from "../packages/library-types/scripts/fidelity-floor.ts";
import {
  PINS_DIR,
  PINS_FILE,
  parseTypecheckPins,
  pinSlots,
} from "../packages/types/scripts/example-pins.ts";
import { collectOpenSlots, openSlots, RATCHET_SOURCES } from "./ratchet-backlog.ts";

const REPO_ROOT = join(import.meta.dir, "..");

// The shape the planning pass parses: one open slot per line, nothing else on
// stdout. Per source, because a floor manifest reports a coverage ratio while
// the pin manifest reports a diagnostic count against a zero target — and every
// registered source must declare one, so a new source cannot slip in unchecked.
const LINE_SHAPES: Record<string, RegExp> = {
  "authored-parity-floor": /^[A-Za-z0-9._-]+\.json: \S+ [a-zA-Z]+ [0-9.]+ \(target 1\)$/,
  "fidelity-floor": /^[A-Za-z0-9._-]+\.json: \S+ [a-zA-Z]+ [0-9.]+ \(target 1\)$/,
  "authored-example-typecheck":
    /^[A-Za-z0-9._-]+\.json: \S+:\S+:[0-9a-f]{16} diagnostics [0-9]+ \(target 0\)$/,
};

// Spelled out rather than imported so relocating either manifest reds this suite.
const MANIFEST_DIR = join("packages", "library-types");

function tempRoot(fidelity: unknown, authored: unknown, pins: unknown = {}): string {
  const root = mkdtempSync(join(tmpdir(), "ratchet-backlog-"));
  const dir = join(root, MANIFEST_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, FLOOR_MANIFEST_FILE), `${JSON.stringify(fidelity, null, 2)}\n`);
  writeFileSync(join(dir, AUTHORED_FLOOR_MANIFEST_FILE), `${JSON.stringify(authored, null, 2)}\n`);
  const pinsDir = join(root, PINS_DIR);
  mkdirSync(pinsDir, { recursive: true });
  writeFileSync(join(pinsDir, PINS_FILE), `${JSON.stringify(pins, null, 2)}\n`);
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

  test("the pin manifest joins the same walk, through its own collector", () => {
    const root = tempRoot(
      { "fidelity/a.json": 1 },
      { "fidelity/authored/b.json": { callable: 1, field: 1 } },
      {
        "defold-1.13.1:go.get:0123456789abcdef": [{ code: 2304, text: "x" }],
      },
    );
    try {
      expect(collectOpenSlots(root)).toEqual([
        `${PINS_FILE}: defold-1.13.1:go.get:0123456789abcdef diagnostics 1 (target 0)`,
      ]);
      expect(collectOpenSlots(root, "authored-example-typecheck")).toHaveLength(1);
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

describe("pinSlots — the pin manifest's own collector", () => {
  test("one line per pinned pair, naming its identity and diagnostic count", () => {
    expect(
      pinSlots("typecheck-pins.json", {
        "defold-1.13.1:go.get:0123456789abcdef": [{ code: 2304, text: "x" }],
        "defold-1.13.1/kinds/script:msg.post:fedcba9876543210": [
          { code: 2345, text: "y" },
          { code: 2339, text: "z" },
        ],
      }),
    ).toEqual([
      "typecheck-pins.json: defold-1.13.1:go.get:0123456789abcdef diagnostics 1 (target 0)",
      "typecheck-pins.json: defold-1.13.1/kinds/script:msg.post:fedcba9876543210 diagnostics 2 (target 0)",
    ]);
  });

  test("an emptied pin file yields no lines — the backlog is drained, not missing", () => {
    expect(pinSlots("typecheck-pins.json", {})).toEqual([]);
  });

  test("`openSlots` alone would print nothing, which is why the hook exists", () => {
    expect(openSlots("typecheck-pins.json", { "a:b:c": [{ code: 1, text: "x" }] })).toEqual([]);
  });

  test("a malformed pin entry throws rather than reading as satisfied backlog", () => {
    expect(() => parseTypecheckPins({ "a:b:c": [] }, "typecheck-pins.json")).toThrow(
      /non-empty array/,
    );
    expect(() => parseTypecheckPins({ "a:b:c": [{ code: 1 }] }, "typecheck-pins.json")).toThrow(
      /not \{code, text\}/,
    );
    expect(() => parseTypecheckPins([], "typecheck-pins.json")).toThrow(/expected an object/);
  });
});

describe("CLI contract — what the planning pass consumes", () => {
  test("every registered source declares the line shape its output must conform to", () => {
    expect(RATCHET_SOURCES.map((source) => source.id).sort()).toEqual(
      Object.keys(LINE_SHAPES).sort(),
    );
  });

  for (const source of RATCHET_SOURCES) {
    test(`\`${source.id}\` exits 0 and prints only conforming lines`, () => {
      const proc = Bun.spawnSync(["bun", "scripts/ratchet-backlog.ts", source.id], {
        cwd: REPO_ROOT,
      });
      expect(proc.exitCode).toBe(0);
      const lines = proc.stdout.toString().split("\n").filter(Boolean);
      const shape = LINE_SHAPES[source.id];
      if (!shape) throw new Error(`no line shape declared for source "${source.id}"`);
      for (const line of lines) expect(line).toMatch(shape);
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
