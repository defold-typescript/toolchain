import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { COMMAND_NAMES, renderHelpJson } from "./help";
import { SCAFFOLD_DEV_DEPS } from "./init";
import { MISE_TASKS_TOML, mergeMiseToml } from "./mise-scaffold";

describe("MISE_TASKS_TOML", () => {
  test("declares the seven quoted namespaced task headers", () => {
    expect(MISE_TASKS_TOML).toContain('[tasks."defold-typescript:build"]');
    expect(MISE_TASKS_TOML).toContain('[tasks."defold-typescript:watch"]');
    expect(MISE_TASKS_TOML).toContain('[tasks."defold-typescript:watch-hr"]');
    expect(MISE_TASKS_TOML).toContain('[tasks."defold-typescript:resolve"]');
    expect(MISE_TASKS_TOML).toContain('[tasks."defold-typescript:upgrade"]');
    expect(MISE_TASKS_TOML).toContain('[tasks."defold-typescript:setup-debug"]');
    expect(MISE_TASKS_TOML).toContain('[tasks."defold-typescript:init-agents"]');
  });

  test("watch-hr runs the watch verb with the hot-reload flag", () => {
    expect(MISE_TASKS_TOML).toContain('run = "bunx @defold-typescript/cli watch --hot-reload"');
  });

  test("watch-ec and watch-hr-ec run the watch verb with the editor-compile flag", () => {
    const runOf = (task: string): string | undefined =>
      MISE_TASKS_TOML.split(`[tasks."defold-typescript:${task}"]\n`)[1]?.match(
        /run = "([^"]+)"/,
      )?.[1];

    expect(runOf("watch-ec")).toBe("bunx @defold-typescript/cli watch --editor-compile");
    expect(runOf("watch-hr-ec")).toBe(
      "bunx @defold-typescript/cli watch --hot-reload --editor-compile",
    );
  });

  test("setup-debug runs the CLI via bunx @defold-typescript/cli", () => {
    expect(MISE_TASKS_TOML).toContain('run = "bunx @defold-typescript/cli setup-debug"');
  });

  test("init-agents runs the installed CLI via bunx @defold-typescript/cli", () => {
    expect(MISE_TASKS_TOML).toContain('run = "bunx @defold-typescript/cli init-agents ."');
  });

  test("build, watch, and resolve invoke the CLI via bunx @defold-typescript/cli", () => {
    expect(MISE_TASKS_TOML).toContain('run = "bunx @defold-typescript/cli build"');
    expect(MISE_TASKS_TOML).toContain('run = "bunx @defold-typescript/cli watch"');
    expect(MISE_TASKS_TOML).toContain('run = "bunx @defold-typescript/cli resolve"');
  });

  test("resolve carries the note that watch runs it automatically", () => {
    expect(MISE_TASKS_TOML).toContain(
      "# watch runs this automatically on every game.project change; run it manually for a one-off resolve",
    );
  });

  test("upgrade calls the verb, so the recipe lives in exactly one place", () => {
    expect(MISE_TASKS_TOML).toContain('run = "bunx @defold-typescript/cli@latest upgrade"');
    // The longhand recipe the verb replaces must not survive anywhere in the block.
    expect(MISE_TASKS_TOML).not.toContain("init . --force");
    expect(MISE_TASKS_TOML).not.toContain("--suppress-install-reminder");
    expect(MISE_TASKS_TOML).not.toContain("bun install");
  });

  test("each managed task is fronted by the managed marker", () => {
    // Derived from the block itself, so adding a seventh task never re-baselines
    // this — but adding one *without* its marker line still reds.
    const lines = MISE_TASKS_TOML.split("\n");
    const taskHeaders = lines.filter((l) => l.startsWith("[tasks."));
    expect(taskHeaders.length).toBeGreaterThan(1);
    for (const [i, line] of lines.entries()) {
      if (!line.startsWith("[tasks.")) continue;
      expect(lines[i - 1]).toBe("# managed by @defold-typescript");
    }
  });
});

interface MiseTask {
  readonly run: string | readonly string[];
}

