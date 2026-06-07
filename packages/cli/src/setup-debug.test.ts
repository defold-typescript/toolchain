import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  AMBIENT_DECLARATION,
  AMBIENT_DTS_REL,
  addLldebuggerDependency,
  BLOCK_BEGIN,
  BLOCK_END,
  findEntryScriptCandidates,
  injectDebugBootstrap,
  LEGACY_BOOTSTRAP_MARKER,
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

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
const TYPES_PKG = path.join(REPO_ROOT, "packages", "types");
const BIN_DIR = path.join(REPO_ROOT, "node_modules", ".bin");

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

describe("AMBIENT_DECLARATION", () => {
  test("carries @noResolution and the start signature, no inline import or gate", () => {
    expect(AMBIENT_DECLARATION).toContain("/** @noResolution */");
    expect(AMBIENT_DECLARATION).toContain('declare module "lldebugger.debug" {');
    expect(AMBIENT_DECLARATION).toContain("export function start(): void;");
    expect(AMBIENT_DECLARATION).not.toContain("import * as lldebugger");
    expect(AMBIENT_DECLARATION).not.toContain("is_debug");
  });
});

describe("injectDebugBootstrap (managed BEGIN/END block)", () => {
  test("wraps the import and gated start in sentinels, no declare module", () => {
    const out = injectDebugBootstrap(FACTORY_SCRIPT);
    expect(out.startsWith(BLOCK_BEGIN)).toBe(true);
    expect(out).toContain(BLOCK_BEGIN);
    expect(out).toContain(BLOCK_END);
    expect(out).toContain('import * as lldebugger from "lldebugger.debug";');
    expect(out).toContain("if (sys.get_engine_info().is_debug) {");
    expect(out).toContain("lldebugger.start();");
    expect(out).not.toContain('declare module "lldebugger.debug"');
    expect(out).toContain(FACTORY_SCRIPT);
  });

  test("separates the END sentinel from following code with a blank line", () => {
    // Biome's no-blank-line-before-statement rule flags an import that
    // immediately follows the END line comment; FACTORY_SCRIPT opens with an
    // import, so a fresh inject must leave a blank line between them.
    const out = injectDebugBootstrap(FACTORY_SCRIPT);
    expect(out).toContain(`${BLOCK_END}\n\nimport`);
  });

  test("no-op when the enclosed text is already canonical", () => {
    const once = injectDebugBootstrap(FACTORY_SCRIPT);
    expect(injectDebugBootstrap(once)).toBe(once);
  });

  test("refreshes a drifted block, preserving lines outside the sentinels", () => {
    const drifted = `${BLOCK_BEGIN}
import * as lldebugger from "lldebugger.debug";
// hand-edited stale wording
lldebugger.start();
${BLOCK_END}
${FACTORY_SCRIPT}`;
    const out = injectDebugBootstrap(drifted);
    expect(out).not.toContain("hand-edited stale wording");
    expect(out).toContain("if (sys.get_engine_info().is_debug) {");
    expect(out).toContain(FACTORY_SCRIPT);
    // exactly one managed block remains
    expect(out.split(BLOCK_BEGIN).length - 1).toBe(1);
    expect(out.split(BLOCK_END).length - 1).toBe(1);
    // a second pass is now a no-op
    expect(injectDebugBootstrap(out)).toBe(out);
  });

  test("upgrades a legacy single-marker block in place to exactly one managed block", () => {
    const legacy = `${LEGACY_BOOTSTRAP_MARKER}
/** @noResolution */
declare module "lldebugger.debug" {
  export function start(): void;
}

import * as lldebugger from "lldebugger.debug";

if (sys.get_engine_info().is_debug) {
  lldebugger.start();
}

${FACTORY_SCRIPT}`;
    const out = injectDebugBootstrap(legacy);
    expect(out).not.toContain(LEGACY_BOOTSTRAP_MARKER);
    expect(out).not.toContain('declare module "lldebugger.debug"');
    expect(out.split(BLOCK_BEGIN).length - 1).toBe(1);
    expect(out.split(BLOCK_END).length - 1).toBe(1);
    expect(out).toContain(FACTORY_SCRIPT);
    expect(injectDebugBootstrap(out)).toBe(out);
  });

  test("refuses a BEGIN with no END", () => {
    const broken = `${BLOCK_BEGIN}\nimport * as lldebugger from "lldebugger.debug";\n${FACTORY_SCRIPT}`;
    expect(() => injectDebugBootstrap(broken)).toThrow(/malformed/i);
  });

  test("refuses an END with no BEGIN", () => {
    const broken = `${BLOCK_END}\n${FACTORY_SCRIPT}`;
    expect(() => injectDebugBootstrap(broken)).toThrow(/malformed/i);
  });

  test("refuses out-of-order sentinels", () => {
    const broken = `${BLOCK_END}\nstuff\n${BLOCK_BEGIN}\n${FACTORY_SCRIPT}`;
    expect(() => injectDebugBootstrap(broken)).toThrow(/malformed/i);
  });

  test("refuses duplicate blocks", () => {
    const dup = `${BLOCK_BEGIN}\na\n${BLOCK_END}\n${BLOCK_BEGIN}\nb\n${BLOCK_END}\n`;
    expect(() => injectDebugBootstrap(dup)).toThrow(/malformed/i);
  });

  test("mirrors the bootstrap snippet in the debugging guide exactly", () => {
    const guide = readFileSync(
      path.join(__dirname, "..", "..", "..", "docs", "guide", "debugging.md"),
      "utf8",
    );
    // Every line the tool emits (ambient declaration + managed block) appears
    // in the guide. Checked line-by-line because the guide nests the fenced
    // code under a numbered list, indenting each line.
    const emitted = [
      ...AMBIENT_DECLARATION.split("\n"),
      ...injectDebugBootstrap("").split("\n"),
    ].filter((line) => line.trim() !== "");
    for (const line of emitted) {
      expect(guide).toContain(line.trim());
    }
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

  test("normalizes Windows-shaped scan results before reading and reporting candidates", () => {
    const cwd = tempProject();
    try {
      mkdirSync(path.join(cwd, "src"), { recursive: true });
      writeFileSync(path.join(cwd, "src", "player.ts"), FACTORY_SCRIPT);
      expect(findEntryScriptCandidates(cwd, () => ["src\\player.ts"])).toEqual(["src/player.ts"]);
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
  test("writes the ambient .d.ts, the managed block, and game.project", async () => {
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
      expect(result.written).toContain(AMBIENT_DTS_REL);
      expect(result.written).toContain("game.project");
      expect(result.actions[AMBIENT_DTS_REL]).toBe("injected");
      expect(result.actions["src/player.ts"]).toBe("injected");

      const script = readFileSync(path.join(cwd, "src", "player.ts"), "utf8");
      expect(script).toContain(BLOCK_BEGIN);
      expect(script).not.toContain('declare module "lldebugger.debug"');
      const dts = readFileSync(path.join(cwd, AMBIENT_DTS_REL), "utf8");
      expect(dts).toContain("/** @noResolution */");
      expect(dts).toContain("export function start(): void;");
      expect(readFileSync(path.join(cwd, "game.project"), "utf8")).toContain(LLDEBUGGER_URL);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("a clean re-run is a no-op (no duplicate block or dependency)", async () => {
    const cwd = tempProject();
    try {
      writeBaseProject(cwd);
      writeFileSync(path.join(cwd, "src", "player.ts"), FACTORY_SCRIPT);
      await runSetupDebug({ cwd });
      const result = await runSetupDebug({ cwd });
      expect(result.ok).toBe(true);
      expect(result.actions["src/player.ts"]).toBe("unchanged");
      expect(result.actions[AMBIENT_DTS_REL]).toBe("unchanged");
      const script = readFileSync(path.join(cwd, "src", "player.ts"), "utf8");
      expect(script.split(BLOCK_BEGIN).length - 1).toBe(1);
      const game = readFileSync(path.join(cwd, "game.project"), "utf8");
      expect(game.split(LLDEBUGGER_URL).length - 1).toBe(1);
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
      expect(readFileSync(path.join(cwd, "src", "hud.ts"), "utf8")).toContain(BLOCK_BEGIN);
      expect(readFileSync(path.join(cwd, "src", "player.ts"), "utf8")).not.toContain(BLOCK_BEGIN);
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
      expect(readFileSync(path.join(cwd, "src", "player.ts"), "utf8")).toContain(BLOCK_BEGIN);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("uses normalized scan candidates for setup-debug reports", async () => {
    const cwd = tempProject();
    try {
      writeBaseProject(cwd);
      writeFileSync(path.join(cwd, "src", "player.ts"), FACTORY_SCRIPT);
      const result = await runSetupDebug({ cwd, scanFiles: () => ["src\\player.ts"] });
      expect(result.ok).toBe(true);
      expect(result.addedTo).toBe("src/player.ts");
      expect(result.written).toContain("src/player.ts");
      expect(readFileSync(path.join(cwd, "src", "player.ts"), "utf8")).toContain(BLOCK_BEGIN);
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
      expect(readFileSync(path.join(cwd, "src", "player.ts"), "utf8")).not.toContain(BLOCK_BEGIN);
      expect(readFileSync(path.join(cwd, "game.project"), "utf8")).not.toContain(LLDEBUGGER_URL);
      expect(existsSync(path.join(cwd, AMBIENT_DTS_REL))).toBe(false);
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

// An embedded game object whose escaped `data:` string names a `.ts.script`
// component, mirroring the platformer's `player.collection` shape.
function embeddedScript(id: string, component: string): string {
  return `embedded_instances {
  id: "${id}"
  data: "components {\\n"
  "  component: \\"${component}\\"\\n"
  "}\\n"
  ""
}
`;
}

// Boot project: `[project]` (so the dependency edit is legal) + a `[bootstrap]`
// `main_collection` whose `main.collection` embeds each `{ id, src }` as a
// `.ts.script` component; the matching `src/*.ts` factory files are written too.
function writeBootProject(cwd: string, scripts: { id: string; src: string }[]): void {
  writeFileSync(
    path.join(cwd, "game.project"),
    "[project]\ntitle = demo\n\n[bootstrap]\nmain_collection = /main.collectionc\n",
  );
  const blocks = scripts
    .map((s) => embeddedScript(s.id, `/${s.src.replace(/\.ts$/, ".ts.script")}`))
    .join("\n");
  writeFileSync(path.join(cwd, "main.collection"), `name: "main"\n${blocks}`);
  for (const s of scripts) {
    const abs = path.join(cwd, s.src);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, FACTORY_SCRIPT);
  }
}

describe("runSetupDebug boot-path selection", () => {
  test("auto-picks the sole boot-path script over an off-path factory file", async () => {
    const cwd = tempProject();
    try {
      writeBootProject(cwd, [{ id: "player", src: "src/player.ts" }]);
      writeFileSync(path.join(cwd, "src", "decoy.ts"), FACTORY_SCRIPT);
      const result = await runSetupDebug({
        cwd,
        chooseScript: async () => {
          throw new Error("chooser must not run for a single boot-path candidate");
        },
      });
      expect(result.ok).toBe(true);
      expect(result.addedTo).toBe("src/player.ts");
      expect(result.bootPath).toEqual([
        "game.project",
        "main.collection",
        "player",
        "/src/player.ts.script",
      ]);
      expect(readFileSync(path.join(cwd, "src", "player.ts"), "utf8")).toContain(BLOCK_BEGIN);
      expect(readFileSync(path.join(cwd, "src", "decoy.ts"), "utf8")).not.toContain(BLOCK_BEGIN);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("several boot-path candidates use the injected chooser", async () => {
    const cwd = tempProject();
    try {
      writeBootProject(cwd, [
        { id: "player", src: "src/player.ts" },
        { id: "hud", src: "src/hud.ts" },
      ]);
      const result = await runSetupDebug({
        cwd,
        chooseScript: async (candidates) => {
          expect([...candidates].sort()).toEqual(["src/hud.ts", "src/player.ts"]);
          return "src/player.ts";
        },
      });
      expect(result.ok).toBe(true);
      expect(result.addedTo).toBe("src/player.ts");
      expect(result.bootPath?.[result.bootPath.length - 1]).toBe("/src/player.ts.script");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("several boot-path candidates with --json error without mutating", async () => {
    const cwd = tempProject();
    try {
      writeBootProject(cwd, [
        { id: "player", src: "src/player.ts" },
        { id: "hud", src: "src/hud.ts" },
      ]);
      const result = await runSetupDebug({ cwd, json: true });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("src/hud.ts");
      expect(result.error).toContain("src/player.ts");
      expect(readFileSync(path.join(cwd, "src", "player.ts"), "utf8")).not.toContain(BLOCK_BEGIN);
      expect(existsSync(path.join(cwd, AMBIENT_DTS_REL))).toBe(false);
      expect(readFileSync(path.join(cwd, "game.project"), "utf8")).not.toContain(LLDEBUGGER_URL);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("falls back to the src scan when no boot-path script is reachable", async () => {
    const cwd = tempProject();
    try {
      writeFileSync(
        path.join(cwd, "game.project"),
        "[project]\ntitle = demo\n\n[bootstrap]\nmain_collection = /main.collectionc\n",
      );
      writeFileSync(
        path.join(cwd, "main.collection"),
        embeddedScript("logic", "/main/main.script"),
      );
      mkdirSync(path.join(cwd, "src"), { recursive: true });
      writeFileSync(path.join(cwd, "src", "player.ts"), FACTORY_SCRIPT);
      const result = await runSetupDebug({ cwd });
      expect(result.ok).toBe(true);
      expect(result.addedTo).toBe("src/player.ts");
      expect(result.bootPath).toEqual([]);
      expect(readFileSync(path.join(cwd, "src", "player.ts"), "utf8")).toContain(BLOCK_BEGIN);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("strips the managed block from every non-target script, keeping exactly one", async () => {
    const cwd = tempProject();
    try {
      writeBootProject(cwd, [{ id: "player", src: "src/player.ts" }]);
      for (const rel of ["src/player.ts", "src/old1.ts", "src/old2.ts"]) {
        writeFileSync(path.join(cwd, rel), injectDebugBootstrap(FACTORY_SCRIPT));
      }
      const result = await runSetupDebug({ cwd });
      expect(result.ok).toBe(true);
      expect(result.addedTo).toBe("src/player.ts");
      expect([...(result.removedFrom ?? [])].sort()).toEqual(["src/old1.ts", "src/old2.ts"]);
      expect(readFileSync(path.join(cwd, "src", "player.ts"), "utf8")).toContain(BLOCK_BEGIN);
      expect(readFileSync(path.join(cwd, "src", "old1.ts"), "utf8")).not.toContain(BLOCK_BEGIN);
      expect(readFileSync(path.join(cwd, "src", "old2.ts"), "utf8")).not.toContain(BLOCK_BEGIN);
      // the stripped file is otherwise intact
      expect(readFileSync(path.join(cwd, "src", "old1.ts"), "utf8")).toContain("defineScript({");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

// The regression teeth for Bug 08: the wired project must type-check clean.
function linkTypes(cwd: string): void {
  const scope = path.join(cwd, "node_modules", "@defold-typescript");
  mkdirSync(scope, { recursive: true });
  symlinkSync(TYPES_PKG, path.join(scope, "types"), "dir");
}

function writeGuardProject(cwd: string): void {
  writeFileSync(path.join(cwd, "game.project"), "[project]\ntitle = demo\n");
  mkdirSync(path.join(cwd, "src"), { recursive: true });
  writeFileSync(path.join(cwd, "src", "player.ts"), FACTORY_SCRIPT);
  writeFileSync(
    path.join(cwd, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          lib: ["ES2022"],
          strict: true,
          skipLibCheck: true,
          noEmit: true,
        },
        include: ["src/**/*.ts", "src/**/*.d.ts"],
      },
      null,
      2,
    ),
  );
}

function runTsc(cwd: string): { code: number; output: string } {
  const proc = Bun.spawnSync([path.join(BIN_DIR, "tsc"), "--noEmit", "-p", "tsconfig.json"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: proc.exitCode, output: `${proc.stdout.toString()}${proc.stderr.toString()}` };
}

// Lint the wired file under the repo's own Biome config so the
// organizeImports blank-line rule (which fired on the injected block above the
// user's imports) is the same one the guard enforces. The repo config enables
// `vcs.useIgnoreFile`, which makes Biome skip an out-of-tree temp path, so we
// drop the `vcs` block into a local copy and lint from the project root.
function writeBiomeConfig(cwd: string): void {
  const config = JSON.parse(readFileSync(path.join(REPO_ROOT, "biome.json"), "utf8"));
  delete config.vcs;
  writeFileSync(path.join(cwd, "biome.json"), JSON.stringify(config));
}

function runBiome(cwd: string, rel: string): { code: number; output: string } {
  const proc = Bun.spawnSync([path.join(BIN_DIR, "biome"), "check", "--error-on-warnings", rel], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: proc.exitCode, output: `${proc.stdout.toString()}${proc.stderr.toString()}` };
}

describe("setup-debug wired project type-checks (Bug 08 regression)", () => {
  test("the split ambient .d.ts + managed block compiles clean", async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-setup-debug-tsc-"));
    try {
      writeGuardProject(cwd);
      linkTypes(cwd);
      const result = await runSetupDebug({ cwd });
      expect(result.ok).toBe(true);
      const { code, output } = runTsc(cwd);
      if (code !== 0) {
        throw new Error(`wired project failed to compile:\n${output}`);
      }
      expect(code).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("the wired entry script is Biome-clean (blank line around the END sentinel)", async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-setup-debug-biome-"));
    try {
      writeGuardProject(cwd);
      writeBiomeConfig(cwd);
      const result = await runSetupDebug({ cwd });
      expect(result.ok).toBe(true);
      const { code, output } = runBiome(cwd, "src/player.ts");
      if (code !== 0) {
        throw new Error(`wired entry script failed Biome:\n${output}`);
      }
      expect(code).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("negative control: the old inline declare-module form fails the same compile", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-setup-debug-neg-"));
    try {
      writeGuardProject(cwd);
      linkTypes(cwd);
      const inlineForm = `/** @noResolution */
declare module "lldebugger.debug" {
  export function start(): void;
}

import * as lldebugger from "lldebugger.debug";

if (sys.get_engine_info().is_debug) {
  lldebugger.start();
}

${FACTORY_SCRIPT}`;
      writeFileSync(path.join(cwd, "src", "player.ts"), inlineForm);
      const { code } = runTsc(cwd);
      expect(code).not.toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
