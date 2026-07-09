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

  test("both tasks share the located matcher capturing file, line, column, message", () => {
    for (const label of ["defold-typescript: build", "defold-typescript: watch"]) {
      const pattern = (
        taskByLabel(VSCODE_TASKS_CONTENT, label).problemMatcher as Record<string, unknown>
      ).pattern as Record<string, unknown>;
      expect(pattern.file).toBe(1);
      expect(pattern.line).toBe(2);
      expect(pattern.column).toBe(3);
      expect(pattern.message).toBe(4);

      const re = matcherRegexp(VSCODE_TASKS_CONTENT, label);
      const located = "  src/foo.ts:12:5: cannot lower X".match(re);
      expect(located?.[1]).toBe("src/foo.ts");
      expect(located?.[2]).toBe("12");
      expect(located?.[3]).toBe("5");
      expect(located?.[4]).toBe("cannot lower X");

      // A positionless failure row still lands (at the file head), with no line/column.
      const positionless = "  src/foo.ts: cannot lower X".match(re);
      expect(positionless?.[1]).toBe("src/foo.ts");
      expect(positionless?.[4]).toBe("cannot lower X");
      expect(positionless?.[2]).toBeUndefined();

      expect("defold-typescript build: 2 file(s) failed:".match(re)).toBeNull();
      expect("defold-typescript build: wrote 3 files".match(re)).toBeNull();
    }
  });

  test("the watch task is an isBackground watcher whose begin/end patterns match the sentinels", () => {
    const watch = taskByLabel(VSCODE_TASKS_CONTENT, "defold-typescript: watch");
    expect(watch.isBackground).toBe(true);
    const background = (watch.problemMatcher as Record<string, unknown>).background as Record<
      string,
      unknown
    >;
    const begins = new RegExp(background.beginsPattern as string);
    const ends = new RegExp(background.endsPattern as string);
    expect("defold-typescript watch: build started").toMatch(begins);
    expect("defold-typescript watch: build finished").toMatch(ends);
  });

  test("the build task stays non-background but reuses the located matcher", () => {
    const build = taskByLabel(VSCODE_TASKS_CONTENT, "defold-typescript: build");
    expect(build.isBackground).toBeUndefined();
    expect((build.problemMatcher as Record<string, unknown>).background).toBeUndefined();
    const re = matcherRegexp(VSCODE_TASKS_CONTENT, "defold-typescript: build");
    expect("  src/foo.ts:1:2: boom".match(re)?.[1]).toBe("src/foo.ts");
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