const CLI_PACKAGES = new Set(["@defold-typescript/cli", "@defold-typescript/cli@latest"]);

function managedTasks(): Record<string, MiseTask | undefined> {
  return (Bun.TOML.parse(MISE_TASKS_TOML) as { tasks: Record<string, MiseTask> }).tasks;
}

// A task's `run` is one command or a list of them; each splits on whitespace.
function commandsOf(task: MiseTask): string[][] {
  const runs = typeof task.run === "string" ? [task.run] : task.run;
  return runs.map((command) => command.trim().split(/\s+/));
}

function everyCommand(): { task: string; argv: string[] }[] {
  return Object.entries(managedTasks()).flatMap(([task, definition]) =>
    definition === undefined ? [] : commandsOf(definition).map((argv) => ({ task, argv })),
  );
}

function runsTheCli(argv: readonly string[]): boolean {
  return CLI_PACKAGES.has(argv[1] ?? "");
}

function flagsOf(verb: string): Set<string> {
  const { flags } = JSON.parse(renderHelpJson(verb)) as { flags: { flag: string }[] };
  return new Set(flags.flatMap((f) => f.flag.match(/--[A-Za-z][\w-]*/g) ?? []));
}

// The `bin` map of a package as installed, and the directory its manifest sits in.
function installedBins(pkg: string): { dir: string; bins: Record<string, string> } {
  const manifestPath = createRequire(import.meta.url).resolve(`${pkg}/package.json`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    name: string;
    bin?: string | Record<string, string>;
  };
  const bins =
    typeof manifest.bin === "string"
      ? { [manifest.name.split("/").at(-1) ?? manifest.name]: manifest.bin }
      : (manifest.bin ?? {});
  return { dir: dirname(manifestPath), bins };
}

// The typecheck task's command with `bunx --package <pkg> <bin>` swapped for the
// installed bin, so the test runs the compiler the scaffold pins without
// reaching the registry.
function typecheckArgv(): string[] {
  const task = managedTasks()["defold-typescript:typecheck"];
  expect(task).toBeDefined();
  const [command = []] = commandsOf(task ?? { run: [] });
  const [bunx, packageFlag, pkg = "", bin = "", ...rest] = command;
  expect([bunx, packageFlag]).toEqual(["bunx", "--package"]);
  const { dir, bins } = installedBins(pkg);
  const binPath = bins[bin];
  expect(binPath).toBeDefined();
  return [process.execPath, join(dir, binPath ?? ""), ...rest];
}

