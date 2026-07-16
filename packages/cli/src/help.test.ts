import { describe, expect, test } from "bun:test";
import { COMMAND_NAMES, renderHelp, renderHelpJson } from "./help";

describe("renderHelp", () => {
  test("top-level help lists usage, every command, and the global flags", () => {
    const text = renderHelp(null);

    expect(text).toContain("bunx @defold-typescript/cli");
    expect(text).not.toContain("Usage: defold-typescript ");
    for (const name of COMMAND_NAMES) {
      expect(text).toContain(name);
    }
    expect(text).toContain("--json");
    expect(text).toContain("--version");
    expect(text).toContain("--help");
    expect(text.endsWith("\n")).toBe(true);
  });

  test("command help shows the command, a usage line, and its flags only", () => {
    const text = renderHelp("build");

    expect(text).toContain("build");
    expect(text).toContain("Usage:");
    expect(text).toContain("--defold-target");
    expect(text).not.toContain("--defold-version");
    expect(text).not.toContain("--channel");
    expect(text).not.toContain("init-agents");
    expect(text).not.toContain("setup-debug");
    expect(text.endsWith("\n")).toBe(true);
  });

  test("watch and resolve help name --defold-target, not the removed flags", () => {
    for (const subject of ["watch", "resolve"]) {
      const text = renderHelp(subject);
      expect(text).toContain("--defold-target");
      expect(text).not.toContain("--defold-version");
      expect(text).not.toContain("--channel");
    }
  });

  test("the headless build command is named bob, not defold", () => {
    const top = renderHelp(null);
    expect(top).toContain("bob");
    expect(top).not.toContain(" defold ");
    expect(COMMAND_NAMES.has("bob")).toBe(true);
    expect(COMMAND_NAMES.has("defold")).toBe(false);

    const text = renderHelp("bob");
    expect(text).toContain("bob");
    expect(text).toContain("Usage:");
    expect(text).toContain("--defold-target");
    expect(text).toContain("run");
    expect(text.endsWith("\n")).toBe(true);
  });

  test("init help names both the new-project and existing-project role", () => {
    const text = renderHelp("init");

    expect(text).toContain("existing");
    expect(text).toContain("new");
  });

  test("init-agents help drops the no-op --force flag", () => {
    const text = renderHelp("init-agents");

    expect(text).not.toContain("--force");
  });

  test("top-level help lists upgrade with a summary", () => {
    const text = renderHelp(null);

    expect(COMMAND_NAMES.has("upgrade")).toBe(true);
    expect(text).toMatch(/^ {2}upgrade {2,}\S/m);
  });

  test("upgrade help explains that it resolves the latest CLI and hands off when behind", () => {
    const text = renderHelp("upgrade");

    expect(text).toContain("Usage:");
    expect(text).toContain("bunx @defold-typescript/cli upgrade");
    expect(text).toContain("latest");
    expect(text).toContain("hands off");
    expect(text.endsWith("\n")).toBe(true);
  });

  test("update is an alias, never listed as a second command", () => {
    expect(COMMAND_NAMES.has("update")).toBe(false);
    expect(renderHelp(null)).not.toMatch(/^ {2}update\b/m);
  });

  test("init --force reads as an in-place re-scaffold, not a blind overwrite", () => {
    const text = renderHelp("init");

    expect(text).toContain("re-scaffolds in place");
    expect(text).not.toContain("overwrite existing scaffolding files");
  });

  test("top-level help lists set-target", () => {
    const text = renderHelp(null);

    expect(COMMAND_NAMES.has("set-target")).toBe(true);
    expect(text).toMatch(/^ {2}set-target {2,}\S/m);
  });

  test("set-target help names --detected and its --detect synonym", () => {
    const text = renderHelp("set-target");

    expect(text).toContain("Usage:");
    expect(text).toContain("set-target");
    expect(text).toContain("--detected");
    expect(text).toContain("--detect");
    expect(text.endsWith("\n")).toBe(true);
  });
});

describe("renderHelpJson", () => {
  test("top-level JSON reports command help and a commands array", () => {
    const text = renderHelpJson(null);

    expect(text.endsWith("\n")).toBe(true);
    expect(text.slice(0, -1).endsWith("\n")).toBe(false);
    const parsed = JSON.parse(text);
    expect(parsed.command).toBe("help");
    expect(parsed.ok).toBe(true);
    expect(Array.isArray(parsed.commands)).toBe(true);
    expect(parsed.commands.some((c: { name: string }) => c.name === "build")).toBe(true);
  });

  test("command JSON carries the subject, a usage string, and a flags array", () => {
    const text = renderHelpJson("build");

    const parsed = JSON.parse(text);
    expect(parsed.command).toBe("help");
    expect(parsed.ok).toBe(true);
    expect(parsed.subject).toBe("build");
    expect(typeof parsed.usage).toBe("string");
    expect(Array.isArray(parsed.flags)).toBe(true);
  });

  test("init command summary in top-level JSON names both roles", () => {
    const parsed = JSON.parse(renderHelpJson(null));
    const init = parsed.commands.find((c: { name: string }) => c.name === "init");

    expect(init.summary).toContain("existing");
    expect(init.summary).toContain("new");
  });

  test("init-agents JSON flags carry no --force entry", () => {
    const parsed = JSON.parse(renderHelpJson("init-agents"));

    expect(parsed.flags.some((f: { flag: string }) => f.flag.startsWith("--force"))).toBe(false);
  });

  test("the commands array carries upgrade and no update alias entry", () => {
    const parsed = JSON.parse(renderHelpJson(null));
    const names = parsed.commands.map((c: { name: string }) => c.name);

    expect(names).toContain("upgrade");
    expect(names).not.toContain("update");
    const upgrade = parsed.commands.find((c: { name: string }) => c.name === "upgrade");
    expect(upgrade.summary.length).toBeGreaterThan(0);
  });

  test("upgrade JSON carries the subject and its usage", () => {
    const parsed = JSON.parse(renderHelpJson("upgrade"));

    expect(parsed.subject).toBe("upgrade");
    expect(parsed.usage).toContain("upgrade");
    expect(Array.isArray(parsed.flags)).toBe(true);
  });

  // Prose and JSON help describe one CLI; a reword that lands in only one of them
  // is drift an agent reading `--json` would never see.
  test("init --force JSON flag text matches the prose re-scaffold wording", () => {
    const parsed = JSON.parse(renderHelpJson("init"));
    const force = parsed.flags.find((f: { flag: string }) => f.flag === "--force");

    expect(force.desc).toContain("re-scaffolds in place");
    expect(renderHelp("init")).toContain(force.desc);
  });
});
