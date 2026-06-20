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
    expect(out()).toMatch(/wrote 14 files/);
    expect(out()).toContain("game.project");
    expect(out()).toContain("main/main.collection");
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

  test("empty argv prints usage to stderr and returns 1", () => {
    const { io, out, err } = captureStreams();

    const code = dispatch([], io);

    expect(code).toBe(1);
    expect(out()).toBe("");
    expect(err()).toBe(
      "Usage: defold-typescript <init|init-agents|build|watch|wall|setup-debug|resolve|defold> [path]\n",
    );
  });

  test("unknown command prints usage to stderr and returns 1", () => {
    const { io, out, err } = captureStreams();

    const code = dispatch(["unknown"], io);

    expect(code).toBe(1);
    expect(out()).toBe("");
    expect(err()).toBe(
      "Usage: defold-typescript <init|init-agents|build|watch|wall|setup-debug|resolve|defold> [path]\n",
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

  test("build <path> runs runBuild and returns 0 on success", () => {
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
    const code = dispatch(["build", cwd], io);

    expect(code).toBe(0);
    expect(err()).toBe("");
    expect(out()).toMatch(/defold-typescript build: wrote 1 files/);
    expect(out()).toContain("src/main.ts.script");
  });

  test("build failure writes error message to stderr and returns 1", () => {
    const { io, out, err } = captureStreams();
    const code = dispatch(["build", cwd], io);

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

  test("build --json before the path resolves the path and emits ok:true JSON", () => {
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
    const code = dispatch(["build", "--json", cwd], io);

    expect(code).toBe(0);
    expect(err()).toBe("");
    const parsed = JSON.parse(out()) as { ok: boolean; command: string; written: string[] };
    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("build");
    expect(parsed.written).toContain("src/main.ts.script");
  });

  test("build --json on failure writes error JSON to stdout, nothing to stderr, returns 1", () => {
    const { io, out, err } = captureStreams();
    const code = dispatch(["build", cwd, "--json"], io);

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
    scaffoldBuildProject({ "defold-typescript": { "defold-version": "1.9.8" } });
    const resolveOpts = labelRefDocResolveOpts();
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, { resolveOpts });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string };
    expect(parsed.defoldVersion).toBe("1.9.8");

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });

  test("build --defold-version overrides the pin", () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-version": "1.9.8" } });
    const { io, out } = captureStreams();

    const code = dispatch(["build", cwd, "--defold-version", "1.10.0", "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string };
    expect(parsed.defoldVersion).toBe("1.10.0");
  });

  test("build --defold-version=<v> form is honored", () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-version": "1.9.8" } });
    const { io, out } = captureStreams();

    const code = dispatch(["build", cwd, "--defold-version=1.10.0", "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string };
    expect(parsed.defoldVersion).toBe("1.10.0");
  });

  test("build --json with no pin reports current-stable", () => {
    scaffoldBuildProject();
    const { io, out } = captureStreams();

    const code = dispatch(["build", cwd, "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string };
    expect(parsed.defoldVersion).toBe(CURRENT_STABLE_DEFOLD_VERSION);
  });

  test("build --json reports the package.json channel pin as defoldChannel", () => {
    scaffoldBuildProject({ "defold-typescript": { channel: "beta" } });
    const { io, out } = captureStreams();

    const code = dispatch(["build", cwd, "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldChannel: string };
    expect(parsed.defoldChannel).toBe("beta");
  });

  test("build --channel overrides the pin", () => {
    scaffoldBuildProject({ "defold-typescript": { channel: "beta" } });
    const { io, out } = captureStreams();

    const code = dispatch(["build", cwd, "--channel", "alpha", "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldChannel: string };
    expect(parsed.defoldChannel).toBe("alpha");
  });

  test("build --json with no channel reports stable", () => {
    scaffoldBuildProject();
    const { io, out } = captureStreams();

    const code = dispatch(["build", cwd, "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldChannel: string };
    expect(parsed.defoldChannel).toBe("stable");
  });

  test("build --json with no channel still reports defoldVersion alongside defoldChannel", () => {
    scaffoldBuildProject();
    const { io, out } = captureStreams();

    const code = dispatch(["build", cwd, "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string; defoldChannel: string };
    expect(parsed.defoldVersion).toBe(CURRENT_STABLE_DEFOLD_VERSION);
    expect(parsed.defoldChannel).toBe("stable");
  });

  test("init --json reports the default stable channel without seeding it", () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out } = captureStreams();

    const code = dispatch(["init", cwd, "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldChannel: string };
    expect(parsed.defoldChannel).toBe("stable");
    const pkgPath = path.join(cwd, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        "defold-typescript"?: Record<string, unknown>;
      };
      expect(pkg["defold-typescript"]?.channel).toBeUndefined();
    }
  });

  test("init --json reports the seeded current-stable defoldVersion", () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out } = captureStreams();

    const code = dispatch(["init", cwd, "--json"], io);

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

  test("build --defold-version overrides the installed-editor detection (source: flag)", () => {
    scaffoldBuildProject();
    const { io, out } = captureStreams();

    const code = dispatch(["build", cwd, "--defold-version", "1.11.0", "--json"], io, {
      detectEditorVersion: () => "1.9.8",
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string; defoldVersionSource: string };
    expect(parsed.defoldVersion).toBe("1.11.0");
    expect(parsed.defoldVersionSource).toBe("flag");
  });

  test("build --json with no pin and no detection reports source: default", () => {
    scaffoldBuildProject();
    const { io, out } = captureStreams();

    const code = dispatch(["build", cwd, "--json"], io, {
      detectEditorVersion: () => null,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string; defoldVersionSource: string };
    expect(parsed.defoldVersion).toBe(CURRENT_STABLE_DEFOLD_VERSION);
    expect(parsed.defoldVersionSource).toBe("default");
  });

  test("build --json with no pin reports apiSurface defold-1.12.4", () => {
    scaffoldBuildProject();
    const { io, out } = captureStreams();

    const code = dispatch(["build", cwd, "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string; apiSurface: string | null };
    expect(parsed.defoldVersion).toBe(CURRENT_STABLE_DEFOLD_VERSION);
    expect(parsed.apiSurface).toBe("defold-1.12.4");
  });

  test("build --defold-version with no pre-baked surface reports apiSurface null", () => {
    scaffoldBuildProject();
    const { io, out } = captureStreams();

    const code = dispatch(["build", cwd, "--defold-version", "1.10.0", "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { apiSurface: string | null };
    expect(parsed.apiSurface).toBeNull();
  });

  test("init --json reports apiSurface defold-1.12.4", () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out } = captureStreams();

    const code = dispatch(["init", cwd, "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { apiSurface: string | null };
    expect(parsed.apiSurface).toBe("defold-1.12.4");
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

  test("build --json materializes the selected surface and reports the dir", () => {
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
    const code = dispatch(["build", cwd, "--json"], io, { sourceGeneratedDir });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { materializedSurface: string | null };
    expect(parsed.materializedSurface).toBe(".defold-types/defold-1.12.4");
    const surfaceDir = path.join(cwd, ".defold-types", "defold-1.12.4");
    expect(existsSync(path.join(surfaceDir, "label.d.ts"))).toBe(true);
    expect(existsSync(path.join(surfaceDir, "engine-globals.d.ts"))).toBe(true);
    expect(readFileSync(path.join(surfaceDir, "index.d.ts"), "utf8")).toContain(
      'import "./engine-globals";',
    );

    rmSync(pkgRoot, { recursive: true, force: true });
  });

  test("build --json on a single-.script project keeps the full surface and no scriptKind", () => {
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
    const code = dispatch(["build", cwd, "--json"], io, { sourceGeneratedDir });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as Record<string, unknown>;
    expect("scriptKind" in parsed).toBe(false);

    const index = readFileSync(
      path.join(cwd, ".defold-types", "defold-1.12.4", "index.d.ts"),
      "utf8",
    );
    expect(index).toContain('"./gui"');
    expect(index).toContain('"./render"');
    expect(index).toContain('"./label"');

    rmSync(sourceGeneratedDir, { recursive: true, force: true });
  });

  test("build --json on a mixed-kind project keeps the full surface and no scriptKind", () => {
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
    const code = dispatch(["build", cwd, "--json"], io, { sourceGeneratedDir });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as Record<string, unknown>;
    expect("scriptKind" in parsed).toBe(false);

    const index = readFileSync(
      path.join(cwd, ".defold-types", "defold-1.12.4", "index.d.ts"),
      "utf8",
    );
    expect(index).toContain('"./gui"');
    expect(index).toContain('"./render"');
    expect(index).toContain('"./label"');

    rmSync(sourceGeneratedDir, { recursive: true, force: true });
  });

  test("build --json on a mixed-kind project writes no per-directory wall tsconfigs", () => {
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
    const code = dispatch(["build", cwd, "--json"], io, { sourceGeneratedDir });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as Record<string, unknown>;
    expect("scriptKind" in parsed).toBe(false);
    expect("directoryWalls" in parsed).toBe(false);
    expect(existsSync(path.join(cwd, "src/ui/tsconfig.json"))).toBe(false);
    expect(existsSync(path.join(cwd, "src/render/tsconfig.json"))).toBe(false);

    rmSync(sourceGeneratedDir, { recursive: true, force: true });
  });

  test("build does not mutate root tsconfig wall wiring written by hand", () => {
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
    const code = dispatch(["build", cwd, "--json"], io, { sourceGeneratedDir });

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

  test("build --json on a pinned unavailable version reports materializedSurface null", () => {
    scaffoldBuildProject();
    const { io, out } = captureStreams();

    const code = dispatch(["build", cwd, "--defold-version", "1.10.0", "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { materializedSurface: string | null };
    expect(parsed.materializedSurface).toBeNull();
    expect(existsSync(path.join(cwd, ".defold-types"))).toBe(false);
  });

  test("build --json on a pinned ref-doc version generates the surface on the fly", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-version": "1.9.8" } });
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

  test("build --channel beta materializes the ref-doc surface from the beta channel archive", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-version": "1.9.8" } });
    const base = labelRefDocResolveOpts();
    let downloadedUrl: string | undefined;
    let infoChannel: string | undefined;
    const resolveOpts = {
      cacheDir: base.cacheDir,
      readZip: base.readZip,
      fetchChannelInfo: async (channel: "stable" | "beta" | "alpha") => {
        infoChannel = channel;
        return { version: "1.13.0", sha1: "deadbeef" };
      },
      download: async (url: string): Promise<Uint8Array> => {
        downloadedUrl = url;
        return new TextEncoder().encode("beta-bytes");
      },
    };
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--channel", "beta", "--json"], io, { resolveOpts });

    expect(code).toBe(0);
    expect(infoChannel).toBe("beta");
    expect(downloadedUrl).toContain("/archive/beta/deadbeef/");
    const parsed = JSON.parse(out()) as { materializedSurface: string | null };
    expect(parsed.materializedSurface).toBe(".defold-types/defold-1.9.8");

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

    const code = await dispatch(["build", cwd, "--json"], io, { sourceGeneratedDir, resolveOpts });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { materializedSurface: string | null };
    expect(parsed.materializedSurface).toBe(".defold-types/defold-1.12.4");
    expect(downloadCalled).toBe(false);

    rmSync(sourceGeneratedDir, { recursive: true, force: true });
    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });

  test("build --json on a ref-doc version whose generation fails reports null and exits 0", async () => {
    scaffoldBuildProject({ "defold-typescript": { "defold-version": "1.9.8" } });
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
    scaffoldBuildProject({ "defold-typescript": { "defold-version": "1.9.8" } });
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
    scaffoldBuildProject({ "defold-typescript": { "defold-version": "1.9.8" } });
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

    let captured: RunWatchHandle | undefined;
    const result = dispatch(["watch", cwd], io, {
      watcherFactory: factory,
      onWatchStart: (h) => {
        captured = h;
      },
    });

    expect(result).toBeInstanceOf(Promise);
    await captured?.waitForIdle();
    captured?.stop();
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

    let captured: RunWatchHandle | undefined;
    const result = dispatch(["watch", cwd, "--json"], io, {
      watcherFactory: factory,
      onWatchStart: (h) => {
        captured = h;
      },
    });

    await captured?.waitForIdle();
    captured?.stop();
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

    let handle: RunWatchHandle | undefined;
    const result = dispatch(["watch", cwd], io, {
      watcherFactory: main,
      componentWatcherFactory: component,
      sourceGeneratedDir,
      onWatchStart: (h) => {
        handle = h;
      },
    });

    await handle?.waitForIdle();

    const index = readFileSync(
      path.join(cwd, ".defold-types", "defold-1.12.4", "index.d.ts"),
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

    let handle: RunWatchHandle | undefined;
    const result = dispatch(["watch", cwd], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      sourceGeneratedDir,
      onWatchStart: (h) => {
        handle = h;
      },
    });

    await handle?.waitForIdle();

    const indexPath = path.join(cwd, ".defold-types", "defold-1.12.4", "index.d.ts");
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

    let handle: RunWatchHandle | undefined;
    const result = dispatch(["watch", cwd], io, {
      watcherFactory: main,
      componentWatcherFactory: component,
      sourceGeneratedDir,
      onWatchStart: (h) => {
        handle = h;
      },
    });

    await handle?.waitForIdle();

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
    let handle: RunWatchHandle | undefined;
    const result = dispatch(["watch", cwd], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      sourceGeneratedDir,
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
      onWatchStart: (h) => {
        handle = h;
      },
    });

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
    let handle: RunWatchHandle | undefined;
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
      onWatchStart: (h) => {
        handle = h;
      },
    });

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

    let handle: RunWatchHandle | undefined;
    const result = dispatch(["watch", cwd, "--json"], io, {
      debounceMs: 5,
      watcherFactory: main,
      componentWatcherFactory: component,
      sourceGeneratedDir,
      // No `resolveInternals` — production wiring must still build the
      // resolveSurface closure and run it on a game.project change.
      onWatchStart: (h) => {
        handle = h;
      },
    });

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
    };
    expect(parsed).toEqual({
      command: "resolve",
      ok: true,
      written: [],
      materializedSurface: null,
      extensions: [],
    });

    const extDir = path.join(cwd, ".defold-types", "extensions");
    expect(existsSync(extDir)).toBe(false);
    expect(err()).toBe("");

    handle?.stop();
    const code = await result;
    expect(code).toBe(0);

    rmSync(sourceGeneratedDir, { recursive: true, force: true });
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

  test("wall <dir...> walls exactly those and --json reports directoryWalls", () => {
    scaffoldWallProject();
    const { io, out } = captureStreams();

    const code = dispatch(["wall", "src/ui", "src/render", "--json"], io, { cwd });

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

  test("wall --remove drops that wall and leaves others intact", () => {
    scaffoldWallProject();
    const { io } = captureStreams();
    dispatch(["wall", "src/ui", "src/render"], io, { cwd });

    const { io: io2, out } = captureStreams();
    const code = dispatch(["wall", "--remove", "src/ui", "--json"], io2, { cwd });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { directoryWalls: { dir: string; kind: string }[] };
    expect(parsed.directoryWalls).toEqual([{ dir: "src/render", kind: "render-script" }]);
    expect(existsSync(path.join(cwd, "src/ui/tsconfig.json"))).toBe(false);
    expect(readRoot().references).toEqual([{ path: "src/render" }]);
  });

  test("wall --list --json reports current and eligible walls and writes nothing", () => {
    scaffoldWallProject();
    const { io } = captureStreams();
    dispatch(["wall", "src/ui"], io, { cwd });
    const renderTsconfigBefore = existsSync(path.join(cwd, "src/render/tsconfig.json"));

    const { io: io2, out } = captureStreams();
    const code = dispatch(["wall", "--list", "--json"], io2, { cwd });

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

  test("wall with no dir and no TTY exits non-zero and writes nothing", () => {
    scaffoldWallProject();
    const { io, out, err } = captureStreams();

    const code = dispatch(["wall"], io, { cwd, isTty: false });

    expect(code).toBe(1);
    expect(out()).toBe("");
    expect(err()).toContain("no directory given");
    expect(existsSync(path.join(cwd, "src/ui/tsconfig.json"))).toBe(false);
  });

  test("wall on a mixed-kind directory errors and writes nothing", () => {
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

    const code = dispatch(["wall", "src/mix"], io, { cwd });

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

describe("dispatch defold", () => {
  const SHA = "8fd9f9f5c6e1bd91b8c0f0a3a7d2e1c4b5a60798";

  function defoldInternals(overrides: Partial<DefoldIo> = {}): {
    defoldIo: Partial<DefoldIo>;
    spawned: string[][];
  } {
    const spawned: string[][] = [];
    return {
      spawned,
      defoldIo: {
        cacheDir: "/c",
        fetchSha: async () => SHA,
        probe: () => true,
        javaProbe: () => true,
        spawn: async (argv) => {
          spawned.push(argv);
          return 0;
        },
        download: async () => {},
        ...overrides,
      },
    };
  }

  test("defold resolve spawns bob and returns 0", async () => {
    const { io } = captureStreams();
    const { defoldIo, spawned } = defoldInternals();

    const code = await dispatch(["defold", "resolve", cwd], io, { defoldIo });

    expect(code).toBe(0);
    expect(spawned[0]).toContain("resolve");
    expect(spawned[0]).toContain("-jar");
  });

  test("defold build composes a debug-variant build", async () => {
    const { io } = captureStreams();
    const { defoldIo, spawned } = defoldInternals();

    await dispatch(["defold", "build", cwd], io, { defoldIo });

    expect(spawned[0]).toContain("--variant");
    expect(spawned[0]).toContain("debug");
    expect(spawned[0]).toContain("build");
  });

  test("--build-server is threaded into bob's argv", async () => {
    const { io } = captureStreams();
    const { defoldIo, spawned } = defoldInternals();

    await dispatch(["defold", "build", cwd, "--build-server", "https://build.example"], io, {
      defoldIo,
    });

    expect(spawned[0]).toContain("--build-server");
    expect(spawned[0]).toContain("https://build.example");
  });

  test("a non-zero bob exit becomes the CLI exit code", async () => {
    const { io, err } = captureStreams();
    const { defoldIo } = defoldInternals({ spawn: async () => 17 });

    const code = await dispatch(["defold", "bundle", cwd], io, { defoldIo });

    expect(code).toBe(17);
    expect(err()).not.toContain("\n    at ");
  });

  test("--json emits a defold result via renderResult", async () => {
    const { io, out } = captureStreams();
    const { defoldIo } = defoldInternals();

    const code = await dispatch(["defold", "resolve", cwd, "--json"], io, { defoldIo });

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as {
      command: string;
      ok: boolean;
      subcommand: string;
      exitCode: number;
    };
    expect(parsed.command).toBe("defold");
    expect(parsed.subcommand).toBe("resolve");
    expect(parsed.ok).toBe(true);
    expect(parsed.exitCode).toBe(0);
  });

  test("unknown defold subcommand prints usage listing resolve|build|bundle", async () => {
    const { io, err } = captureStreams();
    const { defoldIo } = defoldInternals();

    const code = await dispatch(["defold", "frobnicate", cwd], io, { defoldIo });

    expect(code).toBe(1);
    expect(err()).toMatch(/resolve\|build\|bundle/);
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
});
