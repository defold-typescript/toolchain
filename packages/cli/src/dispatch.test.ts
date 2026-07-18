import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Writable } from "node:stream";
import type { DefoldIo } from "./bob-command";
import { CURRENT_STABLE_DEFOLD_VERSION } from "./defold-version";
import { dispatch } from "./dispatch";
import { type ExtensionZip, extensionArchiveKey } from "./extension-archive";
import {
  labelRefDocResolveOpts,
  multiKindRefDocResolveOpts,
  multiKindRefDocTarget,
  noDownload,
} from "./ref-doc-test-fixture";
import { runResolve } from "./resolve";
import { defaultUpgradeIo } from "./upgrade";
import type { RunWatchHandle, Watcher, WatcherFactory } from "./watch";

function captureStreams(): {
  io: { stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream };
  out: () => string;
  err: () => string;
} {
  const outChunks: Buffer[] = [];
  const errChunks: Buffer[] = [];
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      outChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      cb();
    },
  });
  const stderr = new Writable({
    write(chunk, _enc, cb) {
      errChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      cb();
    },
  });
  return {
    io: { stdout, stderr },
    out: () => Buffer.concat(outChunks).toString("utf8"),
    err: () => Buffer.concat(errChunks).toString("utf8"),
  };
}

// The watch branch lazy-imports its transpiler-bearing modules, so its
// `onWatchStart` callback fires on a later microtask than the synchronous
// dispatch() return. This bridges that gap: pass `onWatchStart` into dispatch,
// then `await ready` to get the handle before driving the watcher.
function watchHandle(): {
  onWatchStart: (h: RunWatchHandle) => void;
  ready: Promise<RunWatchHandle>;
} {
  let resolve: (h: RunWatchHandle) => void = () => {};
  const ready = new Promise<RunWatchHandle>((r) => {
    resolve = r;
  });
  return { onWatchStart: (h) => resolve(h), ready };
}

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-dispatch-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function expectedWallTsconfig(typesEntrypoint: string): unknown {
  return {
    extends: "../../tsconfig.json",
    compilerOptions: { composite: true, typeRoots: null, types: [typesEntrypoint] },
    include: ["**/*.ts"],
    exclude: [],
  };
}

const ALPHA = `
- name: alpha
  type: table
  desc: Alpha extension.
  members:
  - name: do_alpha
    type: function
    desc: does alpha
    parameters:
      - name: self
        type: object
        desc: the script self
`;

