import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Writable } from "node:stream";
import {
  EVAL_AUTH_SCHEME,
  EVAL_REQUEST_MEDIA_TYPE,
  EVAL_ROUTE,
  evalSuccessBody,
  SPEC_BODY,
} from "../test/fixtures/editor-openapi";
import { loadApiTargetsRegistry } from "./api-registry";
import { CURRENT_STABLE_SURFACE_ID } from "./api-surface";
import type { DefoldIo } from "./bob-command";
import { GENERATED_BANNER } from "./build-output";
import { readCliVersion } from "./cli-version";
import { CURRENT_STABLE_DEFOLD_VERSION } from "./defold-version";
import { dispatch } from "./dispatch";
import { EDITOR_PORT_FILE, EDITOR_TOKEN_FILE, type EditorTransport } from "./editor-attach";
import { type ExtensionZip, extensionArchiveKey } from "./extension-archive";
import { EDITOR_ROOT_ENV } from "./installed-editor-version";
import { MATERIALIZED_ROOT, surfaceDirName } from "./materialize";
import {
  labelRefDocResolveOpts,
  multiKindRefDocResolveOpts,
  multiKindRefDocTarget,
  noDownload,
} from "./ref-doc-test-fixture";
import { runResolve } from "./resolve";
import { SCENE_ADDRESSES_DECLARATION } from "./scene-types-command";
import {
  scaffoldUnresolvedDependency,
  scaffoldUnresolvedDependencyManifest,
  UNRESOLVED_DEPENDENCY_URL,
} from "./unresolved-dependency-fixture";
import { defaultUpgradeIo } from "./upgrade";
import type {
  EditorReloadCommand,
  RunWatchHandle,
  WatchEditorClient,
  Watcher,
  WatcherFactory,
} from "./watch";

// The materialized surface directory carries the generating toolchain version;
// these tests defend other behavior, so they derive the name from production
// rather than restating it.
function surfaceDir(surfaceId: string): string {
  return surfaceDirName(surfaceId, readCliVersion());
}

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

// Editor attach/detach is a status channel every watch reports on, including one
// running with no editor. Strip it so an assertion aimed at command failures
// still fails on any real failure line.
const EDITOR_STATUS = /^defold-typescript watch: (attached to Defold editor|no Defold editor)/;
// A hole in the scene address universe rides stderr as a non-fatal warning, so
// a fixture that declares a dependency it never resolves reports one without
// having failed at anything.
const SCENE_TYPES_WARNING = /^defold-typescript scene-types: /;

function failureOutput(stderrText: string): string {
  return stderrText
    .split("\n")
    .filter((line) => line !== "" && !EDITOR_STATUS.test(line) && !SCENE_TYPES_WARNING.test(line))
    .join("\n");
}

// The watch branch lazy-imports its transpiler-bearing modules, so its
// `onWatchStart` callback fires on a later microtask than the synchronous
// dispatch() return. This bridges that gap: pass `onWatchStart` into dispatch,
// then `await ready` to get the handle before driving the watcher.
interface FakeEditorClient {
  readonly client: WatchEditorClient;
  readonly posts: EditorReloadCommand[];
  resolveCount(): number;
}

function makeEditorClient(baseUrl = "http://localhost:4242"): FakeEditorClient {
  const posts: EditorReloadCommand[] = [];
  let resolves = 0;
  return {
    client: {
      resolve() {
        resolves += 1;
        return Promise.resolve({ baseUrl });
      },
      postCommand(_cwd, name) {
        posts.push(name);
        return Promise.resolve("accepted");
      },
      openConsole() {
        return Promise.resolve(null);
      },
    },
    posts,
    resolveCount: () => resolves,
  };
}

// `build` regenerates the scene-address declaration under `.defold-types`, so
// the directory's existence no longer answers whether a surface materialized.
// Its contents still do.
function materializedSurfaceEntries(): string[] {
  const root = path.join(cwd, MATERIALIZED_ROOT);
  if (!existsSync(root)) return [];
  const declaration = path.posix.basename(SCENE_ADDRESSES_DECLARATION);
  return readdirSync(root).filter((entry) => entry !== declaration);
}

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

// A version the registry has never carried, so the surface lookup misses no
// matter which targets ship. The precondition assertion below keeps it honest
// if the registry ever grows toward it.
const UNREGISTERED_TARGET = "1.0.0";

