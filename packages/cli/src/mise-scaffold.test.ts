import { describe, expect, test } from "bun:test";
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
