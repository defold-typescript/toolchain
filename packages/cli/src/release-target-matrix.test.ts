import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { selectApiSurface } from "./api-surface";
import type { DefoldIo } from "./bob-command";
import {
  CURRENT_STABLE_DEFOLD_VERSION,
  DEFOLD_VERSIONS,
  PREVIOUS_STABLE_DEFOLD_VERSION,
} from "./defold-version";
import {
  ensureMaterializedReference,
  materializeApiSurface,
  resolveRegisteredSurfaceGeneratedDir,
} from "./materialize";
import {
  bobArtifactIdentity,
  isReusableBobArtifact,
  MATRIX_COMMANDS,
  type MatrixCommandContext,
  RELEASE_TARGET_MATRIX,
  runMatrixCommand,
  selectMatrixSurface,
} from "./release-target-matrix";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
const TYPES_PKG = path.join(REPO_ROOT, "packages", "types");
const TSC_BIN = path.join(REPO_ROOT, "node_modules", ".bin", "tsc");

function linkTypes(cwd: string): void {
  const scope = path.join(cwd, "node_modules", "@defold-typescript");
  mkdirSync(scope, { recursive: true });
  symlinkSync(TYPES_PKG, path.join(scope, "types"), "dir");
}

function runTsc(cwd: string): { code: number; output: string } {
  const proc = Bun.spawnSync([TSC_BIN, "--noEmit", "-p", "tsconfig.json"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: proc.exitCode, output: `${proc.stdout.toString()}${proc.stderr.toString()}` };
}

// Materialize a registered surface into a fresh consumer project through the
// production seam (selectApiSurface -> resolveRegisteredSurfaceGeneratedDir ->
// materializeApiSurface -> ensureMaterializedReference), link the shared types
// package, and run a real offline `tsc --noEmit` against the given source.
function compileAgainstSurface(version: string, source: string): { code: number; output: string } {
  const cwd = mkdtempSync(path.join(os.tmpdir(), `matrix-compile-${version}-`));
  try {
    const surface = selectApiSurface(version);
    const sourceGeneratedDir = resolveRegisteredSurfaceGeneratedDir(surface.surfaceId);
    // Correspondence check (mirrors the readiness physical-surface verification):
    // the materialization source must physically exist before we lean on it.
    if (sourceGeneratedDir === null || !existsSync(sourceGeneratedDir)) {
      throw new Error(`surface for ${version} has no committed generated directory`);
    }
    mkdirSync(path.join(cwd, "src"), { recursive: true });
    writeFileSync(path.join(cwd, "src", "main.ts"), `${source}\n`);
    writeFileSync(
      path.join(cwd, "tsconfig.json"),
      `${JSON.stringify(
        {
          compilerOptions: {
            module: "ESNext",
            moduleResolution: "bundler",
            lib: ["ES2022"],
            skipLibCheck: true,
            strict: true,
            noEmit: true,
          },
          include: ["src/**/*.ts"],
        },
        null,
        2,
      )}\n`,
    );
    linkTypes(cwd);
    const { materializedDir } = materializeApiSurface({ cwd, surface, sourceGeneratedDir });
    if (materializedDir === null) {
      throw new Error(`materialization produced no surface for ${version}`);
    }
    ensureMaterializedReference(cwd, materializedDir);
    return runTsc(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function scaffoldProject(dir: string, main = "export const answer = 1;\n"): void {
  writeFileSync(path.join(dir, "game.project"), "[project]\ntitle = matrix\n");
  writeFileSync(
    path.join(dir, "tsconfig.json"),
    `${JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }, null, 2)}\n`,
  );
  const src = path.join(dir, "src");
  mkdirSync(src, { recursive: true });
  writeFileSync(path.join(src, "main.ts"), main);
}

function fakeContext(cwd: string, sha: string): MatrixCommandContext {
  const io: Pick<DefoldIo, "spawn" | "download" | "probe" | "javaProbe"> = {
    // Fake jar/engine "already cached" so no network download is triggered.
    probe: () => true,
    javaProbe: () => true,
    spawn: async () => ({ exitCode: 0, output: "" }),
    download: async () => {},
  };
  return { cwd, sha, cacheDir: path.join(cwd, ".cache"), ...io };
}

describe("RELEASE_TARGET_MATRIX", () => {
  test("covers exactly the current-stable and previous-stable releases", () => {
    expect(RELEASE_TARGET_MATRIX.map((s) => s.version)).toEqual([
      CURRENT_STABLE_DEFOLD_VERSION,
      PREVIOUS_STABLE_DEFOLD_VERSION,
    ]);
    const current = RELEASE_TARGET_MATRIX.find((s) => s.isCurrentStable);
    expect(current?.version).toBe(CURRENT_STABLE_DEFOLD_VERSION);
    expect(current?.surfaceId).toBe(`defold-${CURRENT_STABLE_DEFOLD_VERSION}`);
    const previous = RELEASE_TARGET_MATRIX.find((s) => !s.isCurrentStable);
    expect(previous?.surfaceId).toBe(`defold-${PREVIOUS_STABLE_DEFOLD_VERSION}`);
  });

  test("is derived one-per-version from DEFOLD_VERSIONS, in order", () => {
    expect(RELEASE_TARGET_MATRIX).toHaveLength(DEFOLD_VERSIONS.length);
    DEFOLD_VERSIONS.forEach((version, i) => {
      const spec = RELEASE_TARGET_MATRIX[i];
      expect(spec).toBeDefined();
      expect(spec?.version).toBe(version);
      expect(spec?.surfaceId).toBe(`defold-${version}`);
      expect(spec?.isCurrentStable).toBe(i === 0);
    });
  });
});

describe("selectMatrixSurface", () => {
  test("current-stable uses the pre-baked surface; the previous release selects the committed historical surface", () => {
    const current = selectMatrixSurface(CURRENT_STABLE_DEFOLD_VERSION);
    expect(current.available).toBe(true);
    expect(current.surfaceId).toBe(`defold-${CURRENT_STABLE_DEFOLD_VERSION}`);
    expect(current.generatedDir).not.toBeNull();

    const previous = selectMatrixSurface(PREVIOUS_STABLE_DEFOLD_VERSION);
    expect(previous.available).toBe(true);
    expect(previous.surfaceId).toBe(`defold-${PREVIOUS_STABLE_DEFOLD_VERSION}`);
    expect(previous.generatedDir).not.toBeNull();
    expect(previous.generatedDir).not.toBe(current.generatedDir);
  });

  test("an unregistered version resolves to no surface (compile would fail)", () => {
    const unknown = selectMatrixSurface("9.9.9");
    expect(unknown.available).toBe(false);
    expect(unknown.surfaceId).toBeNull();
    expect(unknown.generatedDir).toBeNull();
  });
});

describe("bob artifact cache identity", () => {
  test("keys the cached jar by the resolved SHA, not the semantic version", () => {
    const prePatch = bobArtifactIdentity("sha-pre", "/cache");
    const patched = bobArtifactIdentity("sha-post", "/cache");
    expect(prePatch).not.toBe(patched);
    expect(prePatch).toContain("sha-pre");
    expect(patched).toContain("sha-post");
  });

  test("a patched 1.13.0 cannot reuse a pre-patch cache entry for the same semantic version", () => {
    // The cache only holds the pre-patch artifact.
    const has = (candidate: string): boolean =>
      candidate === bobArtifactIdentity("sha-pre", "/cache");
    expect(isReusableBobArtifact("sha-pre", "/cache", has)).toBe(true);
    expect(isReusableBobArtifact("sha-post", "/cache", has)).toBe(false);
  });
});

describe("runMatrixCommand drives the CLI seams offline", () => {
  let cwd: string;

  function withProject(version: string): { dir: string; ctx: MatrixCommandContext } {
    const dir = mkdtempSync(path.join(cwd, `${version}-`));
    scaffoldProject(dir);
    return { dir, ctx: fakeContext(dir, `sha-${version}`) };
  }

  test.each([
    ...RELEASE_TARGET_MATRIX,
  ])("every command reports and consumes the same target/version/SHA for %o", async (spec) => {
    cwd = mkdtempSync(path.join(os.tmpdir(), "matrix-"));
    try {
      const records = [];
      for (const command of MATRIX_COMMANDS) {
        const { ctx } = withProject(spec.version);
        records.push(await runMatrixCommand(command, spec.version, ctx));
      }
      for (const r of records) {
        expect(r.ok).toBe(true);
        expect(r.version).toBe(spec.version);
        expect(r.apiSurface).toBe(spec.surfaceId);
      }
      // The SHA is only fetched by the bob subcommands (version targets carry a
      // null head SHA until an archive is needed); every bob command must agree.
      const bobShas = records.filter((r) => r.command.startsWith("bob")).map((r) => r.sha);
      expect(bobShas.every((s) => s === `sha-${spec.version}`)).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("cross-version compile proof: shared code compiles on both; 1.13-only code compiles on 1.13.0 and fails on 1.12.4", () => {
    // Deterministic, fully offline cross-version proof. Each surface is reached
    // through the production materialization/selection seam (selectApiSurface +
    // resolveRegisteredSurfaceGeneratedDir + materializeApiSurface +
    // ensureMaterializedReference), then a real `tsc --noEmit` runs against the
    // materialized ambient surface. Real Bob/engine cross-compilation remains the
    // advisory live matrix's job; this proves the committed type surfaces.
    const currentSurface = selectMatrixSurface(CURRENT_STABLE_DEFOLD_VERSION);
    const previousSurface = selectMatrixSurface(PREVIOUS_STABLE_DEFOLD_VERSION);
    expect(currentSurface.available && previousSurface.available).toBe(true);
    expect(currentSurface.generatedDir).not.toBe(previousSurface.generatedDir);

    // A shared snippet using APIs present in both releases.
    const sharedSource = [
      'go.set_position(vmath.vector3(1, 2, 3), "#go");',
      'msg.post("#other", "hello", {});',
    ].join("\n");

    // A 1.13-only snippet exercising the reverified areas; every symbol is absent
    // from the 1.12.4 surface, so it must compile on 1.13.0 and fail on 1.12.4.
    const only113Source = [
      "declare const world: Parameters<typeof b2d.world.cast_ray>[0];",
      'compute.set_constants("/c.computec", { tint: { value: vmath.vector4(1, 0, 0, 1) } });',
      'material.set_vertex_attributes("/m.materialc", { position: { normalize: true } });',
      'model.set_blend_weights("#model", [0, 1]);',
      "b2d.world.cast_ray(world, vmath.vector3(), vmath.vector3(), { category_bits: 1, mask_bits: 1 }, 4);",
      "const info = graphics.get_adapter_info();",
      "void info.family;",
      "render.set_blend_func_separate(1, 1, 1, 1);",
      "void camera.get_orthographic_auto_zoom();",
      "void liveupdate.is_built_with_excluded_files();",
      'sprite.reset_constant("#sprite", "tint");',
    ].join("\n");

    const sharedOnCurrent = compileAgainstSurface(CURRENT_STABLE_DEFOLD_VERSION, sharedSource);
    const sharedOnPrevious = compileAgainstSurface(PREVIOUS_STABLE_DEFOLD_VERSION, sharedSource);
    if (sharedOnCurrent.code !== 0) {
      throw new Error(`shared snippet must compile on current:\n${sharedOnCurrent.output}`);
    }
    if (sharedOnPrevious.code !== 0) {
      throw new Error(`shared snippet must compile on previous:\n${sharedOnPrevious.output}`);
    }

    const onlyOnCurrent = compileAgainstSurface(CURRENT_STABLE_DEFOLD_VERSION, only113Source);
    const onlyOnPrevious = compileAgainstSurface(PREVIOUS_STABLE_DEFOLD_VERSION, only113Source);
    if (onlyOnCurrent.code !== 0) {
      throw new Error(`1.13-only snippet must compile on 1.13.0:\n${onlyOnCurrent.output}`);
    }
    expect(onlyOnPrevious.code).not.toBe(0);
  }, 180_000);
});