function typecheckProject(source: string): { exitCode: number; jsFiles: string[] } {
  const dir = mkdtempSync(join(tmpdir(), "mise-typecheck-"));
  try {
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { noEmit: false, strict: true },
        include: ["src/**/*.ts"],
      }),
    );
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "main.ts"), source);
    const result = Bun.spawnSync(typecheckArgv(), { cwd: dir, stdout: "pipe", stderr: "pipe" });
    const jsFiles = readdirSync(dir, { recursive: true })
      .map((entry) => String(entry).replaceAll("\\", "/"))
      .filter((entry) => entry.endsWith(".js"));
    return { exitCode: result.exitCode, jsFiles };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("the managed tasks", () => {
  const added = [
    '[tasks."defold-typescript:bob-run"]',
    '[tasks."defold-typescript:typecheck"]',
    '[tasks."defold-typescript:scene-types"]',
    '[tasks."defold-typescript:sync-target"]',
  ];

  test("every command that runs the CLI names a verb it dispatches, with flags its help lists", () => {
    const cliCommands = everyCommand().filter(({ argv }) => runsTheCli(argv));
    expect(cliCommands.length).toBeGreaterThan(0);
    for (const { task, argv } of cliCommands) {
      const verb = argv[2] ?? "";
      expect({ task, verb, dispatched: COMMAND_NAMES.has(verb) }).toEqual({
        task,
        verb,
        dispatched: true,
      });
      const flags = flagsOf(verb);
      for (const token of argv.slice(3).filter((t) => t.startsWith("--"))) {
        const flag = token.split("=")[0] ?? token;
        expect({ task, flag, listed: flags.has(flag) }).toEqual({ task, flag, listed: true });
      }
    }
  });

  test("every other command runs a scaffolded dependency's binary", () => {
    for (const { task, argv } of everyCommand().filter(({ argv }) => !runsTheCli(argv))) {
      const [bunx, packageFlag, pkg = "", bin = ""] = argv;
      expect({ task, bunx, packageFlag }).toEqual({
        task,
        bunx: "bunx",
        packageFlag: "--package",
      });
      expect({ task, pkg, scaffolded: pkg in SCAFFOLD_DEV_DEPS }).toEqual({
        task,
        pkg,
        scaffolded: true,
      });
      expect({ task, bin, installed: bin in installedBins(pkg).bins }).toEqual({
        task,
        bin,
        installed: true,
      });
    }
  });

  test("typecheck writes no file when the project sets noEmit: false", () => {
    const { exitCode, jsFiles } = typecheckProject("export const answer: number = 42;\n");
    expect(jsFiles).toEqual([]);
    expect(exitCode).toBe(0);
  }, 30000);

  test("typecheck fails on a type error", () => {
    const { exitCode, jsFiles } = typecheckProject('export const answer: number = "42";\n');
    expect(exitCode).not.toBe(0);
    expect(jsFiles).toEqual([]);
  }, 30000);

  test("an upgraded project gains the four tasks with its user content byte-identical", () => {
    const userContent = '[tools]\nbun = "1.3"\n\n[tasks.foo]\nrun = "echo hi"';
    const priorManaged = MISE_TASKS_TOML.split("# managed by @defold-typescript\n")
      .filter((block) => !added.some((header) => block.includes(header)))
      .filter((block) => block !== "")
      .map((block) => `# managed by @defold-typescript\n${block}`)
      .join("");
    for (const header of added) expect(priorManaged).not.toContain(header);

    const merged = mergeMiseToml(`${userContent}\n\n${priorManaged}`);

    for (const header of added) expect(merged.split(header).length - 1).toBe(1);
    expect(merged.startsWith(`${userContent}\n\n`)).toBe(true);
    for (const header of merged.match(/\[tasks\."defold-typescript:[^"]+"\]/g) ?? []) {
      expect(merged.split(header).length - 1).toBe(1);
    }
  });
});

describe("mergeMiseToml", () => {
  test("no existing file returns the managed block verbatim", () => {
    expect(mergeMiseToml(undefined)).toBe(MISE_TASKS_TOML);
  });

  test("preserves user content verbatim and appends the managed tasks once", () => {
    const existing = '[tools]\nbun = "1.3"\n\n[tasks.foo]\nrun = "echo hi"\n';
    const merged = mergeMiseToml(existing);

    expect(merged).toContain('[tools]\nbun = "1.3"');
    expect(merged).toContain('[tasks.foo]\nrun = "echo hi"');
    expect(merged).toContain('[tasks."defold-typescript:build"]');
    expect(merged).toContain('[tasks."defold-typescript:watch"]');
    expect(merged).toContain('[tasks."defold-typescript:upgrade"]');
    expect(merged).toContain('[tasks."defold-typescript:init-agents"]');

    const buildHeaders = merged.match(/\[tasks\."defold-typescript:build"\]/g) ?? [];
    expect(buildHeaders.length).toBe(1);
    const initAgentsHeaders = merged.match(/\[tasks\."defold-typescript:init-agents"\]/g) ?? [];
    expect(initAgentsHeaders.length).toBe(1);
  });

  test("is idempotent: re-merging an already-merged file changes nothing", () => {
    const existing = '[tools]\nbun = "1.3"\n\n[tasks.foo]\nrun = "echo hi"\n';
    const once = mergeMiseToml(existing);
    const twice = mergeMiseToml(once);
    expect(twice).toBe(once);
  });

  test("a force-style re-merge refreshes managed blocks without touching user tasks", () => {
    const existing = '[tasks.foo]\nrun = "echo hi"\n';
    const merged = mergeMiseToml(existing);
    const refreshed = mergeMiseToml(merged);

    expect(refreshed).toBe(merged);
    expect(refreshed).toContain('[tasks.foo]\nrun = "echo hi"');
    const upgradeHeaders = refreshed.match(/\[tasks\."defold-typescript:upgrade"\]/g) ?? [];
    expect(upgradeHeaders.length).toBe(1);
  });

  test("upgrades a previous-version mise.toml: bare init/init-agents run strings become dotted", () => {
    // A mise.toml scaffolded before `init` required an explicit destination: the
    // managed blocks carry no-path run strings. Re-merging (what every `init`
    // does) must strip them and re-append the dotted current strings so the
    // `:upgrade` task heals on disk.
    const previousVersion = [
      '[tools]\nnode = "22"\n',
      "# managed by @defold-typescript",
      '[tasks."defold-typescript:init-agents"]',
      'run = "bunx @defold-typescript/cli init-agents"\n',
      "# managed by @defold-typescript",
      '[tasks."defold-typescript:upgrade"]',
      'run = ["bunx @defold-typescript/cli@latest init --force --suppress-install-reminder", "bun install"]\n',
      '[tasks."my-custom-task"]\nrun = "echo hello"\n',
    ].join("\n");

    const merged = mergeMiseToml(previousVersion);

    expect(merged).toContain('run = "bunx @defold-typescript/cli init-agents ."');
    expect(merged).not.toContain('run = "bunx @defold-typescript/cli init-agents"');
    expect(merged).toContain('run = "bunx @defold-typescript/cli@latest upgrade"');
    expect(merged).not.toContain("@latest init --force");
    expect(merged).toContain('node = "22"');
    expect(merged).toContain('[tasks."my-custom-task"]\nrun = "echo hello"');

    // Against the managed block's own marker count, so the merge is asserted to
    // carry every marker across rather than a number that drifts with the block.
    const markers = merged.match(/# managed by @defold-typescript/g) ?? [];
    const expected = MISE_TASKS_TOML.match(/# managed by @defold-typescript/g) ?? [];
    expect(markers.length).toBe(expected.length);
  });

  test("an upgraded project gains watch-hr with its user content byte-identical", () => {
    // The prior generation is the managed block minus the new task, which is what
    // a project scaffolded before this feature actually carries on disk.
    const userContent = '[tools]\nbun = "1.3"\n\n[tasks.foo]\nrun = "echo hi"';
    const priorManaged = MISE_TASKS_TOML.split("# managed by @defold-typescript\n")
      .filter((block) => !block.includes('[tasks."defold-typescript:watch-hr"]'))
      .filter((block) => block !== "")
      .map((block) => `# managed by @defold-typescript\n${block}`)
      .join("");
    expect(priorManaged).not.toContain('[tasks."defold-typescript:watch-hr"]');

    const merged = mergeMiseToml(`${userContent}\n\n${priorManaged}`);

    expect(merged).toContain('[tasks."defold-typescript:watch-hr"]');
    expect(merged).toContain(userContent);
    for (const header of merged.match(/\[tasks\."defold-typescript:[^"]+"\]/g) ?? []) {
      expect(merged.split(header).length - 1).toBe(1);
    }
  });

  test("an upgraded project gains watch-ec and watch-hr-ec with its user content byte-identical", () => {
    const added = [
      '[tasks."defold-typescript:watch-ec"]',
      '[tasks."defold-typescript:watch-hr-ec"]',
    ];
    const userContent = '[tools]\nbun = "1.3"\n\n[tasks.foo]\nrun = "echo hi"';
    const priorManaged = MISE_TASKS_TOML.split("# managed by @defold-typescript\n")
      .filter((block) => !added.some((header) => block.includes(header)))
      .filter((block) => block !== "")
      .map((block) => `# managed by @defold-typescript\n${block}`)
      .join("");
    for (const header of added) expect(priorManaged).not.toContain(header);

    const merged = mergeMiseToml(`${userContent}\n\n${priorManaged}`);

    for (const header of added) expect(merged).toContain(header);
    expect(merged).toContain(userContent);
    for (const header of merged.match(/\[tasks\."defold-typescript:[^"]+"\]/g) ?? []) {
      expect(merged.split(header).length - 1).toBe(1);
    }
  });

  test("a file of nothing but managed blocks re-emits them byte-identically", () => {
    // Also the parity lock on the block renderer: with nothing carried it must
    // reproduce the literal, so every assertion above still describes the file
    // a merge actually writes.
    expect(mergeMiseToml("")).toBe(MISE_TASKS_TOML);
    expect(mergeMiseToml(MISE_TASKS_TOML)).toBe(MISE_TASKS_TOML);
  });

  test("strips a stale managed block before re-appending the fresh one", () => {
    const stale = `[tasks.foo]\nrun = "echo hi"\n\n# managed by @defold-typescript\n[tasks."defold-typescript:build"]\nrun = "old"\n`;
    const merged = mergeMiseToml(stale);

    expect(merged).toContain('run = "bunx @defold-typescript/cli build"');
    expect(merged).not.toContain('run = "old"');
    expect(merged).toContain('[tasks.foo]\nrun = "echo hi"');
  });
});

describe("mergeMiseToml (keys added inside a managed block)", () => {
  // Blocks are blank-line separated, so the one holding a header is its slice.
  const blockFor = (text: string, header: string) =>
    text.split("\n\n").find((block) => block.includes(header)) ?? "";

  const BUILD = '[tasks."defold-typescript:build"]';
  const RESOLVE = '[tasks."defold-typescript:resolve"]';

  const onDisk = (header: string, ...added: string[]) =>
    [
      "# managed by @defold-typescript",
      header,
      'description = "stale"',
      'run = "old"',
      ...added,
      "",
    ].join("\n");

  test("carries an added key across a refresh while the managed keys still overwrite", () => {
    const merged = mergeMiseToml(onDisk(BUILD, 'alias = "b"', 'depends = ["setup"]'));
    const block = blockFor(merged, BUILD);

    expect(block).toContain('run = "bunx @defold-typescript/cli build"');
    expect(block).toContain(
      'description = "Build the TypeScript sources with the defold-typescript CLI"',
    );
    expect(merged).not.toContain('run = "old"');
    expect(merged).not.toContain('description = "stale"');
    expect(block).toContain('alias = "b"');
    expect(block).toContain('depends = ["setup"]');
  });

  test("is idempotent with carried keys: a second merge changes nothing", () => {
    const once = mergeMiseToml(onDisk(BUILD, 'alias = "b"'));
    expect(mergeMiseToml(once)).toBe(once);
  });

  test("carries keys even when the file holds no user content at all", () => {
    // The old merge short-circuited on empty user content and returned the
    // canonical block, dropping additions a managed-blocks-only file carried.
    expect(mergeMiseToml(onDisk(BUILD, 'alias = "b"'))).toContain('alias = "b"');
  });

  test("carries a comment of your own without duplicating one the scaffold emits", () => {
    const scaffoldComment =
      "# watch runs this automatically on every game.project change; run it manually for a one-off resolve";
    const merged = mergeMiseToml(
      onDisk(RESOLVE, scaffoldComment, "# ours: run before every playtest", 'alias = "r"'),
    );
    const block = blockFor(merged, RESOLVE);

    expect(block).toContain("# ours: run before every playtest");
    expect(block.split(scaffoldComment).length - 1).toBe(1);
    expect(block).toContain('alias = "r"');
  });

  test("follows a hand-edited multi-line run to its close instead of stranding its tail", () => {
    const merged = mergeMiseToml(
      [
        "# managed by @defold-typescript",
        BUILD,
        "run = [",
        '  "echo before # not a comment",',
        '  "bunx @defold-typescript/cli build",',
        "]",
        'alias = "b"',
        "",
      ].join("\n"),
    );
    const block = blockFor(merged, BUILD);

    expect(block).toContain('run = "bunx @defold-typescript/cli build"');
    expect(block).not.toContain("echo before");
    expect(block).not.toContain("run = [");
    expect(block.split("\n")).not.toContain("]");
    expect(block).toContain('alias = "b"');
  });

  test("follows a triple-quoted run to its close", () => {
    const merged = mergeMiseToml(
      [
        "# managed by @defold-typescript",
        BUILD,
        'run = """',
        "#!/usr/bin/env bash",
        "echo building",
        '"""',
        'alias = "b"',
        "",
      ].join("\n"),
    );
    const block = blockFor(merged, BUILD);

    expect(block).toContain('run = "bunx @defold-typescript/cli build"');
    expect(block).not.toContain("echo building");
    expect(block).not.toContain("#!/usr/bin/env bash");
    expect(block).toContain('alias = "b"');
  });

  test("a block for a task the scaffold no longer emits retires with its additions", () => {
    const merged = mergeMiseToml(
      [
        "# managed by @defold-typescript",
        '[tasks."defold-typescript:retired"]',
        'run = "gone"',
        'alias = "x"',
        "",
        '[tasks.foo]\nrun = "echo hi"',
      ].join("\n"),
    );

    expect(merged).not.toContain("defold-typescript:retired");
    expect(merged).not.toContain('alias = "x"');
    expect(merged).toContain('[tasks.foo]\nrun = "echo hi"');
  });

  test("carries additions while user content outside the blocks stays byte-identical", () => {
    const userContent = '[tools]\nbun = "1.3"\n\n[tasks.foo]\nrun = "echo hi"';
    const merged = mergeMiseToml(`${userContent}\n\n${onDisk(BUILD, 'alias = "b"')}`);

    expect(merged).toContain(userContent);
    expect(blockFor(merged, BUILD)).toContain('alias = "b"');
    expect(merged.match(/\[tasks\."defold-typescript:build"\]/g)?.length).toBe(1);
  });
});

describe("mergeMiseToml (blank lines inside a managed block)", () => {
  const BUILD = '[tasks."defold-typescript:build"]';
  const BUILD_TASK = "defold-typescript:build";
  const UPGRADE_TASK = "defold-typescript:upgrade";
  const CANONICAL_BUILD_RUN = "bunx @defold-typescript/cli build";

  // A key hoisted out of its task is still valid TOML, so only the parsed table
  // tree distinguishes fixed from broken — substrings cannot.
  const parse = (text: string) => Bun.TOML.parse(text) as Record<string, unknown>;
  const taskTable = (text: string, name: string) => {
    const tasks = parse(text).tasks as Record<string, Record<string, unknown>>;
    return tasks[name] ?? {};
  };

  test("a key after a blank line stays in its task instead of reaching the root", () => {
    const merged = mergeMiseToml(
      [
        "# managed by @defold-typescript",
        BUILD,
        'description = "stale"',
        'run = "old"',
        "",
        'alias = "b"',
        "",
      ].join("\n"),
    );

    expect(taskTable(merged, BUILD_TASK).alias).toBe("b");
    expect(parse(merged).alias).toBeUndefined();
    expect(taskTable(merged, BUILD_TASK).run).toBe(CANONICAL_BUILD_RUN);
    expect(mergeMiseToml(merged)).toBe(merged);
  });

  test("a multi-line run array survives an interior blank line", () => {
    const merged = mergeMiseToml(
      [
        "# managed by @defold-typescript",
        BUILD,
        "run = [",
        '  "echo one",',
        "",
        '  "echo two",',
        "]",
        'alias = "b"',
        "",
      ].join("\n"),
    );

    expect(taskTable(merged, BUILD_TASK).run).toBe(CANONICAL_BUILD_RUN);
    expect(taskTable(merged, BUILD_TASK).alias).toBe("b");
    expect(merged).not.toContain("echo one");
    expect(merged).not.toContain("echo two");
    expect(merged.split("\n")).not.toContain("]");
  });

  test("a triple-quoted run survives an interior blank line", () => {
    const merged = mergeMiseToml(
      [
        "# managed by @defold-typescript",
        BUILD,
        'run = """',
        "echo one",
        "",
        "echo two",
        '"""',
        'alias = "b"',
        "",
      ].join("\n"),
    );

    expect(taskTable(merged, BUILD_TASK).run).toBe(CANONICAL_BUILD_RUN);
    expect(taskTable(merged, BUILD_TASK).alias).toBe("b");
    expect(merged).not.toContain("echo one");
    expect(merged).not.toContain("echo two");
    expect(merged).not.toContain('"""');
  });

  test("a bracketed line inside a multi-line value is value text, not a table header", () => {
    const merged = mergeMiseToml(
      [
        "# managed by @defold-typescript",
        BUILD,
        'run = """',
        "echo start",
        "[stage] building",
        "echo done",
        '"""',
        'alias = "b"',
        "",
      ].join("\n"),
    );

    expect(taskTable(merged, BUILD_TASK).run).toBe(CANONICAL_BUILD_RUN);
    expect(taskTable(merged, BUILD_TASK).alias).toBe("b");
    expect(merged).not.toContain("[stage]");
    expect(merged).not.toContain("echo done");
  });

  test("a user table after a managed block ends the block instead of joining it", () => {
    const authored = '[tasks.foo]\nrun = "echo hi"';
    const merged = mergeMiseToml(
      [
        "# managed by @defold-typescript",
        BUILD,
        'description = "stale"',
        'run = "old"',
        authored,
        "",
      ].join("\n"),
    );

    const tasks = parse(merged).tasks as Record<string, Record<string, unknown>>;
    expect(tasks.foo?.run).toBe("echo hi");
    expect(taskTable(merged, BUILD_TASK).foo).toBeUndefined();
    expect(taskTable(merged, BUILD_TASK).run).toBe(CANONICAL_BUILD_RUN);
    expect(merged).toContain(authored);
  });

  test("a blank-separated key in the last block lands on that task, not the root", () => {
    const merged = mergeMiseToml(
      [
        "# managed by @defold-typescript",
        `[tasks."${UPGRADE_TASK}"]`,
        'description = "stale"',
        'run = "old"',
        "",
        'alias = "u"',
        "",
      ].join("\n"),
    );

    expect(taskTable(merged, UPGRADE_TASK).alias).toBe("u");
    expect(parse(merged).alias).toBeUndefined();
  });
});

describe("mergeMiseToml (TOML key syntax)", () => {
  const MARKER = "# managed by @defold-typescript";
  const BUILD = '[tasks."defold-typescript:build"]';
  const BUILD_TASK = "defold-typescript:build";
  const CANONICAL_BUILD_RUN = "bunx @defold-typescript/cli build";

  const parse = (text: string) => Bun.TOML.parse(text) as Record<string, unknown>;
  const taskTable = (text: string, name: string) => {
    const tasks = parse(text).tasks as Record<string, Record<string, unknown>>;
    return tasks[name] ?? {};
  };
  const envOf = (text: string, name: string) =>
    (taskTable(text, name).env ?? {}) as Record<string, string>;

  test("a dotted key written with spaces keeps its multi-line value on the task", () => {
    const merged = mergeMiseToml(
      [
        MARKER,
        BUILD,
        'description = "stale"',
        'run = "old"',
        'env . CONFIG = """',
        "echo start",
        "[stage] building",
        '"""',
        'alias = "b"',
        "",
      ].join("\n"),
    );

    expect(envOf(merged, BUILD_TASK).CONFIG).toContain("[stage] building");
    expect(parse(merged).env).toBeUndefined();
    expect(parse(merged).alias).toBeUndefined();
    expect(taskTable(merged, BUILD_TASK).run).toBe(CANONICAL_BUILD_RUN);
    expect(taskTable(merged, BUILD_TASK).alias).toBe("b");
    expect(mergeMiseToml(merged)).toBe(merged);
  });

  test("a quoted key segment holding a space keeps its multi-line value on the task", () => {
    const merged = mergeMiseToml(
      [
        MARKER,
        BUILD,
        'description = "stale"',
        'run = "old"',
        'env."MY VAR" = """',
        "echo start",
        "[stage] building",
        '"""',
        'alias = "b"',
        "",
      ].join("\n"),
    );

    expect(envOf(merged, BUILD_TASK)["MY VAR"]).toContain("[stage] building");
    expect(parse(merged).env).toBeUndefined();
    expect(taskTable(merged, BUILD_TASK).run).toBe(CANONICAL_BUILD_RUN);
    expect(taskTable(merged, BUILD_TASK).alias).toBe("b");
  });

  test("a managed key spelled inside a carried value stays part of that value", () => {
    const merged = mergeMiseToml(
      [
        MARKER,
        BUILD,
        'description = "stale"',
        'run = "old"',
        'env . CONFIG = """',
        'run = "not the task run"',
        '"""',
        "",
      ].join("\n"),
    );

    expect(envOf(merged, BUILD_TASK).CONFIG).toContain('run = "not the task run"');
    expect(taskTable(merged, BUILD_TASK).run).toBe(CANONICAL_BUILD_RUN);
  });

  test("a quoted spelling of a managed key refreshes instead of duplicating", () => {
    const merged = mergeMiseToml(
      [MARKER, BUILD, 'description = "stale"', '"run" = "mine"', ""].join("\n"),
    );

    expect(taskTable(merged, BUILD_TASK).run).toBe(CANONICAL_BUILD_RUN);
    expect(merged).not.toContain("mine");
  });

  test("a managed marker inside a user task's value does not split the file", () => {
    const merged = mergeMiseToml(
      [
        "[tasks.foo]",
        'run = """',
        "echo one",
        MARKER,
        "echo two",
        '"""',
        "",
        "[tasks.bar]",
        'run = "echo bar"',
        "",
        MARKER,
        BUILD,
        'description = "stale"',
        'run = "old"',
        "",
      ].join("\n"),
    );

    const tasks = parse(merged).tasks as Record<string, Record<string, unknown>>;
    expect(tasks.foo?.run).toContain(MARKER);
    expect(tasks.bar?.run).toBe("echo bar");
    expect(taskTable(merged, BUILD_TASK).run).toBe(CANONICAL_BUILD_RUN);
    expect(merged.match(/\[tasks\."defold-typescript:build"\]/g)?.length).toBe(1);
    expect(merged.match(/# managed by @defold-typescript/g)?.length).toBe(
      (MISE_TASKS_TOML.match(/# managed by @defold-typescript/g)?.length ?? 0) + 1,
    );
  });

  test("a comment is carried rather than read as an assignment", () => {
    const merged = mergeMiseToml(
      [
        MARKER,
        BUILD,
        'description = "stale"',
        'run = "old"',
        '# note: """ below',
        'alias = "b"',
        "",
      ].join("\n"),
    );

    expect(taskTable(merged, BUILD_TASK).alias).toBe("b");
    expect(taskTable(merged, BUILD_TASK).run).toBe(CANONICAL_BUILD_RUN);
    expect(merged).toContain('# note: """ below');
  });

  test("an escaped spelling of a managed key refreshes instead of duplicating", () => {
    const merged = mergeMiseToml(
      [
        MARKER,
        BUILD,
        'description = "stale"',
        'run = "old"',
        '"r\\u0075n" = "mine"',
        '"d\\U00000065scription" = "theirs"',
        "",
      ].join("\n"),
    );

    expect(taskTable(merged, BUILD_TASK).run).toBe(CANONICAL_BUILD_RUN);
    expect(taskTable(merged, BUILD_TASK).description).toBe(
      "Build the TypeScript sources with the defold-typescript CLI",
    );
    // `Bun.TOML` does not decode the 8-digit form, so only the emitted text can
    // prove the `\U` key was recognized rather than carried beside the canonical
    // one.
    expect(merged).not.toContain("mine");
    expect(merged).not.toContain("theirs");
    expect(mergeMiseToml(merged)).toBe(merged);
  });

  test("a control escape is not a managed key", () => {
    const CR_KEY = "\r" + "un";
    const merged = mergeMiseToml(
      [MARKER, BUILD, 'description = "stale"', 'run = "old"', '"\\run" = "mine"', ""].join("\n"),
    );

    expect(taskTable(merged, BUILD_TASK).run).toBe(CANONICAL_BUILD_RUN);
    expect(taskTable(merged, BUILD_TASK)[CR_KEY]).toBe("mine");
    expect(merged).toContain('"\\run" = "mine"');
    expect(mergeMiseToml(merged)).toBe(merged);
  });
});
