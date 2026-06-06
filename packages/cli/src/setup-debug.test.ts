import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  addLldebuggerDependency,
  BOOTSTRAP_MARKER,
  findEntryScriptCandidates,
  injectDebugBootstrap,
  LLDEBUGGER_URL,
  runSetupDebug,
} from "./setup-debug";

function tempProject(): string {
  return mkdtempSync(path.join(os.tmpdir(), "defold-typescript-setup-debug-"));
}

const FACTORY_SCRIPT = `import { defineScript } from "@defold-typescript/types";

export default defineScript({
  init() {},
});
`;

describe("addLldebuggerDependency", () => {
  test("inserts dependencies#0 when none exist", () => {
    const text = "[project]\ntitle = demo\nmain_collection = /main/main.collectionc\n";
    const out = addLldebuggerDependency(text);
    expect(out).toContain(`dependencies#0 = ${LLDEBUGGER_URL}`);
    expect(out).toContain("title = demo");
  });

  test("appends at the next free index, preserving the existing entry", () => {
    const existing = "https://example.com/other.zip";
    const text = `[project]\ntitle = demo\ndependencies#0 = ${existing}\n`;
    const out = addLldebuggerDependency(text);
    expect(out).toContain(`dependencies#0 = ${existing}`);
    expect(out).toContain(`dependencies#1 = ${LLDEBUGGER_URL}`);
  });

  test("is idempotent when the URL is already present at any index", () => {
    const text = `[project]\ntitle = demo\ndependencies#3 = ${LLDEBUGGER_URL}\n`;
    expect(addLldebuggerDependency(text)).toBe(text);
  });

  test("inserts within [project] when other sections follow", () => {
    const text = "[project]\ntitle = demo\n\n[display]\nwidth = 960\n";
    const out = addLldebuggerDependency(text);
    const depIndex = out.indexOf("dependencies#0");
    const displayIndex = out.indexOf("[display]");
    expect(depIndex).toBeGreaterThan(-1);
    expect(depIndex).toBeLessThan(displayIndex);
  });

  test("throws when there is no [project] section", () => {
    expect(() => addLldebuggerDependency("[display]\nwidth = 960\n")).toThrow(
      /not a Defold project/i,
    );
  });
});

describe("injectDebugBootstrap", () => {
  test("prepends the ambient module, import, and gated start behind a marker", () => {
    const out = injectDebugBootstrap(FACTORY_SCRIPT);
    expect(out.startsWith(BOOTSTRAP_MARKER)).toBe(true);
    expect(out).toContain('declare module "lldebugger.debug"');
    expect(out).toContain('import * as lldebugger from "lldebugger.debug";');
    expect(out).toContain("if (sys.get_engine_info().is_debug)");
    expect(out).toContain("lldebugger.start();");
    expect(out).toContain(FACTORY_SCRIPT);
  });

  test("mirrors the bootstrap snippet in the debugging guide exactly", () => {
    const guide = readFileSync(
      path.join(__dirname, "..", "..", "..", "docs", "guide", "debugging.md"),
      "utf8",
    );
    const out = injectDebugBootstrap("");
    for (const line of [
      "/** @noResolution */",
      'declare module "lldebugger.debug" {',
      "export function start(): void;",
      'import * as lldebugger from "lldebugger.debug";',
      "if (sys.get_engine_info().is_debug) {",
      "lldebugger.start();",
    ]) {
      expect(guide).toContain(line);
      expect(out).toContain(line);
    }
  });

  test("is idempotent when the marker is already present", () => {
    const once = injectDebugBootstrap(FACTORY_SCRIPT);
    expect(injectDebugBootstrap(once)).toBe(once);
  });
});