describe("dispatch", () => {
  test("init <path> runs runInit and returns 0 on success", () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out, err } = captureStreams();

    const code = dispatch(["init", cwd], io);

    expect(code).toBe(0);
    expect(err()).toBe("");
    expect(out()).toMatch(/defold-typescript init: wrote/);
  });

  test("init prints the install reminder after the wrote-files line", () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out, err } = captureStreams();

    const code = dispatch(["init", cwd], io);

    expect(code).toBe(0);
    expect(err()).toBe("");
    const text = out();
    expect(text).toMatch(/install/);
    expect(text.indexOf("install")).toBeGreaterThan(text.indexOf("wrote"));
  });

  test("init --suppress-install-reminder writes wrote-files but no reminder", () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out, err } = captureStreams();

    const code = dispatch(["init", cwd, "--suppress-install-reminder"], io);

    expect(code).toBe(0);
    expect(err()).toBe("");
    const text = out();
    expect(text).toMatch(/wrote/);
    expect(text).not.toMatch(/Next: run/);
  });

  test("--suppress-install-reminder is stripped from positionals", () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out, err } = captureStreams();

    const code = dispatch(["init", cwd, "--suppress-install-reminder"], io);

    expect(code).toBe(0);
    expect(err()).toBe("");
    expect(out()).toMatch(/defold-typescript init: wrote/);
  });

  test("init --json emits installCommand even with --suppress-install-reminder", () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out } = captureStreams();

    const code = dispatch(["init", cwd, "--json", "--suppress-install-reminder"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { installCommand?: string };
    expect(typeof parsed.installCommand).toBe("string");
    expect(parsed.installCommand).toMatch(/install$/);
  });

  test("init failure writes error message to stderr and returns 1", () => {
    writeFileSync(path.join(cwd, "README.md"), "stray\n");
    const { io, out, err } = captureStreams();

    const code = dispatch(["init", cwd], io);

    expect(code).toBe(1);
    expect(out()).toBe("");
    expect(err()).toMatch(/--force/);
    expect(err()).not.toMatch(/not yet implemented/);
  });

  test("init --force overwrites a conflicting tsconfig.json and returns 0", () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    writeFileSync(path.join(cwd, "tsconfig.json"), "{}\n");
    const { io, out, err } = captureStreams();

    const code = dispatch(["init", cwd, "--force"], io);

    expect(code).toBe(0);
    expect(err()).toBe("");
    expect(out()).toMatch(/defold-typescript init: wrote/);
    expect(out()).toContain("tsconfig.json");
    const tsconfig = JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types: string[] };
    };
    expect(tsconfig.compilerOptions.types).toContain("@defold-typescript/types");
  });

  test("init --force composes with --json on a conflicting dir", () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    writeFileSync(path.join(cwd, "tsconfig.json"), "{}\n");
    const { io, out, err } = captureStreams();

    const code = dispatch(["init", cwd, "--force", "--json"], io);

    expect(code).toBe(0);
    expect(err()).toBe("");
    const parsed = JSON.parse(out()) as { ok: boolean; command: string; written: string[] };
    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("init");
    expect(parsed.written).toContain("tsconfig.json");
  });

  test("init <missing-path> runs new-project mode and reports the scaffold files", () => {
    const target = path.join(cwd, "fresh");
    const { io, out, err } = captureStreams();

    const code = dispatch(["init", target], io);

    expect(code).toBe(0);
    expect(err()).toBe("");
    expect(out()).toMatch(/wrote 17 files/);
    expect(out()).toContain("game.project");
    expect(out()).toContain("AGENTS.md");
    expect(out()).toContain("CLAUDE.md");
    expect(out()).toContain("main/main.collection");
    expect(out()).toContain("input/game.input_binding");
    expect(out()).not.toContain("main/main.script");
  });

  test("init with no destination folder returns 1 and writes nothing", () => {
    const { io, out, err } = captureStreams();

    const code = dispatch(["init"], io);

    expect(code).toBe(1);
    expect(out()).toBe("");
    expect(err()).toContain("a destination folder is required");
    expect(existsSync(path.join(cwd, "game.project"))).toBe(false);
  });

  test("init with no destination folder --json emits an error envelope", () => {
    const { io, out } = captureStreams();

    const code = dispatch(["init", "--json"], io);

    expect(code).toBe(1);
    const parsed = JSON.parse(out()) as { command: string; ok: boolean; error: string };
    expect(parsed.command).toBe("init");
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("a destination folder is required");
  });

  test('init "." scaffolds into the current folder', () => {
    const { io, err } = captureStreams();
    const previous = process.cwd();
    process.chdir(cwd);
    try {
      const code = dispatch(["init", "."], io);

      expect(code).toBe(0);
      expect(err()).toBe("");
      expect(existsSync(path.join(cwd, "game.project"))).toBe(true);
    } finally {
      process.chdir(previous);
    }
  });

  test("init-agents writes both files and returns 0", () => {
    const { io, err } = captureStreams();

    const code = dispatch(["init-agents", cwd], io);

    expect(code).toBe(0);
    expect(err()).toBe("");
    expect(existsSync(path.join(cwd, "AGENTS.md"))).toBe(true);
    expect(existsSync(path.join(cwd, "CLAUDE.md"))).toBe(true);
  });

  test("init-agents --json emits the written envelope", () => {
    const { io, out } = captureStreams();

    const code = dispatch(["init-agents", cwd, "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { command: string; ok: boolean; written: string[] };
    expect(parsed.command).toBe("init-agents");
    expect(parsed.ok).toBe(true);
    expect(parsed.written).toEqual(["AGENTS.md", "CLAUDE.md"]);
  });

  test("init-agents with no destination folder returns 1 and writes nothing", () => {
    const { io, out, err } = captureStreams();

    const code = dispatch(["init-agents"], io);

    expect(code).toBe(1);
    expect(out()).toBe("");
    expect(err()).toContain("a destination folder is required");
    expect(existsSync(path.join(cwd, "AGENTS.md"))).toBe(false);
  });

  describe("scaffold verbs never load the transpiler graph", () => {
    const dispatchSource = readFileSync(path.join(import.meta.dir, "dispatch.ts"), "utf8");
    const LAZY_SPECIFIERS = ["./build", "./watch", "./materialize", "./resolve", "./wall"] as const;

    // A value (runtime) import of a transpiler-bearing module at module scope is
    // what makes the pure-scaffold verbs inherit a broken toolchain, so the guard
    // is structural: none of LAZY_SPECIFIERS may appear as a top-level value
    // import (type-only imports are erased at build and load nothing).
    function topLevelValueImports(src: string): string[] {
      return [...src.matchAll(/^import\s+(type\s+)?[\s\S]*?from\s*"([^"]+)";/gm)]
        .filter((m) => m[1] === undefined)
        .map((m) => m[2] as string);
    }

    test("dispatch.ts imports no transpiler-bearing module at module scope", () => {
      const valueImports = topLevelValueImports(dispatchSource);
      for (const spec of LAZY_SPECIFIERS) {
        expect(valueImports).not.toContain(spec);
      }
    });

    test("dispatch.ts loads the transpiler-bearing modules via await import()", () => {
      for (const spec of LAZY_SPECIFIERS) {
        expect(dispatchSource).toContain(`await import("${spec}")`);
      }
    });

    test("init-agents dispatches with no transpiler import required", () => {
      const { io, err } = captureStreams();

      const code = dispatch(["init-agents", cwd], io);

      expect(code).toBe(0);
      expect(err()).toBe("");
      expect(existsSync(path.join(cwd, "AGENTS.md"))).toBe(true);
      expect(existsSync(path.join(cwd, "CLAUDE.md"))).toBe(true);
    });

    test("init dispatches with no transpiler import required", () => {
      writeFileSync(path.join(cwd, "game.project"), "[project]\n");
      const { io, err } = captureStreams();

      const code = dispatch(["init", cwd], io);

      expect(code).toBe(0);
      expect(err()).toBe("");
    });
  });

  test("empty argv prints usage to stderr and returns 1", () => {
    const { io, out, err } = captureStreams();

    const code = dispatch([], io);

    expect(code).toBe(1);
    expect(out()).toBe("");
    expect(err()).toBe(
      "Usage: defold-typescript <init|init-agents|build|watch|wall|setup-debug|resolve|bob|run> [path]\n",
    );
  });

  test("unknown command prints usage to stderr and returns 1", () => {
    const { io, out, err } = captureStreams();

    const code = dispatch(["unknown"], io);

    expect(code).toBe(1);
    expect(out()).toBe("");
    expect(err()).toBe(
      "Usage: defold-typescript <init|init-agents|build|watch|wall|setup-debug|resolve|bob|run> [path]\n",
    );
  });

  test("--version prints the CLI version to stdout and returns 0", () => {
    const { io, out, err } = captureStreams();

    const code = dispatch(["--version"], io, { cliVersion: "1.2.3" });

    expect(code).toBe(0);
    expect(out()).toBe("defold-typescript 1.2.3\n");
    expect(err()).toBe("");
  });

  test("-v behaves identically to --version", () => {
    const { io, out, err } = captureStreams();

    const code = dispatch(["-v"], io, { cliVersion: "1.2.3" });

    expect(code).toBe(0);
    expect(out()).toBe("defold-typescript 1.2.3\n");
    expect(err()).toBe("");
  });

  test("--version --json emits the machine-readable shape", () => {
    const { io, out } = captureStreams();

    const code = dispatch(["--version", "--json"], io, { cliVersion: "1.2.3" });

    expect(code).toBe(0);
    expect(out()).toBe('{"command":"version","ok":true,"version":"1.2.3"}\n');
  });

  test("--version short-circuits before command resolution and does not print usage", () => {
    const { io, out, err } = captureStreams();

    const code = dispatch(["--version"], io, { cliVersion: "1.2.3" });

    expect(code).toBe(0);
    expect(out()).not.toContain("Usage:");
    expect(err()).not.toContain("Usage:");
  });

  test("--help prints top-level help to stdout and returns 0", () => {
    const { io, out, err } = captureStreams();

    const code = dispatch(["--help"], io);

    expect(code).toBe(0);
    const text = out();
    expect(text).toContain("Usage: bunx @defold-typescript/cli");
    expect(text).toContain("build");
    expect(text).toContain("watch");
    expect(err()).toBe("");
  });

  test("-h behaves identically to --help", () => {
    const { io, out, err } = captureStreams();

    const code = dispatch(["-h"], io);

    expect(code).toBe(0);
    expect(out()).toContain("Usage: bunx @defold-typescript/cli");
    expect(err()).toBe("");
  });

  test("build --help prints build help and never treats --help as a path", () => {
    const { io, out, err } = captureStreams();

    const code = dispatch(["build", "--help"], io);

    expect(code).toBe(0);
    const text = out();
    expect(text).toContain("build");
    expect(text).not.toContain("tsconfig");
    expect(err()).toBe("");
  });

  test("build --help --json emits the machine-readable help shape", () => {
    const { io, out } = captureStreams();

    const code = dispatch(["build", "--help", "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out());
    expect(parsed.command).toBe("help");
    expect(parsed.ok).toBe(true);
    expect(parsed.subject).toBe("build");
  });

  test("--help short-circuits before command resolution and writes no usage error", () => {
    const { io, err } = captureStreams();

    const code = dispatch(["--help"], io);

    expect(code).toBe(0);
    expect(err()).toBe("");
  });

  test("build <path> runs runBuild and returns 0 on success", async () => {
    const tsconfig = JSON.stringify(
      { compilerOptions: { strict: true }, include: ["src/**/*.ts"] },
      null,
      2,
    );
    writeFileSync(path.join(cwd, "tsconfig.json"), tsconfig);
    const srcDir = path.join(cwd, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(
      path.join(srcDir, "main.ts"),
      'import { defineScript } from "@defold-typescript/types";\nexport default defineScript({});\n',
    );

    const { io, out, err } = captureStreams();
    const code = await dispatch(["build", cwd], io);

    expect(code).toBe(0);
    expect(err()).toBe("");
    expect(out()).toMatch(/defold-typescript build: wrote 1 files/);
    expect(out()).toContain("src/main.ts.script");
  });

  test("build failure writes error message to stderr and returns 1", async () => {
    const { io, out, err } = captureStreams();
    const code = await dispatch(["build", cwd], io);

    expect(code).toBe(1);
    expect(out()).toBe("");
    expect(err()).toMatch(/defold-typescript build/);
  });

  test("init --json writes a success JSON object to stdout and returns 0", () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out, err } = captureStreams();

    const code = dispatch(["init", cwd, "--json"], io);

    expect(code).toBe(0);
    expect(err()).toBe("");
    const parsed = JSON.parse(out()) as { ok: boolean; command: string; written: string[] };
    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("init");
    expect(parsed.written.length).toBeGreaterThan(0);
  });

  test("build --json before the path resolves the path and emits ok:true JSON", async () => {
    const tsconfig = JSON.stringify(
      { compilerOptions: { strict: true }, include: ["src/**/*.ts"] },
      null,
      2,
    );
    writeFileSync(path.join(cwd, "tsconfig.json"), tsconfig);
    const srcDir = path.join(cwd, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(
      path.join(srcDir, "main.ts"),
      'import { defineScript } from "@defold-typescript/types";\nexport default defineScript({});\n',
    );

    const { io, out, err } = captureStreams();
    const code = await dispatch(["build", "--json", cwd], io);

    expect(code).toBe(0);
    expect(err()).toBe("");
    const parsed = JSON.parse(out()) as { ok: boolean; command: string; written: string[] };
    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("build");
    expect(parsed.written).toContain("src/main.ts.script");
  });

  test("build --json on failure writes error JSON to stdout, nothing to stderr, returns 1", async () => {
    const { io, out, err } = captureStreams();
    const code = await dispatch(["build", cwd, "--json"], io);

    expect(code).toBe(1);
    expect(err()).toBe("");
    const parsed = JSON.parse(out()) as { ok: boolean; command: string; error: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.command).toBe("build");
    expect(parsed.error.length).toBeGreaterThan(0);
  });

  function scaffoldBuildProject(pkg?: Record<string, unknown>): void {
    const tsconfig = JSON.stringify(
      { compilerOptions: { strict: true }, include: ["src/**/*.ts"] },
      null,
      2,
    );
    writeFileSync(path.join(cwd, "tsconfig.json"), tsconfig);
    const srcDir = path.join(cwd, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(path.join(srcDir, "main.ts"), "export const a = 1;\n");
    if (pkg) {
      writeFileSync(path.join(cwd, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
    }
  }

  test("build --json reports the package.json pin as defoldVersion", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.9.8" } });
    const resolveOpts = labelRefDocResolveOpts();
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, { resolveOpts });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string };
    expect(parsed.defoldVersion).toBe("1.9.8");

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });

  test("build warns on a legacy defold-version pin key and still succeeds", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-version": "1.12.4" } });
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd], io, { detectEditorVersion: () => null });

    expect(code).toBe(0);
    expect(err()).toContain("defold-version");
    expect(err()).toContain("defold-target");
  });

  test("build --json reports the bad pin key as a warning and stays ok", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-version": "1.12.4" } });
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, { detectEditorVersion: () => null });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { ok: boolean; warnings: string[] };
    expect(parsed.ok).toBe(true);
    const warning = parsed.warnings.find((w) => w.includes("defold-version"));
    expect(warning).toBeDefined();
    expect(warning).toContain("defold-target");
  });

  test("a bad pin key does not become a pin: resolution is unchanged", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-version": "1.12.4" } });
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, { detectEditorVersion: () => null });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string; defoldVersionSource: string };
    expect(parsed.defoldVersionSource).toBe("default");
    expect(parsed.defoldVersion).toBe(CURRENT_STABLE_DEFOLD_VERSION);
  });

  test("a valid pin produces no pin-key warning", async () => {
    scaffoldBuildProject({
      "defold-typescript": { "defold-target": CURRENT_STABLE_DEFOLD_VERSION },
    });
    const { io, out, err } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { warnings: string[] };
    expect(parsed.warnings.some((w) => w.includes("defold-typescript"))).toBe(false);
    expect(err()).toBe("");
  });

  test("build --defold-target overrides the pin", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.9.8" } });
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--defold-target", "1.10.0", "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string };
    expect(parsed.defoldVersion).toBe("1.10.0");
  });

  test("build --defold-target=<v> form is honored", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.9.8" } });
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--defold-target=1.10.0", "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string };
    expect(parsed.defoldVersion).toBe("1.10.0");
  });

  test("build --json with no pin reports current-stable", async () => {
    scaffoldBuildProject();
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, {
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string };
    expect(parsed.defoldVersion).toBe(CURRENT_STABLE_DEFOLD_VERSION);
  });

  test("build --json resolves a channel-target pin's head and reports channel/version/sha", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "beta" } });
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, {
      fetchChannelInfo: async () => ({ version: "1.10.0", sha1: "abc123" }),
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      defoldVersion: string;
      defoldChannel: string | null;
      defoldSha: string | null;
    };
    expect(parsed.defoldChannel).toBe("beta");
    expect(parsed.defoldVersion).toBe("1.10.0");
    expect(parsed.defoldSha).toBe("abc123");
  });

  test("build --defold-target flag overrides a channel pin", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "beta" } });
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--defold-target", "alpha", "--json"], io, {
      fetchChannelInfo: async (channel) => ({ version: "1.10.0", sha1: `sha-${channel}` }),
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldChannel: string; defoldSha: string };
    expect(parsed.defoldChannel).toBe("alpha");
    expect(parsed.defoldSha).toBe("sha-alpha");
  });

  test("build --defold-target overriding a live pin writes a stderr override notice", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.12.4" } });
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd, "--defold-target", "1.13.0"], io, {
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    expect(err()).toContain("1.13.0");
    expect(err()).toContain("1.12.4");
  });

  test("build --json override notice rides warnings without changing resolution", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.12.4" } });
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--defold-target", "1.13.0", "--json"], io, {
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      ok: boolean;
      warnings: string[];
      defoldVersion: string;
      defoldVersionSource: string;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.defoldVersion).toBe("1.13.0");
    expect(parsed.defoldVersionSource).toBe("flag");
    const notice = parsed.warnings.find((w) => w.includes("1.13.0") && w.includes("1.12.4"));
    expect(notice).toBeDefined();
  });

  test("build --defold-target equal to the pin produces no override notice", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.12.4" } });
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--defold-target", "1.12.4", "--json"], io, {
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { warnings: string[] };
    expect(parsed.warnings.some((w) => w.includes("overrides the package.json pin"))).toBe(false);
  });

  test("build --defold-target with no pin produces no override notice", async () => {
    scaffoldBuildProject();
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--defold-target", "1.13.0", "--json"], io, {
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { warnings: string[] };
    expect(parsed.warnings.some((w) => w.includes("overrides the package.json pin"))).toBe(false);
  });

  test("a pin-key diagnostic and an override notice compose", async () => {
    scaffoldBuildProject({
      "defold-typescript": { "defold-version": "1.9.0", "defold-target": "1.12.4" },
    });
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--defold-target", "1.13.0", "--json"], io, {
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { warnings: string[] };
    expect(parsed.warnings.some((w) => w.includes("defold-version"))).toBe(true);
    expect(parsed.warnings.some((w) => w.includes("1.13.0") && w.includes("1.12.4"))).toBe(true);
  });

  test("build warns on stderr when the installed editor drifts from a version pin", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.12.4" } });
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd], io, { detectEditorVersion: () => "1.13.0" });

    expect(code).toBe(0);
    expect(err()).toContain("1.13.0");
    expect(err()).toContain("1.12.4");
    expect(err()).toContain("set-target --detected");
  });

  test("build --json folds the drift notice into warnings and adds pinMismatch, resolution unchanged", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.12.4" } });
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, {
      detectEditorVersion: () => "1.13.0",
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      ok: boolean;
      warnings: string[];
      defoldVersion: string;
      defoldVersionSource: string;
      pinMismatch?: { installed: string; pinned: string };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.defoldVersion).toBe("1.12.4");
    expect(parsed.defoldVersionSource).toBe("pin");
    expect(parsed.warnings.some((w) => w.includes("set-target --detected"))).toBe(true);
    expect(parsed.pinMismatch).toEqual({ installed: "1.13.0", pinned: "1.12.4" });
  });

  test("build produces no drift notice when the editor matches the pin or is undetected", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.12.4" } });

    const matched = captureStreams();
    const matchCode = await dispatch(["build", cwd, "--json"], matched.io, {
      detectEditorVersion: () => "1.12.4",
    });
    expect(matchCode).toBe(0);
    const matchParsed = JSON.parse(matched.out()) as {
      warnings: string[];
      pinMismatch?: unknown;
    };
    expect(matchParsed.warnings.some((w) => w.includes("set-target --detected"))).toBe(false);
    expect("pinMismatch" in matchParsed).toBe(false);

    const undetected = captureStreams();
    const undetectedCode = await dispatch(["build", cwd, "--json"], undetected.io, {
      detectEditorVersion: () => null,
    });
    expect(undetectedCode).toBe(0);
    const undetectedParsed = JSON.parse(undetected.out()) as {
      warnings: string[];
      pinMismatch?: unknown;
    };
    expect(undetectedParsed.warnings.some((w) => w.includes("set-target --detected"))).toBe(false);
    expect("pinMismatch" in undetectedParsed).toBe(false);
  });

  test("build --defold-target emits only the override notice, not the drift notice", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.12.4" } });
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--defold-target", "1.13.0", "--json"], io, {
      detectEditorVersion: () => "1.13.0",
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { warnings: string[]; pinMismatch?: unknown };
    expect(parsed.warnings.some((w) => w.includes("overrides the package.json pin"))).toBe(true);
    expect(parsed.warnings.some((w) => w.includes("set-target --detected"))).toBe(false);
    expect("pinMismatch" in parsed).toBe(false);
  });

  test("build produces no drift notice for a channel pin even when the editor differs", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "stable" } });
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, {
      detectEditorVersion: () => "1.13.0",
      fetchChannelInfo: async () => ({ version: "1.10.0", sha1: "abc123" }),
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { warnings: string[]; pinMismatch?: unknown };
    expect(parsed.warnings.some((w) => w.includes("set-target --detected"))).toBe(false);
    expect("pinMismatch" in parsed).toBe(false);
  });

  test("watch produces no drift notice — the scope guard holds for non-build/upgrade commands", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.9.8" } });
    writeFileSync(path.join(cwd, "main.script"), "");
    const resolveOpts = multiKindRefDocResolveOpts();
    const { io, err } = captureStreams();
    const main: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });

    const code = await dispatch(["watch", cwd], io, {
      watcherFactory: main,
      resolveOpts,
      refDocRegistry: [multiKindRefDocTarget()],
      onWatchStart: (h) => h.stop(),
      detectEditorVersion: () => "1.13.0",
    });

    expect(code).toBe(0);
    expect(err()).not.toContain("set-target --detected");

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });

  test("build --json with a version target reports a null channel and sha", async () => {
    scaffoldBuildProject();
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldChannel: string | null; defoldSha: string | null };
    expect(parsed.defoldChannel).toBeNull();
    expect(parsed.defoldSha).toBeNull();
  });

  test("build --json reports defoldVersion alongside a null channel for the default target", async () => {
    scaffoldBuildProject();
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, {
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string; defoldChannel: string | null };
    expect(parsed.defoldVersion).toBe(CURRENT_STABLE_DEFOLD_VERSION);
    expect(parsed.defoldChannel).toBeNull();
  });

  test("init --json reports a null channel and sha for the default version target", () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out } = captureStreams();

    const code = dispatch(["init", cwd, "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldChannel: string | null; defoldSha: string | null };
    expect(parsed.defoldChannel).toBeNull();
    expect(parsed.defoldSha).toBeNull();
    const pkgPath = path.join(cwd, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        "defold-typescript"?: Record<string, unknown>;
      };
      expect(pkg["defold-typescript"]?.channel).toBeUndefined();
    }
  });

  test("build --defold-version is rejected with a pointer to --defold-target", async () => {
    scaffoldBuildProject();
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd, "--defold-version", "1.12.4"], io);

    expect(code).toBe(1);
    expect(err()).toContain("--defold-target");
  });

  test("build --channel is rejected with a pointer to --defold-target", async () => {
    scaffoldBuildProject();
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd, "--channel", "beta"], io);

    expect(code).toBe(1);
    expect(err()).toContain("--defold-target");
  });

  test("build --json --defold-version rejection reports the error in the JSON envelope", async () => {
    scaffoldBuildProject();
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--defold-version=1.12.4", "--json"], io);

    expect(code).toBe(1);
    const parsed = JSON.parse(out()) as { ok: boolean; error: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("--defold-target");
  });

  test("build --defold-target with a fixed version reports version with null channel and sha", async () => {
    scaffoldBuildProject();
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--defold-target", "1.12.4", "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      defoldVersion: string;
      defoldChannel: string | null;
      defoldSha: string | null;
      materializedSurface: string | null;
    };
    expect(parsed.defoldVersion).toBe("1.12.4");
    expect(parsed.defoldChannel).toBeNull();
    expect(parsed.defoldSha).toBeNull();
    expect(parsed.materializedSurface).toBe(".defold-types/defold-1.12.4");
    const camera = readFileSync(
      path.join(cwd, ".defold-types", "defold-1.12.4", "camera.d.ts"),
      "utf8",
    );
    expect(camera).toContain('from "./core-types"');
    expect(camera).not.toContain("get_orthographic_auto_zoom");
  });

  test("init --json reports the seeded current-stable defoldVersion", () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out } = captureStreams();

    const code = dispatch(["init", cwd, "--json"], io, {
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string };
    expect(parsed.defoldVersion).toBe(CURRENT_STABLE_DEFOLD_VERSION);
  });

  test("build --json with no pin reports the installed-editor detection when no flag/pin", async () => {
    scaffoldBuildProject();
    const resolveOpts = labelRefDocResolveOpts();
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, {
      detectEditorVersion: () => "1.9.8",
      resolveOpts,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string; defoldVersionSource: string };
    expect(parsed.defoldVersion).toBe("1.9.8");
    expect(parsed.defoldVersionSource).toBe("detected");

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });

  test("init --json with no pin reports the installed-editor detection when no flag/pin", () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out } = captureStreams();

    const code = dispatch(["init", cwd, "--json"], io, {
      detectEditorVersion: () => "1.9.8",
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string; defoldVersionSource: string };
    expect(parsed.defoldVersion).toBe("1.9.8");
    expect(parsed.defoldVersionSource).toBe("detected");
  });

  test("build --defold-target overrides the installed-editor detection (source: flag)", async () => {
    scaffoldBuildProject();
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--defold-target", "1.11.0", "--json"], io, {
      detectEditorVersion: () => "1.9.8",
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string; defoldVersionSource: string };
    expect(parsed.defoldVersion).toBe("1.11.0");
    expect(parsed.defoldVersionSource).toBe("flag");
  });

  test("build --json with no pin and no detection reports source: default", async () => {
    scaffoldBuildProject();
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, {
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string; defoldVersionSource: string };
    expect(parsed.defoldVersion).toBe(CURRENT_STABLE_DEFOLD_VERSION);
    expect(parsed.defoldVersionSource).toBe("default");
  });

  test("build --json with no pin reports apiSurface defold-1.13.0", async () => {
    scaffoldBuildProject();
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, {
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string; apiSurface: string | null };
    expect(parsed.defoldVersion).toBe(CURRENT_STABLE_DEFOLD_VERSION);
    expect(parsed.apiSurface).toBe("defold-1.13.0");
  });

  test("build --defold-target with no pre-baked surface reports apiSurface null", async () => {
    scaffoldBuildProject();
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--defold-target", "1.10.0", "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { apiSurface: string | null };
    expect(parsed.apiSurface).toBeNull();
  });

  test("init --json reports apiSurface defold-1.13.0", () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out } = captureStreams();

    const code = dispatch(["init", cwd, "--json"], io, {
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { apiSurface: string | null };
    expect(parsed.apiSurface).toBe("defold-1.13.0");
  });

  test("init --json carries no scriptKind field even for a single-gui_script project", () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    writeFileSync(path.join(cwd, "hud.gui_script"), "");
    const { io, out } = captureStreams();

    const code = dispatch(["init", cwd, "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as Record<string, unknown>;
    expect("scriptKind" in parsed).toBe(false);
  });

  test("build --json materializes the selected surface and reports the dir", async () => {
    scaffoldBuildProject();
    const pkgRoot = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-pkg-"));
    const sourceGeneratedDir = path.join(pkgRoot, "generated");
    const pkgSrcDir = path.join(pkgRoot, "src");
    mkdirSync(sourceGeneratedDir, { recursive: true });
    mkdirSync(pkgSrcDir, { recursive: true });
    writeFileSync(path.join(sourceGeneratedDir, "label.d.ts"), "declare const __label: unknown;\n");
    writeFileSync(path.join(pkgSrcDir, "msg-overloads.d.ts"), "export {};\n");
    writeFileSync(path.join(pkgSrcDir, "go-overloads.d.ts"), "export {};\n");
    writeFileSync(path.join(pkgSrcDir, "core-types.ts"), "export interface Hash {}\n");
    writeFileSync(
      path.join(pkgSrcDir, "engine-globals.d.ts"),
      'import type * as Core from "./core-types";\ndeclare global {\n  type Hash = Core.Hash;\n}\nexport {};\n',
    );

    const { io, out } = captureStreams();
    const code = await dispatch(["build", cwd, "--json"], io, {
      sourceGeneratedDir,
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { materializedSurface: string | null };
    expect(parsed.materializedSurface).toBe(".defold-types/defold-1.13.0");
    const surfaceDir = path.join(cwd, ".defold-types", "defold-1.13.0");
    expect(existsSync(path.join(surfaceDir, "label.d.ts"))).toBe(true);
    expect(existsSync(path.join(surfaceDir, "engine-globals.d.ts"))).toBe(true);
    expect(readFileSync(path.join(surfaceDir, "index.d.ts"), "utf8")).toContain(
      'import "./engine-globals";',
    );

    rmSync(pkgRoot, { recursive: true, force: true });
  });

  test("build --json on a single-.script project keeps the full surface and no scriptKind", async () => {
    scaffoldBuildProject();
    writeFileSync(path.join(cwd, "main.script"), "");
    const sourceGeneratedDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-src-"));
    for (const mod of ["label", "gui", "render"]) {
      writeFileSync(
        path.join(sourceGeneratedDir, `${mod}.d.ts`),
        `declare const __${mod}: unknown;\n`,
      );
    }

    const { io, out } = captureStreams();
    const code = await dispatch(["build", cwd, "--json"], io, {
      sourceGeneratedDir,
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as Record<string, unknown>;
    expect("scriptKind" in parsed).toBe(false);

    const index = readFileSync(
      path.join(cwd, ".defold-types", "defold-1.13.0", "index.d.ts"),
      "utf8",
    );
    expect(index).toContain('"./gui"');
    expect(index).toContain('"./render"');
    expect(index).toContain('"./label"');

    rmSync(sourceGeneratedDir, { recursive: true, force: true });
  });

  test("build --json on a mixed-kind project keeps the full surface and no scriptKind", async () => {
    scaffoldBuildProject();
    writeFileSync(path.join(cwd, "main.script"), "");
    writeFileSync(path.join(cwd, "hud.gui_script"), "");
    const sourceGeneratedDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-src-"));
    for (const mod of ["label", "gui", "render"]) {
      writeFileSync(
        path.join(sourceGeneratedDir, `${mod}.d.ts`),
        `declare const __${mod}: unknown;\n`,
      );
    }

    const { io, out } = captureStreams();
    const code = await dispatch(["build", cwd, "--json"], io, {
      sourceGeneratedDir,
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as Record<string, unknown>;
    expect("scriptKind" in parsed).toBe(false);

    const index = readFileSync(
      path.join(cwd, ".defold-types", "defold-1.13.0", "index.d.ts"),
      "utf8",
    );
    expect(index).toContain('"./gui"');
    expect(index).toContain('"./render"');
    expect(index).toContain('"./label"');

    rmSync(sourceGeneratedDir, { recursive: true, force: true });
  });

  test("build --json on a mixed-kind project writes no per-directory wall tsconfigs", async () => {
    scaffoldBuildProject();
    rmSync(path.join(cwd, "src", "main.ts"));
    mkdirSync(path.join(cwd, "src", "ui"), { recursive: true });
    mkdirSync(path.join(cwd, "src", "render"), { recursive: true });
    writeFileSync(
      path.join(cwd, "src", "ui", "hud.ts"),
      'import { defineGuiScript } from "@defold-typescript/types";\nexport default defineGuiScript({});\n',
    );
    writeFileSync(
      path.join(cwd, "src", "render", "cam.ts"),
      'import { defineRenderScript } from "@defold-typescript/types";\nexport default defineRenderScript({});\n',
    );
    const sourceGeneratedDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-src-"));
    for (const mod of ["label", "gui", "render"]) {
      writeFileSync(
        path.join(sourceGeneratedDir, `${mod}.d.ts`),
        `declare const __${mod}: unknown;\n`,
      );
    }

    const { io, out } = captureStreams();
    const code = await dispatch(["build", cwd, "--json"], io, { sourceGeneratedDir });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as Record<string, unknown>;
    expect("scriptKind" in parsed).toBe(false);
    expect("directoryWalls" in parsed).toBe(false);
    expect(existsSync(path.join(cwd, "src/ui/tsconfig.json"))).toBe(false);
    expect(existsSync(path.join(cwd, "src/render/tsconfig.json"))).toBe(false);

    rmSync(sourceGeneratedDir, { recursive: true, force: true });
  });

  test("build does not mutate root tsconfig wall wiring written by hand", async () => {
    scaffoldBuildProject();
    rmSync(path.join(cwd, "src", "main.ts"));
    mkdirSync(path.join(cwd, "src", "ui"), { recursive: true });
    writeFileSync(
      path.join(cwd, "src", "ui", "hud.ts"),
      'import { defineGuiScript } from "@defold-typescript/types/gui-script";\nexport default defineGuiScript({});\n',
    );
    // A manually-written wall: root tsconfig carries references/exclude/files and
    // src/ui has its own composite tsconfig. A build must leave all of it intact.
    const rootTsconfig = {
      compilerOptions: { strict: true, types: ["@defold-typescript/types"] },
      include: ["src/**/*.ts"],
      exclude: ["src/ui"],
      files: [],
      references: [{ path: "src/ui" }],
    };
    writeFileSync(path.join(cwd, "tsconfig.json"), `${JSON.stringify(rootTsconfig, null, 2)}\n`);
    const wallTsconfig = expectedWallTsconfig("@defold-typescript/types/gui-script");
    writeFileSync(
      path.join(cwd, "src", "ui", "tsconfig.json"),
      `${JSON.stringify(wallTsconfig, null, 2)}\n`,
    );

    const sourceGeneratedDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-src-"));
    for (const mod of ["label", "gui", "render"]) {
      writeFileSync(
        path.join(sourceGeneratedDir, `${mod}.d.ts`),
        `declare const __${mod}: unknown;\n`,
      );
    }

    const { io } = captureStreams();
    const code = await dispatch(["build", cwd, "--json"], io, { sourceGeneratedDir });

    expect(code).toBe(0);
    const root = JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")) as {
      exclude?: string[];
      files?: string[];
      references?: { path: string }[];
    };
    expect(root.references).toEqual([{ path: "src/ui" }]);
    expect(root.exclude).toEqual(["src/ui"]);
    expect(root.files).toEqual([]);
    expect(JSON.parse(readFileSync(path.join(cwd, "src/ui/tsconfig.json"), "utf8"))).toEqual(
      wallTsconfig,
    );

    rmSync(sourceGeneratedDir, { recursive: true, force: true });
  });

  test("build --json on a pinned unavailable version reports materializedSurface null", async () => {
    scaffoldBuildProject();
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--defold-target", "1.10.0", "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { materializedSurface: string | null };
    expect(parsed.materializedSurface).toBeNull();
    expect(existsSync(path.join(cwd, ".defold-types"))).toBe(false);
  });

  test("build --json on a pinned ref-doc version generates the surface on the fly", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.9.8" } });
    const resolveOpts = labelRefDocResolveOpts();
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, { resolveOpts });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { materializedSurface: string | null };
    expect(parsed.materializedSurface).toBe(".defold-types/defold-1.9.8");

    const dir = path.join(cwd, ".defold-types", "defold-1.9.8");
    expect(existsSync(path.join(dir, "label.d.ts"))).toBe(true);
    expect(existsSync(path.join(dir, "index.d.ts"))).toBe(true);
    expect(existsSync(path.join(dir, "package.json"))).toBe(true);
    expect(existsSync(path.join(dir, "engine-globals.d.ts"))).toBe(true);
    expect(readFileSync(path.join(dir, "index.d.ts"), "utf8")).toContain(
      'import "./engine-globals";',
    );

    const tsconfig = JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { typeRoots: string[]; types: string[] };
    };
    expect(tsconfig.compilerOptions.typeRoots).toEqual([".defold-types"]);
    expect(tsconfig.compilerOptions.types).toEqual(["defold-1.9.8"]);

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });

  test("build --defold-target beta materializes the ref-doc surface off the resolved head", async () => {
    scaffoldBuildProject();
    const base = labelRefDocResolveOpts();
    let downloadedUrl: string | undefined;
    let infoChannel: string | undefined;
    const resolveOpts = {
      cacheDir: base.cacheDir,
      readZip: base.readZip,
      fetchChannelInfo: async (channel: "stable" | "beta" | "alpha") => {
        infoChannel = channel;
        return { version: "1.9.8", sha1: "deadbeef" };
      },
      download: async (url: string): Promise<Uint8Array> => {
        downloadedUrl = url;
        return new TextEncoder().encode("beta-bytes");
      },
    };
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--defold-target", "beta", "--json"], io, {
      resolveOpts,
    });

    expect(code).toBe(0);
    expect(infoChannel).toBe("beta");
    expect(downloadedUrl).toContain("/archive/beta/deadbeef/");
    const parsed = JSON.parse(out()) as {
      materializedSurface: string | null;
      defoldVersion: string;
      defoldChannel: string | null;
      defoldSha: string | null;
    };
    expect(parsed.materializedSurface).toBe(".defold-types/defold-1.9.8");
    expect(parsed.defoldVersion).toBe("1.9.8");
    expect(parsed.defoldChannel).toBe("beta");
    expect(parsed.defoldSha).toBe("deadbeef");

    rmSync(base.cacheDir, { recursive: true, force: true });
  });

  test("build --json at current-stable still uses the pre-baked copy path", async () => {
    scaffoldBuildProject();
    const sourceGeneratedDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-src-"));
    writeFileSync(path.join(sourceGeneratedDir, "label.d.ts"), "declare const __label: unknown;\n");
    let downloadCalled = false;
    const resolveOpts = {
      cacheDir: mkdtempSync(path.join(os.tmpdir(), "defold-typescript-ref-doc-")),
      download: async (): Promise<Uint8Array> => {
        downloadCalled = true;
        throw new Error("ref-doc resolution must not run for current-stable");
      },
    };
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, {
      sourceGeneratedDir,
      resolveOpts,
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { materializedSurface: string | null };
    expect(parsed.materializedSurface).toBe(".defold-types/defold-1.13.0");
    expect(downloadCalled).toBe(false);

    rmSync(sourceGeneratedDir, { recursive: true, force: true });
    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });

  test("build --json on a ref-doc version whose generation fails reports null and exits 0", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.9.8" } });
    const emptyCache = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-ref-doc-"));
    const resolveOpts = { cacheDir: emptyCache, download: noDownload };
    const { io, out, err } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, { resolveOpts });

    expect(code).toBe(0);
    expect(err()).toBe("");
    const parsed = JSON.parse(out()) as { materializedSurface: string | null };
    expect(parsed.materializedSurface).toBeNull();
    expect(existsSync(path.join(cwd, ".defold-types"))).toBe(false);

    rmSync(emptyCache, { recursive: true, force: true });
  });

  test("build keeps the full pinned ref-doc surface for a single-.script project", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.9.8" } });
    writeFileSync(path.join(cwd, "main.script"), "");
    const resolveOpts = multiKindRefDocResolveOpts();
    const { io } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, {
      resolveOpts,
      refDocRegistry: [multiKindRefDocTarget()],
    });

    expect(code).toBe(0);
    const dir = path.join(cwd, ".defold-types", "defold-1.9.8");
    expect(existsSync(path.join(dir, "sprite.d.ts"))).toBe(true);
    expect(existsSync(path.join(dir, "gui.d.ts"))).toBe(true);
    expect(existsSync(path.join(dir, "render.d.ts"))).toBe(true);

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });

  test("watch keeps the full pinned ref-doc surface at startup for a single-.script project", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.9.8" } });
    writeFileSync(path.join(cwd, "main.script"), "");
    const resolveOpts = multiKindRefDocResolveOpts();

    const { io, err } = captureStreams();
    const main: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });

    const result = dispatch(["watch", cwd], io, {
      watcherFactory: main,
      resolveOpts,
      refDocRegistry: [multiKindRefDocTarget()],
      onWatchStart: (h) => h.stop(),
    });

    const code = await result;
    expect(code).toBe(0);
    expect(err()).toBe("");

    const dir = path.join(cwd, ".defold-types", "defold-1.9.8");
    expect(existsSync(path.join(dir, "sprite.d.ts"))).toBe(true);
    expect(existsSync(path.join(dir, "gui.d.ts"))).toBe(true);
    expect(existsSync(path.join(dir, "render.d.ts"))).toBe(true);

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });

  test("watch returns a Promise<number> resolving to 0 on graceful stop", async () => {
    const tsconfig = JSON.stringify(
      { compilerOptions: { strict: true }, include: ["src/**/*.ts"] },
      null,
      2,
    );
    writeFileSync(path.join(cwd, "tsconfig.json"), tsconfig);
    const srcDir = path.join(cwd, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(path.join(srcDir, "main.ts"), "export const a = 1;\n");

    const { io, out, err } = captureStreams();

    const factory: WatcherFactory = (_srcDir, _onEvent): Watcher => ({
      close() {},
    });

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd], io, {
      watcherFactory: factory,
      onWatchStart,
    });

    expect(result).toBeInstanceOf(Promise);
    const captured = await ready;
    await captured.waitForIdle();
    captured.stop();
    const code = await result;

    expect(code).toBe(0);
    expect(err()).toBe("");
    expect(out()).toMatch(/wrote 1 files/);
  });

  test("watch --json threads json into runWatch and streams a build NDJSON line", async () => {
    const tsconfig = JSON.stringify(
      { compilerOptions: { strict: true }, include: ["src/**/*.ts"] },
      null,
      2,
    );
    writeFileSync(path.join(cwd, "tsconfig.json"), tsconfig);
    const srcDir = path.join(cwd, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(path.join(srcDir, "main.ts"), "export const a = 1;\n");

    const { io, out, err } = captureStreams();

    const factory: WatcherFactory = (_srcDir, _onEvent): Watcher => ({
      close() {},
    });

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd, "--json"], io, {
      watcherFactory: factory,
      onWatchStart,
    });

    const captured = await ready;
    await captured.waitForIdle();
    captured.stop();
    await result;

    expect(err()).toBe("");
    const lines = out().trimEnd().split("\n");
    const start = JSON.parse(lines[0] as string) as Record<string, unknown>;
    expect(start).toEqual({ command: "watch", event: "start", ok: true, written: [] });
    const build = JSON.parse(lines[1] as string) as Record<string, unknown>;
    expect(build.command).toBe("watch");
    expect(build.event).toBe("build");
    expect(build.ok).toBe(true);
  });

  test("watch keeps the full materialized surface at startup for a single-.script project", async () => {
    const tsconfig = JSON.stringify(
      { compilerOptions: { strict: true }, include: ["src/**/*.ts"] },
      null,
      2,
    );
    writeFileSync(path.join(cwd, "tsconfig.json"), tsconfig);
    const srcDir = path.join(cwd, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(path.join(srcDir, "main.ts"), "export const a = 1;\n");
    writeFileSync(path.join(cwd, "main.script"), "");

    const sourceGeneratedDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-src-"));
    for (const mod of ["label", "gui", "render"]) {
      writeFileSync(
        path.join(sourceGeneratedDir, `${mod}.d.ts`),
        `declare const __${mod}: unknown;\n`,
      );
    }

    const { io, err } = captureStreams();
    const main: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });
    const component: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd], io, {
      watcherFactory: main,
      componentWatcherFactory: component,
      sourceGeneratedDir,
      onWatchStart,
      detectEditorVersion: () => null,
    });

    const handle = await ready;
    await handle.waitForIdle();

    const index = readFileSync(
      path.join(cwd, ".defold-types", "defold-1.13.0", "index.d.ts"),
      "utf8",
    );
    expect(index).toContain('"./gui"');
    expect(index).toContain('"./render"');
    expect(index).toContain('"./label"');

    handle?.stop();
    const code = await result;
    expect(code).toBe(0);
    expect(err()).toBe("");

    rmSync(sourceGeneratedDir, { recursive: true, force: true });
  });

  test("watch keeps the full surface when a .gui_script is added mid-session", async () => {
    const tsconfig = JSON.stringify(
      { compilerOptions: { strict: true }, include: ["src/**/*.ts"] },
      null,
      2,
    );
    writeFileSync(path.join(cwd, "tsconfig.json"), tsconfig);
    const srcDir = path.join(cwd, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(path.join(srcDir, "main.ts"), "export const a = 1;\n");

    const sourceGeneratedDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-src-"));
    for (const mod of ["label", "gui", "render"]) {
      writeFileSync(
        path.join(sourceGeneratedDir, `${mod}.d.ts`),
        `declare const __${mod}: unknown;\n`,
      );
    }

    const { io } = captureStreams();
    const main: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });
    let triggerComponent: ((kind: "change" | "rename", rel: string) => void) | undefined;
    const component: WatcherFactory = (_dir, onEvent): Watcher => {
      triggerComponent = (kind, rel) => onEvent({ kind, path: rel });
      return { close() {} };
    };

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      sourceGeneratedDir,
      onWatchStart,
      detectEditorVersion: () => null,
    });

    const handle = await ready;
    await handle.waitForIdle();

    const indexPath = path.join(cwd, ".defold-types", "defold-1.13.0", "index.d.ts");
    expect(readFileSync(indexPath, "utf8")).toContain('"./render"');

    writeFileSync(path.join(cwd, "hud.gui_script"), "");
    triggerComponent?.("rename", "hud.gui_script");
    await handle?.waitForIdle();

    const index = readFileSync(indexPath, "utf8");
    expect(index).toContain('"./gui"');
    expect(index).toContain('"./render"');
    expect(index).toContain('"./label"');

    handle?.stop();
    const code = await result;
    expect(code).toBe(0);

    rmSync(sourceGeneratedDir, { recursive: true, force: true });
  });

  test("watch on a mixed-kind project writes no per-directory wall tsconfigs", async () => {
    const tsconfig = JSON.stringify(
      { compilerOptions: { strict: true }, include: ["src/**/*.ts"] },
      null,
      2,
    );
    writeFileSync(path.join(cwd, "tsconfig.json"), tsconfig);
    const srcDir = path.join(cwd, "src");
    mkdirSync(path.join(srcDir, "ui"), { recursive: true });
    mkdirSync(path.join(srcDir, "render"), { recursive: true });
    writeFileSync(
      path.join(srcDir, "ui", "hud.ts"),
      'import { defineGuiScript } from "@defold-typescript/types";\nexport default defineGuiScript({});\n',
    );
    writeFileSync(
      path.join(srcDir, "render", "cam.ts"),
      'import { defineRenderScript } from "@defold-typescript/types";\nexport default defineRenderScript({});\n',
    );

    const sourceGeneratedDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-src-"));
    for (const mod of ["label", "gui", "render"]) {
      writeFileSync(
        path.join(sourceGeneratedDir, `${mod}.d.ts`),
        `declare const __${mod}: unknown;\n`,
      );
    }

    const { io } = captureStreams();
    const main: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });
    const component: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd], io, {
      watcherFactory: main,
      componentWatcherFactory: component,
      sourceGeneratedDir,
      onWatchStart,
    });

    const handle = await ready;
    await handle.waitForIdle();

    expect(existsSync(path.join(cwd, "src/ui/tsconfig.json"))).toBe(false);
    expect(existsSync(path.join(cwd, "src/render/tsconfig.json"))).toBe(false);

    handle?.stop();
    const code = await result;
    expect(code).toBe(0);

    rmSync(sourceGeneratedDir, { recursive: true, force: true });
  });

  test("watch resolves to 1 and writes stderr when the initial build throws", async () => {
    const { io, out, err } = captureStreams();
    let opened = false;
    const factory: WatcherFactory = (_srcDir, _onEvent): Watcher => {
      opened = true;
      return { close() {} };
    };

    const result = dispatch(["watch", cwd], io, { watcherFactory: factory });
    expect(result).toBeInstanceOf(Promise);
    const code = await result;

    expect(code).toBe(1);
    expect(out()).toBe("");
    expect(err()).toMatch(/tsconfig\.json/);
    expect(opened).toBe(false);
  });

  test("watch re-resolves the extension surface when game.project changes", async () => {
    const tsconfig = JSON.stringify(
      { compilerOptions: { strict: true }, include: ["src/**/*.ts"] },
      null,
      2,
    );
    writeFileSync(path.join(cwd, "tsconfig.json"), tsconfig);
    const srcDir = path.join(cwd, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(path.join(srcDir, "main.ts"), "export const a = 1;\n");
    writeFileSync(path.join(cwd, "main.script"), "");

    const sourceGeneratedDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-src-"));
    writeFileSync(path.join(sourceGeneratedDir, "label.d.ts"), `declare const __label: unknown;\n`);

    const url = "https://example.com/alpha.zip";
    writeFileSync(path.join(cwd, "game.project"), `[project]\ndependencies#0 = ${url}\n`);

    const { io, err } = captureStreams();
    let triggerMain: ((kind: "change" | "rename", rel: string) => void) | undefined;
    const main: WatcherFactory = (_dir, onEvent): Watcher => {
      triggerMain = (kind, rel) => onEvent({ kind, path: rel });
      return { close() {} };
    };
    const component: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });

    const cacheDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-ext-cache-"));
    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      sourceGeneratedDir,
      detectEditorVersion: () => null,
      resolveInternals: {
        cacheDir,
        download: async () => new TextEncoder().encode("z"),
        readZip: (zipPath: string) => {
          if (path.basename(path.dirname(zipPath)) !== extensionArchiveKey(url)) {
            throw new Error(`no fake archive for ${zipPath}`);
          }
          return {
            entries: () => ["ext/api/alpha.script_api"],
            read: () => ALPHA,
          };
        },
      },
      onWatchStart,
    });

    const handle = await ready;
    await handle?.waitForIdle();

    const extPath = path.join(cwd, ".defold-types", "extensions", "alpha.d.ts");
    expect(existsSync(extPath)).toBe(false);

    writeFileSync(path.join(cwd, "game.project"), `[project]\ndependencies#0 = ${url}\n`);
    triggerMain?.("change", "game.project");
    await handle?.waitForIdle();

    expect(existsSync(extPath)).toBe(true);
    const contents = readFileSync(extPath, "utf8");
    expect(contents).toContain("do_alpha");

    expect(err()).toBe("");

    handle?.stop();
    const code = await result;
    expect(code).toBe(0);

    rmSync(sourceGeneratedDir, { recursive: true, force: true });
    rmSync(cacheDir, { recursive: true, force: true });
  });

  test("watch re-resolves a game.project with no [dependencies] without writing an extension surface", async () => {
    const tsconfig = JSON.stringify(
      { compilerOptions: { strict: true }, include: ["src/**/*.ts"] },
      null,
      2,
    );
    writeFileSync(path.join(cwd, "tsconfig.json"), tsconfig);
    const srcDir = path.join(cwd, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(path.join(srcDir, "main.ts"), "export const a = 1;\n");
    writeFileSync(path.join(cwd, "main.script"), "");
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");

    const sourceGeneratedDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-src-"));
    writeFileSync(path.join(sourceGeneratedDir, "label.d.ts"), `declare const __label: unknown;\n`);

    const { io, err } = captureStreams();
    let triggerMain: ((kind: "change" | "rename", rel: string) => void) | undefined;
    const main: WatcherFactory = (_dir, onEvent): Watcher => {
      triggerMain = (kind, rel) => onEvent({ kind, path: rel });
      return { close() {} };
    };
    const component: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });

    const cacheDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-ext-cache-"));
    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      sourceGeneratedDir,
      resolveInternals: {
        cacheDir,
        download: async () => new TextEncoder().encode("z"),
        readZip: (): ExtensionZip => ({
          entries: () => [],
          read: () => "",
        }),
      },
      onWatchStart,
    });

    const handle = await ready;
    await handle?.waitForIdle();

    triggerMain?.("change", "game.project");
    await handle?.waitForIdle();

    const extDir = path.join(cwd, ".defold-types", "extensions");
    expect(existsSync(extDir)).toBe(false);
    expect(err()).toBe("");

    handle?.stop();
    const code = await result;
    expect(code).toBe(0);

    rmSync(sourceGeneratedDir, { recursive: true, force: true });
    rmSync(cacheDir, { recursive: true, force: true });
  });

  test("watch builds resolveSurface without injected resolveInternals and emits a --json resolve line on game.project change", async () => {
    const tsconfig = JSON.stringify(
      { compilerOptions: { strict: true }, include: ["src/**/*.ts"] },
      null,
      2,
    );
    writeFileSync(path.join(cwd, "tsconfig.json"), tsconfig);
    const srcDir = path.join(cwd, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(path.join(srcDir, "main.ts"), "export const a = 1;\n");
    writeFileSync(path.join(cwd, "main.script"), "");
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");

    const sourceGeneratedDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-src-"));
    writeFileSync(path.join(sourceGeneratedDir, "label.d.ts"), `declare const __label: unknown;\n`);

    const { io, out, err } = captureStreams();
    let triggerMain: ((kind: "change" | "rename", rel: string) => void) | undefined;
    const main: WatcherFactory = (_dir, onEvent): Watcher => {
      triggerMain = (kind, rel) => onEvent({ kind, path: rel });
      return { close() {} };
    };
    const component: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd, "--json"], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      sourceGeneratedDir,
      detectEditorVersion: () => null,
      // No `resolveInternals` — production wiring must still build the
      // resolveSurface closure and run it on a game.project change.
      onWatchStart,
    });

    const handle = await ready;
    await handle?.waitForIdle();

    triggerMain?.("change", "game.project");
    await handle?.waitForIdle();

    const lines = out()
      .split("\n")
      .filter((l) => l.length > 0);
    const resolveLines = lines.filter((l) => {
      try {
        return (JSON.parse(l) as { command?: string }).command === "resolve";
      } catch {
        return false;
      }
    });
    expect(resolveLines).toHaveLength(1);
    const parsed = JSON.parse(resolveLines[0] as string) as {
      command: string;
      ok: boolean;
      written: string[];
      materializedSurface: string | null;
      extensions: unknown[];
      libraries: unknown[];
    };
    expect(parsed).toEqual({
      command: "resolve",
      ok: true,
      written: [],
      materializedSurface: null,
      extensions: [],
      libraries: [],
    });

    const extDir = path.join(cwd, ".defold-types", "extensions");
    expect(existsSync(extDir)).toBe(false);
    expect(err()).toBe("");

    handle?.stop();
    const code = await result;
    expect(code).toBe(0);

    rmSync(sourceGeneratedDir, { recursive: true, force: true });
  });

  test("watch --json reports the bad pin key on its start event", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-version": "1.12.4" } });
    const { io, out } = captureStreams();
    const factory: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd, "--json"], io, {
      watcherFactory: factory,
      onWatchStart,
      detectEditorVersion: () => null,
    });

    const handle = await ready;
    await handle.waitForIdle();
    handle.stop();
    const code = await result;

    expect(code).toBe(0);
    const lines = out().trimEnd().split("\n");
    const start = JSON.parse(lines[0] as string) as { event: string; warnings: string[] };
    expect(start.event).toBe("start");
    const warning = start.warnings.find((w) => w.includes("defold-version"));
    expect(warning).toBeDefined();
    expect(warning).toContain("defold-target");
  });

  test("watch --json reports the bad pin key exactly once across the stream", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-version": "1.12.4" } });
    const { io, out } = captureStreams();
    let triggerMain: ((kind: "change" | "rename", rel: string) => void) | undefined;
    const main: WatcherFactory = (_dir, onEvent): Watcher => {
      triggerMain = (kind, rel) => onEvent({ kind, path: rel });
      return { close() {} };
    };
    const component: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd, "--json"], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      onWatchStart,
      detectEditorVersion: () => null,
    });

    const handle = await ready;
    await handle.waitForIdle();

    // The embedded resolve fires on a game.project change and emits its own
    // `command: "resolve"` payload; it must not repeat the pin diagnostic.
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    triggerMain?.("change", "game.project");
    await handle.waitForIdle();

    handle.stop();
    const code = await result;

    expect(code).toBe(0);
    const stdout = out();
    expect(stdout).toContain('"event":"resolve"');
    expect(stdout.split("defold-version").length - 1).toBe(1);
  });

  test("watch --json keeps the bad pin key on start when the initial build fails", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-version": "1.12.4" } });
    writeFileSync(path.join(cwd, "src", "main.ts"), "export const a: number = 'nope';\n");
    const { io, out } = captureStreams();
    const factory: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd, "--json"], io, {
      watcherFactory: factory,
      onWatchStart,
      detectEditorVersion: () => null,
    });

    const handle = await ready;
    await handle.waitForIdle();
    handle.stop();
    await result;

    const lines = out().trimEnd().split("\n");
    const start = JSON.parse(lines[0] as string) as { event: string; warnings: string[] };
    expect(start.event).toBe("start");
    expect(start.warnings.some((w) => w.includes("defold-target"))).toBe(true);
    const build = JSON.parse(lines[1] as string) as { event: string; ok: boolean };
    expect(build.event).toBe("build");
    expect(build.ok).toBe(false);
  });

  test("watch --json on a valid pin emits a start event with no warnings", async () => {
    scaffoldBuildProject({
      "defold-typescript": { "defold-target": CURRENT_STABLE_DEFOLD_VERSION },
    });
    const { io, out, err } = captureStreams();
    const factory: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd, "--json"], io, {
      watcherFactory: factory,
      onWatchStart,
    });

    const handle = await ready;
    await handle.waitForIdle();
    handle.stop();
    const code = await result;

    expect(code).toBe(0);
    const lines = out().trimEnd().split("\n");
    const start = JSON.parse(lines[0] as string) as Record<string, unknown>;
    expect(start).toEqual({ command: "watch", event: "start", ok: true, written: [] });
    expect(err()).toBe("");
  });

  test("non-JSON watch writes the bad pin key to stderr once", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-version": "1.12.4" } });
    const { io, err } = captureStreams();
    const factory: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd], io, {
      watcherFactory: factory,
      onWatchStart,
      detectEditorVersion: () => null,
    });

    const handle = await ready;
    await handle.waitForIdle();
    handle.stop();
    const code = await result;

    expect(code).toBe(0);
    const stderr = err();
    expect(stderr).toContain("defold-target");
    expect(stderr.split("defold-version").length - 1).toBe(1);
  });
});