function registeredTargetVersions(): string[] {
  return loadApiTargetsRegistry().map((target) => target.id.replace(/^defold-/, ""));
}

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
    expect(out()).toMatch(/wrote 19 files/);
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
      "Usage: defold-typescript <init|init-agents|upgrade|set-target|build|watch|reload|wall|setup-debug|resolve|scene-types|bob|run> [path]\n" +
        "Run `defold-typescript --help` for per-command usage and flags.\n",
    );
  });

  test("unknown command prints usage to stderr and returns 1", () => {
    const { io, out, err } = captureStreams();

    const code = dispatch(["unknown"], io);

    expect(code).toBe(1);
    expect(out()).toBe("");
    expect(err()).toBe(
      "Usage: defold-typescript <init|init-agents|upgrade|set-target|build|watch|reload|wall|setup-debug|resolve|scene-types|bob|run> [path]\n" +
        "Run `defold-typescript --help` for per-command usage and flags.\n",
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

  // A hole in the address universe explains the findings that follow it, so
  // both build branches print it ahead of the build's own warnings. The orphan
  // is a real `scanOrphanOutputs` finding over on-disk state, not a string the
  // test hands to production.
  function scaffoldUnresolvedDependencyBuild(pkg?: Record<string, unknown>): void {
    scaffoldBuildProject(pkg);
    scaffoldUnresolvedDependency(cwd);
    writeFileSync(path.join(cwd, "src", "stale.lua"), `return 1\n${GENERATED_BANNER}\n`);
  }

  function expectHoleBeforeOrphan(warnings: readonly string[]): void {
    const hole = warnings.findIndex((w) => w.includes(UNRESOLVED_DEPENDENCY_URL));
    const orphan = warnings.findIndex((w) => w.includes("stale.lua"));
    expect(hole).toBeGreaterThanOrEqual(0);
    expect(orphan).toBeGreaterThanOrEqual(0);
    expect(hole).toBeLessThan(orphan);
  }

  test("build reports an unresolved dependency ahead of its own warnings", async () => {
    scaffoldUnresolvedDependencyBuild();
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, { detectEditorVersion: () => null });

    expect(code).toBe(0);
    expectHoleBeforeOrphan((JSON.parse(out()) as { warnings: string[] }).warnings);

    const plain = captureStreams();
    const plainCode = await dispatch(["build", cwd], plain.io, {
      detectEditorVersion: () => null,
    });

    expect(plainCode).toBe(0);
    const lines = plain
      .err()
      .split("\n")
      .filter((line) => line !== "");
    const holeAt = lines.findIndex((line) => line.includes(UNRESOLVED_DEPENDENCY_URL));
    const orphanAt = lines.findIndex((line) => line.includes("stale.lua"));
    expect(holeAt).toBeGreaterThanOrEqual(0);
    expect(orphanAt).toBeGreaterThanOrEqual(0);
    expect(holeAt).toBeLessThan(orphanAt);
    expect(lines[holeAt]?.startsWith("defold-typescript build: ")).toBe(true);
    expect(lines[orphanAt]?.startsWith("defold-typescript build: ")).toBe(true);
  });

  test("a ref-doc-surface build keeps the same order", async () => {
    scaffoldUnresolvedDependencyBuild({ "defold-typescript": { "defold-target": "1.9.8" } });
    const resolveOpts = labelRefDocResolveOpts();
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, {
      resolveOpts,
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    expectHoleBeforeOrphan((JSON.parse(out()) as { warnings: string[] }).warnings);

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });

  // Both build branches hand `runBuild` the *composed* index — the scene
  // walk's `unreadable` reasons folded into the component index's own
  // `incomplete` — so a fragment declared only by an unresolved library reports
  // the check as suppressed rather than reporting the fragment unreachable.
  function scaffoldReachabilityBuild(pkg?: Record<string, unknown>): void {
    scaffoldBuildProject(pkg);
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    mkdirSync(path.join(cwd, "game"), { recursive: true });
    writeFileSync(
      path.join(cwd, "game", "player.go"),
      'embedded_components {\n  id: "sprite"\n  type: "sprite"\n}\n',
    );
    writeFileSync(path.join(cwd, "src", "main.ts"), 'msg.post("#nobody", "hello");\n');
  }

  test("an unreachable fragment reaches stderr from the ordinary build branch", async () => {
    scaffoldReachabilityBuild();
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd], io, { detectEditorVersion: () => null });

    expect(code).toBe(0);
    expect(err()).toContain("nobody");
    expect(err()).toContain("src/main.ts");
  });

  test("an unreachable fragment reaches stderr from the ref-doc-surface branch", async () => {
    scaffoldReachabilityBuild({ "defold-typescript": { "defold-target": "1.9.8" } });
    const resolveOpts = labelRefDocResolveOpts();
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd], io, {
      resolveOpts,
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    expect(err()).toContain("nobody");
    expect(err()).toContain("src/main.ts");

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });

  test("a declared-but-unresolved dependency suppresses the check on the ordinary branch", async () => {
    scaffoldReachabilityBuild();
    scaffoldUnresolvedDependency(cwd);
    writeFileSync(path.join(cwd, "src", "main.ts"), 'msg.post("#nobody", "hello");\n');
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd], io, { detectEditorVersion: () => null });

    expect(code).toBe(0);
    expect(err()).toContain("did not run");
    expect(err()).not.toContain("nobody");
  });

  test("a declared-but-unresolved dependency suppresses the check on the ref-doc branch", async () => {
    scaffoldReachabilityBuild({ "defold-typescript": { "defold-target": "1.9.8" } });
    scaffoldUnresolvedDependency(cwd);
    writeFileSync(path.join(cwd, "src", "main.ts"), 'msg.post("#nobody", "hello");\n');
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": "1.9.8" } }, null, 2)}\n`,
    );
    const resolveOpts = labelRefDocResolveOpts();
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd], io, {
      resolveOpts,
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    expect(err()).toContain("did not run");
    expect(err()).not.toContain("nobody");

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });

  // A project whose scenes are missing *because* its dependency is missing has
  // no scene sources at all, so the suppression the two cases above prove never
  // reaches it: `hasScenes` is false there and true here.
  test("a scene-less project with an unresolved dependency suppresses the check on the ordinary branch", async () => {
    scaffoldBuildProject();
    scaffoldUnresolvedDependencyManifest(cwd);
    writeFileSync(path.join(cwd, "src", "main.ts"), 'msg.post("#nobody", "hello");\n');
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd], io, { detectEditorVersion: () => null });

    expect(code).toBe(0);
    expect(err()).toContain("did not run");
    expect(err()).not.toContain("nobody");
  });

  test("a scene-less project with an unresolved dependency suppresses the check on the ref-doc branch", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.9.8" } });
    scaffoldUnresolvedDependencyManifest(cwd);
    writeFileSync(path.join(cwd, "src", "main.ts"), 'msg.post("#nobody", "hello");\n');
    const resolveOpts = labelRefDocResolveOpts();
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd], io, {
      resolveOpts,
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    expect(err()).toContain("did not run");
    expect(err()).not.toContain("nobody");

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });

  test("build --json reports an unreachable fragment as prose and as an entry", async () => {
    scaffoldReachabilityBuild();
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, { detectEditorVersion: () => null });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      ok: boolean;
      warnings: readonly string[];
      unreachableAddresses?: readonly { file: string; fragment: string; message: string }[];
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.warnings.some((w) => w.includes("nobody"))).toBe(true);
    expect(parsed.unreachableAddresses).toHaveLength(1);
    expect(parsed.unreachableAddresses?.[0]?.file).toBe("src/main.ts");
    expect(parsed.unreachableAddresses?.[0]?.fragment).toBe("nobody");
    expect(parsed.unreachableAddresses?.[0]?.message).toContain("nobody");
  });

  // A whole object universe whose two objects own *different* ids, both of them
  // in the project-wide set. Only a check scoped to the addressed object can
  // report `/player#sprit`, so each assertion below fails the moment its branch
  // stops forwarding `sceneObjects` and the project-wide test answers instead.
  function scaffoldScopedReachabilityBuild(pkg?: Record<string, unknown>): void {
    scaffoldBuildProject(pkg);
    writeFileSync(
      path.join(cwd, "game.project"),
      "[bootstrap]\nmain_collection = /game/main.collectionc\n\n[project]\n",
    );
    mkdirSync(path.join(cwd, "game"), { recursive: true });
    writeFileSync(
      path.join(cwd, "game", "main.collection"),
      'instances {\n  id: "player"\n  prototype: "/game/player.go"\n}\n' +
        'instances {\n  id: "hud"\n  prototype: "/game/hud.go"\n}\n',
    );
    writeFileSync(
      path.join(cwd, "game", "player.go"),
      'embedded_components {\n  id: "sprite"\n  type: "sprite"\n}\n',
    );
    writeFileSync(
      path.join(cwd, "game", "hud.go"),
      'embedded_components {\n  id: "sprit"\n  type: "sprite"\n}\n',
    );
    writeFileSync(path.join(cwd, "src", "main.ts"), 'msg.post("/player#sprit", "hello");\n');
  }

  test("the ordinary build branch reports a scoped finding", async () => {
    scaffoldScopedReachabilityBuild();
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd], io, { detectEditorVersion: () => null });

    expect(code).toBe(0);
    expect(err()).toContain("src/main.ts");
    expect(err()).toContain('the game object "/player"');
    expect(err()).toContain('"sprite"');
  });

  test("the ref-doc-surface branch reports the same scoped finding", async () => {
    scaffoldScopedReachabilityBuild({ "defold-typescript": { "defold-target": "1.9.8" } });
    const resolveOpts = labelRefDocResolveOpts();
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd], io, {
      resolveOpts,
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    expect(err()).toContain("src/main.ts");
    expect(err()).toContain('the game object "/player"');
    expect(err()).toContain('"sprite"');

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });

  test("build --json carries the scoped message as an entry", async () => {
    scaffoldScopedReachabilityBuild();
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, { detectEditorVersion: () => null });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      unreachableAddresses?: readonly { file: string; fragment: string; message: string }[];
    };
    expect(parsed.unreachableAddresses).toHaveLength(1);
    expect(parsed.unreachableAddresses?.[0]?.fragment).toBe("sprit");
    expect(parsed.unreachableAddresses?.[0]?.message).toContain('the game object "/player"');
  });

  test("a project whose object universe has a hole keeps the project-wide result", async () => {
    scaffoldScopedReachabilityBuild();
    // Reached by no bootstrap, proxy, instance or factory edge, so the role walk
    // cannot say which world its objects live in — and a world it never placed
    // could be the one `/player` names.
    writeFileSync(
      path.join(cwd, "game", "orphan.collection"),
      'instances {\n  id: "player"\n  prototype: "/game/hud.go"\n}\n',
    );
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd], io, { detectEditorVersion: () => null });

    expect(code).toBe(0);
    expect(err()).not.toContain('the game object "/player"');
    expect(err()).not.toContain("sprit");
  });

  // The one failure a `--json` consumer could not recover from: a check that
  // could not run rendering as a check that found nothing.
  test("build --json emits no entries for a suppressed check and says so in warnings", async () => {
    scaffoldReachabilityBuild();
    scaffoldUnresolvedDependency(cwd);
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, { detectEditorVersion: () => null });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      warnings: readonly string[];
      unreachableAddresses?: readonly unknown[];
    };
    expect(parsed.unreachableAddresses).toBeUndefined();
    expect(parsed.warnings.some((w) => w.includes("did not run"))).toBe(true);
    expect(parsed.warnings.some((w) => w.includes("nobody"))).toBe(false);
  });

  // A bootstrap world hosting the built script beside a proxy world named
  // `mylevel`, so the socket a literal names is decided by these files.
  function scaffoldCrossWorldBuild(address: string): void {
    scaffoldBuildProject();
    writeFileSync(
      path.join(cwd, "game.project"),
      "[bootstrap]\nmain_collection = /game/main.collectionc\n\n[project]\n",
    );
    mkdirSync(path.join(cwd, "game"), { recursive: true });
    writeFileSync(
      path.join(cwd, "game", "main.collection"),
      'instances {\n  id: "loader"\n  prototype: "/game/loader.go"\n}\n' +
        'instances {\n  id: "home"\n  prototype: "/game/home.go"\n}\n',
    );
    writeFileSync(
      path.join(cwd, "game", "loader.go"),
      'embedded_components {\n  id: "loader"\n  type: "collectionproxy"\n' +
        '  data: "collection: \\"/game/level1.collection\\"\\n"\n}\n',
    );
    writeFileSync(
      path.join(cwd, "game", "home.go"),
      'components {\n  id: "brain"\n  component: "/src/main.ts.script"\n}\n',
    );
    writeFileSync(
      path.join(cwd, "game", "level1.collection"),
      'name: "mylevel"\ninstances {\n  id: "enemy"\n  prototype: "/game/enemy.go"\n}\n',
    );
    writeFileSync(
      path.join(cwd, "game", "enemy.go"),
      'embedded_components {\n  id: "body"\n  type: "sprite"\n}\n',
    );
    writeFileSync(path.join(cwd, "src", "main.ts"), `go.get_position("${address}");\n`);
  }

  type CrossWorldJson = {
    ok?: boolean;
    warnings?: readonly string[];
    crossWorldAddresses?: readonly {
      file: string;
      address: string;
      socket: string;
      message: string;
    }[];
  };

  test("a cross-world address reaches stderr from the ordinary build branch", async () => {
    scaffoldCrossWorldBuild("mylevel:/enemy");
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd], io, { detectEditorVersion: () => null });

    expect(code).toBe(0);
    expect(err()).toContain("mylevel");
    expect(err()).toContain("src/main.ts");
  });

  test("build --json reports a cross-world address as prose and as an entry", async () => {
    scaffoldCrossWorldBuild("mylevel:/enemy");
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, { detectEditorVersion: () => null });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as CrossWorldJson;
    expect(parsed.ok).toBe(true);
    expect(parsed.crossWorldAddresses).toHaveLength(1);
    expect(parsed.crossWorldAddresses?.[0]?.file).toBe("src/main.ts");
    expect(parsed.crossWorldAddresses?.[0]?.address).toBe("mylevel:/enemy");
    expect(parsed.crossWorldAddresses?.[0]?.socket).toBe("mylevel");
    const message = parsed.crossWorldAddresses?.[0]?.message ?? "";
    expect(parsed.warnings?.some((w) => w.includes(message))).toBe(true);
  });

  test("build --json omits crossWorldAddresses entirely when nothing is found", async () => {
    scaffoldCrossWorldBuild("/enemy");
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, { detectEditorVersion: () => null });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as CrossWorldJson;
    expect(Object.hasOwn(parsed as object, "crossWorldAddresses")).toBe(false);
  });

  test("a project the caller read no scenes for reports nothing and carries no field", async () => {
    scaffoldBuildProject();
    writeFileSync(path.join(cwd, "src", "main.ts"), 'go.get_position("mylevel:/enemy");\n');
    const { io, out, err } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, { detectEditorVersion: () => null });

    expect(code).toBe(0);
    expect(Object.hasOwn(JSON.parse(out()) as object, "crossWorldAddresses")).toBe(false);
    expect(err()).not.toContain("mylevel");
  });

  test("a cross-world address reaches stderr from the ref-doc-surface branch", async () => {
    scaffoldCrossWorldBuild("mylevel:/enemy");
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": "1.9.8" } }, null, 2)}\n`,
    );
    const resolveOpts = labelRefDocResolveOpts();
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd], io, {
      resolveOpts,
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    expect(err()).toContain("mylevel");
    expect(err()).toContain("src/main.ts");

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
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

  test("--defold-target materializes beside the pinned surface and leaves it intact", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.12.4" } });
    const sourceGeneratedDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-src-"));
    writeFileSync(path.join(sourceGeneratedDir, "label.d.ts"), "declare const __label: unknown;\n");

    const pinned = captureStreams();
    expect(
      await dispatch(["build", cwd, "--json"], pinned.io, {
        sourceGeneratedDir,
        detectEditorVersion: () => null,
      }),
    ).toBe(0);
    const pinnedDir = path.join(cwd, ".defold-types", surfaceDir("defold-1.12.4"));
    writeFileSync(path.join(pinnedDir, "sentinel.txt"), "pinned\n");

    const overridden = captureStreams();
    const code = await dispatch(
      ["build", cwd, "--defold-target", "1.13.0", "--json"],
      overridden.io,
      {
        sourceGeneratedDir,
        detectEditorVersion: () => null,
      },
    );

    expect(code).toBe(0);
    const parsed = JSON.parse(overridden.out()) as { materializedSurface: string | null };
    expect(parsed.materializedSurface).toBe(`.defold-types/${surfaceDir("defold-1.13.0")}`);
    expect(readFileSync(path.join(pinnedDir, "sentinel.txt"), "utf8")).toBe("pinned\n");
    expect(existsSync(path.join(pinnedDir, "label.d.ts"))).toBe(true);

    rmSync(sourceGeneratedDir, { recursive: true, force: true });
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

  test("build warns on stderr when the detected editor drifts from a version pin", async () => {
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

  test("build --fail-on-drift exits non-zero when the detected editor drifts from the pin", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.12.4" } });
    const { io } = captureStreams();

    const code = await dispatch(["build", cwd, "--fail-on-drift"], io, {
      detectEditorVersion: () => "1.13.0",
    });

    expect(code).toBe(1);
  });

  test("build --fail-on-drift exits 0 when the detected editor matches the pin", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.12.4" } });
    const { io } = captureStreams();

    const code = await dispatch(["build", cwd, "--fail-on-drift"], io, {
      detectEditorVersion: () => "1.12.4",
    });

    expect(code).toBe(0);
  });

  test("build without the flag still exits 0 on the same drift", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.12.4" } });
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd], io, { detectEditorVersion: () => "1.13.0" });

    expect(code).toBe(0);
    expect(err()).toContain("set-target --detected");
  });

  test("build --fail-on-drift exits 0 for a channel pin even when the editor differs", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "stable" } });
    const { io } = captureStreams();

    const code = await dispatch(["build", cwd, "--fail-on-drift"], io, {
      detectEditorVersion: () => "1.13.0",
      fetchChannelInfo: async () => ({ version: "1.10.0", sha1: "abc123" }),
    });

    expect(code).toBe(0);
  });

  test("build --fail-on-drift writes the same stderr notice as build alone", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.12.4" } });

    const advisory = captureStreams();
    const advisoryCode = await dispatch(["build", cwd], advisory.io, {
      detectEditorVersion: () => "1.13.0",
    });
    const failing = captureStreams();
    const failingCode = await dispatch(["build", cwd, "--fail-on-drift"], failing.io, {
      detectEditorVersion: () => "1.13.0",
    });

    expect(advisoryCode).toBe(0);
    expect(failingCode).toBe(1);
    expect(advisory.err()).toContain("set-target --detected");
    expect(failing.err()).toBe(advisory.err());
  });

  test("build --fail-on-drift --json exits 1 with a byte-identical payload", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.12.4" } });

    const advisory = captureStreams();
    const advisoryCode = await dispatch(["build", cwd, "--json"], advisory.io, {
      detectEditorVersion: () => "1.13.0",
    });
    const failing = captureStreams();
    const failingCode = await dispatch(["build", cwd, "--fail-on-drift", "--json"], failing.io, {
      detectEditorVersion: () => "1.13.0",
    });

    expect(advisoryCode).toBe(0);
    expect(failingCode).toBe(1);
    expect(failing.out()).toBe(advisory.out());
    const parsed = JSON.parse(failing.out()) as {
      warnings: string[];
      pinMismatch?: { installed: string; pinned: string };
    };
    expect(parsed.pinMismatch).toEqual({ installed: "1.13.0", pinned: "1.12.4" });
    expect(parsed.warnings.some((w) => w.includes("set-target --detected"))).toBe(true);
  });

  test("build reports a pin the API registry cannot provide, naming the resolvable targets", async () => {
    expect(registeredTargetVersions()).not.toContain(UNREGISTERED_TARGET);
    scaffoldBuildProject({ "defold-typescript": { "defold-target": UNREGISTERED_TARGET } });
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd], io, { detectEditorVersion: () => null });

    expect(code).toBe(0);
    expect(err()).toContain(UNREGISTERED_TARGET);
    for (const version of registeredTargetVersions()) {
      expect(err()).toContain(version);
    }
  });

  test("build --json carries the unresolvable-target notice in warnings and states no surface was materialized", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": UNREGISTERED_TARGET } });
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, { detectEditorVersion: () => null });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      warnings: string[];
      materializedSurface: string | null;
      unresolvableTarget?: { target: string; available: string[] };
    };
    expect(parsed.warnings.some((w) => w.includes(UNREGISTERED_TARGET))).toBe(true);
    expect(parsed.materializedSurface).toBeNull();
    expect(parsed.unresolvableTarget).toEqual({
      target: UNREGISTERED_TARGET,
      available: registeredTargetVersions(),
    });
    expect(materializedSurfaceEntries()).toEqual([]);
  });

  test("build --fail-on-drift escalates an unresolvable pin and leaves the notice unchanged", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": UNREGISTERED_TARGET } });

    const advisory = captureStreams();
    const advisoryCode = await dispatch(["build", cwd], advisory.io, {
      detectEditorVersion: () => null,
    });
    const failing = captureStreams();
    const failingCode = await dispatch(["build", cwd, "--fail-on-drift"], failing.io, {
      detectEditorVersion: () => null,
    });

    expect(advisoryCode).toBe(0);
    expect(failingCode).toBe(1);
    expect(failing.err()).toBe(advisory.err());
  });

  test("an unresolvable --defold-target override reports the same way and still does not write the pin", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.12.4" } });
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd, "--defold-target", UNREGISTERED_TARGET], io, {
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    // The override notice already names the flag value, so the registry-miss
    // notice is identified by the resolvable targets it lists instead.
    expect(err()).toContain("API registry");
    for (const version of registeredTargetVersions()) {
      expect(err()).toContain(version);
    }
    const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8")) as {
      "defold-typescript": { "defold-target": string };
    };
    expect(pkg["defold-typescript"]["defold-target"]).toBe("1.12.4");
  });

  test("a resolvable pin is unaffected: no notice, surface materialized, tsconfig repointed", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.12.4" } });
    const { io, out, err } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, { detectEditorVersion: () => null });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      warnings: string[];
      materializedSurface: string | null;
      unresolvableTarget?: unknown;
    };
    expect("unresolvableTarget" in parsed).toBe(false);
    expect(parsed.warnings.some((w) => w.includes("API registry"))).toBe(false);
    expect(parsed.materializedSurface).toBe(`.defold-types/${surfaceDir("defold-1.12.4")}`);
    expect(err()).toBe("");
    const tsconfig = JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types?: string[] };
    };
    expect(tsconfig.compilerOptions.types).toContain(surfaceDir("defold-1.12.4"));
  });

  test("watch --fail-on-drift exits non-zero on the same drift the notice reports", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.12.4" } });
    const { io, err } = captureStreams();
    const factory: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });

    const code = await dispatch(["watch", cwd, "--fail-on-drift"], io, {
      watcherFactory: factory,
      onWatchStart: (h) => h.stop(),
      detectEditorVersion: () => "1.13.0",
    });

    expect(code).toBe(1);
    expect(err()).toContain("set-target --detected");
  });

  test("watch warns on stderr once at startup when the detected editor drifts from a version pin", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.12.4" } });
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
    const stderr = err();
    expect(stderr).toContain("1.13.0");
    expect(stderr).toContain("1.12.4");
    expect(stderr).toContain("set-target --detected");
    // Once at startup, never repeated on rebuilds.
    expect(stderr.split("set-target --detected").length - 1).toBe(1);

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });

  test("watch --json surfaces the drift notice and pinMismatch on its start event exactly once", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.12.4" } });
    const { io, out } = captureStreams();
    const factory: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd, "--json"], io, {
      watcherFactory: factory,
      onWatchStart,
      detectEditorVersion: () => "1.13.0",
    });

    const handle = await ready;
    await handle.waitForIdle();
    handle.stop();
    const code = await result;

    expect(code).toBe(0);
    const lines = out().trimEnd().split("\n");
    const start = JSON.parse(lines[0] as string) as {
      event: string;
      warnings?: string[];
      pinMismatch?: { installed: string; pinned: string };
    };
    expect(start.event).toBe("start");
    expect(start.warnings?.some((w) => w.includes("set-target --detected"))).toBe(true);
    expect(start.pinMismatch).toEqual({ installed: "1.13.0", pinned: "1.12.4" });
    // The notice rides `start` alone — exactly once across the whole stream.
    expect(out().split("set-target --detected").length - 1).toBe(1);
  });

  test("watch carries the unresolvable-target notice on stderr and its --json start event", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": UNREGISTERED_TARGET } });
    const plain = captureStreams();
    const plainFactory: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });

    const plainCode = await dispatch(["watch", cwd], plain.io, {
      watcherFactory: plainFactory,
      onWatchStart: (h) => h.stop(),
      detectEditorVersion: () => null,
    });

    expect(plainCode).toBe(0);
    expect(plain.err()).toContain("the API registry cannot provide");

    const jsonRun = captureStreams();
    const jsonFactory: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });
    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd, "--json"], jsonRun.io, {
      watcherFactory: jsonFactory,
      onWatchStart,
      detectEditorVersion: () => null,
    });
    const handle = await ready;
    await handle.waitForIdle();
    handle.stop();

    expect(await result).toBe(0);
    const start = JSON.parse(jsonRun.out().trimEnd().split("\n")[0] as string) as {
      event: string;
      warnings?: string[];
    };
    expect(start.event).toBe("start");
    expect(start.warnings?.some((w) => w.includes("the API registry cannot provide"))).toBe(true);
  });

  test("watch stays silent when the editor matches the pin or the pin is a channel", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.12.4" } });
    const matched = captureStreams();
    const matchFactory: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });
    const matchCode = await dispatch(["watch", cwd, "--json"], matched.io, {
      watcherFactory: matchFactory,
      onWatchStart: (h) => h.stop(),
      detectEditorVersion: () => "1.12.4",
    });
    expect(matchCode).toBe(0);
    expect(matched.out()).not.toContain("set-target --detected");
    expect(matched.out()).not.toContain("pinMismatch");

    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": "stable" } }, null, 2)}\n`,
    );
    const channel = captureStreams();
    const channelFactory: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });
    const channelCode = await dispatch(["watch", cwd, "--json"], channel.io, {
      watcherFactory: channelFactory,
      onWatchStart: (h) => h.stop(),
      detectEditorVersion: () => "1.13.0",
      fetchChannelInfo: async () => ({ version: "1.10.0", sha1: "abc123" }),
    });
    expect(channelCode).toBe(0);
    expect(channel.out()).not.toContain("set-target --detected");
    expect(channel.out()).not.toContain("pinMismatch");
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
    expect(parsed.materializedSurface).toBe(`.defold-types/${surfaceDir("defold-1.12.4")}`);
    const camera = readFileSync(
      path.join(cwd, ".defold-types", surfaceDir("defold-1.12.4"), "camera.d.ts"),
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

  test("build --json with no pin reports the current-stable apiSurface", async () => {
    scaffoldBuildProject();
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, {
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string; apiSurface: string | null };
    expect(parsed.defoldVersion).toBe(CURRENT_STABLE_DEFOLD_VERSION);
    expect(parsed.apiSurface).toBe(CURRENT_STABLE_SURFACE_ID);
  });

  test("build --defold-target with no pre-baked surface reports apiSurface null", async () => {
    scaffoldBuildProject();
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--defold-target", "1.10.0", "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { apiSurface: string | null };
    expect(parsed.apiSurface).toBeNull();
  });

  test("init --json reports the current-stable apiSurface", () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out } = captureStreams();

    const code = dispatch(["init", cwd, "--json"], io, {
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { apiSurface: string | null };
    expect(parsed.apiSurface).toBe(CURRENT_STABLE_SURFACE_ID);
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
    expect(parsed.materializedSurface).toBe(
      `.defold-types/${surfaceDir(CURRENT_STABLE_SURFACE_ID)}`,
    );
    const pinnedDir = path.join(cwd, ".defold-types", surfaceDir(CURRENT_STABLE_SURFACE_ID));
    expect(existsSync(path.join(pinnedDir, "label.d.ts"))).toBe(true);
    expect(existsSync(path.join(pinnedDir, "engine-globals.d.ts"))).toBe(true);
    expect(readFileSync(path.join(pinnedDir, "index.d.ts"), "utf8")).toContain(
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
      path.join(cwd, ".defold-types", surfaceDir(CURRENT_STABLE_SURFACE_ID), "index.d.ts"),
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
      path.join(cwd, ".defold-types", surfaceDir(CURRENT_STABLE_SURFACE_ID), "index.d.ts"),
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
    expect(materializedSurfaceEntries()).toEqual([]);
  });

  test("build --json on a pinned ref-doc version generates the surface on the fly", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-target": "1.9.8" } });
    const resolveOpts = labelRefDocResolveOpts();
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, { resolveOpts });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { materializedSurface: string | null };
    expect(parsed.materializedSurface).toBe(`.defold-types/${surfaceDir("defold-1.9.8")}`);

    const dir = path.join(cwd, ".defold-types", surfaceDir("defold-1.9.8"));
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
    expect(tsconfig.compilerOptions.types).toEqual([surfaceDir("defold-1.9.8")]);

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
    expect(parsed.materializedSurface).toBe(`.defold-types/${surfaceDir("defold-1.9.8")}`);
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
    expect(parsed.materializedSurface).toBe(
      `.defold-types/${surfaceDir(CURRENT_STABLE_SURFACE_ID)}`,
    );
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
    expect(materializedSurfaceEntries()).toEqual([]);

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
    const dir = path.join(cwd, ".defold-types", surfaceDir("defold-1.9.8"));
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
      detectEditorVersion: () => null,
    });

    const code = await result;
    expect(code).toBe(0);
    expect(failureOutput(err())).toBe("");

    const dir = path.join(cwd, ".defold-types", surfaceDir("defold-1.9.8"));
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
    expect(failureOutput(err())).toBe("");
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

  test("watch --hot-reload posts one reload through the injected editor client", async () => {
    const tsconfig = JSON.stringify(
      { compilerOptions: { strict: true }, include: ["src/**/*.ts"] },
      null,
      2,
    );
    writeFileSync(path.join(cwd, "tsconfig.json"), tsconfig);
    const srcDir = path.join(cwd, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(path.join(srcDir, "main.ts"), "export const a = 1;\n");

    const { io } = captureStreams();
    let triggerMain: ((kind: "change" | "rename", rel: string) => void) | undefined;
    const factory: WatcherFactory = (_dir, onEvent): Watcher => {
      triggerMain = (kind, rel) => onEvent({ kind, path: rel });
      return { close() {} };
    };
    const editor = makeEditorClient();

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd, "--hot-reload"], io, {
      debounceMs: 5,
      watcherFactory: factory,
      editorClient: editor.client,
      onWatchStart,
    });

    const handle = await ready;
    await handle.waitForIdle();
    const afterStartup = editor.posts.length;

    writeFileSync(path.join(srcDir, "main.ts"), "export const a = 2;\n");
    triggerMain?.("change", "src/main.ts");
    await handle.waitForIdle();

    expect(editor.posts.slice(afterStartup)).toEqual(["hot-reload"]);

    handle.stop();
    await result;
  });

  test("watch without --hot-reload reads the editor but posts nothing to it", async () => {
    const tsconfig = JSON.stringify(
      { compilerOptions: { strict: true }, include: ["src/**/*.ts"] },
      null,
      2,
    );
    writeFileSync(path.join(cwd, "tsconfig.json"), tsconfig);
    const srcDir = path.join(cwd, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(path.join(srcDir, "main.ts"), "export const a = 1;\n");

    const { io } = captureStreams();
    let triggerMain: ((kind: "change" | "rename", rel: string) => void) | undefined;
    const factory: WatcherFactory = (_dir, onEvent): Watcher => {
      triggerMain = (kind, rel) => onEvent({ kind, path: rel });
      return { close() {} };
    };
    const editor = makeEditorClient();

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd], io, {
      debounceMs: 5,
      watcherFactory: factory,
      editorClient: editor.client,
      onWatchStart,
    });

    const handle = await ready;
    await handle.waitForIdle();

    writeFileSync(path.join(srcDir, "main.ts"), "export const a = 2;\n");
    triggerMain?.("change", "src/main.ts");
    await handle.waitForIdle();

    expect(editor.posts).toEqual([]);
    expect(editor.resolveCount()).toBeGreaterThan(0);

    handle.stop();
    await result;
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
      path.join(cwd, ".defold-types", surfaceDir(CURRENT_STABLE_SURFACE_ID), "index.d.ts"),
      "utf8",
    );
    expect(index).toContain('"./gui"');
    expect(index).toContain('"./render"');
    expect(index).toContain('"./label"');

    handle?.stop();
    const code = await result;
    expect(code).toBe(0);
    expect(failureOutput(err())).toBe("");

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

    const indexPath = path.join(
      cwd,
      ".defold-types",
      surfaceDir(CURRENT_STABLE_SURFACE_ID),
      "index.d.ts",
    );
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

    expect(failureOutput(err())).toBe("");

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
    expect(failureOutput(err())).toBe("");

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
      // Stubbed, not left to the host: an unstubbed probe reads whatever editor
      // this machine has installed, so "a valid pin" would emit a pin-mismatch
      // warning on any machine whose editor is not the pinned version.
      detectEditorVersion: () => CURRENT_STABLE_DEFOLD_VERSION,
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

  function scaffoldNestedWallProject(): void {
    writeFileSync(
      path.join(cwd, "tsconfig.json"),
      `${JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }, null, 2)}\n`,
    );
    for (const leaf of ["hud", "menu"]) {
      mkdirSync(path.join(cwd, "src", "gui", leaf), { recursive: true });
      writeFileSync(
        path.join(cwd, "src", "gui", leaf, "a.ts"),
        'import { defineGuiScript } from "@defold-typescript/types/gui-script";\nexport default defineGuiScript({});\n',
      );
    }
  }

  test("wall --list --json reports each narrowed directory's origin and declaring ancestor", async () => {
    scaffoldNestedWallProject();
    const { io } = captureStreams();
    await dispatch(["wall", "src/gui"], io, { cwd });

    const { io: io2, out } = captureStreams();
    const code = await dispatch(["wall", "--list", "--json"], io2, { cwd });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      directoryWalls: { dir: string; kind: string }[];
      resolved: { dir: string; kind: string; declaredIn: string; origin: string }[];
    };
    expect(parsed.directoryWalls).toEqual([{ dir: "src/gui", kind: "gui-script" }]);
    expect(parsed.resolved).toEqual([
      { dir: "src/gui/hud", kind: "gui-script", declaredIn: "src/gui", origin: "inherited" },
      { dir: "src/gui/menu", kind: "gui-script", declaredIn: "src/gui", origin: "inherited" },
    ]);
  });

  test("wall --list names the inherited directories and their declaring wall", async () => {
    scaffoldNestedWallProject();
    const { io } = captureStreams();
    await dispatch(["wall", "src/gui"], io, { cwd });

    const { io: io2, out } = captureStreams();
    await dispatch(["wall", "--list"], io2, { cwd });

    expect(out()).toContain("inherited [src/gui/hud <- src/gui, src/gui/menu <- src/gui]");
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

  test("bob status honors the --java override", async () => {
    const { io, out } = captureStreams();
    const { internals, spawned, downloaded } = defoldInternals();

    const code = await dispatch(
      ["bob", "status", cwd, "--defold-target", "1.12.4", "--java", "/jdk/bin/java", "--json"],
      io,
      internals,
    );

    expect(code).toBe(0);
    const parsed = JSON.parse(out().trim()) as { java: string };
    expect(parsed.java).toBe("/jdk/bin/java");
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

  function pinProject(target: string): void {
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": target } }, null, 2)}\n`,
    );
  }

  test("bob build warns on stderr when the detected editor drifts from a version pin", async () => {
    pinProject("1.12.4");
    const { io, err } = captureStreams();
    const { internals } = defoldInternals();

    const code = await dispatch(["bob", "build", cwd], io, {
      ...internals,
      detectEditorVersion: () => "1.13.0",
    });

    expect(code).toBe(0);
    const stderr = err();
    expect(stderr).toContain("1.13.0");
    expect(stderr).toContain("1.12.4");
    expect(stderr).toContain("set-target --detected");
  });

  test("bob build --json adds pinMismatch on drift, subcommand and exitCode intact", async () => {
    pinProject("1.12.4");
    const { io, out } = captureStreams();
    const { internals } = defoldInternals();

    const code = await dispatch(["bob", "build", cwd, "--json"], io, {
      ...internals,
      detectEditorVersion: () => "1.13.0",
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out().trim()) as {
      command: string;
      subcommand: string;
      exitCode: number;
      warnings?: string[];
      pinMismatch?: { installed: string; pinned: string };
    };
    expect(parsed.command).toBe("bob");
    expect(parsed.subcommand).toBe("build");
    expect(parsed.exitCode).toBe(0);
    expect(parsed.warnings?.some((w) => w.includes("set-target --detected"))).toBe(true);
    expect(parsed.pinMismatch).toEqual({ installed: "1.13.0", pinned: "1.12.4" });
  });

  test("bob bundle warns on stderr and folds pinMismatch into --json on drift", async () => {
    pinProject("1.12.4");
    const stderrRun = captureStreams();
    const { internals } = defoldInternals();
    const stderrCode = await dispatch(["bob", "bundle", cwd], stderrRun.io, {
      ...internals,
      detectEditorVersion: () => "1.13.0",
    });
    expect(stderrCode).toBe(0);
    expect(stderrRun.err()).toContain("set-target --detected");

    const jsonRun = captureStreams();
    const { internals: internals2 } = defoldInternals();
    const jsonCode = await dispatch(["bob", "bundle", cwd, "--json"], jsonRun.io, {
      ...internals2,
      detectEditorVersion: () => "1.13.0",
    });
    expect(jsonCode).toBe(0);
    const parsed = JSON.parse(jsonRun.out().trim()) as {
      subcommand: string;
      exitCode: number;
      pinMismatch?: { installed: string; pinned: string };
    };
    expect(parsed.subcommand).toBe("bundle");
    expect(parsed.exitCode).toBe(0);
    expect(parsed.pinMismatch).toEqual({ installed: "1.13.0", pinned: "1.12.4" });
  });

  test("bob run warns on stderr on drift, launch exit code intact", async () => {
    pinProject("1.12.4");
    const { io, err } = captureStreams();
    const { internals } = defoldInternals();

    const code = await dispatch(["bob", "run", cwd], io, {
      ...internals,
      detectEditorVersion: () => "1.13.0",
      runInternals: {
        platform: "darwin",
        arch: "arm64",
        probe: () => true,
        spawn: () => ({ kill: () => {}, exited: Promise.resolve(0) }),
        copyAside: (p) => p,
        chmod: () => {},
      },
    });

    expect(code).toBe(0);
    const stderr = err();
    expect(stderr).toContain("1.13.0");
    expect(stderr).toContain("1.12.4");
    expect(stderr).toContain("set-target --detected");
  });

  test("bob run --json adds pinMismatch on drift, launch envelope intact", async () => {
    pinProject("1.12.4");
    const { io, out } = captureStreams();
    const { internals } = defoldInternals();

    const code = await dispatch(["bob", "run", cwd, "--json"], io, {
      ...internals,
      detectEditorVersion: () => "1.13.0",
      runInternals: {
        platform: "darwin",
        arch: "arm64",
        probe: () => true,
        spawn: () => ({ kill: () => {}, exited: Promise.resolve(0) }),
        copyAside: (p) => p,
        chmod: () => {},
      },
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out().trim()) as {
      subcommand: string;
      launch: { enginePath: string; exitCode: number };
      pinMismatch?: { installed: string; pinned: string };
    };
    expect(parsed.subcommand).toBe("run");
    expect(parsed.launch.exitCode).toBe(0);
    expect(parsed.pinMismatch).toEqual({ installed: "1.13.0", pinned: "1.12.4" });
  });

  test("bob build stays silent when the editor matches the pin or the pin is a channel", async () => {
    pinProject("1.12.4");
    const matched = captureStreams();
    const { internals } = defoldInternals();
    const matchCode = await dispatch(["bob", "build", cwd, "--json"], matched.io, {
      ...internals,
      detectEditorVersion: () => "1.12.4",
    });
    expect(matchCode).toBe(0);
    expect(matched.out()).not.toContain("pinMismatch");
    expect(matched.err()).not.toContain("set-target --detected");

    pinProject("stable");
    const channel = captureStreams();
    const { internals: internals2 } = defoldInternals();
    const channelCode = await dispatch(["bob", "build", cwd, "--json"], channel.io, {
      ...internals2,
      detectEditorVersion: () => "1.13.0",
      fetchChannelInfo: async () => ({ version: "1.10.0", sha1: "abc123" }),
    });
    expect(channelCode).toBe(0);
    expect(channel.out()).not.toContain("pinMismatch");
    expect(channel.err()).not.toContain("set-target --detected");
  });

  test("bob bundle stays silent when the editor matches the pin or the pin is a channel", async () => {
    pinProject("1.12.4");
    const matched = captureStreams();
    const { internals } = defoldInternals();
    const matchCode = await dispatch(["bob", "bundle", cwd, "--json"], matched.io, {
      ...internals,
      detectEditorVersion: () => "1.12.4",
    });
    expect(matchCode).toBe(0);
    expect(matched.out()).not.toContain("pinMismatch");
    expect(matched.err()).not.toContain("set-target --detected");

    pinProject("stable");
    const channel = captureStreams();
    const { internals: internals2 } = defoldInternals();
    const channelCode = await dispatch(["bob", "bundle", cwd, "--json"], channel.io, {
      ...internals2,
      detectEditorVersion: () => "1.13.0",
      fetchChannelInfo: async () => ({ version: "1.10.0", sha1: "abc123" }),
    });
    expect(channelCode).toBe(0);
    expect(channel.out()).not.toContain("pinMismatch");
    expect(channel.err()).not.toContain("set-target --detected");
  });

  test("bob run stays silent when the editor matches the pin or the pin is a channel", async () => {
    const runInternals = {
      platform: "darwin" as const,
      arch: "arm64" as const,
      probe: () => true,
      spawn: () => ({ kill: () => {}, exited: Promise.resolve(0) }),
      copyAside: (p: string) => p,
      chmod: () => {},
    };

    pinProject("1.12.4");
    const matched = captureStreams();
    const { internals } = defoldInternals();
    const matchCode = await dispatch(["bob", "run", cwd, "--json"], matched.io, {
      ...internals,
      detectEditorVersion: () => "1.12.4",
      runInternals,
    });
    expect(matchCode).toBe(0);
    expect(matched.out()).not.toContain("pinMismatch");
    expect(matched.err()).not.toContain("set-target --detected");

    pinProject("stable");
    const channel = captureStreams();
    const { internals: internals2 } = defoldInternals();
    const channelCode = await dispatch(["bob", "run", cwd, "--json"], channel.io, {
      ...internals2,
      detectEditorVersion: () => "1.13.0",
      fetchChannelInfo: async () => ({ version: "1.10.0", sha1: "abc123" }),
      runInternals,
    });
    expect(channelCode).toBe(0);
    expect(channel.out()).not.toContain("pinMismatch");
    expect(channel.err()).not.toContain("set-target --detected");
  });

  test("bob status and bob resolve stay silent even when the editor drifts", async () => {
    pinProject("1.12.4");
    const status = captureStreams();
    const { internals } = defoldInternals();
    const statusCode = await dispatch(["bob", "status", cwd], status.io, {
      ...internals,
      detectEditorVersion: () => "1.13.0",
    });
    expect(statusCode).toBe(0);
    expect(status.out()).not.toContain("pinMismatch");
    expect(status.err()).not.toContain("set-target --detected");

    const resolve = captureStreams();
    const { internals: internals2 } = defoldInternals();
    const resolveCode = await dispatch(["bob", "resolve", cwd], resolve.io, {
      ...internals2,
      detectEditorVersion: () => "1.13.0",
    });
    expect(resolveCode).toBe(0);
    expect(resolve.out()).not.toContain("pinMismatch");
    expect(resolve.err()).not.toContain("set-target --detected");
  });

  test("bob build --fail-on-drift exits non-zero on drift without reaching bob's arguments", async () => {
    pinProject("1.12.4");
    const { io, err } = captureStreams();
    const { internals, spawned } = defoldInternals();

    const code = await dispatch(["bob", "build", cwd, "--fail-on-drift"], io, {
      ...internals,
      detectEditorVersion: () => "1.13.0",
    });

    expect(code).toBe(1);
    expect(err()).toContain("set-target --detected");
    expect(spawned.flat()).not.toContain("--fail-on-drift");
  });

  test("bob status --fail-on-drift exits unchanged — the gate excludes it", async () => {
    pinProject("1.12.4");
    const { io } = captureStreams();
    const { internals } = defoldInternals();

    const code = await dispatch(["bob", "status", cwd, "--fail-on-drift"], io, {
      ...internals,
      detectEditorVersion: () => "1.13.0",
    });

    expect(code).toBe(0);
  });

  // The pin verdict is knowable before any network call, so a run that dies in
  // `resolveHead()` must still report it. `fetchVersionInfo` rejecting is the
  // real shape of that failure: an unregistered pin has no `refs/tags/<version>`
  // to dereference, so the tag lookup is exactly what fails first.
  const TAG_LOOKUP_ERROR =
    "defold-typescript: could not resolve the Defold version tag (https://api.github.com/repos/defold/defold/git/refs/tags/1.0.0 -> 404 Not Found).";

  function rejectingVersionFetch(): { fetchVersionInfo: () => Promise<{ sha1: string }> } {
    return {
      fetchVersionInfo: async () => {
        throw new Error(TAG_LOOKUP_ERROR);
      },
    };
  }

  test("bob build retains the unresolvable-target diagnostic when the tag lookup fails", async () => {
    expect(registeredTargetVersions()).not.toContain(UNREGISTERED_TARGET);
    pinProject(UNREGISTERED_TARGET);
    const { io, err } = captureStreams();
    const { internals } = defoldInternals();

    const code = await dispatch(["bob", "build", cwd], io, {
      ...internals,
      ...rejectingVersionFetch(),
      detectEditorVersion: () => null,
    });

    expect(code).toBe(1);
    const stderr = err();
    // `1.0.0` alone also appears inside the tag-lookup URL, so the notice is
    // identified by its own wording and the resolvable set it lists.
    expect(stderr).toContain("the API registry cannot provide");
    for (const version of registeredTargetVersions()) {
      expect(stderr).toContain(version);
    }
    expect(stderr).toContain(TAG_LOOKUP_ERROR);
  });

  test("bob build --json folds the notice and unresolvableTarget into the failing payload", async () => {
    pinProject(UNREGISTERED_TARGET);
    const { io, out } = captureStreams();
    const { internals } = defoldInternals();

    const code = await dispatch(["bob", "build", cwd, "--json"], io, {
      ...internals,
      ...rejectingVersionFetch(),
      detectEditorVersion: () => null,
    });

    expect(code).toBe(1);
    const parsed = JSON.parse(out().trim()) as {
      command: string;
      subcommand: string;
      error: string;
      warnings?: string[];
      unresolvableTarget?: { target: string; available: string[] };
    };
    expect(parsed.command).toBe("bob");
    expect(parsed.subcommand).toBe("build");
    expect(parsed.error).toBe(TAG_LOOKUP_ERROR);
    expect(parsed.warnings?.some((w) => w.includes(UNREGISTERED_TARGET))).toBe(true);
    expect(parsed.unresolvableTarget).toEqual({
      target: UNREGISTERED_TARGET,
      available: registeredTargetVersions(),
    });
  });

  test("bob run reports the same diagnostic on stderr and under --json when the tag lookup fails", async () => {
    pinProject(UNREGISTERED_TARGET);
    const runInternals = {
      platform: "darwin" as const,
      arch: "arm64" as const,
      probe: () => true,
      spawn: () => ({ kill: () => {}, exited: Promise.resolve(0) }),
      copyAside: (p: string) => p,
      chmod: () => {},
    };

    const plain = captureStreams();
    const { internals } = defoldInternals();
    const plainCode = await dispatch(["bob", "run", cwd], plain.io, {
      ...internals,
      ...rejectingVersionFetch(),
      detectEditorVersion: () => null,
      runInternals,
    });

    expect(plainCode).toBe(1);
    expect(plain.err()).toContain("the API registry cannot provide");
    for (const version of registeredTargetVersions()) {
      expect(plain.err()).toContain(version);
    }
    expect(plain.err()).toContain(TAG_LOOKUP_ERROR);

    const jsonRun = captureStreams();
    const { internals: internals2 } = defoldInternals();
    const jsonCode = await dispatch(["bob", "run", cwd, "--json"], jsonRun.io, {
      ...internals2,
      ...rejectingVersionFetch(),
      detectEditorVersion: () => null,
      runInternals,
    });

    expect(jsonCode).toBe(1);
    const parsed = JSON.parse(jsonRun.out().trim()) as {
      subcommand: string;
      error: string;
      warnings?: string[];
      unresolvableTarget?: { target: string; available: string[] };
    };
    expect(parsed.subcommand).toBe("run");
    expect(parsed.error).toBe(TAG_LOOKUP_ERROR);
    expect(parsed.warnings?.some((w) => w.includes(UNREGISTERED_TARGET))).toBe(true);
    expect(parsed.unresolvableTarget).toEqual({
      target: UNREGISTERED_TARGET,
      available: registeredTargetVersions(),
    });
  });

  // The pin is unresolvable, so `--fail-on-drift` really does arm the
  // escalation; Bob then exits 5 on its own. A resolvable pin would leave the
  // escalation disarmed and prove nothing about masking.
  test("bob build --fail-on-drift returns Bob's own failure code, never masking it", async () => {
    pinProject(UNREGISTERED_TARGET);
    const { io } = captureStreams();
    const { internals } = defoldInternals({
      spawn: async () => ({ exitCode: 5 }),
    });

    const code = await dispatch(["bob", "build", cwd, "--fail-on-drift"], io, {
      ...internals,
      detectEditorVersion: () => null,
    });

    expect(code).toBe(5);
  });

  test("bob build carries the unresolvable-target notice on a successful Bob run", async () => {
    pinProject(UNREGISTERED_TARGET);

    const plain = captureStreams();
    const { internals } = defoldInternals();
    const plainCode = await dispatch(["bob", "build", cwd], plain.io, {
      ...internals,
      detectEditorVersion: () => null,
    });

    expect(plainCode).toBe(0);
    expect(plain.err()).toContain("the API registry cannot provide");

    const jsonRun = captureStreams();
    const { internals: internals2 } = defoldInternals();
    const jsonCode = await dispatch(["bob", "build", cwd, "--json"], jsonRun.io, {
      ...internals2,
      detectEditorVersion: () => null,
    });

    expect(jsonCode).toBe(0);
    const parsed = JSON.parse(jsonRun.out().trim()) as {
      exitCode: number;
      warnings?: string[];
      unresolvableTarget?: { target: string; available: string[] };
    };
    expect(parsed.exitCode).toBe(0);
    expect(parsed.warnings?.some((w) => w.includes("the API registry cannot provide"))).toBe(true);
    expect(parsed.unresolvableTarget).toEqual({
      target: UNREGISTERED_TARGET,
      available: registeredTargetVersions(),
    });
  });

  test("the removed defold command is unknown and falls through to top-level usage", async () => {
    const { io, err } = captureStreams();

    const code = await dispatch(["defold", "resolve", cwd], io);

    expect(code).toBe(1);
    expect(err()).toBe(
      "Usage: defold-typescript <init|init-agents|upgrade|set-target|build|watch|reload|wall|setup-debug|resolve|scene-types|bob|run> [path]\n" +
        "Run `defold-typescript --help` for per-command usage and flags.\n",
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
        sceneSources: number;
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
        sceneSources: 0,
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
      // A head that resolves to a *registered* surface, so the assertion below
      // distinguishes "derived from the head" from "fell back to null".
      fetchChannelInfo: async () => ({ version: CURRENT_STABLE_DEFOLD_VERSION, sha1: "abc123" }),
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      defoldVersion: string;
      defoldChannel: string | null;
      defoldSha: string | null;
      apiSurface: string | null;
    };
    expect(parsed.defoldVersion).toBe(CURRENT_STABLE_DEFOLD_VERSION);
    expect(parsed.defoldChannel).toBe("beta");
    expect(parsed.defoldSha).toBe("abc123");
    // The surface derives from the resolved head version, never from the channel
    // pin token — `beta` would otherwise leak through as the surface id.
    expect(parsed.apiSurface).toBe(CURRENT_STABLE_SURFACE_ID);
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
          return {
            entries: () => ["mylib-main/mylib/core.lua", "mylib-main/asset/foo.png"],
            read: () => "",
          };
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

  for (const engineArgs of [["--wait", "100"], ["--extensions"]]) {
    test(`run hands the engine post-\`--\` ${engineArgs[0]} instead of parsing it as a CLI flag`, async () => {
      const projectc = path.join(cwd, "build/default/game.projectc");
      const engine = path.join(cwd, "build/x86_64-linux/dmengine");
      const spawned: string[][] = [];
      const { io } = captureStreams();

      const code = await dispatch(["run", cwd, "--", ...engineArgs], io, {
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
      expect(spawned[0]).toEqual([engine, projectc, ...engineArgs]);
    });
  }

  test("run forwards a post-`--` --json to the engine without switching the CLI to JSON", async () => {
    const projectc = path.join(cwd, "build/default/game.projectc");
    const engine = path.join(cwd, "build/x86_64-linux/dmengine");
    const spawned: string[][] = [];
    const { io, out } = captureStreams();

    const code = await dispatch(["run", cwd, "--", "--json"], io, {
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
    expect(spawned[0]).toEqual([engine, projectc, "--json"]);
    expect(out()).not.toContain('"command"');
  });

  // The scans these cover read `head` *before* the flag preamble, so widening one
  // back to `argv` returns without ever spawning -- a failure shape the three
  // preamble cases above cannot see. The short aliases carry their own rows
  // because each short alias is scanned separately from its long form -- the
  // early exits are two `head.includes` calls joined by `||`, so one operand can
  // be widened back to `argv` while the other stays correct and keeps the
  // long-form row green.
  const POST_DELIMITER_EARLY_EXIT_ARGS = [
    ["--help"],
    ["-h"],
    ["--version"],
    ["-v"],
    ["--channel", "beta"],
    ["--defold-version=1.9.0"],
  ];

  for (const engineArgs of POST_DELIMITER_EARLY_EXIT_ARGS) {
    test(`run hands the engine post-\`--\` ${engineArgs[0]} instead of exiting early`, async () => {
      const projectc = path.join(cwd, "build/default/game.projectc");
      const engine = path.join(cwd, "build/x86_64-linux/dmengine");
      const spawned: string[][] = [];
      const { io, out } = captureStreams();

      const code = await dispatch(["run", cwd, "--", ...engineArgs], io, {
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
      expect(spawned[0]).toEqual([engine, projectc, ...engineArgs]);
      expect(out()).toBe("");
    });
  }

  test("run warns on stderr when the detected editor drifts from a version pin, exit code intact", async () => {
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": "1.12.4" } }, null, 2)}\n`,
    );
    const projectc = path.join(cwd, "build/default/game.projectc");
    const engine = path.join(cwd, "build/arm64-macos/dmengine");
    const { io, err } = captureStreams();

    const code = await dispatch(["run", cwd], io, {
      detectEditorVersion: () => "1.13.0",
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
    const stderr = err();
    expect(stderr).toContain("1.13.0");
    expect(stderr).toContain("1.12.4");
    expect(stderr).toContain("set-target --detected");
  });

  test("run --json adds warnings and pinMismatch on drift, leaving enginePath and exitCode intact", async () => {
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": "1.12.4" } }, null, 2)}\n`,
    );
    const projectc = path.join(cwd, "build/default/game.projectc");
    const engine = path.join(cwd, "build/arm64-macos/dmengine");
    const { io, out } = captureStreams();

    const code = await dispatch(["run", cwd, "--json"], io, {
      detectEditorVersion: () => "1.13.0",
      runInternals: {
        platform: "darwin",
        arch: "arm64",
        probe: (p) => p === projectc || p === engine,
        spawn: () => ({ kill: () => {}, exited: Promise.resolve(0) }),
        copyAside: (p) => p,
        chmod: () => {},
      },
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      command: string;
      enginePath: string;
      exitCode: number;
      warnings?: string[];
      pinMismatch?: { installed: string; pinned: string };
    };
    expect(parsed.command).toBe("run");
    expect(parsed.enginePath).toBe(engine);
    expect(parsed.exitCode).toBe(0);
    expect(parsed.warnings?.some((w) => w.includes("set-target --detected"))).toBe(true);
    expect(parsed.pinMismatch).toEqual({ installed: "1.13.0", pinned: "1.12.4" });
  });

  test("run --fail-on-drift exits non-zero when a clean engine run drifts from the pin", async () => {
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": "1.12.4" } }, null, 2)}\n`,
    );
    const projectc = path.join(cwd, "build/default/game.projectc");
    const engine = path.join(cwd, "build/arm64-macos/dmengine");
    const { io, err } = captureStreams();

    const code = await dispatch(["run", cwd, "--fail-on-drift"], io, {
      detectEditorVersion: () => "1.13.0",
      runInternals: {
        platform: "darwin",
        arch: "arm64",
        probe: (p) => p === projectc || p === engine,
        spawn: () => ({ kill: () => {}, exited: Promise.resolve(0) }),
        copyAside: (p) => p,
        chmod: () => {},
      },
    });

    expect(code).toBe(1);
    expect(err()).toContain("set-target --detected");
  });

  test("run --fail-on-drift returns the engine's own failure code, never masking it", async () => {
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": "1.12.4" } }, null, 2)}\n`,
    );
    const projectc = path.join(cwd, "build/default/game.projectc");
    const engine = path.join(cwd, "build/arm64-macos/dmengine");
    const { io } = captureStreams();

    const code = await dispatch(["run", cwd, "--fail-on-drift"], io, {
      detectEditorVersion: () => "1.13.0",
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
  });

  test("run --fail-on-drift is never forwarded to the engine after --", async () => {
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": "1.12.4" } }, null, 2)}\n`,
    );
    const projectc = path.join(cwd, "build/default/game.projectc");
    const engine = path.join(cwd, "build/arm64-macos/dmengine");
    const spawnedArgs: string[][] = [];
    const { io } = captureStreams();

    const code = await dispatch(["run", cwd, "--fail-on-drift", "--", "--verbose"], io, {
      detectEditorVersion: () => "1.13.0",
      runInternals: {
        platform: "darwin",
        arch: "arm64",
        probe: (p) => p === projectc || p === engine,
        spawn: (argv: string[]) => {
          spawnedArgs.push(argv);
          return { kill: () => {}, exited: Promise.resolve(0) };
        },
        copyAside: (p) => p,
        chmod: () => {},
      },
    });

    expect(code).toBe(1);
    expect(spawnedArgs.flat()).toContain("--verbose");
    expect(spawnedArgs.flat()).not.toContain("--fail-on-drift");
  });

  test("run carries the unresolvable-target notice on stderr and in its --json envelope", async () => {
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": UNREGISTERED_TARGET } }, null, 2)}\n`,
    );
    const projectc = path.join(cwd, "build/default/game.projectc");
    const engine = path.join(cwd, "build/arm64-macos/dmengine");
    const runInternals = {
      platform: "darwin" as const,
      arch: "arm64" as const,
      probe: (candidate: string) => candidate === projectc || candidate === engine,
      spawn: () => ({ kill: () => {}, exited: Promise.resolve(0) }),
      copyAside: (candidate: string) => candidate,
      chmod: () => {},
    };

    const plain = captureStreams();
    const plainCode = await dispatch(["run", cwd], plain.io, {
      detectEditorVersion: () => null,
      runInternals,
    });

    expect(plainCode).toBe(0);
    expect(plain.err()).toContain("the API registry cannot provide");

    const jsonRun = captureStreams();
    const jsonCode = await dispatch(["run", cwd, "--json"], jsonRun.io, {
      detectEditorVersion: () => null,
      runInternals,
    });

    expect(jsonCode).toBe(0);
    const parsed = JSON.parse(jsonRun.out()) as {
      warnings?: string[];
      unresolvableTarget?: { target: string; available: string[] };
    };
    expect(parsed.warnings?.some((w) => w.includes("the API registry cannot provide"))).toBe(true);
    expect(parsed.unresolvableTarget).toEqual({
      target: UNREGISTERED_TARGET,
      available: registeredTargetVersions(),
    });
  });

  test("run stays silent when the editor matches the pin or the pin is a channel", async () => {
    const projectc = path.join(cwd, "build/default/game.projectc");
    const engine = path.join(cwd, "build/arm64-macos/dmengine");
    const runInternals = {
      platform: "darwin" as const,
      arch: "arm64" as const,
      probe: (p: string) => p === projectc || p === engine,
      spawn: () => ({ kill: () => {}, exited: Promise.resolve(0) }),
      copyAside: (p: string) => p,
      chmod: () => {},
    };

    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": "1.12.4" } }, null, 2)}\n`,
    );
    const matched = captureStreams();
    const matchCode = await dispatch(["run", cwd, "--json"], matched.io, {
      detectEditorVersion: () => "1.12.4",
      runInternals,
    });
    expect(matchCode).toBe(0);
    expect(matched.out()).not.toContain("set-target --detected");
    expect(matched.out()).not.toContain("pinMismatch");

    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": "stable" } }, null, 2)}\n`,
    );
    const channel = captureStreams();
    const channelCode = await dispatch(["run", cwd, "--json"], channel.io, {
      detectEditorVersion: () => "1.13.0",
      runInternals,
    });
    expect(channelCode).toBe(0);
    expect(channel.out()).not.toContain("set-target --detected");
    expect(channel.out()).not.toContain("pinMismatch");
  });

  test("run with no project path derives the project dir from args before -- so drift still fires", async () => {
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": "1.12.4" } }, null, 2)}\n`,
    );
    const spawned: string[][] = [];
    const { io, err } = captureStreams();
    const previous = process.cwd();
    process.chdir(cwd);
    const resolved = process.cwd();
    const projectc = path.join(resolved, "build/default/game.projectc");
    const engine = path.join(resolved, "build/arm64-macos/dmengine");
    try {
      const code = await dispatch(["run", "--", "--windowed"], io, {
        detectEditorVersion: () => "1.13.0",
        runInternals: {
          platform: "darwin",
          arch: "arm64",
          probe: (p) => p === projectc || p === engine,
          spawn: (argv) => {
            spawned.push(argv);
            return { kill: () => {}, exited: Promise.resolve(7) };
          },
          copyAside: (p) => p,
          chmod: () => {},
        },
      });

      expect(code).toBe(7);
      const stderr = err();
      expect(stderr).toContain("1.13.0");
      expect(stderr).toContain("1.12.4");
      expect(stderr).toContain("set-target --detected");
      expect(spawned[0]?.[spawned[0].length - 1]).toBe("--windowed");
    } finally {
      process.chdir(previous);
    }
  });

  test("run --json with no project path emits pinMismatch and passes args through", async () => {
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": "1.12.4" } }, null, 2)}\n`,
    );
    const spawned: string[][] = [];
    const { io, out } = captureStreams();
    const previous = process.cwd();
    process.chdir(cwd);
    const resolved = process.cwd();
    const projectc = path.join(resolved, "build/default/game.projectc");
    const engine = path.join(resolved, "build/arm64-macos/dmengine");
    try {
      const code = await dispatch(["run", "--json", "--", "--windowed"], io, {
        detectEditorVersion: () => "1.13.0",
        runInternals: {
          platform: "darwin",
          arch: "arm64",
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
      const parsed = JSON.parse(out()) as {
        enginePath: string;
        exitCode: number;
        warnings?: string[];
        pinMismatch?: { installed: string; pinned: string };
      };
      expect(parsed.pinMismatch).toEqual({ installed: "1.13.0", pinned: "1.12.4" });
      expect(parsed.warnings?.some((w) => w.includes("set-target --detected"))).toBe(true);
      expect(parsed.enginePath).toBe(engine);
      expect(parsed.exitCode).toBe(0);
      expect(spawned[0]?.[spawned[0].length - 1]).toBe("--windowed");
    } finally {
      process.chdir(previous);
    }
  });

  test("run with an explicit project path before -- still drifts and passes args through", async () => {
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": "1.12.4" } }, null, 2)}\n`,
    );
    const projectc = path.join(cwd, "build/default/game.projectc");
    const engine = path.join(cwd, "build/arm64-macos/dmengine");
    const spawned: string[][] = [];
    const { io, out } = captureStreams();

    const code = await dispatch(["run", cwd, "--json", "--", "--windowed"], io, {
      detectEditorVersion: () => "1.13.0",
      runInternals: {
        platform: "darwin",
        arch: "arm64",
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
    const parsed = JSON.parse(out()) as {
      pinMismatch?: { installed: string; pinned: string };
    };
    expect(parsed.pinMismatch).toEqual({ installed: "1.13.0", pinned: "1.12.4" });
    expect(spawned[0]?.[spawned[0].length - 1]).toBe("--windowed");
  });
});

describe("dispatch upgrade", () => {
  const USAGE =
    "Usage: defold-typescript <init|init-agents|upgrade|set-target|build|watch|reload|wall|setup-debug|resolve|scene-types|bob|run> [path]\n" +
    "Run `defold-typescript --help` for per-command usage and flags.\n";

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

  test("upgrade warns on stderr when the detected editor drifts from a version pin", async () => {
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

  test("upgrade carries the unresolvable-target notice on stderr and in --json warnings", async () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": UNREGISTERED_TARGET } }, null, 2)}\n`,
    );

    const plain = captureStreams();
    const { internals } = upgradeHarness({ running: "1.2.0", latest: "1.3.0" });
    const plainCode = await dispatch(["upgrade", cwd], plain.io, internals);

    expect(plainCode).toBe(0);
    expect(plain.err()).toContain("the API registry cannot provide");

    const jsonRun = captureStreams();
    const { internals: internals2 } = upgradeHarness({ running: "1.2.0", latest: "1.3.0" });
    const jsonCode = await dispatch(["upgrade", cwd, "--json"], jsonRun.io, internals2);

    expect(jsonCode).toBe(0);
    const parsed = JSON.parse(jsonRun.out().trim()) as {
      ok: boolean;
      warnings?: string[];
      unresolvableTarget?: { target: string; available: string[] };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.warnings?.some((w) => w.includes("the API registry cannot provide"))).toBe(true);
    expect(parsed.unresolvableTarget).toEqual({
      target: UNREGISTERED_TARGET,
      available: registeredTargetVersions(),
    });
  });

  test("update warns on stderr when the detected editor drifts from a version pin", async () => {
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

  test("update stays silent when the detected editor matches the version pin", async () => {
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

function writePkg(value: unknown): void {
  writeFileSync(path.join(cwd, "package.json"), `${JSON.stringify(value, null, 2)}\n`);
}

function pinOf(): string {
  const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8")) as {
    "defold-typescript": { "defold-target": string };
  };
  return pkg["defold-typescript"]["defold-target"];
}

const EDITOR_TOKEN = "6ee9f0b3-3f5e-4a1e-9a0f-2c7d4b8e1a55";

function openEditorOn(dir: string): void {
  mkdirSync(path.join(dir, ".internal"), { recursive: true });
  writeFileSync(path.join(dir, EDITOR_PORT_FILE), "58433");
  writeFileSync(path.join(dir, EDITOR_TOKEN_FILE), EDITOR_TOKEN);
}

interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>> | undefined;
  readonly body: string | undefined;
}

// Answers the handshake from the recorded spec and hands `/eval` to the case,
// which decides from the posted body.
function recordingTransport(evalBody: (posted: string) => string): {
  readonly transport: EditorTransport;
  readonly calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const transport: EditorTransport = async (url, init) => {
    calls.push({ url, method: init?.method ?? "GET", headers: init?.headers, body: init?.body });
    const body = url.endsWith("/openapi.json") ? SPEC_BODY : evalBody(init?.body ?? "");
    return { status: 200, text: async () => body };
  };
  return { transport, calls };
}

// Dispatch hands the probe nothing but a cwd, so the config lane is steered
// the way a user steers it. The override is read ahead of every per-OS path,
// which is what keeps these deterministic on a machine that has Defold
// installed. One copy serves every `--detected` describe below: a second
// independently-maintained steering helper is exactly the drift these cases
// exist to rule out.
let editorRoots: string[] = [];
function configLaneAnswers(version: string): void {
  const root = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-editor-root-"));
  writeFileSync(path.join(root, "config"), `version = ${version}\n`);
  editorRoots.push(root);
  process.env[EDITOR_ROOT_ENV] = root;
}

const savedEditorRoot = process.env[EDITOR_ROOT_ENV];

afterEach(() => {
  if (savedEditorRoot === undefined) {
    delete process.env[EDITOR_ROOT_ENV];
  } else {
    process.env[EDITOR_ROOT_ENV] = savedEditorRoot;
  }
  for (const root of editorRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  editorRoots = [];
});

describe("dispatch set-target", () => {
  test("set-target <token> writes the pin and reports from -> to", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const { io, out } = captureStreams();

    const code = await dispatch(["set-target", "1.13.1", cwd], io);

    expect(code).toBe(0);
    expect(out()).toContain("1.12.4 -> 1.13.1");
    expect(pinOf()).toBe("1.13.1");
  });

  test("set-target --json emits the command/ok/written/from/to payload", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    const { io, out } = captureStreams();

    const code = await dispatch(["set-target", "1.13.1", cwd, "--json"], io);

    expect(code).toBe(0);
    expect(JSON.parse(out())).toMatchObject({
      command: "set-target",
      ok: true,
      written: ["package.json"],
      from: "1.12.4",
      to: "1.13.1",
    });
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

    const code = await dispatch(["set-target", "--detected", "1.13.1", cwd], io, {
      probeEditor: async () => ({ version: "1.13.1", probed: [] }),
    });

    expect(code).toBe(1);
    expect(err()).toContain("set-target");
    expect(pinOf()).toBe("1.12.4");
  });
});

// These replace the probe *including its choice of source*, which is the seam
// the shared dispatch tail already selects on. The config lane is steered to a
// different resolvable version in every case, so the pin they expect is one
// only the injected probe can produce — never a coincidence of the host's
// installed editor.
describe("dispatch set-target --detected with an injected probe", () => {
  test("--detected writes the version only the injected probe can supply", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    configLaneAnswers("1.12.4");
    const { io } = captureStreams();

    const code = await dispatch(["set-target", "--detected", cwd], io, {
      probeEditor: async () => ({ version: "1.13.0", probed: [] }),
    });

    expect(code).toBe(0);
    expect(pinOf()).toBe("1.13.0");
  });

  test("--detect is a synonym of --detected", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    configLaneAnswers("1.12.4");
    const { io } = captureStreams();

    const code = await dispatch(["set-target", "--detect", cwd], io, {
      probeEditor: async () => ({ version: "1.13.0", probed: [] }),
    });

    expect(code).toBe(0);
    expect(pinOf()).toBe("1.13.0");
  });

  test("probeEditor wins over editorTransport, which is never called", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    // A real editor is open on the project, so the default probe would reach
    // the transport: an empty recording is what proves it was never built.
    openEditorOn(cwd);
    configLaneAnswers("1.12.4");
    const { transport, calls } = recordingTransport(() => evalSuccessBody("1.12.4"));
    const { io } = captureStreams();

    const code = await dispatch(["set-target", "--detected", cwd], io, {
      probeEditor: async () => ({ version: "1.13.0", probed: [] }),
      editorTransport: transport,
    });

    expect(code).toBe(0);
    expect(pinOf()).toBe("1.13.0");
    expect(calls).toEqual([]);
  });
});

// The `--detected` cases above inject `probeEditor`, which replaces the probe
// *including its choice of source*. These drive the default expression instead,
// injecting only the socket beneath it, so what the command asks and where it
// asks it are production's own.
describe("dispatch set-target --detected through the default probe", () => {
  test("--detected takes the version the running editor answered", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.12.4" } });
    openEditorOn(cwd);
    // The config lane answers a *different* version on purpose: a default
    // narrowed to the filesystem then writes 1.12.4 and cannot pass by
    // coincidence on a machine that has an editor installed.
    configLaneAnswers("1.12.4");
    const { transport, calls } = recordingTransport((posted) =>
      posted === "return editor.version" ? evalSuccessBody("1.13.1") : evalSuccessBody("nil"),
    );
    const { io } = captureStreams();

    const code = await dispatch(["set-target", "--detected", cwd], io, {
      editorTransport: transport,
    });

    expect(code).toBe(0);
    expect(pinOf()).toBe("1.13.1");
    expect(calls[1]).toEqual({
      url: `http://localhost:58433${EVAL_ROUTE}`,
      method: "POST",
      headers: {
        Authorization: `${EVAL_AUTH_SCHEME.replace(/^./, (c) => c.toUpperCase())} ${EDITOR_TOKEN}`,
        "Content-Type": EVAL_REQUEST_MEDIA_TYPE,
      },
      body: "return editor.version",
    });
  });

  test("--detected with no editor open asks nothing and reads the config lane", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.13.1" } });
    configLaneAnswers("1.12.4");
    const { transport, calls } = recordingTransport(() => evalSuccessBody("1.13.1"));
    const { io } = captureStreams();

    const code = await dispatch(["set-target", "--detected", cwd], io, {
      editorTransport: transport,
    });

    expect(code).toBe(0);
    expect(calls).toEqual([]);
    expect(pinOf()).toBe("1.12.4");
  });

  test("an editor that never answers cannot hold --detected", async () => {
    writePkg({ "defold-typescript": { "defold-target": "1.13.1" } });
    openEditorOn(cwd);
    configLaneAnswers("1.12.4");
    // Ignores abort on purpose: a stale port file can name a process that
    // accepts and then says nothing, so the deadline — not the signal — is what
    // has to be able to end this wait.
    const transport: EditorTransport = () => new Promise(() => {});
    const { io } = captureStreams();

    const code = await dispatch(["set-target", "--detected", cwd], io, {
      editorTransport: transport,
      editorProbeTimeoutMs: 20,
    });

    expect(code).toBe(0);
    expect(pinOf()).toBe("1.12.4");
  });
});

describe("dispatch reload", () => {
  test("reload posts one hot-reload through the injected editor client and exits 0", async () => {
    const { io, out } = captureStreams();
    const editor = makeEditorClient();

    const code = await dispatch(["reload", cwd, "--wait", "0"], io, {
      editorClient: editor.client,
    });

    expect(code).toBe(0);
    expect(editor.posts).toEqual(["hot-reload"]);
    expect(out()).toContain("no error observed");
    expect(out()).not.toContain('"command"');
  });

  test("reload --wait 0 reaches runReload as a zero window, opening no console", async () => {
    const { io } = captureStreams();
    const editor = makeEditorClient();
    let opened = 0;
    const client: WatchEditorClient = {
      ...editor.client,
      openConsole: () => {
        opened += 1;
        return Promise.resolve(null);
      },
    };

    const zero = await dispatch(["reload", cwd, "--wait", "0"], io, { editorClient: client });
    expect(zero).toBe(0);
    expect(opened).toBe(0);

    // A window that was asked for and could not be opened is a failure, not a
    // quiet console: the flag still reaches `runReload`, and the exit says so.
    const waited = await dispatch(["reload", cwd, "--wait", "10"], io, { editorClient: client });
    expect(waited).toBe(1);
    expect(opened).toBe(1);
  });

  test("reload still parses its own flags when no delimiter is present", async () => {
    const { io } = captureStreams();
    const editor = makeEditorClient();
    let opened = 0;
    const client: WatchEditorClient = {
      ...editor.client,
      openConsole: () => {
        opened += 1;
        return Promise.resolve(null);
      },
    };

    const code = await dispatch(["reload", cwd, "--wait", "0", "--extensions"], io, {
      editorClient: client,
    });

    expect(code).toBe(0);
    expect(editor.posts).toEqual(["reload-extensions"]);
    expect(opened).toBe(0);
  });

  test("reload --extensions forwards the flag instead of dropping it", async () => {
    const { io } = captureStreams();
    const editor = makeEditorClient();

    const code = await dispatch(["reload", cwd, "--extensions", "--wait", "0"], io, {
      editorClient: editor.client,
    });

    expect(code).toBe(0);
    expect(editor.posts).toEqual(["reload-extensions"]);
  });

  test("reload --json writes one result line carrying command and outcome", async () => {
    const { io, out, err } = captureStreams();
    const editor = makeEditorClient();

    const code = await dispatch(["reload", cwd, "--wait", "0", "--json"], io, {
      editorClient: editor.client,
    });

    expect(code).toBe(0);
    expect(err()).toBe("");
    const lines = out().trimEnd().split("\n");
    expect(lines.length).toBe(1);
    const payload = JSON.parse(lines[0] as string) as Record<string, unknown>;
    expect(payload.command).toBe("reload");
    expect(payload.outcome).toBe("accepted");
    expect(payload.ok).toBe(true);
  });

  test("reload propagates a non-zero exit when no editor is running", async () => {
    const { io, err } = captureStreams();
    const editor = makeEditorClient();
    const client: WatchEditorClient = { ...editor.client, resolve: () => Promise.resolve(null) };

    const code = await dispatch(["reload", cwd, "--wait", "0"], io, { editorClient: client });

    expect(code).toBe(1);
    expect(err()).toContain("no running Defold editor");
  });
});

describe("dispatch running-editor precedence", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-running-editor-"));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  function writePortFile(port = 4242): void {
    mkdirSync(path.join(cwd, ".internal"), { recursive: true });
    writeFileSync(path.join(cwd, ".internal", "editor.port"), `${port}\n`);
  }

  function scaffoldProject(pkg: Record<string, unknown>): void {
    writeFileSync(
      path.join(cwd, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }, null, 2),
    );
    mkdirSync(path.join(cwd, "src"), { recursive: true });
    writeFileSync(path.join(cwd, "src", "main.ts"), "export const a = 1;\n");
    writeFileSync(path.join(cwd, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  }

  test("with no editor open the shared tail stays synchronous", () => {
    // The value dispatch actually returned, not an awaited view of it: an
    // `await` hoisted above the decline branch turns this into a Promise and
    // converts every command's return type with it.
    const { io } = captureStreams();

    const result = dispatch(["init", cwd], io);

    expect(typeof result).toBe("number");
    expect(result).not.toBeInstanceOf(Promise);
  });

  test("with an editor open the same command resolves through a promise", async () => {
    writePortFile();
    let probed = false;
    const { io } = captureStreams();

    const result = dispatch(["init", cwd], io, {
      probeEditor: async () => {
        probed = true;
        return { version: null, probed: [] };
      },
    });

    expect(result).toBeInstanceOf(Promise);
    expect(typeof (await result)).toBe("number");
    expect(probed).toBe(true);
  });

  test("an open editor is probed once for the whole command", async () => {
    scaffoldProject({ "defold-typescript": { "defold-target": "1.12.4" } });
    writePortFile();
    let probes = 0;
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd], io, {
      probeEditor: async () => {
        probes += 1;
        return { version: "1.13.0", probed: [] };
      },
    });

    expect(code).toBe(0);
    expect(probes).toBe(1);
    // The drift notice is rendered from the probed version, so the count above
    // is a count of the reads production actually needed.
    expect(err()).toContain("1.13.0");
    expect(err()).toContain("1.12.4");
  });

  test("the running editor outranks the installed-editor lane", async () => {
    scaffoldProject({ "defold-typescript": { "defold-target": "1.12.4" } });
    writePortFile();
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd], io, {
      probeEditor: async () => ({ version: "1.13.1", probed: [] }),
      detectEditorVersion: () => "1.9.8",
    });

    expect(code).toBe(0);
    expect(err()).toContain("1.13.1");
    expect(err()).not.toContain("1.9.8");
  });

  test("an editor that never answers cannot stall the command", async () => {
    scaffoldProject({ "defold-typescript": { "defold-target": "1.12.4" } });
    writePortFile();
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd], io, {
      // Never settles, exactly as a stale port file naming a listening but mute
      // process behaves. Only production's own deadline can end this.
      probeEditor: () => new Promise<never>(() => {}),
      editorProbeTimeoutMs: 5,
      detectEditorVersion: () => "1.13.0",
    });

    expect(code).toBe(0);
    expect(err()).toContain("1.13.0");
  });
});

describe("watch scene-address surface wiring", () => {
  const PLAYER_ONLY = 'instances {\n  id: "player"\n  prototype: "/game/player.go"\n}\n';
  const PLAYER_AND_ENEMY = `${PLAYER_ONLY}instances {\n  id: "enemy"\n  prototype: "/game/enemy.go"\n}\n`;

  function write(rel: string, contents: string): void {
    const abs = path.join(cwd, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, contents);
  }

  test("a scene save through the real watch wiring rewrites the declaration", async () => {
    write(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }, null, 2),
    );
    write("src/main.ts", "export const a = 1;\n");
    write("game.project", "[bootstrap]\nmain_collection = /game/player.collectionc\n\n[project]\n");
    write("game/player.collection", PLAYER_ONLY);
    write("game/player.go", 'embedded_components {\n  id: "sprite"\n  type: "sprite"\n}\n');

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
      onWatchStart,
      detectEditorVersion: () => null,
    });

    const handle = await ready;
    await handle.waitForIdle();

    const declarationPath = path.join(cwd, SCENE_ADDRESSES_DECLARATION);
    expect(readFileSync(declarationPath, "utf8")).not.toContain('"/enemy"');

    write("game/player.collection", PLAYER_AND_ENEMY);
    write("game/enemy.go", 'embedded_components {\n  id: "sprite"\n  type: "sprite"\n}\n');
    triggerComponent?.("change", "game/player.collection");
    await handle.waitForIdle();

    expect(readFileSync(declarationPath, "utf8")).toContain('"/enemy"');

    handle.stop();
    expect(await result).toBe(0);
  });

  test("watch on a pinned ref-doc target regenerates the scene declaration", async () => {
    write(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }, null, 2),
    );
    write("src/main.ts", "export const a = 1;\n");
    write(
      "package.json",
      `${JSON.stringify({ "defold-typescript": { "defold-target": "1.9.8" } }, null, 2)}\n`,
    );
    write("game.project", "[bootstrap]\nmain_collection = /game/player.collectionc\n\n[project]\n");
    write("main.script", "");
    write("game/player.collection", PLAYER_ONLY);
    write("game/player.go", 'embedded_components {\n  id: "sprite"\n  type: "sprite"\n}\n');

    const resolveOpts = multiKindRefDocResolveOpts();
    const { io, err } = captureStreams();
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
      resolveOpts,
      refDocRegistry: [multiKindRefDocTarget()],
      onWatchStart,
      detectEditorVersion: () => null,
    });

    const handle = await ready;
    await handle.waitForIdle();

    const declarationPath = path.join(cwd, SCENE_ADDRESSES_DECLARATION);
    expect(existsSync(declarationPath)).toBe(true);
    expect(readFileSync(declarationPath, "utf8")).not.toContain('"/enemy"');

    write("game/player.collection", PLAYER_AND_ENEMY);
    write("game/enemy.go", 'embedded_components {\n  id: "sprite"\n  type: "sprite"\n}\n');
    triggerComponent?.("change", "game/player.collection");
    await handle.waitForIdle();

    expect(readFileSync(declarationPath, "utf8")).toContain('"/enemy"');

    // The pinned surface has no `syncSurface`; a component save must leave the
    // tsconfig mapping the startup materialization wrote exactly as it is.
    const tsconfigPath = path.join(cwd, "tsconfig.json");
    const pinnedPaths = (
      JSON.parse(readFileSync(tsconfigPath, "utf8")) as {
        compilerOptions: { paths?: Record<string, string[]> };
      }
    ).compilerOptions.paths;
    expect(pinnedPaths).toBeDefined();

    triggerComponent?.("change", "main.script");
    await handle.waitForIdle();

    expect(
      (
        JSON.parse(readFileSync(tsconfigPath, "utf8")) as {
          compilerOptions: { paths?: Record<string, string[]> };
        }
      ).compilerOptions.paths,
    ).toEqual(pinnedPaths);

    const dir = path.join(cwd, ".defold-types", surfaceDir("defold-1.9.8"));
    expect(existsSync(path.join(dir, "sprite.d.ts"))).toBe(true);
    expect(existsSync(path.join(dir, "gui.d.ts"))).toBe(true);
    expect(existsSync(path.join(dir, "render.d.ts"))).toBe(true);
    expect(failureOutput(err())).toBe("");

    handle.stop();
    expect(await result).toBe(0);

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });

  // The address universe a watch reports on is the project's plus its
  // libraries'; a declared-but-unmaterialized dependency is a hole in it, and
  // the reporter names each hole once per appearance.
  function unresolvedReasonCount(stderrText: string): number {
    return stderrText
      .split("\n")
      .filter((line) => SCENE_TYPES_WARNING.test(line) && line.includes(UNRESOLVED_DEPENDENCY_URL))
      .length;
  }

  function scaffoldWatchableProject(): string {
    write(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }, null, 2),
    );
    write("src/main.ts", "export const a = 1;\n");
    scaffoldUnresolvedDependency(cwd);
    const sourceGeneratedDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-src-"));
    writeFileSync(path.join(sourceGeneratedDir, "label.d.ts"), "declare const __label: unknown;\n");
    return sourceGeneratedDir;
  }

  function sceneWatcherPair(): {
    main: WatcherFactory;
    component: WatcherFactory;
    trigger: () => void;
  } {
    let onComponent: ((kind: "change" | "rename", rel: string) => void) | undefined;
    return {
      main: (_dir, _onEvent): Watcher => ({ close() {} }),
      component: (_dir, onEvent): Watcher => {
        onComponent = (kind, rel) => onEvent({ kind, path: rel });
        return { close() {} };
      },
      trigger: () => onComponent?.("change", "game/player.collection"),
    };
  }

  const RESOLVED_GAME_PROJECT =
    "[bootstrap]\nmain_collection = /game/game.collectionc\n\n[project]\ntitle = demo\n";

  test("watch names an unresolved dependency once, and again after it comes back", async () => {
    const sourceGeneratedDir = scaffoldWatchableProject();
    const { io, err } = captureStreams();
    const { main, component, trigger } = sceneWatcherPair();

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      sourceGeneratedDir,
      detectEditorVersion: () => null,
      onWatchStart,
    });

    const handle = await ready;
    await handle.waitForIdle();

    expect(unresolvedReasonCount(err())).toBe(1);

    trigger();
    await handle.waitForIdle();

    expect(unresolvedReasonCount(err())).toBe(1);

    write("game.project", RESOLVED_GAME_PROJECT);
    trigger();
    await handle.waitForIdle();

    expect(unresolvedReasonCount(err())).toBe(1);

    scaffoldUnresolvedDependency(cwd);
    trigger();
    await handle.waitForIdle();

    expect(unresolvedReasonCount(err())).toBe(2);

    handle.stop();
    expect(await result).toBe(0);

    rmSync(sourceGeneratedDir, { recursive: true, force: true });
  });

  test("watch --json carries the same reason on the scene-types warnings channel", async () => {
    const sourceGeneratedDir = scaffoldWatchableProject();
    const { io, out } = captureStreams();
    const { main, component, trigger } = sceneWatcherPair();

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd, "--json"], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      sourceGeneratedDir,
      detectEditorVersion: () => null,
      onWatchStart,
    });

    const handle = await ready;
    await handle.waitForIdle();

    trigger();
    await handle.waitForIdle();

    write("game.project", RESOLVED_GAME_PROJECT);
    trigger();
    await handle.waitForIdle();

    scaffoldUnresolvedDependency(cwd);
    trigger();
    await handle.waitForIdle();

    handle.stop();
    expect(await result).toBe(0);

    const lines = out()
      .split("\n")
      .filter((line) => line !== "")
      .map(
        (line) =>
          JSON.parse(line) as {
            command: string;
            event?: string;
            warnings?: readonly string[];
          },
      );
    const surfaced = lines.filter((line) => line.command === "scene-types");

    expect(surfaced.length).toBe(4);
    expect(surfaced[0]?.warnings?.some((w) => w.includes(UNRESOLVED_DEPENDENCY_URL))).toBe(true);
    expect(surfaced[1]?.warnings).toEqual([]);
    expect(surfaced[2]?.warnings).toEqual([]);
    expect(surfaced[3]?.warnings?.some((w) => w.includes(UNRESOLVED_DEPENDENCY_URL))).toBe(true);
    expect(
      lines.filter((line) => line.command === "watch" && line.event === "sceneTypes").length,
    ).toBe(4);

    rmSync(sourceGeneratedDir, { recursive: true, force: true });
  });

  const GET_POSITION = (address: string): string =>
    `import { defineScript } from "@defold-typescript/types";\nexport default defineScript({ init() { go.get_position("${address}"); } });\n`;

  const POST_TO = (fragment: string): string =>
    `import { defineScript } from "@defold-typescript/types";\nexport default defineScript({ init() { msg.post("#${fragment}", "hello"); } });\n`;

  // A project whose one scene declares `sprite` and whose one source addresses
  // it, so the address universe is complete and the first rebuild decides the
  // fragment on its own.
  function scaffoldReachableWatchProject(): void {
    write(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }, null, 2),
    );
    write("game.project", "[bootstrap]\nmain_collection = /game/player.collectionc\n\n[project]\n");
    write("game/player.go", 'embedded_components {\n  id: "sprite"\n  type: "sprite"\n}\n');
    write("src/main.ts", POST_TO("sprite"));
  }

  function reachabilityWatcherPair(): {
    main: WatcherFactory;
    component: WatcherFactory;
    triggerMain: () => void;
    triggerScene: () => void;
  } {
    let onMain: ((kind: "change" | "rename", rel: string) => void) | undefined;
    let onComponent: ((kind: "change" | "rename", rel: string) => void) | undefined;
    return {
      main: (_dir, onEvent): Watcher => {
        onMain = (kind, rel) => onEvent({ kind, path: rel });
        return { close() {} };
      },
      component: (_dir, onEvent): Watcher => {
        onComponent = (kind, rel) => onEvent({ kind, path: rel });
        return { close() {} };
      },
      triggerMain: () => onMain?.("change", "src/main.ts"),
      triggerScene: () => onComponent?.("change", "game/player.go"),
    };
  }

  test("watch prints a rebuild's unreachable fragment on stderr", async () => {
    scaffoldReachableWatchProject();
    const { io, out, err } = captureStreams();
    const { main, component, triggerMain } = reachabilityWatcherPair();

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      detectEditorVersion: () => null,
      onWatchStart,
    });

    const handle = await ready;
    await handle.waitForIdle();
    expect(err()).not.toContain("nobody");

    write("src/main.ts", POST_TO("nobody"));
    triggerMain();
    await handle.waitForIdle();

    handle.stop();
    expect(await result).toBe(0);

    const reported = err()
      .split("\n")
      .filter((line) => line.includes("nobody"));
    expect(reported.length).toBeGreaterThan(0);
    expect(reported.every((line) => line.startsWith("defold-typescript watch: "))).toBe(true);
    expect(reported.some((line) => line.includes("src/main.ts"))).toBe(true);
    // The findings are advisory: the cycle sentinel still closes the rebuild.
    expect(out()).toContain("defold-typescript watch: build finished");
  });

  test("watch --json carries a rebuild's finding as prose and as an entry", async () => {
    scaffoldReachableWatchProject();
    const { io, out } = captureStreams();
    const { main, component, triggerMain } = reachabilityWatcherPair();

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd, "--json"], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      detectEditorVersion: () => null,
      onWatchStart,
    });

    const handle = await ready;
    await handle.waitForIdle();

    write("src/main.ts", POST_TO("nobody"));
    triggerMain();
    await handle.waitForIdle();

    handle.stop();
    expect(await result).toBe(0);

    const rebuild = out()
      .split("\n")
      .filter((line) => line !== "")
      .map(
        (line) =>
          JSON.parse(line) as {
            command: string;
            event?: string;
            ok?: boolean;
            warnings?: readonly string[];
            unreachableAddresses?: readonly {
              file: string;
              fragment: string;
              message: string;
            }[];
          },
      )
      .find((line) => line.command === "watch" && line.event === "rebuild");

    expect(rebuild?.ok).toBe(true);
    expect(rebuild?.warnings?.some((w) => w.includes("nobody"))).toBe(true);
    expect(rebuild?.unreachableAddresses).toEqual([
      {
        file: "src/main.ts",
        fragment: "nobody",
        message: expect.stringContaining("nobody") as unknown as string,
      },
    ]);
  });

  const PLAYER_GO = (id: string): string =>
    `embedded_components {\n  id: "${id}"\n  type: "sprite"\n}\n`;

  type SceneTypesEvent = {
    command: string;
    event?: string;
    ok?: boolean;
    warnings?: readonly string[];
    unreachableAddresses?: readonly { file: string; fragment: string; message: string }[];
  };

  function sceneTypesEvents(text: string): SceneTypesEvent[] {
    return text
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line) as SceneTypesEvent)
      .filter((line) => line.command === "watch" && line.event === "sceneTypes");
  }

  function watchWarningLines(text: string): string[] {
    return text.split("\n").filter((line) => line.startsWith("defold-typescript watch: "));
  }

  test("watch reports a fragment a scene save made unreachable, with no source event", async () => {
    scaffoldReachableWatchProject();
    const { io, err } = captureStreams();
    const { main, component, triggerScene } = reachabilityWatcherPair();

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      detectEditorVersion: () => null,
      onWatchStart,
    });

    const handle = await ready;
    await handle.waitForIdle();
    expect(watchWarningLines(err()).some((line) => line.includes("sprite"))).toBe(false);

    write("game/player.go", PLAYER_GO("body"));
    triggerScene();
    await handle.waitForIdle();

    handle.stop();
    expect(await result).toBe(0);

    const reported = watchWarningLines(err()).filter((line) => line.includes("sprite"));
    expect(reported.length).toBeGreaterThan(0);
    expect(reported.some((line) => line.includes("src/main.ts"))).toBe(true);
  });

  test("a scene save reports without rebuilding", async () => {
    scaffoldReachableWatchProject();
    const { io, out, err } = captureStreams();
    const { main, component, triggerScene } = reachabilityWatcherPair();

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      detectEditorVersion: () => null,
      onWatchStart,
    });

    const handle = await ready;
    await handle.waitForIdle();
    const afterStartup = out().length;

    write("game/player.go", PLAYER_GO("body"));
    triggerScene();
    await handle.waitForIdle();

    handle.stop();
    expect(await result).toBe(0);

    expect(watchWarningLines(err()).some((line) => line.includes("sprite"))).toBe(true);
    const added = out().slice(afterStartup);
    expect(added).not.toContain("defold-typescript build: wrote");
    expect(added).not.toContain("defold-typescript watch: build started");
    expect(added).not.toContain("defold-typescript watch: build finished");
  });

  test("declaring the component again clears the finding", async () => {
    scaffoldReachableWatchProject();
    const { io, err } = captureStreams();
    const { main, component, triggerScene } = reachabilityWatcherPair();

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      detectEditorVersion: () => null,
      onWatchStart,
    });

    const handle = await ready;
    await handle.waitForIdle();

    write("game/player.go", PLAYER_GO("body"));
    triggerScene();
    await handle.waitForIdle();
    expect(watchWarningLines(err()).some((line) => line.includes("sprite"))).toBe(true);
    const afterBreak = err().length;

    write("game/player.go", PLAYER_GO("sprite"));
    triggerScene();
    await handle.waitForIdle();

    handle.stop();
    expect(await result).toBe(0);

    expect(watchWarningLines(err().slice(afterBreak)).some((line) => line.includes("sprite"))).toBe(
      false,
    );
  });

  const POST_TO_ADDRESS = (address: string): string =>
    `import { defineScript } from "@defold-typescript/types";\nexport default defineScript({ init() { msg.post("${address}", "hello"); } });\n`;

  // `/player` owns "sprite" and `/hud` owns "sprit", so both ids are in the
  // project-wide set and only a check scoped to the addressed object can report
  // `/player#sprit`. The source starts reachable because `sceneObjects` is
  // deliberately behind for watch's very first build (`dispatch.ts`), so the
  // scoped answer is one a rebuild gives, never the startup build.
  function scaffoldScopedWatchProject(): void {
    write(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }, null, 2),
    );
    write("game.project", "[bootstrap]\nmain_collection = /game/main.collectionc\n\n[project]\n");
    write(
      "game/main.collection",
      'instances {\n  id: "player"\n  prototype: "/game/player.go"\n}\n' +
        'instances {\n  id: "hud"\n  prototype: "/game/hud.go"\n}\n',
    );
    write("game/player.go", PLAYER_GO("sprite"));
    write("game/hud.go", PLAYER_GO("sprit"));
    write("src/main.ts", POST_TO_ADDRESS("/player#sprite"));
  }

  function scopedFindingLines(text: string): string[] {
    return watchWarningLines(text).filter((line) => line.includes('the game object "/player"'));
  }

  test("watch reports the scoped finding on a rebuild", async () => {
    scaffoldScopedWatchProject();
    const { io, err } = captureStreams();
    const { main, component, triggerMain } = reachabilityWatcherPair();

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      detectEditorVersion: () => null,
      onWatchStart,
    });

    const handle = await ready;
    await handle.waitForIdle();
    expect(scopedFindingLines(err())).toEqual([]);

    write("src/main.ts", POST_TO_ADDRESS("/player#sprit"));
    triggerMain();
    await handle.waitForIdle();

    handle.stop();
    expect(await result).toBe(0);

    const reported = scopedFindingLines(err());
    expect(reported.length).toBeGreaterThan(0);
    expect(reported.some((line) => line.includes("src/main.ts"))).toBe(true);
    expect(reported.some((line) => line.includes('"sprite"'))).toBe(true);
  });

  test("a scene save re-reads which object owns what", async () => {
    scaffoldScopedWatchProject();
    const { io, err } = captureStreams();
    const { main, component, triggerMain, triggerScene } = reachabilityWatcherPair();

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      detectEditorVersion: () => null,
      onWatchStart,
    });

    const handle = await ready;
    await handle.waitForIdle();

    write("src/main.ts", POST_TO_ADDRESS("/player#sprit"));
    triggerMain();
    await handle.waitForIdle();
    expect(scopedFindingLines(err()).length).toBeGreaterThan(0);
    const afterBreak = err().length;

    // No source edit: the object the address names now owns the id it names.
    write("game/player.go", PLAYER_GO("sprit"));
    triggerScene();
    await handle.waitForIdle();
    expect(scopedFindingLines(err().slice(afterBreak))).toEqual([]);
    const afterFix = err().length;

    // And back: a finding that reappears can only have come from a re-read
    // index, which a cleared finding alone would not prove.
    write("game/player.go", PLAYER_GO("sprite"));
    triggerScene();
    await handle.waitForIdle();

    handle.stop();
    expect(await result).toBe(0);

    expect(scopedFindingLines(err().slice(afterFix)).length).toBeGreaterThan(0);
  });

  test("watch --json carries the finding on the sceneTypes event", async () => {
    scaffoldReachableWatchProject();
    const { io, out } = captureStreams();
    const { main, component, triggerScene } = reachabilityWatcherPair();

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd, "--json"], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      detectEditorVersion: () => null,
      onWatchStart,
    });

    const handle = await ready;
    await handle.waitForIdle();

    write("game/player.go", PLAYER_GO("body"));
    triggerScene();
    await handle.waitForIdle();

    handle.stop();
    expect(await result).toBe(0);

    const events = sceneTypesEvents(out());
    const last = events.at(-1);
    expect(last?.ok).toBe(true);
    expect(last?.warnings?.some((w) => w.includes("sprite"))).toBe(true);
    expect(last?.unreachableAddresses).toEqual([
      {
        file: "src/main.ts",
        fragment: "sprite",
        message: expect.stringContaining("sprite") as unknown as string,
      },
    ]);
    expect(
      out()
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line) as { command: string; event?: string })
        .some((line) => line.command === "watch" && line.event === "rebuild"),
    ).toBe(false);
  });

  test("a clean scene save emits no entries", async () => {
    scaffoldReachableWatchProject();
    const { io, out } = captureStreams();
    const { main, component, triggerScene } = reachabilityWatcherPair();

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd, "--json"], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      detectEditorVersion: () => null,
      onWatchStart,
    });

    const handle = await ready;
    await handle.waitForIdle();

    write("game/player.go", PLAYER_GO("sprite"));
    triggerScene();
    await handle.waitForIdle();

    handle.stop();
    expect(await result).toBe(0);

    const events = sceneTypesEvents(out());
    expect(events.length).toBeGreaterThan(1);
    // The startup regeneration deliberately reports nothing, so it carries no
    // `warnings` key at all — the scene-save event carries an empty one.
    expect(Object.hasOwn(events[0] as object, "warnings")).toBe(false);
    const last = events.at(-1);
    expect(last?.warnings).toEqual([]);
    expect(Object.hasOwn(last as object, "unreachableAddresses")).toBe(false);
  });

  // The built script runs *inside* the proxy world, so the address it writes is
  // correct at startup: only a later edit — to the source, or to the scene that
  // decides which world it runs in — can make it foreign.
  function scaffoldCrossWorldWatchProject(address = "mylevel:/enemy"): void {
    write(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }, null, 2),
    );
    write("game.project", "[bootstrap]\nmain_collection = /game/main.collectionc\n\n[project]\n");
    write(
      "game/main.collection",
      'instances {\n  id: "loader"\n  prototype: "/game/loader.go"\n}\n',
    );
    write(
      "game/loader.go",
      'embedded_components {\n  id: "loader"\n  type: "collectionproxy"\n' +
        '  data: "collection: \\"/game/level1.collection\\"\\n"\n}\n',
    );
    writeLevel("mylevel");
    write("game/home.go", 'components {\n  id: "brain"\n  component: "/src/main.ts.script"\n}\n');
    write("game/enemy.go", 'embedded_components {\n  id: "body"\n  type: "sprite"\n}\n');
    write("src/main.ts", GET_POSITION(address));
  }

  function writeLevel(socket: string): void {
    write(
      "game/level1.collection",
      `name: "${socket}"\n` +
        'instances {\n  id: "home"\n  prototype: "/game/home.go"\n}\n' +
        'instances {\n  id: "enemy"\n  prototype: "/game/enemy.go"\n}\n',
    );
  }

  function crossWorldWatcherPair(): {
    main: WatcherFactory;
    component: WatcherFactory;
    triggerMain: () => void;
    triggerScene: () => void;
  } {
    let onMain: ((kind: "change" | "rename", rel: string) => void) | undefined;
    let onComponent: ((kind: "change" | "rename", rel: string) => void) | undefined;
    return {
      main: (_dir, onEvent): Watcher => {
        onMain = (kind, rel) => onEvent({ kind, path: rel });
        return { close() {} };
      },
      component: (_dir, onEvent): Watcher => {
        onComponent = (kind, rel) => onEvent({ kind, path: rel });
        return { close() {} };
      },
      triggerMain: () => onMain?.("change", "src/main.ts"),
      triggerScene: () => onComponent?.("change", "game/level1.collection"),
    };
  }

  type CrossWorldEvent = {
    command: string;
    event?: string;
    ok?: boolean;
    warnings?: readonly string[];
    crossWorldAddresses?: readonly {
      file: string;
      address: string;
      socket: string;
      message: string;
    }[];
  };

  function watchEvents(text: string): CrossWorldEvent[] {
    return text
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line) as CrossWorldEvent)
      .filter((line) => line.command === "watch");
  }

  test("watch --json carries a rebuild's cross-world address as prose and as an entry", async () => {
    scaffoldCrossWorldWatchProject();
    const { io, out } = captureStreams();
    const { main, component, triggerMain } = crossWorldWatcherPair();

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd, "--json"], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      detectEditorVersion: () => null,
      onWatchStart,
    });

    const handle = await ready;
    await handle.waitForIdle();
    const startup = watchEvents(out()).find((e) => e.event === "build");
    expect(Object.hasOwn(startup as object, "crossWorldAddresses")).toBe(false);

    write("src/main.ts", GET_POSITION("other:/enemy"));
    triggerMain();
    await handle.waitForIdle();

    handle.stop();
    expect(await result).toBe(0);

    const rebuild = watchEvents(out()).find((e) => e.event === "rebuild");
    expect(rebuild?.ok).toBe(true);
    expect(rebuild?.crossWorldAddresses).toEqual([
      {
        file: "src/main.ts",
        address: "other:/enemy",
        socket: "other",
        message: expect.stringContaining("other") as unknown as string,
      },
    ]);
    expect(
      rebuild?.warnings?.some((w) => w.includes(rebuild?.crossWorldAddresses?.[0]?.message ?? "")),
    ).toBe(true);
  });

  test("a scene save that moves the script's world reports without rebuilding", async () => {
    scaffoldCrossWorldWatchProject();
    const { io, out } = captureStreams();
    const { main, component, triggerScene } = crossWorldWatcherPair();

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd, "--json"], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      detectEditorVersion: () => null,
      onWatchStart,
    });

    const handle = await ready;
    await handle.waitForIdle();

    writeLevel("otherlevel");
    triggerScene();
    await handle.waitForIdle();

    handle.stop();
    expect(await result).toBe(0);

    const events = watchEvents(out());
    const last = events.filter((e) => e.event === "sceneTypes").at(-1);
    expect(last?.crossWorldAddresses).toEqual([
      {
        file: "src/main.ts",
        address: "mylevel:/enemy",
        socket: "mylevel",
        message: expect.stringContaining("mylevel") as unknown as string,
      },
    ]);
    expect(events.some((e) => e.event === "rebuild")).toBe(false);
  });

  test("watch prints a rebuild's cross-world address on stderr", async () => {
    scaffoldCrossWorldWatchProject();
    const { io, err } = captureStreams();
    const { main, component, triggerMain } = crossWorldWatcherPair();

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      detectEditorVersion: () => null,
      onWatchStart,
    });

    const handle = await ready;
    await handle.waitForIdle();
    expect(err()).not.toContain("other:/enemy");

    write("src/main.ts", GET_POSITION("other:/enemy"));
    triggerMain();
    await handle.waitForIdle();

    handle.stop();
    expect(await result).toBe(0);

    const reported = err()
      .split("\n")
      .filter((line) => line.includes('the world "other"'));
    expect(reported.length).toBeGreaterThan(0);
    expect(reported.every((line) => line.startsWith("defold-typescript watch: "))).toBe(true);
    expect(reported.some((line) => line.includes("src/main.ts"))).toBe(true);
  });

  // A bootstrap world holding the object that opens a proxy world, so the
  // reference document alone decides which collection the socket addresses.
  function scaffoldProxiedProject(target: string): void {
    write(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }, null, 2),
    );
    write("src/main.ts", "export const a = 1;\n");
    write("game.project", "[bootstrap]\nmain_collection = /game/game.collectionc\n\n[project]\n");
    write(
      "game/game.collection",
      'instances {\n  id: "loader"\n  prototype: "/game/loader.go"\n}\n',
    );
    write(
      "game/loader.go",
      'components {\n  id: "loader"\n  component: "/levels/level.collectionproxy"\n}\n',
    );
    write("levels/level.collectionproxy", `collection: "${target}"\n`);
    write(
      "levels/level1.collection",
      'name: "mylevel"\ninstances {\n  id: "enemy"\n  prototype: "/game/enemy.go"\n}\n',
    );
    write(
      "levels/level2.collection",
      'name: "otherlevel"\ninstances {\n  id: "boss"\n  prototype: "/game/enemy.go"\n}\n',
    );
    write("game/enemy.go", 'embedded_components {\n  id: "sprite"\n  type: "sprite"\n}\n');
  }

  test("retargeting a standalone .collectionproxy moves the world the declaration offers", async () => {
    scaffoldProxiedProject("/levels/level1.collection");

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
      onWatchStart,
      detectEditorVersion: () => null,
    });

    const handle = await ready;
    await handle.waitForIdle();

    const declarationPath = path.join(cwd, SCENE_ADDRESSES_DECLARATION);
    expect(readFileSync(declarationPath, "utf8")).toContain('"mylevel:/enemy"');
    expect(readFileSync(declarationPath, "utf8")).not.toContain('"otherlevel:/boss"');

    write("levels/level.collectionproxy", 'collection: "/levels/level2.collection"\n');
    triggerComponent?.("change", "levels/level.collectionproxy");
    await handle.waitForIdle();

    const retargeted = readFileSync(declarationPath, "utf8");
    expect(retargeted).toContain('"otherlevel:/boss"');
    expect(retargeted).not.toContain('"mylevel:/enemy"');

    handle.stop();
    expect(await result).toBe(0);
  });

  // A collection reached by nothing is a named hole; a `.collectionfactory`
  // naming it as a prototype is what closes that hole. The declaration's keys
  // are the same either way — a factory prototype has no static path — so the
  // classification is what a save has to reach.
  function scaffoldFactoryProject(): void {
    write(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }, null, 2),
    );
    write("src/main.ts", "export const a = 1;\n");
    write("game.project", "[bootstrap]\nmain_collection = /game/game.collectionc\n\n[project]\n");
    write(
      "game/game.collection",
      'instances {\n  id: "spawner"\n  prototype: "/game/spawner.go"\n}\n',
    );
    write(
      "game/spawner.go",
      'components {\n  id: "spawner"\n  component: "/game/enemy.collectionfactory"\n}\n',
    );
    write(
      "game/enemy.collection",
      'instances {\n  id: "enemy"\n  prototype: "/game/enemy.go"\n}\n',
    );
    write("game/enemy.go", 'embedded_components {\n  id: "sprite"\n  type: "sprite"\n}\n');
  }

  function unclassifiedReasonCount(stderrText: string): number {
    return stderrText
      .split("\n")
      .filter(
        (line) =>
          SCENE_TYPES_WARNING.test(line) &&
          line.includes("game/enemy.collection: is reached by no"),
      ).length;
  }

  test("a .collectionfactory save classifies its prototype, and unclassifies it when removed", async () => {
    scaffoldFactoryProject();

    const { io, err } = captureStreams();
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
      onWatchStart,
      detectEditorVersion: () => null,
    });

    const handle = await ready;
    await handle.waitForIdle();

    const declarationPath = path.join(cwd, SCENE_ADDRESSES_DECLARATION);
    const factoryDeclarationAtStartup = readFileSync(declarationPath, "utf8");
    expect(factoryDeclarationAtStartup).toContain('"/spawner"');
    expect(factoryDeclarationAtStartup).not.toContain('"/enemy"');

    // No reference document yet: the prototype collection is reached by nothing.
    expect(unclassifiedReasonCount(err())).toBe(1);

    write("game/enemy.collectionfactory", 'prototype: "/game/enemy.collection"\n');
    triggerComponent?.("change", "game/enemy.collectionfactory");
    await handle.waitForIdle();

    // The reporter only repeats a reason that went away and came back, so the
    // count holding at one is what says the hole closed.
    expect(unclassifiedReasonCount(err())).toBe(1);
    expect(readFileSync(declarationPath, "utf8")).toBe(factoryDeclarationAtStartup);

    rmSync(path.join(cwd, "game/enemy.collectionfactory"));
    triggerComponent?.("rename", "game/enemy.collectionfactory");
    await handle.waitForIdle();

    expect(unclassifiedReasonCount(err())).toBe(2);
    expect(readFileSync(declarationPath, "utf8")).toBe(factoryDeclarationAtStartup);

    handle.stop();
    expect(await result).toBe(0);
  });

  test("a reference-document save regenerates without rebuilding or resyncing", async () => {
    scaffoldProxiedProject("/levels/level1.collection");

    const { io, out } = captureStreams();
    const main: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });
    let triggerComponent: ((kind: "change" | "rename", rel: string) => void) | undefined;
    const component: WatcherFactory = (_dir, onEvent): Watcher => {
      triggerComponent = (kind, rel) => onEvent({ kind, path: rel });
      return { close() {} };
    };

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

    const tsconfigPath = path.join(cwd, "tsconfig.json");
    const beforeTsconfig = readFileSync(tsconfigPath, "utf8");
    const atStartup = sceneTypesEvents(out()).length;

    write("levels/level.collectionproxy", 'collection: "/levels/level2.collection"\n');
    triggerComponent?.("change", "levels/level.collectionproxy");
    await handle.waitForIdle();

    handle.stop();
    expect(await result).toBe(0);

    expect(sceneTypesEvents(out()).length).toBe(atStartup + 1);
    expect(
      out()
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line) as { command: string; event?: string })
        .some((line) => line.command === "watch" && line.event === "rebuild"),
    ).toBe(false);
    expect(readFileSync(tsconfigPath, "utf8")).toBe(beforeTsconfig);
  });

  // Two candidate worlds, so the only thing deciding which one's paths are bare
  // is the `[bootstrap] main_collection` line the save rewrites.
  function scaffoldTwoWorldProject(bootstrap: string): void {
    write(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }, null, 2),
    );
    write("src/main.ts", "export const a = 1;\n");
    write("game.project", `[bootstrap]\nmain_collection = ${bootstrap}\n\n[project]\n`);
    write(
      "game/alpha.collection",
      'instances {\n  id: "alpha"\n  prototype: "/game/thing.go"\n}\n',
    );
    write("game/beta.collection", 'instances {\n  id: "beta"\n  prototype: "/game/thing.go"\n}\n');
    write("game/thing.go", 'embedded_components {\n  id: "sprite"\n  type: "sprite"\n}\n');
  }

  test("switching [bootstrap] main_collection rewrites the declaration on that save", async () => {
    scaffoldTwoWorldProject("/game/alpha.collectionc");

    const { io } = captureStreams();
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
      detectEditorVersion: () => null,
      resolveInternals: {
        cacheDir,
        download: async () => {
          throw new Error("this project declares no dependencies");
        },
      },
      onWatchStart,
    });

    const handle = await ready;
    await handle.waitForIdle();

    const declarationPath = path.join(cwd, SCENE_ADDRESSES_DECLARATION);
    expect(readFileSync(declarationPath, "utf8")).toContain('"/alpha"');
    expect(readFileSync(declarationPath, "utf8")).not.toContain('"/beta"');

    write("game.project", "[bootstrap]\nmain_collection = /game/beta.collectionc\n\n[project]\n");
    triggerMain?.("change", "game.project");
    await handle.waitForIdle();

    const switched = readFileSync(declarationPath, "utf8");
    expect(switched).toContain('"/beta"');
    expect(switched).not.toContain('"/alpha"');

    handle.stop();
    expect(await result).toBe(0);

    rmSync(cacheDir, { recursive: true, force: true });
  });

  test("a game.project regeneration repeating a startup reason adds no second line", async () => {
    const sourceGeneratedDir = scaffoldWatchableProject();
    const { io, err } = captureStreams();
    let triggerMain: ((kind: "change" | "rename", rel: string) => void) | undefined;
    const main: WatcherFactory = (_dir, onEvent): Watcher => {
      triggerMain = (kind, rel) => onEvent({ kind, path: rel });
      return { close() {} };
    };
    const component: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });

    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      sourceGeneratedDir,
      detectEditorVersion: () => null,
      onWatchStart,
    });

    const handle = await ready;
    await handle.waitForIdle();

    expect(unresolvedReasonCount(err())).toBe(1);

    triggerMain?.("change", "game.project");
    await handle.waitForIdle();

    expect(unresolvedReasonCount(err())).toBe(1);

    handle.stop();
    expect(await result).toBe(0);

    rmSync(sourceGeneratedDir, { recursive: true, force: true });
  });

  test("the game.project regeneration reports reachability, as a scene save does", async () => {
    scaffoldTwoWorldProject("/game/alpha.collectionc");

    const { io, out } = captureStreams();
    let triggerMain: ((kind: "change" | "rename", rel: string) => void) | undefined;
    const main: WatcherFactory = (_dir, onEvent): Watcher => {
      triggerMain = (kind, rel) => onEvent({ kind, path: rel });
      return { close() {} };
    };
    const component: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });

    const cacheDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-ext-cache-"));
    const { onWatchStart, ready } = watchHandle();
    const result = dispatch(["watch", cwd, "--json"], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      detectEditorVersion: () => null,
      resolveInternals: {
        cacheDir,
        download: async () => {
          throw new Error("this project declares no dependencies");
        },
      },
      onWatchStart,
    });

    const handle = await ready;
    await handle.waitForIdle();

    write("game.project", "[bootstrap]\nmain_collection = /game/beta.collectionc\n\n[project]\n");
    triggerMain?.("change", "game.project");
    await handle.waitForIdle();

    handle.stop();
    expect(await result).toBe(0);

    const events = sceneTypesEvents(out());
    expect(events.length).toBe(2);
    // The startup regeneration deliberately reports nothing and so carries no
    // `warnings` key; a reporting one carries the key even when it is empty.
    expect(Object.hasOwn(events[0] as object, "warnings")).toBe(false);
    expect(Object.hasOwn(events[1] as object, "warnings")).toBe(true);

    rmSync(cacheDir, { recursive: true, force: true });
  });
});

