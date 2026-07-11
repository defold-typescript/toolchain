import { describe, expect, test } from "bun:test";
import { COMMAND_NAMES, renderHelp, renderHelpJson } from "./help";

describe("renderHelp", () => {
  test("top-level help lists usage, every command, and the global flags", () => {
    const text = renderHelp(null);

    expect(text).toContain("Usage: defold-typescript");
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
    expect(text).toContain("--defold-version");
    expect(text).not.toContain("init-agents");
    expect(text).not.toContain("setup-debug");
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
});