describe("dispatch wall command", () => {
  function scaffoldWallProject(): void {
    writeFileSync(
      path.join(cwd, "tsconfig.json"),
      `${JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }, null, 2)}\n`,
    );
    mkdirSync(path.join(cwd, "src", "ui"), { recursive: true });
    mkdirSync(path.join(cwd, "src", "render"), { recursive: true });
    writeFileSync(
      path.join(cwd, "src", "ui", "hud.ts"),
      'import { defineGuiScript } from "@defold-typescript/types/gui-script";\nexport default defineGuiScript({});\n',
    );
    writeFileSync(
      path.join(cwd, "src", "render", "cam.ts"),
      'import { defineRenderScript } from "@defold-typescript/types/render-script";\nexport default defineRenderScript({});\n',
    );
  }

  function readRoot(): { exclude?: string[]; references?: { path: string }[] } {
    return JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8"));
  }

  test("wall <dir...> walls exactly those and --json reports directoryWalls", async () => {
    scaffoldWallProject();
    const { io, out } = captureStreams();

    const code = await dispatch(["wall", "src/ui", "src/render", "--json"], io, { cwd });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      directoryWalls: { dir: string; kind: string }[];
    };
    expect(parsed.directoryWalls).toEqual([
      { dir: "src/render", kind: "render-script" },
      { dir: "src/ui", kind: "gui-script" },
    ]);
    expect(existsSync(path.join(cwd, "src/ui/tsconfig.json"))).toBe(true);
    expect(existsSync(path.join(cwd, "src/render/tsconfig.json"))).toBe(true);
    expect(readRoot().references).toEqual([{ path: "src/render" }, { path: "src/ui" }]);
  });

  test("wall --remove drops that wall and leaves others intact", async () => {
    scaffoldWallProject();
    const { io } = captureStreams();
    dispatch(["wall", "src/ui", "src/render"], io, { cwd });

    const { io: io2, out } = captureStreams();
    const code = await dispatch(["wall", "--remove", "src/ui", "--json"], io2, { cwd });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { directoryWalls: { dir: string; kind: string }[] };
    expect(parsed.directoryWalls).toEqual([{ dir: "src/render", kind: "render-script" }]);
    expect(existsSync(path.join(cwd, "src/ui/tsconfig.json"))).toBe(false);
    expect(readRoot().references).toEqual([{ path: "src/render" }]);
  });

  test("wall --list --json reports current and eligible walls and writes nothing", async () => {
    scaffoldWallProject();
    const { io } = captureStreams();
    dispatch(["wall", "src/ui"], io, { cwd });
    const renderTsconfigBefore = existsSync(path.join(cwd, "src/render/tsconfig.json"));

    const { io: io2, out } = captureStreams();
    const code = await dispatch(["wall", "--list", "--json"], io2, { cwd });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      directoryWalls: { dir: string; kind: string }[];
      eligible: { dir: string; kind: string }[];
    };
    expect(parsed.directoryWalls).toEqual([{ dir: "src/ui", kind: "gui-script" }]);
    expect(parsed.eligible).toEqual([
      { dir: "src/render", kind: "render-script" },
      { dir: "src/ui", kind: "gui-script" },
    ]);
    expect(existsSync(path.join(cwd, "src/render/tsconfig.json"))).toBe(renderTsconfigBefore);
  });

  test("wall with no dir and no TTY exits non-zero and writes nothing", async () => {
    scaffoldWallProject();
    const { io, out, err } = captureStreams();

    const code = await dispatch(["wall"], io, { cwd, isTty: false });

    expect(code).toBe(1);
    expect(out()).toBe("");
    expect(err()).toContain("no directory given");
    expect(existsSync(path.join(cwd, "src/ui/tsconfig.json"))).toBe(false);
  });

  test("wall on a mixed-kind directory errors and writes nothing", async () => {
    writeFileSync(
      path.join(cwd, "tsconfig.json"),
      `${JSON.stringify({ include: ["src/**/*.ts"] }, null, 2)}\n`,
    );
    mkdirSync(path.join(cwd, "src", "mix"), { recursive: true });
    writeFileSync(
      path.join(cwd, "src", "mix", "a.ts"),
      'import { defineScript } from "@defold-typescript/types/script";\nexport default defineScript({});\n',
    );
    writeFileSync(
      path.join(cwd, "src", "mix", "b.ts"),
      'import { defineGuiScript } from "@defold-typescript/types/gui-script";\nexport default defineGuiScript({});\n',
    );
    const { io, err } = captureStreams();

    const code = await dispatch(["wall", "src/mix"], io, { cwd });

    expect(code).toBe(1);
    expect(err()).toContain("single-kind source directory");
    expect(existsSync(path.join(cwd, "src/mix/tsconfig.json"))).toBe(false);
    expect("references" in readRoot()).toBe(false);
  });

  test("bare wall on a TTY without --json runs the injected menu", async () => {
    scaffoldWallProject();
    const { io, out } = captureStreams();

    const code = await dispatch(["wall"], io, {
      cwd,
      isTty: true,
      wallCheckbox: async () => ["src/ui"],
    });

    expect(code).toBe(0);
    expect(out()).toContain("src/ui");
    expect(existsSync(path.join(cwd, "src/ui/tsconfig.json"))).toBe(true);
    expect(readRoot().references).toEqual([{ path: "src/ui" }]);
  });

  test("bare wall --json on a TTY does not prompt — it errors like the non-TTY path", async () => {
    scaffoldWallProject();
    const { io, out, err } = captureStreams();

    const code = await dispatch(["wall", "--json"], io, { cwd, isTty: true });

    expect(code).toBe(1);
    expect(out()).toBe("");
    expect(err()).toContain("no directory given");
    expect(existsSync(path.join(cwd, "src/ui/tsconfig.json"))).toBe(false);
  });
});