describe("upstream release notice", () => {
  // The preload defaults the suite offline; this block is the one that exercises
  // the feature, so it opts back in and hands the check injected seams only.
  beforeEach(() => {
    delete process.env.DEFOLD_TYPESCRIPT_NO_UPDATE_CHECK;
  });

  afterEach(() => {
    process.env.DEFOLD_TYPESCRIPT_NO_UPDATE_CHECK = "1";
  });

  const PIN = "1.12.4";
  const NEWER = "1.13.1";
  const NOW = 1_000_000_000;
  const DAY = 24 * 60 * 60 * 1000;

  function cachePath(): string {
    return path.join(cwd, ".upstream-cache", "stable.json");
  }

  function seedCache(latestVersion: string, checkedAt = NOW): void {
    const file = cachePath();
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ checkedAt, channel: "stable", latestVersion }));
  }

  function scaffoldPinned(target: string = PIN): void {
    const tsconfig = JSON.stringify(
      { compilerOptions: { strict: true }, include: ["src/**/*.ts"] },
      null,
      2,
    );
    writeFileSync(path.join(cwd, "tsconfig.json"), tsconfig);
    mkdirSync(path.join(cwd, "src"), { recursive: true });
    writeFileSync(path.join(cwd, "src", "main.ts"), "export const a = 1;\n");
    writeFileSync(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ "defold-typescript": { "defold-target": target } }, null, 2)}\n`,
    );
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
  }

  function upstreamInternals(overrides: Record<string, unknown> = {}): {
    internals: Record<string, unknown>;
    channelCalls: string[];
  } {
    const channelCalls: string[] = [];
    return {
      channelCalls,
      internals: {
        detectEditorVersion: () => PIN,
        upstreamCachePath: cachePath(),
        upstreamNow: () => NOW,
        fetchChannelInfo: async (channel: string) => {
          channelCalls.push(channel);
          return { version: NEWER, sha1: "abc123" };
        },
        ...overrides,
      },
    };
  }

  test("build on a version pin behind upstream writes the notice to stderr", async () => {
    scaffoldPinned();
    seedCache(NEWER);
    const { io, err } = captureStreams();
    const { internals } = upstreamInternals();

    const code = await dispatch(["build", cwd], io, internals);

    expect(code).toBe(0);
    expect(err()).toContain(NEWER);
    expect(err()).toContain(`set-target ${NEWER}`);
    expect(err()).toContain("advisory");
  });

  test("a cache level with the pin produces no notice", async () => {
    scaffoldPinned();
    seedCache(PIN);
    const { io, err } = captureStreams();
    const { internals } = upstreamInternals();

    const code = await dispatch(["build", cwd], io, internals);

    expect(code).toBe(0);
    expect(err()).not.toContain("available upstream");
  });

  test("an absent cache produces no notice on this run", async () => {
    scaffoldPinned();
    const { io, err } = captureStreams();
    const { internals } = upstreamInternals();

    const code = await dispatch(["build", cwd], io, internals);

    expect(code).toBe(0);
    expect(err()).not.toContain("available upstream");
  });

  test("--no-update-check suppresses the notice and never reads or refreshes the cache", async () => {
    scaffoldPinned();
    seedCache(NEWER, NOW - DAY * 2);
    const { io, err } = captureStreams();
    const { internals, channelCalls } = upstreamInternals();

    const code = await dispatch(["build", cwd, "--no-update-check"], io, internals);

    expect(code).toBe(0);
    expect(err()).not.toContain("available upstream");
    expect(channelCalls).toEqual([]);
  });

  test("DEFOLD_TYPESCRIPT_NO_UPDATE_CHECK suppresses it the same way", async () => {
    scaffoldPinned();
    seedCache(NEWER, NOW - DAY * 2);
    process.env.DEFOLD_TYPESCRIPT_NO_UPDATE_CHECK = "1";
    {
      const { io, err } = captureStreams();
      const { internals, channelCalls } = upstreamInternals();

      const code = await dispatch(["build", cwd], io, internals);

      expect(code).toBe(0);
      expect(err()).not.toContain("available upstream");
      expect(channelCalls).toEqual([]);
    }
  });

  test("--no-update-check never reaches the spawned bob's argv", async () => {
    scaffoldPinned();
    seedCache(NEWER);
    const spawned: string[][] = [];
    const spawnCwds: string[] = [];
    const { io } = captureStreams();
    const { internals } = upstreamInternals({
      fetchVersionInfo: async () => ({ sha1: "8fd9f9f5c6e1bd91b8c0f0a3a7d2e1c4b5a60798" }),
      defoldIo: {
        cacheDir: "/c",
        probe: () => true,
        javaProbe: () => true,
        spawn: async (argv: string[], spawnCwd: string) => {
          spawned.push(argv);
          spawnCwds.push(spawnCwd);
          return { exitCode: 0 };
        },
        download: async () => {},
      },
    });

    // Placed *before* the path: bob reads its project dir from `rest[1]`, so an
    // unfiltered flag is consumed as the directory rather than merely tagging along.
    await dispatch(["bob", "build", "--no-update-check", cwd], io, internals);

    expect(spawned).toHaveLength(1);
    expect(spawned[0]).not.toContain("--no-update-check");
    expect(spawnCwds[0]).toBe(cwd);
  });

  test("--no-update-check never reaches the engine args after --", async () => {
    scaffoldPinned();
    seedCache(NEWER);
    const projectc = path.join(cwd, "build/default/game.projectc");
    const engine = path.join(cwd, "build/arm64-macos/dmengine");
    const spawned: string[][] = [];
    const { io } = captureStreams();
    const { internals } = upstreamInternals({
      runInternals: {
        platform: "darwin",
        arch: "arm64",
        probe: (p: string) => p === projectc || p === engine,
        spawn: (argv: string[]) => {
          spawned.push(argv);
          return { kill: () => {}, exited: Promise.resolve(0) };
        },
        copyAside: (p: string) => p,
        chmod: () => {},
      },
    });

    // Before the path for the same reason as bob: `run` takes its project dir from
    // the first positional ahead of `--`.
    await dispatch(["run", "--no-update-check", cwd, "--", "--verbose"], io, internals);

    expect(spawned[0]).toEqual([engine, projectc, "--verbose"]);
  });

  test("build --json carries upstreamRelease and no prose", async () => {
    scaffoldPinned();
    seedCache(NEWER);
    const { io, out, err } = captureStreams();
    const { internals } = upstreamInternals();

    const code = await dispatch(["build", cwd, "--json"], io, internals);

    expect(code).toBe(0);
    expect(err()).not.toContain("available upstream");
    const parsed = JSON.parse(out()) as {
      warnings: readonly string[];
      upstreamRelease?: { current: string; latest: string };
    };
    expect(parsed.upstreamRelease).toEqual({ current: PIN, latest: NEWER });
    expect(parsed.warnings.some((w) => w.includes("available upstream"))).toBe(true);
  });

  test("build --json omits upstreamRelease entirely when there is nothing to report", async () => {
    scaffoldPinned();
    seedCache(PIN);
    const { io, out } = captureStreams();
    const { internals } = upstreamInternals();

    const code = await dispatch(["build", cwd, "--json"], io, internals);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as Record<string, unknown>;
    expect("upstreamRelease" in parsed).toBe(false);
  });

  test("build --fail-on-drift with a matching editor and a behind-upstream cache exits 0", async () => {
    scaffoldPinned();
    seedCache(NEWER);
    const { io, err } = captureStreams();
    const { internals } = upstreamInternals({ detectEditorVersion: () => PIN });

    const code = await dispatch(["build", cwd, "--fail-on-drift"], io, internals);

    expect(err()).toContain("available upstream");
    expect(code).toBe(0);
  });

  test("watch emits the notice on the same cache state", async () => {
    scaffoldPinned();
    seedCache(NEWER);
    const { io, err } = captureStreams();
    const factory: WatcherFactory = (_dir, _onEvent): Watcher => ({ close() {} });
    const { internals } = upstreamInternals({
      watcherFactory: factory,
      onWatchStart: (h: RunWatchHandle) => h.stop(),
    });

    const code = await dispatch(["watch", cwd], io, internals);

    expect(code).toBe(0);
    expect(err()).toContain("available upstream");
  });

  test("run emits the notice on the same cache state", async () => {
    scaffoldPinned();
    seedCache(NEWER);
    const { io, err } = captureStreams();
    const { internals } = upstreamInternals({
      runInternals: {
        platform: "darwin",
        arch: "arm64",
        probe: () => true,
        spawn: () => ({ kill: () => {}, exited: Promise.resolve(0) }),
        copyAside: (p: string) => p,
        chmod: () => {},
      },
    });

    const code = await dispatch(["run", cwd], io, internals);

    expect(code).toBe(0);
    expect(err()).toContain("available upstream");
  });

  test("bob build emits it; bob status and resolve do not", async () => {
    scaffoldPinned();
    seedCache(NEWER);
    const defoldIo = {
      cacheDir: "/c",
      probe: () => true,
      javaProbe: () => true,
      spawn: async () => ({ exitCode: 0 }),
      download: async () => {},
    };
    const fetchVersionInfo = async () => ({
      sha1: "8fd9f9f5c6e1bd91b8c0f0a3a7d2e1c4b5a60798",
    });

    const build = captureStreams();
    await dispatch(
      ["bob", "build", cwd],
      build.io,
      upstreamInternals({ defoldIo, fetchVersionInfo }).internals,
    );
    expect(build.err()).toContain("available upstream");

    const status = captureStreams();
    await dispatch(
      ["bob", "status", cwd],
      status.io,
      upstreamInternals({ defoldIo, fetchVersionInfo }).internals,
    );
    expect(status.err()).not.toContain("available upstream");

    const resolved = captureStreams();
    await dispatch(["resolve", cwd], resolved.io, upstreamInternals().internals);
    expect(resolved.err()).not.toContain("available upstream");
  });

  test("a channel-pinned project never gets the notice", async () => {
    scaffoldPinned("stable");
    seedCache(NEWER);
    const { io, err } = captureStreams();
    const { internals } = upstreamInternals();

    const code = await dispatch(["build", cwd], io, internals);

    expect(code).toBe(0);
    expect(err()).not.toContain("available upstream");
  });

  test("a stale cache makes exactly one stable fetch and leaves the file refreshed", async () => {
    scaffoldPinned();
    seedCache("1.11.0", NOW - DAY * 2);
    const { io } = captureStreams();
    const { internals, channelCalls } = upstreamInternals();

    const code = await dispatch(["build", cwd], io, internals);

    expect(code).toBe(0);
    expect(channelCalls).toEqual(["stable"]);
    const state = JSON.parse(readFileSync(cachePath(), "utf8")) as {
      checkedAt: number;
      channel: string;
      latestVersion: string;
    };
    expect(state).toEqual({ checkedAt: NOW, channel: "stable", latestVersion: NEWER });
  });

  test("a fresh cache makes no fetch at all", async () => {
    scaffoldPinned();
    seedCache(NEWER, NOW);
    const { io } = captureStreams();
    const { internals, channelCalls } = upstreamInternals();

    const code = await dispatch(["build", cwd], io, internals);

    expect(code).toBe(0);
    expect(channelCalls).toEqual([]);
  });
});
