import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  anchorOffenders,
  declaresGoal,
  implDir,
  parseIndexStatus,
  prdDir,
} from "./planning-ledger";

const present = existsSync(prdDir) && existsSync(implDir);

const goalPath = ["docs", "prd", "area.md"].join("/");

// Builds a throwaway tree with the same layout the real ledger has, so the
// offender walker can be exercised on data this test fully controls.
function seedTree(): string {
  const root = mkdtempSync(join(tmpdir(), "ledger-"));
  const impl = join(root, "docs", "impl");
  const goals = join(root, "docs", "prd");
  mkdirSync(impl, { recursive: true });
  mkdirSync(goals, { recursive: true });
  writeFileSync(join(goals, "area.md"), "### real-goal\n- **Status**: planned\n");
  writeFileSync(join(impl, "anchorless.md"), "# Anchorless\n\nGoal: real-goal\n");
  writeFileSync(join(impl, "dangling.md"), `# Dangling\n\nPRD: ${goalPath}#absent-goal\n`);
  writeFileSync(join(impl, "sound.md"), `# Sound\n\nPRD: ${goalPath}#real-goal\n`);
  writeFileSync(
    join(impl, "README.md"),
    [
      "| Step file | Goal | Status |",
      "| --------- | ---- | ------ |",
      "| [anchorless.md](anchorless.md) | real-goal | done |",
      "| [dangling.md](dangling.md) | real-goal | done |",
      "| [sound.md](sound.md) | real-goal | done |",
      "| [absent.md](absent.md) | real-goal | done |",
      "",
    ].join("\n"),
  );
  return root;
}

function indexRowCount(): number {
  return parseIndexStatus(readFileSync(join(implDir, "README.md"), "utf8")).size;
}

describe("goal anchor exactness", () => {
  test.skipIf(!present)("every ledger step carries an anchor line", () => {
    expect(indexRowCount()).toBeGreaterThan(0);
    expect(anchorOffenders().filter((o) => o.endsWith("(no anchor)"))).toEqual([]);
  });

  test.skipIf(!present)("every ledger step row resolves to a file that exists", () => {
    expect(indexRowCount()).toBeGreaterThan(0);
    expect(anchorOffenders().filter((o) => o.endsWith("(missing step file)"))).toEqual([]);
  });

  test.skipIf(!present)("every anchor resolves to a file that declares its id", () => {
    expect(indexRowCount()).toBeGreaterThan(0);
    expect(
      anchorOffenders().filter(
        (o) => !o.endsWith("(no anchor)") && !o.endsWith("(missing step file)"),
      ),
    ).toEqual([]);
  });

  test("declaresGoal accepts an area heading and rejects a different id", () => {
    const body = "# Area\n\n### some-goal\n- **Status**: planned\n";
    expect(declaresGoal(body, "some-goal", false)).toBe(true);
    expect(declaresGoal(body, "other-goal", false)).toBe(false);
  });

  test("declaresGoal accepts the lowercase id heading and rejects the spaced-capital form", () => {
    expect(declaresGoal("# bug-07 — a title\n", "bug-07", true)).toBe(true);
    expect(declaresGoal("# Bug 07 — a title\n", "bug-07", true)).toBe(false);
  });

  test("declaresGoal reads only the first heading of a bug file", () => {
    const body = "# bug-07 — a title\n\nSee also:\n\n# bug-08 — quoted inside\n";
    expect(declaresGoal(body, "bug-07", true)).toBe(true);
    expect(declaresGoal(body, "bug-08", true)).toBe(false);
  });

  test("declaresGoal rejects an id that is only mentioned in prose", () => {
    const body = "# Something else\n\nThis behaves like some-goal but does not declare it.\n";
    expect(declaresGoal(body, "some-goal", false)).toBe(false);
    expect(declaresGoal(body, "some-goal", true)).toBe(false);
  });

  test("the offender walker reports anchorless and dangling steps", () => {
    const root = seedTree();
    try {
      expect(anchorOffenders(root)).toEqual([
        "anchorless.md: (no anchor)",
        `dangling.md: ${goalPath}#absent-goal (missing id)`,
        "absent.md: (missing step file)",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