const SETUP_DEBUG_SCRIPT = `import { defineScript } from "@defold-typescript/types";

export default defineScript({
  init() {},
});
`;

describe("dispatch setup-debug", () => {
  test("routes to runSetupDebug, wiring the sole candidate and returning 0", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\ntitle = demo\n");
    mkdirSync(path.join(cwd, "src"), { recursive: true });
    writeFileSync(path.join(cwd, "src", "player.ts"), SETUP_DEBUG_SCRIPT);
    const { io, out, err } = captureStreams();

    const code = await dispatch(["setup-debug", cwd], io);

    expect(code).toBe(0);
    expect(err()).toBe("");
    expect(out()).toContain("src/player.ts");
    expect(out()).toMatch(/Fetch Libraries/i);
    expect(readFileSync(path.join(cwd, "game.project"), "utf8")).toContain("lldebugger");
  });

  test("--json emits the structured setup-debug result", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\ntitle = demo\n");
    mkdirSync(path.join(cwd, "src"), { recursive: true });
    writeFileSync(path.join(cwd, "src", "player.ts"), SETUP_DEBUG_SCRIPT);
    const { io, out } = captureStreams();

    const code = await dispatch(["setup-debug", cwd, "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      command: string;
      ok: boolean;
      written: string[];
      manualSteps: string[];
    };
    expect(parsed.command).toBe("setup-debug");
    expect(parsed.ok).toBe(true);
    expect(parsed.written).toContain("game.project");
    expect(parsed.manualSteps.length).toBeGreaterThan(0);
  });

  test("--script targets the named file", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\ntitle = demo\n");
    mkdirSync(path.join(cwd, "src"), { recursive: true });
    writeFileSync(path.join(cwd, "src", "player.ts"), SETUP_DEBUG_SCRIPT);
    writeFileSync(path.join(cwd, "src", "hud.ts"), SETUP_DEBUG_SCRIPT);
    const { io, out } = captureStreams();

    const code = await dispatch(["setup-debug", cwd, "--script", "src/hud.ts"], io);

    expect(code).toBe(0);
    expect(out()).toContain("src/hud.ts");
    expect(readFileSync(path.join(cwd, "src", "hud.ts"), "utf8")).toContain("lldebugger");
    expect(readFileSync(path.join(cwd, "src", "player.ts"), "utf8")).not.toContain("lldebugger");
  });

  test("multiple candidates without --script in --json mode errors with exit 1", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\ntitle = demo\n");
    mkdirSync(path.join(cwd, "src"), { recursive: true });
    writeFileSync(path.join(cwd, "src", "player.ts"), SETUP_DEBUG_SCRIPT);
    writeFileSync(path.join(cwd, "src", "hud.ts"), SETUP_DEBUG_SCRIPT);
    const { io, out } = captureStreams();

    const code = await dispatch(["setup-debug", cwd, "--json"], io);

    expect(code).toBe(1);
    const parsed = JSON.parse(out()) as { command: string; ok: boolean; error: string };
    expect(parsed.command).toBe("setup-debug");
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("src/hud.ts");
  });

  test("--json carries addedTo, removedFrom, and the boot-path trace", async () => {
    writeFileSync(
      path.join(cwd, "game.project"),
      "[project]\ntitle = demo\n\n[bootstrap]\nmain_collection = /main.collectionc\n",
    );
    writeFileSync(
      path.join(cwd, "main.collection"),
      'name: "main"\nembedded_instances {\n  id: "player"\n  data: "components {\\n"\n  "  component: \\"/src/player.ts.script\\"\\n"\n  "}\\n"\n  ""\n}\n',
    );
    mkdirSync(path.join(cwd, "src"), { recursive: true });
    writeFileSync(path.join(cwd, "src", "player.ts"), SETUP_DEBUG_SCRIPT);
    const { io, out } = captureStreams();

    const code = await dispatch(["setup-debug", cwd, "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      command: string;
      ok: boolean;
      addedTo: string;
      removedFrom: string[];
      bootPath: string[];
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.addedTo).toBe("src/player.ts");
    expect(parsed.removedFrom).toEqual([]);
    expect(parsed.bootPath).toEqual([
      "game.project",
      "main.collection",
      "player",
      "/src/player.ts.script",
    ]);
  });
});

