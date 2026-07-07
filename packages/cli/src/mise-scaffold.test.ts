import { describe, expect, test } from "bun:test";
import { MISE_TASKS_TOML, mergeMiseToml } from "./mise-scaffold";

describe("MISE_TASKS_TOML", () => {
  test("declares the six quoted namespaced task headers", () => {
    expect(MISE_TASKS_TOML).toContain('[tasks."defold-typescript:build"]');
    expect(MISE_TASKS_TOML).toContain('[tasks."defold-typescript:watch"]');
    expect(MISE_TASKS_TOML).toContain('[tasks."defold-typescript:resolve"]');
    expect(MISE_TASKS_TOML).toContain('[tasks."defold-typescript:upgrade"]');
    expect(MISE_TASKS_TOML).toContain('[tasks."defold-typescript:setup-debug"]');
    expect(MISE_TASKS_TOML).toContain('[tasks."defold-typescript:init-agents"]');
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

  test("upgrade is the two-command @latest init --force then bun install array", () => {
    expect(MISE_TASKS_TOML).toContain(
      'run = ["bunx @defold-typescript/cli@latest init . --force --suppress-install-reminder", "bun install"]',
    );
  });

  test("each managed task is fronted by the managed marker", () => {
    const markers = MISE_TASKS_TOML.match(/# managed by @defold-typescript/g) ?? [];
    expect(markers.length).toBe(6);
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
    expect(merged).toContain(
      'run = ["bunx @defold-typescript/cli@latest init . --force --suppress-install-reminder", "bun install"]',
    );
    expect(merged).not.toContain("@latest init --force");
    expect(merged).toContain('node = "22"');
    expect(merged).toContain('[tasks."my-custom-task"]\nrun = "echo hello"');

    const markers = merged.match(/# managed by @defold-typescript/g) ?? [];
    expect(markers.length).toBe(6);
  });

  test("strips a stale managed block before re-appending the fresh one", () => {
    const stale = `[tasks.foo]\nrun = "echo hi"\n\n# managed by @defold-typescript\n[tasks."defold-typescript:build"]\nrun = "old"\n`;
    const merged = mergeMiseToml(stale);

    expect(merged).toContain('run = "bunx @defold-typescript/cli build"');
    expect(merged).not.toContain('run = "old"');
    expect(merged).toContain('[tasks.foo]\nrun = "echo hi"');
  });
});
