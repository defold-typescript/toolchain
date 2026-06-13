import { describe, expect, test } from "bun:test";
import { mergeVscodeTasks, VSCODE_TASKS_CONTENT } from "./vscode-tasks";

function taskByLabel(content: Record<string, unknown>, label: string): Record<string, unknown> {
  const tasks = Array.isArray(content.tasks) ? content.tasks : [];
  const found = tasks.find(
    (t): t is Record<string, unknown> =>
      typeof t === "object" && t !== null && (t as Record<string, unknown>).label === label,
  );
  if (found === undefined) {
    throw new Error(`no task labelled ${label}`);
  }
  return found;
}

function matcherRegexp(content: Record<string, unknown>, label: string): RegExp {
  const task = taskByLabel(content, label);
  const matcher = task.problemMatcher as Record<string, unknown>;
  const pattern = matcher.pattern as Record<string, unknown>;
  return new RegExp(pattern.regexp as string);
}

describe("VSCODE_TASKS_CONTENT", () => {
  test("declares version 2.0.0 and the two managed tasks invoking the CLI", () => {
    expect(VSCODE_TASKS_CONTENT.version).toBe("2.0.0");
    expect(taskByLabel(VSCODE_TASKS_CONTENT, "defold-typescript: build").command).toBe(
      "bunx @defold-typescript/cli build",
    );
    expect(taskByLabel(VSCODE_TASKS_CONTENT, "defold-typescript: watch").command).toBe(
      "bunx @defold-typescript/cli watch",
    );
  });

  test("both tasks carry the shared matcher that captures a real failure line only", () => {
    for (const label of ["defold-typescript: build", "defold-typescript: watch"]) {
      const re = matcherRegexp(VSCODE_TASKS_CONTENT, label);
      const failure = "  src/foo.ts: cannot lower X".match(re);
      expect(failure?.[1]).toBe("src/foo.ts");
      expect(failure?.[2]).toBe("cannot lower X");
      expect("defold-typescript build: 2 file(s) failed:".match(re)).toBeNull();
      expect("defold-typescript build: wrote 3 files".match(re)).toBeNull();
    }
  });
});

describe("mergeVscodeTasks", () => {
  test("no existing file returns the managed content verbatim", () => {
    expect(mergeVscodeTasks(undefined)).toEqual(VSCODE_TASKS_CONTENT);
  });

  test("preserves a user task and adds both managed tasks exactly once", () => {
    const merged = mergeVscodeTasks({ version: "2.0.0", tasks: [{ label: "deploy" }] });
    const labels = (merged.tasks as Record<string, unknown>[]).map((t) => t.label);
    expect(labels).toContain("deploy");
    expect(labels.filter((l) => l === "defold-typescript: build")).toHaveLength(1);
    expect(labels.filter((l) => l === "defold-typescript: watch")).toHaveLength(1);
  });

  test("re-merging an already-merged object is idempotent", () => {
    const once = mergeVscodeTasks({ version: "2.0.0", tasks: [{ label: "deploy" }] });
    const twice = mergeVscodeTasks(once);
    expect(twice).toEqual(once);
  });
});