describe("dispatch bob", () => {
  const SHA = "8fd9f9f5c6e1bd91b8c0f0a3a7d2e1c4b5a60798";

  function defoldInternals(overrides: Partial<DefoldIo> = {}): {
    internals: {
      defoldIo: Partial<DefoldIo>;
      fetchVersionInfo: (version: string) => Promise<{ sha1: string }>;
    };
    spawned: string[][];
    captures: boolean[];
    downloaded: string[];
  } {
    const spawned: string[][] = [];
    const captures: boolean[] = [];
    const downloaded: string[] = [];
    return {
      spawned,
      captures,
      downloaded,
      internals: {
        fetchVersionInfo: async () => ({ sha1: SHA }),
        defoldIo: {
          cacheDir: "/c",
          probe: () => true,
          javaProbe: () => true,
          spawn: async (argv, _cwd, opts) => {
            spawned.push(argv);
            captures.push(opts?.capture ?? false);
            return { exitCode: 0 };
          },
          download: async (url) => {
            downloaded.push(url);
          },
          ...overrides,
        },
      },
    };
  }

  test("bob resolve spawns bob and returns 0", async () => {
    const { io } = captureStreams();
    const { internals, spawned } = defoldInternals();

    const code = await dispatch(["bob", "resolve", cwd], io, internals);

    expect(code).toBe(0);
    expect(spawned[0]).toContain("resolve");
    expect(spawned[0]).toContain("-jar");
  });

  test("bob build composes a debug-variant build", async () => {
    const { io } = captureStreams();
    const { internals, spawned } = defoldInternals();

    await dispatch(["bob", "build", cwd], io, internals);

    expect(spawned[0]).toContain("--variant");
    expect(spawned[0]).toContain("debug");
    expect(spawned[0]).toContain("build");
  });

  test("--build-server is threaded into bob's argv", async () => {
    const { io } = captureStreams();
    const { internals, spawned } = defoldInternals();

    await dispatch(["bob", "build", cwd, "--build-server", "https://build.example"], io, internals);

    expect(spawned[0]).toContain("--build-server");
    expect(spawned[0]).toContain("https://build.example");
  });

  test("a non-zero bob exit becomes the CLI exit code", async () => {
    const { io, err } = captureStreams();
    const { internals } = defoldInternals({ spawn: async () => ({ exitCode: 17 }) });

    const code = await dispatch(["bob", "bundle", cwd], io, internals);

    expect(code).toBe(17);
    expect(err()).not.toContain("\n    at ");
  });

  test("--json keeps stdout to exactly one JSON object with bob chatter in the envelope", async () => {
    const { io, out } = captureStreams();
    const { internals } = defoldInternals({
      spawn: async () => ({ exitCode: 0, output: "bob: building\nbob: done" }),
    });

    const code = await dispatch(["bob", "resolve", cwd, "--json"], io, internals);

    expect(code).toBe(0);
    const lines = out().trim().split("\n");
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0] as string) as {
      command: string;
      subcommand: string;
      ok: boolean;
      exitCode: number;
      output: string;
    };
    expect(parsed).toMatchObject({
      command: "bob",
      subcommand: "resolve",
      ok: true,
      exitCode: 0,
    });
    expect(parsed.output).toBe("bob: building\nbob: done");
  });

  test("--json surfaces a failing bob's captured output and marks ok:false", async () => {
    const { io, out } = captureStreams();
    const { internals } = defoldInternals({
      spawn: async () => ({ exitCode: 5, output: "bob: fatal error" }),
    });

    const code = await dispatch(["bob", "build", cwd, "--json"], io, internals);

    expect(code).toBe(5);
    const parsed = JSON.parse(out().trim()) as {
      ok: boolean;
      exitCode: number;
      error: string;
      output: string;
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.exitCode).toBe(5);
    expect(parsed.error).toBeDefined();
    expect(parsed.output).toBe("bob: fatal error");
  });

  test("--json runs bob in capture mode", async () => {
    const { io } = captureStreams();
    const { internals, captures } = defoldInternals();

    await dispatch(["bob", "resolve", cwd, "--json"], io, internals);

    expect(captures).toEqual([true]);
  });

  test("without --json bob runs in inherit mode and no JSON is written", async () => {
    const { io, out } = captureStreams();
    const { internals, captures } = defoldInternals();

    const code = await dispatch(["bob", "resolve", cwd], io, internals);

    expect(code).toBe(0);
    expect(captures).toEqual([false]);
    expect(out()).toBe("");
  });

  test("--json emits a bob result via renderResult", async () => {
    const { io, out } = captureStreams();
    const { internals } = defoldInternals();

    const code = await dispatch(["bob", "resolve", cwd, "--json"], io, internals);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      command: string;
      ok: boolean;
      subcommand: string;
      exitCode: number;
    };
    expect(parsed.command).toBe("bob");
    expect(parsed.subcommand).toBe("resolve");
    expect(parsed.ok).toBe(true);
    expect(parsed.exitCode).toBe(0);
  });

  test("--defold-target beta drives the head sha into the bob.jar download and --json report", async () => {
    const { io, out } = captureStreams();
    const { internals, downloaded } = defoldInternals({ probe: () => false });

    const code = await dispatch(["bob", "build", cwd, "--defold-target", "beta", "--json"], io, {
      ...internals,
      fetchChannelInfo: async () => ({ version: "1.13.0", sha1: "abc" }),
    });

    expect(code).toBe(0);
    expect(downloaded).toEqual(["https://d.defold.com/archive/stable/abc/bob/bob.jar"]);
    const parsed = JSON.parse(out().trim()) as {
      defoldVersion: string;
      defoldChannel: string | null;
      defoldSha: string | null;
    };
    expect(parsed.defoldVersion).toBe("1.13.0");
    expect(parsed.defoldChannel).toBe("beta");
    expect(parsed.defoldSha).toBe("abc");
  });

  test("--defold-target with a fixed version resolves that version's artifact sha", async () => {
    const { io, out } = captureStreams();
    const { internals, downloaded } = defoldInternals({ probe: () => false });

    const code = await dispatch(["bob", "build", cwd, "--defold-target", "1.12.4", "--json"], io, {
      ...internals,
      fetchVersionInfo: async () => ({ sha1: "fixed-sha" }),
    });

    expect(code).toBe(0);
    expect(downloaded).toEqual(["https://d.defold.com/archive/stable/fixed-sha/bob/bob.jar"]);
    const parsed = JSON.parse(out().trim()) as {
      defoldVersion: string;
      defoldChannel: string | null;
      defoldSha: string | null;
    };
    expect(parsed.defoldVersion).toBe("1.12.4");
    expect(parsed.defoldChannel).toBeNull();
    expect(parsed.defoldSha).toBe("fixed-sha");
  });

  test("bob status reports the resolved state, returns 0, and runs neither download nor bob", async () => {
    const { io, out } = captureStreams();
    const { internals, spawned, downloaded } = defoldInternals();

    const code = await dispatch(["bob", "status", cwd, "--defold-target", "1.12.4"], io, internals);

    expect(code).toBe(0);
    expect(spawned).toEqual([]);
    expect(downloaded).toEqual([]);
    expect(out()).toContain("1.12.4");
    expect(out()).toContain(SHA);
  });

  test("bob status --json emits a status envelope and runs nothing", async () => {
    const { io, out } = captureStreams();
    const { internals, spawned, downloaded } = defoldInternals();

    const code = await dispatch(
      ["bob", "status", cwd, "--defold-target", "1.12.4", "--json"],
      io,
      internals,
    );

    expect(code).toBe(0);
    const parsed = JSON.parse(out().trim()) as {
      command: string;
      subcommand: string;
      ok: boolean;
    };
    expect(parsed).toMatchObject({ command: "bob", subcommand: "status", ok: true });
    expect(spawned).toEqual([]);
    expect(downloaded).toEqual([]);
  });

  test("bob status --json on an offline channel exits non-zero with an error", async () => {
    const { io, out } = captureStreams();
    const { internals } = defoldInternals();

    const code = await dispatch(["bob", "status", cwd, "--defold-target", "beta", "--json"], io, {
      ...internals,
      fetchChannelInfo: async () => {
        throw new Error("offline: could not resolve the beta Defold head");
      },
    });

    expect(code).toBe(1);
    const parsed = JSON.parse(out().trim()) as { ok: boolean; error?: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBeDefined();
  });

  test("unknown bob subcommand prints usage listing resolve|build|bundle", async () => {
    const { io, err } = captureStreams();
    const { internals } = defoldInternals();

    const code = await dispatch(["bob", "frobnicate", cwd], io, internals);

    expect(code).toBe(1);
    expect(err()).toMatch(/resolve\|build\|bundle/);
  });

  test("a missing bob subcommand prints the bob usage string", async () => {
    const { io, err } = captureStreams();
    const { internals } = defoldInternals();

    const code = await dispatch(["bob"], io, internals);

    expect(code).toBe(1);
    expect(err()).toBe("Usage: defold-typescript bob <resolve|build|bundle|status|run> [path]\n");
  });

  test("bob run builds then launches and returns the engine exit code with a composite --json envelope", async () => {
    const { io, out } = captureStreams();
    const { internals } = defoldInternals();
    const engineSpawned: string[][] = [];

    const code = await dispatch(["bob", "run", cwd, "--defold-target", "1.12.4", "--json"], io, {
      ...internals,
      runInternals: {
        platform: "darwin",
        arch: "arm64",
        probe: () => true,
        spawn: (argv) => {
          engineSpawned.push(argv);
          return { kill: () => {}, exited: Promise.resolve(0) };
        },
        copyAside: (p) => p,
        chmod: () => {},
      },
    });

    expect(code).toBe(0);
    expect(engineSpawned).toHaveLength(1);
    const parsed = JSON.parse(out().trim()) as {
      command: string;
      subcommand: string;
      ok: boolean;
      build: { exitCode: number };
      launch: { enginePath: string; exitCode: number };
    };
    expect(parsed).toMatchObject({
      command: "bob",
      subcommand: "run",
      ok: true,
      build: { exitCode: 0 },
      launch: { exitCode: 0 },
    });
    expect(parsed.launch.enginePath).toBe(path.join(cwd, "build", "arm64-macos", "dmengine"));
  });

  test("bob run with a failing build returns the bob exit code and never launches", async () => {
    const { io, err } = captureStreams();
    const { internals } = defoldInternals({ spawn: async () => ({ exitCode: 5 }) });
    const engineSpawned: string[][] = [];

    const code = await dispatch(["bob", "run", cwd, "--defold-target", "1.12.4"], io, {
      ...internals,
      runInternals: {
        platform: "darwin",
        arch: "arm64",
        probe: () => true,
        spawn: (argv) => {
          engineSpawned.push(argv);
          return { kill: () => {}, exited: Promise.resolve(0) };
        },
        copyAside: (p) => p,
        chmod: () => {},
      },
    });

    expect(code).toBe(5);
    expect(engineSpawned).toEqual([]);
    expect(err()).toContain("5");
  });

  test("the removed defold command is unknown and falls through to top-level usage", async () => {
    const { io, err } = captureStreams();

    const code = await dispatch(["defold", "resolve", cwd], io);

    expect(code).toBe(1);
    expect(err()).toBe(
      "Usage: defold-typescript <init|init-agents|build|watch|wall|setup-debug|resolve|bob|run> [path]\n",
    );
  });
});

