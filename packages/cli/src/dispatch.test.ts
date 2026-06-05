import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Writable } from "node:stream";
import { CURRENT_STABLE_DEFOLD_VERSION } from "./defold-version";
import { dispatch } from "./dispatch";
import {
  labelRefDocResolveOpts,
  multiKindRefDocResolveOpts,
  multiKindRefDocTarget,
  noDownload,
} from "./ref-doc-test-fixture";
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

describe("dispatch", () => {
  test("init <path> runs runInit and returns 0 on success", () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out, err } = captureStreams();

    const code = dispatch(["init", cwd], io);

    expect(code).toBe(0);
    expect(err()).toBe("");
    expect(out()).toMatch(/defold-typescript init: wrote/);
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
    expect(out()).toMatch(/wrote 13 files/);
    expect(out()).toContain("game.project");
    expect(out()).toContain("main/main.script");
  });

  test("empty argv prints usage to stderr and returns 1", () => {
    const { io, out, err } = captureStreams();

    const code = dispatch([], io);

    expect(code).toBe(1);
    expect(out()).toBe("");
    expect(err()).toBe("Usage: defold-typescript <init|build|watch> [path]\n");
  });

  test("unknown command prints usage to stderr and returns 1", () => {
    const { io, out, err } = captureStreams();

    const code = dispatch(["unknown"], io);

    expect(code).toBe(1);
    expect(out()).toBe("");
    expect(err()).toBe("Usage: defold-typescript <init|build|watch> [path]\n");
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
    writeFileSync(path.join(srcDir, "main.ts"), "export const a = 1;\n");

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
    writeFileSync(path.join(srcDir, "main.ts"), "export const a = 1;\n");

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

  test("init --json reports the seeded current-stable defoldVersion", () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    const { io, out } = captureStreams();

    const code = dispatch(["init", cwd, "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { defoldVersion: string };
    expect(parsed.defoldVersion).toBe(CURRENT_STABLE_DEFOLD_VERSION);
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

  test("init --json reports scriptKind gui-script for a single-gui_script project", () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    writeFileSync(path.join(cwd, "hud.gui_script"), "");
    const { io, out } = captureStreams();

    const code = dispatch(["init", cwd, "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { scriptKind: string | null };
    expect(parsed.scriptKind).toBe("gui-script");
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

  test("build --json on a single-.script project narrows to scriptKind script", () => {
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
    const parsed = JSON.parse(out()) as { scriptKind: string | null };
    expect(parsed.scriptKind).toBe("script");

    const index = readFileSync(
      path.join(cwd, ".defold-types", "defold-1.12.4", "index.d.ts"),
      "utf8",
    );
    expect(index).not.toContain('"./gui"');
    expect(index).not.toContain('"./render"');
    expect(index).toContain('"./label"');

    rmSync(sourceGeneratedDir, { recursive: true, force: true });
  });

  test("build --json on a mixed-kind project keeps the full surface (scriptKind null)", () => {
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
    const parsed = JSON.parse(out()) as { scriptKind: string | null };
    expect(parsed.scriptKind).toBeNull();

    const index = readFileSync(
      path.join(cwd, ".defold-types", "defold-1.12.4", "index.d.ts"),
      "utf8",
    );
    expect(index).toContain('"./gui"');
    expect(index).toContain('"./render"');
    expect(index).toContain('"./label"');

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

  test("build narrows the pinned ref-doc surface for a single-.script project", async () => {
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
    expect(existsSync(path.join(dir, "gui.d.ts"))).toBe(false);
    expect(existsSync(path.join(dir, "render.d.ts"))).toBe(false);

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });

  test("watch narrows the pinned ref-doc surface at startup for a single-.script project", async () => {
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
    expect(existsSync(path.join(dir, "gui.d.ts"))).toBe(false);
    expect(existsSync(path.join(dir, "render.d.ts"))).toBe(false);

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

  test("watch narrows the materialized surface at startup for a single-.script project", async () => {
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
    expect(index).not.toContain('"./gui"');
    expect(index).not.toContain('"./render"');
    expect(index).toContain('"./label"');

    handle?.stop();
    const code = await result;
    expect(code).toBe(0);
    expect(err()).toBe("");

    rmSync(sourceGeneratedDir, { recursive: true, force: true });
  });

  test("watch re-narrows live when a .gui_script is added mid-session", async () => {
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
    expect(index).not.toContain('"./render"');

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
});
