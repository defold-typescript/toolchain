// The build's `TranspileDiagnostic` carries only `file` + `message`, so the
// matcher captures `(file, message)` and VS Code anchors the problem at the
// file head. The leading-`\s+` anchor is load-bearing: it admits the indented
// `  <file>: <message>` failure rows from `throwIfFailures` while rejecting the
// column-0 `defold-typescript build: …` header and `wrote N files` lines.
const PROBLEM_MATCHER = {
  owner: "defold-typescript",
  severity: "error",
  // ${workspaceFolder} is VS Code's literal variable token, not a JS template placeholder.
  // biome-ignore lint/suspicious/noTemplateCurlyInString: emitted verbatim into tasks.json
  fileLocation: ["relative", "${workspaceFolder}"],
  pattern: { regexp: "^\\s+(\\S.*?):\\s+(.+)$", file: 1, message: 2 },
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
      problemMatcher: PROBLEM_MATCHER,
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