describe("dispatch resolve", () => {
  function resolveInternals(url: string): {
    resolveInternals: {
      download: () => Promise<Uint8Array>;
      readZip: (zipPath: string) => ExtensionZip;
      cacheDir: string;
    };
  } {
    const cacheDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-ext-cache-"));
    const key = extensionArchiveKey(url);
    return {
      resolveInternals: {
        cacheDir,
        download: async () => new TextEncoder().encode("z"),
        readZip: (zipPath: string) => {
          if (path.basename(path.dirname(zipPath)) !== key) {
            throw new Error(`no fake archive for ${zipPath}`);
          }
          return {
            entries: () => ["ext/api/alpha.script_api"],
            read: () => ALPHA,
          };
        },
      },
    };
  }

  function writeProject(body: string): void {
    writeFileSync(path.join(cwd, "game.project"), body);
    writeFileSync(
      path.join(cwd, "tsconfig.json"),
      `${JSON.stringify({ compilerOptions: { types: ["@defold-typescript/types"] } }, null, 2)}\n`,
    );
  }

  test("resolves the declared extension and writes the materialized surface", async () => {
    const { io } = captureStreams();
    const url = "https://example.com/alpha.zip";
    writeProject(`[project]\ndependencies#0 = ${url}\n`);

    const code = await dispatch(["resolve", cwd], io, resolveInternals(url));

    expect(code).toBe(0);
    expect(existsSync(path.join(cwd, ".defold-types", "extensions", "alpha.d.ts"))).toBe(true);
  });

  test("--json emits one line carrying the per-extension report", async () => {
    const { io, out } = captureStreams();
    const url = "https://example.com/alpha.zip";
    writeProject(`[project]\ndependencies#0 = ${url}\n`);

    const code = await dispatch(["resolve", cwd, "--json"], io, resolveInternals(url));

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      command: string;
      ok: boolean;
      extensions: {
        url: string;
        namespaces: string[];
        scriptApiCount: number;
        resolvedVersion?: string;
        pinnedVersion?: string;
        pinStatus?: "unpinned" | "match" | "drift";
      }[];
    };
    expect(parsed.command).toBe("resolve");
    expect(parsed.ok).toBe(true);
    expect(parsed.extensions).toEqual([
      {
        url,
        provenance: "download",
        namespaces: ["alpha"],
        scriptApiCount: 1,
        assetOnly: false,
        resolvedVersion: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) as unknown as string,
        pinStatus: "unpinned",
      },
    ] as unknown as typeof parsed.extensions);
  });

  test("--json reports the resolved head version/channel/sha for a channel target", async () => {
    const { io, out } = captureStreams();
    const url = "https://example.com/alpha.zip";
    writeProject(`[project]\ndependencies#0 = ${url}\n`);

    const code = await dispatch(["resolve", cwd, "--defold-target", "beta", "--json"], io, {
      ...resolveInternals(url),
      fetchChannelInfo: async () => ({ version: "1.13.0", sha1: "abc123" }),
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      defoldVersion: string;
      defoldChannel: string | null;
      defoldSha: string | null;
      apiSurface: string | null;
    };
    expect(parsed.defoldVersion).toBe("1.13.0");
    expect(parsed.defoldChannel).toBe("beta");
    expect(parsed.defoldSha).toBe("abc123");
    // The registered 1.13.0 surface derives from the resolved head version,
    // never from the channel pin token.
    expect(parsed.apiSurface).toBe("defold-1.13.0");
  });

  test("--json includes pinnedVersion when the project pins the url", async () => {
    const { io, out } = captureStreams();
    const url = "https://example.com/alpha.zip";
    writeProject(`[project]\ndependencies#0 = ${url}\n`);
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify(
        { "defold-typescript": { extensions: { [url]: "sha256:pinned" } } },
        null,
        2,
      )}\n`,
    );

    const code = await dispatch(["resolve", cwd, "--json"], io, resolveInternals(url));

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      extensions: { resolvedVersion: string; pinnedVersion?: string }[];
    };
    expect(parsed.extensions).toHaveLength(1);
    expect(parsed.extensions[0]?.resolvedVersion).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(parsed.extensions[0]?.pinnedVersion).toBe("sha256:pinned");
  });

  function libraryResolveInternals(url: string): {
    resolveInternals: {
      download: () => Promise<Uint8Array>;
      readZip: (zipPath: string) => ExtensionZip;
      cacheDir: string;
      libraryRegistry: { sourceId: string; modules: string[] }[];
      libraryGeneratedDir: string;
    };
  } {
    const cacheDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-ext-cache-"));
    const generatedDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-lib-generated-"));
    writeFileSync(path.join(generatedDir, "mylib.core.d.ts"), "declare module 'mylib.core' {}\n");
    const key = extensionArchiveKey(url);
    return {
      resolveInternals: {
        cacheDir,
        libraryRegistry: [{ sourceId: "mylib", modules: ["mylib.core"] }],
        libraryGeneratedDir: generatedDir,
        download: async () => new TextEncoder().encode("z"),
        readZip: (zipPath: string) => {
          if (path.basename(path.dirname(zipPath)) !== key) {
            throw new Error(`no fake archive for ${zipPath}`);
          }
          return { entries: () => ["mylib-main/mylib/core.lua", "asset/foo.png"], read: () => "" };
        },
      },
    };
  }

  // The repo name matches the registry, but the archive ships a different module
  // folder, so the match cannot be verified against `mylib.core`.
  function unverifiedLibraryResolveInternals(url: string): {
    resolveInternals: {
      download: () => Promise<Uint8Array>;
      readZip: (zipPath: string) => ExtensionZip;
      cacheDir: string;
      libraryRegistry: { sourceId: string; modules: string[] }[];
      libraryGeneratedDir: string;
    };
  } {
    const cacheDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-ext-cache-"));
    const generatedDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-lib-generated-"));
    writeFileSync(path.join(generatedDir, "mylib.core.d.ts"), "declare module 'mylib.core' {}\n");
    const key = extensionArchiveKey(url);
    return {
      resolveInternals: {
        cacheDir,
        libraryRegistry: [{ sourceId: "mylib", modules: ["mylib.core"] }],
        libraryGeneratedDir: generatedDir,
        download: async () => new TextEncoder().encode("z"),
        readZip: (zipPath: string) => {
          if (path.basename(path.dirname(zipPath)) !== key) {
            throw new Error(`no fake archive for ${zipPath}`);
          }
          return { entries: () => ["mylib-main/somethingelse/init.lua"], read: () => "" };
        },
      },
    };
  }

  test("--json includes a verified libraries report for a matched asset-only dependency", async () => {
    const { io, out } = captureStreams();
    const url = "https://github.com/owner/mylib/archive/main.zip";
    writeProject(`[project]\ndependencies#0 = ${url}\n`);

    const code = await dispatch(["resolve", cwd, "--json"], io, libraryResolveInternals(url));

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      libraries: {
        url: string;
        source: string;
        modules: string[];
        provenance: string;
        verified: boolean;
      }[];
    };
    expect(parsed.libraries).toEqual([
      { url, source: "mylib", modules: ["mylib.core"], provenance: "vendored", verified: true },
    ]);
  });

  test("the human path prints matched library modules instead of asset-only, skipped", async () => {
    const { io, out } = captureStreams();
    const url = "https://github.com/owner/mylib/archive/main.zip";
    writeProject(`[project]\ndependencies#0 = ${url}\n`);

    const code = await dispatch(["resolve", cwd], io, libraryResolveInternals(url));

    expect(code).toBe(0);
    expect(out()).toContain("mylib.core");
    expect(out()).not.toContain("asset-only, skipped");
  });

  test("--json reports an unverified match with verified:false and no modules", async () => {
    const { io, out } = captureStreams();
    const url = "https://github.com/other-owner/mylib/archive/main.zip";
    writeProject(`[project]\ndependencies#0 = ${url}\n`);

    const code = await dispatch(
      ["resolve", cwd, "--json"],
      io,
      unverifiedLibraryResolveInternals(url),
    );

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      libraries: { url: string; source: string; modules: string[]; verified: boolean }[];
    };
    expect(parsed.libraries).toEqual([
      { url, source: "mylib", modules: [], provenance: "vendored", verified: false },
    ] as unknown as typeof parsed.libraries);
  });

  test("the human path warns for an unverified match instead of printing modules", async () => {
    const { io, out, err } = captureStreams();
    const url = "https://github.com/other-owner/mylib/archive/main.zip";
    writeProject(`[project]\ndependencies#0 = ${url}\n`);

    const code = await dispatch(["resolve", cwd], io, unverifiedLibraryResolveInternals(url));

    expect(code).toBe(0);
    expect(out()).not.toContain("mylib.core");
    expect(err()).toContain("unverified");
    expect(err()).toContain(url);
  });

  test("a missing game.project returns 1 and, under --json, reports ok:false", async () => {
    const { io, out } = captureStreams();

    const code = await dispatch(
      ["resolve", cwd, "--json"],
      io,
      resolveInternals("https://x/0.zip"),
    );

    expect(code).toBe(1);
    const parsed = JSON.parse(out()) as { command: string; ok: boolean; error: string };
    expect(parsed.command).toBe("resolve");
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBeDefined();
  });

  test("the human path warns on drift without a flag and exits 0", async () => {
    const { io, err } = captureStreams();
    const url = "https://example.com/alpha.zip";
    writeProject(`[project]\ndependencies#0 = ${url}\n`);
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify(
        { "defold-typescript": { extensions: { [url]: "sha256:pinned" } } },
        null,
        2,
      )}\n`,
    );

    const code = await dispatch(["resolve", cwd], io, resolveInternals(url));

    expect(code).toBe(0);
    const warning = err();
    expect(warning).toContain(url);
    expect(warning).toContain("sha256:pinned");
    expect(warning).toMatch(/drift/);
  });

  test("--frozen fails on drift and does not seed absent pins", async () => {
    const { io, err } = captureStreams();
    const driftedUrl = "https://example.com/drifted.zip";
    const freshUrl = "https://example.com/fresh.zip";
    writeProject(`[project]\ndependencies#0 = ${driftedUrl}\ndependencies#1 = ${freshUrl}\n`);
    const pkgPath = path.join(cwd, "package.json");
    writeFileSync(
      pkgPath,
      `${JSON.stringify(
        { "defold-typescript": { extensions: { [driftedUrl]: "sha256:stale" } } },
        null,
        2,
      )}\n`,
    );
    const originalPkg = readFileSync(pkgPath, "utf8");

    // Custom readZip that returns ALPHA for the drifted url and a no-op archive
    // for the fresh one (no entries -> asset-only branch).
    const internals = (() => {
      const base = resolveInternals(driftedUrl);
      const cacheDir = base.resolveInternals.cacheDir;
      const freshKey = extensionArchiveKey(freshUrl);
      return {
        resolveInternals: {
          cacheDir,
          download: base.resolveInternals.download,
          readZip: (zipPath: string) => {
            const key = path.basename(path.dirname(zipPath));
            if (key === extensionArchiveKey(driftedUrl)) {
              return base.resolveInternals.readZip(zipPath);
            }
            if (key === freshKey) {
              return { entries: () => ["asset/foo.png"], read: () => "" };
            }
            throw new Error(`unexpected readZip for ${zipPath}`);
          },
        },
      };
    })();

    const code = await dispatch(["resolve", cwd, "--frozen"], io, internals);

    expect(code).toBe(1);
    const warning = err();
    expect(warning).toContain(driftedUrl);
    expect(warning).toContain("sha256:stale");
    // package.json byte-unchanged: no drift clobber, no absent-pinned seed
    expect(readFileSync(pkgPath, "utf8")).toBe(originalPkg);
  });

  test("--frozen passes when all pins match", async () => {
    const { io, err } = captureStreams();
    const url = "https://example.com/alpha.zip";
    writeProject(`[project]\ndependencies#0 = ${url}\n`);

    // Resolve once to learn the real digest, then pin it
    const first = await runResolve({
      cwd,
      cacheDir: mkdtempSync(path.join(os.tmpdir(), "frozen-precache-")),
      download: async () => new TextEncoder().encode("z"),
      readZip: resolveInternals(url).resolveInternals.readZip,
    });
    expect(first.ok).toBe(true);
    const matchingDigest = first.extensions[0]?.resolvedVersion as string;
    expect(matchingDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify(
        { "defold-typescript": { extensions: { [url]: matchingDigest } } },
        null,
        2,
      )}\n`,
    );

    const code = await dispatch(["resolve", cwd, "--frozen"], io, resolveInternals(url));

    expect(code).toBe(0);
    // No drift warning expected
    expect(err()).not.toContain("drift");
  });

  test("--frozen passes when all extensions are unpinned and seeds nothing", async () => {
    const { io, err } = captureStreams();
    const url = "https://example.com/alpha.zip";
    writeProject(`[project]\ndependencies#0 = ${url}\n`);
    const pkgPath = path.join(cwd, "package.json");
    const originalPkg = "{}\n";
    writeFileSync(pkgPath, originalPkg);

    const code = await dispatch(["resolve", cwd, "--frozen"], io, resolveInternals(url));

    expect(code).toBe(0);
    // No drift warning (unpinned passes under --frozen)
    expect(err()).not.toContain("drift");
    // No pin seeded
    expect(readFileSync(pkgPath, "utf8")).toBe(originalPkg);
  });

  test("--json carries pinStatus and --frozen still exits 1 on drift", async () => {
    const { io, out, err } = captureStreams();
    const url = "https://example.com/alpha.zip";
    writeProject(`[project]\ndependencies#0 = ${url}\n`);
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify(
        { "defold-typescript": { extensions: { [url]: "sha256:stale" } } },
        null,
        2,
      )}\n`,
    );

    const code = await dispatch(["resolve", cwd, "--json", "--frozen"], io, resolveInternals(url));

    expect(code).toBe(1);
    const parsed = JSON.parse(out()) as {
      command: string;
      ok: boolean;
      extensions: { url: string; pinStatus: string }[];
    };
    expect(parsed.command).toBe("resolve");
    expect(parsed.ok).toBe(true);
    expect(parsed.extensions).toHaveLength(1);
    expect(parsed.extensions[0]?.url).toBe(url);
    expect(parsed.extensions[0]?.pinStatus).toBe("drift");
    expect(err()).toContain("drift");
  });

  function writePin(pkg: Record<string, unknown>): void {
    writeFileSync(path.join(cwd, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  }

  test("resolve --json reports the bad pin key as a warning and stays ok", async () => {
    writeProject("[project]\n");
    writePin({ "defold-typescript": { "defold-version": "1.12.4" } });
    const { io, out } = captureStreams();

    const code = await dispatch(["resolve", cwd, "--json"], io, {
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { ok: boolean; warnings: string[] };
    expect(parsed.ok).toBe(true);
    const warning = parsed.warnings.find((w) => w.includes("defold-version"));
    expect(warning).toBeDefined();
    expect(warning).toContain("defold-target");
  });

  test("a bad pin key does not become a resolve pin: resolution is unchanged", async () => {
    writeProject("[project]\n");
    writePin({ "defold-typescript": { "defold-version": "1.12.4" } });
    const { io, out } = captureStreams();

    const code = await dispatch(["resolve", cwd, "--json"], io, {
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string; defoldVersionSource: string };
    expect(parsed.defoldVersionSource).toBe("default");
    expect(parsed.defoldVersion).toBe(CURRENT_STABLE_DEFOLD_VERSION);
  });

  test("a valid pin produces no pin-key warning on the resolve payload", async () => {
    writeProject("[project]\n");
    writePin({ "defold-typescript": { "defold-target": CURRENT_STABLE_DEFOLD_VERSION } });
    const { io, out, err } = captureStreams();

    const code = await dispatch(["resolve", cwd, "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as Record<string, unknown>;
    expect(parsed.warnings).toBeUndefined();
    expect(err()).toBe("");
  });

  test("non-JSON resolve writes the bad pin key to stderr once", async () => {
    writeProject("[project]\n");
    writePin({ "defold-typescript": { "defold-version": "1.12.4" } });
    const { io, err } = captureStreams();

    const code = await dispatch(["resolve", cwd], io, { detectEditorVersion: () => null });

    expect(code).toBe(0);
    const stderr = err();
    expect(stderr).toContain("defold-target");
    expect(stderr.split("defold-version").length - 1).toBe(1);
  });
});

describe("dispatch init --template", () => {
  test("--template minimal writes the minimal scaffold and returns 0", () => {
    const { io, out, err } = captureStreams();

    const code = dispatch(["init", cwd, "--template", "minimal"], io);

    expect(code).toBe(0);
    expect(err()).toBe("");
    expect(out()).toMatch(/defold-typescript init: wrote/);
    expect(existsSync(path.join(cwd, "src", "main.ts"))).toBe(true);
    expect(readFileSync(path.join(cwd, "src", "main.ts"), "utf8")).not.toContain("vmath");
  });

  test("--template=minimal behaves identically to the spaced form", () => {
    const { io, out } = captureStreams();

    const code = dispatch(["init", cwd, "--template=minimal"], io);

    expect(code).toBe(0);
    expect(out()).toMatch(/defold-typescript init: wrote/);
    expect(readFileSync(path.join(cwd, "src", "main.ts"), "utf8")).not.toContain("vmath");
  });

  test("an unknown template returns 1 and names the valid templates on stderr", () => {
    const { io, out, err } = captureStreams();

    const code = dispatch(["init", cwd, "--template", "nope"], io);

    expect(code).toBe(1);
    expect(out()).toBe("");
    expect(err()).toMatch(/default/);
    expect(err()).toMatch(/minimal/);
  });

  test("an unknown template under --json emits the init error result shape", () => {
    const { io, out } = captureStreams();

    const code = dispatch(["init", cwd, "--template", "nope", "--json"], io);

    expect(code).toBe(1);
    const parsed = JSON.parse(out()) as { command: string; ok: boolean; error?: string };
    expect(parsed.command).toBe("init");
    expect(parsed.ok).toBe(false);
    expect(typeof parsed.error).toBe("string");
  });

  test("--template value is consumed and never leaks into the positional path", () => {
    const target = path.join(cwd, "fresh");
    const { io, out } = captureStreams();

    const code = dispatch(["init", target, "--template", "minimal"], io);

    expect(code).toBe(0);
    expect(out()).toMatch(/defold-typescript init: wrote/);
    expect(existsSync(path.join(target, "game.project"))).toBe(true);
    expect(existsSync(path.join(cwd, "minimal"))).toBe(false);
  });

  test("run propagates the engine exit code", async () => {
    const projectc = path.join(cwd, "build/default/game.projectc");
    const engine = path.join(cwd, "build/arm64-macos/dmengine");
    const { io, err } = captureStreams();

    const code = await dispatch(["run", cwd], io, {
      detectEditorVersion: () => null,
      runInternals: {
        platform: "darwin",
        arch: "arm64",
        probe: (p) => p === projectc || p === engine,
        spawn: () => ({ kill: () => {}, exited: Promise.resolve(7) }),
        copyAside: (p) => p,
        chmod: () => {},
      },
    });

    expect(code).toBe(7);
    expect(err()).toBe("");
  });

  test("run with no compiled project returns 1 with an actionable error", async () => {
    const { io, err } = captureStreams();

    const code = await dispatch(["run", cwd], io, {
      detectEditorVersion: () => null,
      runInternals: {
        platform: "darwin",
        arch: "arm64",
        probe: () => false,
        spawn: () => ({ kill: () => {}, exited: Promise.resolve(0) }),
        copyAside: (p) => p,
        chmod: () => {},
      },
    });

    expect(code).toBe(1);
    expect(err()).toContain("build/default");
    expect(err()).toMatch(/bob build|bob run/);
  });

  test("run --json on a missing build emits ok:false with the error", async () => {
    const { io, out } = captureStreams();

    const code = await dispatch(["run", cwd, "--json"], io, {
      detectEditorVersion: () => null,
      runInternals: {
        platform: "darwin",
        arch: "arm64",
        probe: () => false,
        spawn: () => ({ kill: () => {}, exited: Promise.resolve(0) }),
        copyAside: (p) => p,
        chmod: () => {},
      },
    });

    expect(code).toBe(1);
    const parsed = JSON.parse(out()) as { command: string; ok: boolean; error: string };
    expect(parsed.command).toBe("run");
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("build/default");
  });

  test("run passes post-`--` args through and emits the run envelope on --json", async () => {
    const projectc = path.join(cwd, "build/default/game.projectc");
    const engine = path.join(cwd, "build/x86_64-linux/dmengine");
    const spawned: string[][] = [];
    const { io, out } = captureStreams();

    const code = await dispatch(["run", cwd, "--json", "--", "--windowed"], io, {
      detectEditorVersion: () => null,
      runInternals: {
        platform: "linux",
        arch: "x64",
        probe: (p) => p === projectc || p === engine,
        spawn: (argv) => {
          spawned.push(argv);
          return { kill: () => {}, exited: Promise.resolve(0) };
        },
        copyAside: (p) => p,
        chmod: () => {},
      },
    });

    expect(code).toBe(0);
    expect(spawned[0]).toEqual([engine, projectc, "--windowed"]);
    const parsed = JSON.parse(out()) as {
      command: string;
      ok: boolean;
      enginePath: string;
      projectc: string;
      exitCode: number;
    };
    expect(parsed.command).toBe("run");
    expect(parsed.ok).toBe(true);
    expect(parsed.enginePath).toBe(engine);
    expect(parsed.projectc).toBe(projectc);
    expect(parsed.exitCode).toBe(0);
  });
});

describe("dispatch upgrade", () => {
  const USAGE =
    "Usage: defold-typescript <init|init-agents|build|watch|wall|setup-debug|resolve|bob|run> [path]\n";

  function upgradeHarness(opts?: {
    latest?: string;
    running?: string;
    exitCodes?: number[];
    outputs?: string[];
    stdouts?: string[];
    offline?: boolean;
    env?: NodeJS.ProcessEnv;
  }): {
    internals: Parameters<typeof dispatch>[2];
    spawned: { argv: string[]; cwd: string; capture: boolean }[];
  } {
    const spawned: { argv: string[]; cwd: string; capture: boolean }[] = [];
    const exitCodes = [...(opts?.exitCodes ?? [])];
    const outputs = [...(opts?.outputs ?? [])];
    const stdouts = [...(opts?.stdouts ?? [])];
    return {
      spawned,
      internals: {
        cliVersion: opts?.running ?? "1.2.0",
        detectEditorVersion: () => null,
        upgradeInternals: {
          fetch: async () => {
            if (opts?.offline) {
              throw new Error("getaddrinfo ENOTFOUND registry.npmjs.org");
            }
            return new Response(JSON.stringify({ version: opts?.latest ?? "1.3.0" }));
          },
          spawn: (argv, spawnCwd, spawnOpts) => {
            spawned.push({ argv, cwd: spawnCwd, capture: spawnOpts?.capture === true });
            const output = outputs.shift();
            const stdout = stdouts.shift();
            return {
              exited: Promise.resolve(exitCodes.shift() ?? 0),
              ...(output !== undefined ? { output: Promise.resolve(output) } : {}),
              ...(stdout !== undefined ? { stdout: Promise.resolve(stdout) } : {}),
            };
          },
          env: opts?.env ?? { npm_config_user_agent: "bun/1.2.0 npm/? node/?" },
        },
      },
    };
  }

  const delegatedInit = (written: readonly string[]): string =>
    `${JSON.stringify({ command: "init", ok: true, written })}\n`;

  const handOffs = (spawned: { argv: string[] }[]): string[][] =>
    spawned
      .map((s) => s.argv)
      .filter((argv) => argv.some((a) => a.startsWith("@defold-typescript/cli@")));

  test("a behind CLI hands off to the resolved version, exactly once", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io } = captureStreams();
    const { internals, spawned } = upgradeHarness({ running: "1.2.0", latest: "1.3.0" });

    const code = await dispatch(["upgrade", cwd], io, internals);

    expect(code).toBe(0);
    expect(handOffs(spawned)).toEqual([
      [
        "bunx",
        "@defold-typescript/cli@1.3.0",
        "init",
        ".",
        "--force",
        "--suppress-install-reminder",
      ],
    ]);
    expect(spawned[0]?.cwd).toBe(cwd);
  });

  test("a successful hand-off is followed by the install command and reports from -> to", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out } = captureStreams();
    const { internals, spawned } = upgradeHarness({ running: "1.2.0", latest: "1.3.0" });

    const code = await dispatch(["upgrade", cwd], io, internals);

    expect(code).toBe(0);
    expect(spawned.map((s) => s.argv).at(-1)).toEqual(["bun", "install"]);
    expect(out()).toContain("1.2.0");
    expect(out()).toContain("1.3.0");
  });

  test("the install command follows the detected package manager", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io } = captureStreams();
    const { internals, spawned } = upgradeHarness({
      running: "1.2.0",
      latest: "1.3.0",
      env: { npm_config_user_agent: "pnpm/9.0.0" },
    });

    await dispatch(["upgrade", cwd], io, internals);

    expect(spawned.map((s) => s.argv).at(-1)).toEqual(["pnpm", "install"]);
    expect(spawned[0]?.argv[0]).toBe("pnpm");
  });

  test("an already-latest CLI re-scaffolds in process and installs, spawning no hand-off", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io } = captureStreams();
    const { internals, spawned } = upgradeHarness({ running: "1.3.0", latest: "1.3.0" });

    const code = await dispatch(["upgrade", cwd], io, internals);

    expect(code).toBe(0);
    expect(handOffs(spawned)).toEqual([]);
    expect(spawned.map((s) => s.argv)).toEqual([["bun", "install"]]);
    expect(existsSync(path.join(cwd, "tsconfig.json"))).toBe(true);
  });

  test("a failing hand-off propagates its exit code and never installs", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, err } = captureStreams();
    const { internals, spawned } = upgradeHarness({
      running: "1.2.0",
      latest: "1.3.0",
      exitCodes: [7],
    });

    const code = await dispatch(["upgrade", cwd], io, internals);

    expect(code).toBe(7);
    expect(spawned.map((s) => s.argv)).toEqual([
      [
        "bunx",
        "@defold-typescript/cli@1.3.0",
        "init",
        ".",
        "--force",
        "--suppress-install-reminder",
      ],
    ]);
    expect(err()).toContain("7");
  });

  test("offline exits 1 with an actionable message, spawning nothing and writing nothing", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, err } = captureStreams();
    const { internals, spawned } = upgradeHarness({ offline: true });

    const code = await dispatch(["upgrade", cwd], io, internals);

    expect(code).toBe(1);
    expect(spawned).toEqual([]);
    expect(err()).toMatch(/network connection/i);
    expect(existsSync(path.join(cwd, "tsconfig.json"))).toBe(false);
    expect(existsSync(path.join(cwd, "mise.toml"))).toBe(false);
  });

  test("update is a strict alias for upgrade", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io } = captureStreams();
    const { internals, spawned } = upgradeHarness({ running: "1.2.0", latest: "1.3.0" });

    const code = await dispatch(["update", cwd], io, internals);

    expect(code).toBe(0);
    expect(handOffs(spawned)).toEqual([
      [
        "bunx",
        "@defold-typescript/cli@1.3.0",
        "init",
        ".",
        "--force",
        "--suppress-install-reminder",
      ],
    ]);
  });

  test("--json carries ok, from/to and handedOff, and writes nothing to stderr", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out, err } = captureStreams();
    const { internals, spawned } = upgradeHarness({ running: "1.2.0", latest: "1.3.0" });

    const code = await dispatch(["upgrade", cwd, "--json"], io, internals);

    expect(code).toBe(0);
    // Both children must be captured, or their prose would share stdout with the
    // envelope; the seam assertion is what makes the single-document check real.
    expect(spawned).toHaveLength(2);
    expect(spawned.every((s) => s.capture)).toBe(true);
    expect(out().trim()).not.toContain("\n");
    const parsed = JSON.parse(out().trim()) as {
      command: string;
      ok: boolean;
      from: string;
      to: string;
      handedOff: boolean;
    };
    expect(parsed).toMatchObject({
      command: "upgrade",
      ok: true,
      from: "1.2.0",
      to: "1.3.0",
      handedOff: true,
    });
    expect(err()).toBe("");
  });

  test("upgrade warns on stderr when the installed editor drifts from a version pin", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": "1.12.4" } }, null, 2)}\n`,
    );
    const { io, err } = captureStreams();
    const { internals } = upgradeHarness({ running: "1.2.0", latest: "1.3.0" });
    const drifting = { ...internals, detectEditorVersion: (): string => "1.13.0" };

    const code = await dispatch(["upgrade", cwd], io, drifting);

    expect(code).toBe(0);
    expect(err()).toContain("1.13.0");
    expect(err()).toContain("1.12.4");
    expect(err()).toContain("set-target --detected");
  });

  test("upgrade --json folds the drift notice into warnings and adds pinMismatch", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": "1.12.4" } }, null, 2)}\n`,
    );
    const { io, out } = captureStreams();
    const { internals } = upgradeHarness({ running: "1.2.0", latest: "1.3.0" });
    const drifting = { ...internals, detectEditorVersion: (): string => "1.13.0" };

    const code = await dispatch(["upgrade", cwd, "--json"], io, drifting);

    expect(code).toBe(0);
    const parsed = JSON.parse(out().trim()) as {
      ok: boolean;
      warnings?: string[];
      pinMismatch?: { installed: string; pinned: string };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.warnings?.some((w) => w.includes("set-target --detected"))).toBe(true);
    expect(parsed.pinMismatch).toEqual({ installed: "1.13.0", pinned: "1.12.4" });
  });

  test("update warns on stderr when the installed editor drifts from a version pin", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": "1.12.4" } }, null, 2)}\n`,
    );
    const { io, err } = captureStreams();
    const { internals } = upgradeHarness({ running: "1.2.0", latest: "1.3.0" });
    const drifting = { ...internals, detectEditorVersion: (): string => "1.13.0" };

    const code = await dispatch(["update", cwd], io, drifting);

    expect(code).toBe(0);
    expect(err()).toContain("1.13.0");
    expect(err()).toContain("1.12.4");
    expect(err()).toContain("set-target --detected");
  });

  test("update --json folds the drift notice into warnings and adds pinMismatch", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": "1.12.4" } }, null, 2)}\n`,
    );
    const { io, out } = captureStreams();
    const { internals } = upgradeHarness({ running: "1.2.0", latest: "1.3.0" });
    const drifting = { ...internals, detectEditorVersion: (): string => "1.13.0" };

    const code = await dispatch(["update", cwd, "--json"], io, drifting);

    expect(code).toBe(0);
    const parsed = JSON.parse(out().trim()) as {
      ok: boolean;
      warnings?: string[];
      pinMismatch?: { installed: string; pinned: string };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.warnings?.some((w) => w.includes("set-target --detected"))).toBe(true);
    expect(parsed.pinMismatch).toEqual({ installed: "1.13.0", pinned: "1.12.4" });
  });

  test("update stays silent when the installed editor matches the version pin", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": "1.12.4" } }, null, 2)}\n`,
    );
    const { io, out, err } = captureStreams();
    const { internals } = upgradeHarness({ running: "1.2.0", latest: "1.3.0" });
    const matching = { ...internals, detectEditorVersion: (): string => "1.12.4" };

    const code = await dispatch(["update", cwd, "--json"], io, matching);

    expect(code).toBe(0);
    expect(err()).not.toContain("set-target --detected");
    expect("pinMismatch" in (JSON.parse(out().trim()) as object)).toBe(false);
  });

  test("update produces no drift notice for a channel pin even when the editor differs", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": "stable" } }, null, 2)}\n`,
    );
    const { io, out, err } = captureStreams();
    const { internals } = upgradeHarness({ running: "1.2.0", latest: "1.3.0" });
    const channelDrift = {
      ...internals,
      detectEditorVersion: (): string => "1.13.0",
      fetchChannelInfo: async () => ({ version: "1.10.0", sha1: "abc123" }),
    };

    const code = await dispatch(["update", cwd, "--json"], io, channelDrift);

    expect(code).toBe(0);
    expect(err()).not.toContain("set-target --detected");
    expect("pinMismatch" in (JSON.parse(out().trim()) as object)).toBe(false);
  });

  test("--json captures the install on the already-latest path too", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out, err } = captureStreams();
    const { internals, spawned } = upgradeHarness({ running: "1.3.0", latest: "1.3.0" });

    const code = await dispatch(["upgrade", cwd, "--json"], io, internals);

    expect(code).toBe(0);
    expect(spawned.map((s) => s.argv)).toEqual([["bun", "install"]]);
    expect(spawned[0]?.capture).toBe(true);
    expect(JSON.parse(out().trim())).toMatchObject({ ok: true, handedOff: false });
    expect(err()).toBe("");
  });

  test("without --json nothing is captured: humans keep the inherited child output", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io } = captureStreams();
    const { internals, spawned } = upgradeHarness({ running: "1.2.0", latest: "1.3.0" });

    await dispatch(["upgrade", cwd], io, internals);

    expect(spawned).toHaveLength(2);
    expect(spawned.some((s) => s.capture)).toBe(false);
  });

  test("--json with a failing install carries the captured child text in output", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out, err } = captureStreams();
    const { internals, spawned } = upgradeHarness({
      running: "1.2.0",
      latest: "1.3.0",
      exitCodes: [0, 5],
      outputs: ["hand-off log", "error: lockfile is frozen"],
    });

    const code = await dispatch(["upgrade", cwd, "--json"], io, internals);

    expect(code).toBe(5);
    expect(spawned.every((s) => s.capture)).toBe(true);
    const parsed = JSON.parse(out().trim()) as { ok: boolean; error: string; output: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("bun install");
    expect(parsed.output).toBe("error: lockfile is frozen");
    expect(err()).toBe("");
  });

  test("update --json does not diverge from upgrade --json", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out, err } = captureStreams();
    const { internals, spawned } = upgradeHarness({ running: "1.2.0", latest: "1.3.0" });

    const code = await dispatch(["update", cwd, "--json"], io, internals);

    expect(code).toBe(0);
    expect(spawned.every((s) => s.capture)).toBe(true);
    expect(JSON.parse(out().trim())).toMatchObject({ command: "upgrade", ok: true });
    expect(err()).toBe("");
  });

  test("--json on an offline failure writes an ok:false payload with the error", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out, err } = captureStreams();
    const { internals, spawned } = upgradeHarness({ offline: true });

    const code = await dispatch(["upgrade", cwd, "--json"], io, internals);

    expect(code).toBe(1);
    // The clean stderr below is earned by resolving nothing, not by a silent seam.
    expect(spawned).toEqual([]);
    const parsed = JSON.parse(out().trim()) as { command: string; ok: boolean; error: string };
    expect(parsed.command).toBe("upgrade");
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/network connection/i);
    expect(err()).toBe("");
  });

  // Every seam above resolves, which is what hid the orphan: drive the real capture
  // seam with an argv that cannot spawn, so the whole path runs for real and only
  // `fetch` is stubbed.
  test("--json survives a child that cannot be spawned: one envelope, clean stderr, no orphaned rejection", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out, err } = captureStreams();
    const missing = "definitely-not-a-real-command-xyz";
    const internals: Parameters<typeof dispatch>[2] = {
      cliVersion: "1.2.0",
      detectEditorVersion: () => null,
      upgradeInternals: {
        fetch: async () => new Response(JSON.stringify({ version: "1.3.0" })),
        spawn: (_argv, spawnCwd, spawnOpts) =>
          defaultUpgradeIo().spawn([missing], spawnCwd, spawnOpts),
        env: { npm_config_user_agent: "bun/1.2.0 npm/? node/?" },
      },
    };

    const orphans: unknown[] = [];
    const onOrphan = (reason: unknown): void => {
      orphans.push(reason);
    };
    process.on("unhandledRejection", onOrphan);
    try {
      const code = await dispatch(["upgrade", cwd, "--json"], io, internals);
      // The orphan surfaces after dispatch returns, so a microtask tick is not enough.
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(orphans).toEqual([]);
      expect(code).not.toBe(0);
      const text = out().trim();
      expect(text).not.toContain("\n");
      const parsed = JSON.parse(text) as { command: string; ok: boolean; error: string };
      expect(parsed.command).toBe("upgrade");
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toContain(missing);
      expect(err()).toBe("");
    } finally {
      process.off("unhandledRejection", onOrphan);
    }
  });

  test("--json on a hand-off prints the documented pair: handedOff true with a populated written", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out, err } = captureStreams();
    const { internals, spawned } = upgradeHarness({
      running: "1.2.0",
      latest: "1.3.0",
      stdouts: [delegatedInit(["package.json", "tsconfig.json"])],
    });

    const code = await dispatch(["upgrade", cwd, "--json"], io, internals);

    expect(code).toBe(0);
    expect(handOffs(spawned)[0]).toContain("--json");
    expect(out().trim()).not.toContain("\n");
    expect(JSON.parse(out().trim())).toMatchObject({
      command: "upgrade",
      ok: true,
      handedOff: true,
      written: ["package.json", "tsconfig.json"],
    });
    expect(err()).toBe("");
  });

  test("update --json reports the delegated files too", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out, err } = captureStreams();
    const { internals } = upgradeHarness({
      running: "1.2.0",
      latest: "1.3.0",
      stdouts: [delegatedInit(["package.json", "tsconfig.json"])],
    });

    const code = await dispatch(["update", cwd, "--json"], io, internals);

    expect(code).toBe(0);
    expect(JSON.parse(out().trim())).toMatchObject({
      command: "upgrade",
      ok: true,
      handedOff: true,
      written: ["package.json", "tsconfig.json"],
    });
    expect(err()).toBe("");
  });

  test("a human upgrade hands off without --json, so the delegated CLI still prints prose", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io } = captureStreams();
    const { internals, spawned } = upgradeHarness({ running: "1.2.0", latest: "1.3.0" });

    await dispatch(["upgrade", cwd], io, internals);

    expect(handOffs(spawned)[0]).not.toContain("--json");
  });

  test("the usage fallback is untouched: only upgrade/update are claimed", () => {
    const bare = captureStreams();
    expect(dispatch([], bare.io)).toBe(1);
    expect(bare.err()).toBe(USAGE);

    const unknown = captureStreams();
    expect(dispatch(["upgradez"], unknown.io)).toBe(1);
    expect(unknown.err()).toBe(USAGE);
  });
});