describe("findEntryScriptCandidates", () => {
  test("returns src files with a lifecycle factory call, sorted", () => {
    const cwd = tempProject();
    try {
      mkdirSync(path.join(cwd, "src", "nested"), { recursive: true });
      writeFileSync(path.join(cwd, "src", "player.ts"), FACTORY_SCRIPT);
      writeFileSync(
        path.join(cwd, "src", "nested", "hud.ts"),
        'import { defineGuiScript } from "@defold-typescript/types";\nexport default defineGuiScript({});\n',
      );
      writeFileSync(path.join(cwd, "src", "util.ts"), "export const x = 1;\n");
      const candidates = findEntryScriptCandidates(cwd);
      expect(candidates).toEqual(["src/nested/hud.ts", "src/player.ts"]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("returns [] when no factory call is present", () => {
    const cwd = tempProject();
    try {
      mkdirSync(path.join(cwd, "src"), { recursive: true });
      writeFileSync(path.join(cwd, "src", "util.ts"), "export const x = 1;\n");
      expect(findEntryScriptCandidates(cwd)).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("skips generated and ignored directories", () => {
    const cwd = tempProject();
    try {
      mkdirSync(path.join(cwd, "src"), { recursive: true });
      mkdirSync(path.join(cwd, "build"), { recursive: true });
      writeFileSync(path.join(cwd, "src", "player.ts"), FACTORY_SCRIPT);
      writeFileSync(path.join(cwd, "build", "player.ts"), FACTORY_SCRIPT);
      expect(findEntryScriptCandidates(cwd)).toEqual(["src/player.ts"]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

function writeBaseProject(cwd: string): void {
  writeFileSync(path.join(cwd, "game.project"), "[project]\ntitle = demo\n");
  mkdirSync(path.join(cwd, "src"), { recursive: true });
}

describe("runSetupDebug", () => {
  test("auto-selects the sole candidate, injects, and rewrites game.project", async () => {
    const cwd = tempProject();
    try {
      writeBaseProject(cwd);
      writeFileSync(path.join(cwd, "src", "player.ts"), FACTORY_SCRIPT);
      let chooserCalled = false;
      const result = await runSetupDebug({
        cwd,
        chooseScript: async () => {
          chooserCalled = true;
          return "unused";
        },
      });
      expect(result.ok).toBe(true);
      expect(chooserCalled).toBe(false);
      expect(result.written).toContain("src/player.ts");
      expect(result.written).toContain("game.project");
      expect(readFileSync(path.join(cwd, "src", "player.ts"), "utf8")).toContain(BOOTSTRAP_MARKER);
      expect(readFileSync(path.join(cwd, "game.project"), "utf8")).toContain(LLDEBUGGER_URL);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("uses the explicit --script path without invoking the chooser", async () => {
    const cwd = tempProject();
    try {
      writeBaseProject(cwd);
      writeFileSync(path.join(cwd, "src", "player.ts"), FACTORY_SCRIPT);
      writeFileSync(path.join(cwd, "src", "hud.ts"), FACTORY_SCRIPT);
      let chooserCalled = false;
      const result = await runSetupDebug({
        cwd,
        script: "src/hud.ts",
        chooseScript: async () => {
          chooserCalled = true;
          return "unused";
        },
      });
      expect(result.ok).toBe(true);
      expect(chooserCalled).toBe(false);
      expect(result.written).toContain("src/hud.ts");
      expect(readFileSync(path.join(cwd, "src", "hud.ts"), "utf8")).toContain(BOOTSTRAP_MARKER);
      expect(readFileSync(path.join(cwd, "src", "player.ts"), "utf8")).not.toContain(
        BOOTSTRAP_MARKER,
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("uses the injected chooser's pick with multiple candidates", async () => {
    const cwd = tempProject();
    try {
      writeBaseProject(cwd);
      writeFileSync(path.join(cwd, "src", "player.ts"), FACTORY_SCRIPT);
      writeFileSync(path.join(cwd, "src", "hud.ts"), FACTORY_SCRIPT);
      const result = await runSetupDebug({
        cwd,
        chooseScript: async (candidates) => {
          expect(candidates).toEqual(["src/hud.ts", "src/player.ts"]);
          return "src/player.ts";
        },
      });
      expect(result.ok).toBe(true);
      expect(result.written).toContain("src/player.ts");
      expect(readFileSync(path.join(cwd, "src", "player.ts"), "utf8")).toContain(BOOTSTRAP_MARKER);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("errors and mutates nothing with multiple candidates and no chooser", async () => {
    const cwd = tempProject();
    try {
      writeBaseProject(cwd);
      writeFileSync(path.join(cwd, "src", "player.ts"), FACTORY_SCRIPT);
      writeFileSync(path.join(cwd, "src", "hud.ts"), FACTORY_SCRIPT);
      const result = await runSetupDebug({ cwd, json: true });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("src/hud.ts");
      expect(result.error).toContain("src/player.ts");
      expect(readFileSync(path.join(cwd, "src", "player.ts"), "utf8")).not.toContain(
        BOOTSTRAP_MARKER,
      );
      expect(readFileSync(path.join(cwd, "game.project"), "utf8")).not.toContain(LLDEBUGGER_URL);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("errors when there is no game.project", async () => {
    const cwd = tempProject();
    try {
      mkdirSync(path.join(cwd, "src"), { recursive: true });
      writeFileSync(path.join(cwd, "src", "player.ts"), FACTORY_SCRIPT);
      const result = await runSetupDebug({ cwd });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/not a Defold project|game\.project/i);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("errors when no entry script is found", async () => {
    const cwd = tempProject();
    try {
      writeBaseProject(cwd);
      const result = await runSetupDebug({ cwd });
      expect(result.ok).toBe(false);
      expect(existsSync(path.join(cwd, "game.project"))).toBe(true);
      expect(readFileSync(path.join(cwd, "game.project"), "utf8")).not.toContain(LLDEBUGGER_URL);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("reports manual steps that remain after wiring", async () => {
    const cwd = tempProject();
    try {
      writeBaseProject(cwd);
      writeFileSync(path.join(cwd, "src", "player.ts"), FACTORY_SCRIPT);
      const result = await runSetupDebug({ cwd });
      expect(result.manualSteps.length).toBeGreaterThan(0);
      expect(result.manualSteps.join("\n")).toMatch(/Fetch Libraries/i);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
