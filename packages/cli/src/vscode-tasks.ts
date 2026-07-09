// `throwIfFailures` now emits located `  <file>:<line>:<column>: <message>` rows,
// so the matcher captures file/line/column/message with the position group
// optional — a positionless `  <file>: <message>` row still lands at the file
// head. The leading-`\s+` anchor is load-bearing: it admits the indented failure
// rows while rejecting the column-0 `defold-typescript …` header, `wrote N files`,
// and the `build started`/`build finished` cycle sentinels.
const PROBLEM_MATCHER = {
  owner: "defold-typescript",
  severity: "error",
  // ${workspaceFolder} is VS Code's literal variable token, not a JS template placeholder.
  // biome-ignore lint/suspicious/noTemplateCurlyInString: emitted verbatim into tasks.json
  fileLocation: ["relative", "${workspaceFolder}"],
  pattern: {
    regexp: "^\\s+(\\S.*?)(?::(\\d+):(\\d+))?:\\s+(.+)$",
    file: 1,
    line: 2,
    column: 3,
    message: 4,
  },
} as const;

// The `watch` task frames each cycle with these lines (see watch.ts); the
// background matcher clears stale problems on `beginsPattern` and re-anchors
// them on `endsPattern`.
const WATCH_BACKGROUND = {
  activeOnStart: true,
  beginsPattern: "^defold-typescript watch: build started$",
  endsPattern: "^defold-typescript watch: build finished$",
} as const;

const MANAGED_LABELS = ["defold-typescript: build", "defold-typescript: watch"] as const;

function managedTasks(): Record<string, unknown>[] {
  return [
    {
      label: "defold-typescript: build",
      type: "shell",
      command: "bunx @defold-typescript/cli build",
      group: "build",
      problemMatcher: PROBLEM_MATCHER,
    },
    {
      label: "defold-typescript: watch",
      type: "shell",
      command: "bunx @defold-typescript/cli watch",
      isBackground: true,
      problemMatcher: { ...PROBLEM_MATCHER, background: WATCH_BACKGROUND },
    },
  ];
}

export const VSCODE_TASKS_CONTENT: Record<string, unknown> = {
  version: "2.0.0",
  tasks: managedTasks(),
};

function labelOf(task: unknown): string | undefined {
  return typeof task === "object" && task !== null
    ? (task as Record<string, unknown>).label === undefined
      ? undefined
      : String((task as Record<string, unknown>).label)
    : undefined;
}

// Reconcile the `tasks` array by `label` the way `reconcileManagedList`
// reconciles strings: drop any stale managed task, keep user tasks in order,
// then append the canonical managed tasks once.
export function mergeVscodeTasks(existing?: Record<string, unknown>): Record<string, unknown> {
  if (existing === undefined) {
    return VSCODE_TASKS_CONTENT;
  }
  const managedSet = new Set<string>(MANAGED_LABELS);
  const existingTasks = Array.isArray(existing.tasks) ? existing.tasks : [];
  const userTasks = existingTasks.filter((task) => {
    const label = labelOf(task);
    return label === undefined || !managedSet.has(label);
  });
  return {
    ...existing,
    version: existing.version ?? VSCODE_TASKS_CONTENT.version,
    tasks: [...userTasks, ...managedTasks()],
  };
}