describe("dispatch set-target", () => {
  function writePkg(value: unknown): void {
    writeFileSync(path.join(cwd, "package.json"), `${JSON.stringify(value, null, 2)}\n`);
  }

  function pinOf(): string {
    const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8")) as {
      "defold-typescript": { "defold-target": string };
    };
    return pkg["defold-typescript"]["defold-target"];
  }

  test("set-target <token> writes the pin and reports from -> to", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const { io, out } = captureStreams();

    const code = await dispatch(["set-target", "1.13.0", cwd], io);

    expect(code).toBe(0);
    expect(out()).toContain("1.12.4 -> 1.13.0");
    expect(pinOf()).toBe("1.13.0");
  });

  test("set-target --json emits the command/ok/written/from/to payload", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const { io, out } = captureStreams();

    const code = await dispatch(["set-target", "1.13.0", cwd, "--json"], io);

    expect(code).toBe(0);
    expect(JSON.parse(out())).toMatchObject({
      command: "set-target",
      ok: true,
      written: ["package.json"],
      from: "1.12.4",
      to: "1.13.0",
    });
  });

  test("set-target --detected writes the injected detected version", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const { io } = captureStreams();

    const code = await dispatch(["set-target", "--detected", cwd], io, {
      detectEditorVersion: () => "1.13.0",
    });

    expect(code).toBe(0);
    expect(pinOf()).toBe("1.13.0");
  });

  test("--detect is a synonym of --detected", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const { io } = captureStreams();

    const code = await dispatch(["set-target", "--detect", cwd], io, {
      detectEditorVersion: () => "1.13.0",
    });

    expect(code).toBe(0);
    expect(pinOf()).toBe("1.13.0");
  });

  test("neither a token nor --detected is a usage error", async () => {
    const { io, err } = captureStreams();

    const code = await dispatch(["set-target"], io);

    expect(code).toBe(1);
    expect(err()).toContain("set-target");
  });

  test("--detected together with a positional token is a usage error", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const { io, err } = captureStreams();

    const code = await dispatch(["set-target", "--detected", "1.13.0", cwd], io, {
      detectEditorVersion: () => "1.13.0",
    });

    expect(code).toBe(1);
    expect(err()).toContain("set-target");
    expect(pinOf()).toBe("1.12.4");
  });
});
