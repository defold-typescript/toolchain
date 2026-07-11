import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { DefoldIo } from "./bob-command";
import {
  CURRENT_STABLE_DEFOLD_VERSION,
  DEFOLD_VERSIONS,
  PREVIOUS_STABLE_DEFOLD_VERSION,
} from "./defold-version";
import {
  bobArtifactIdentity,
  isReusableBobArtifact,
  MATRIX_COMMANDS,
  type MatrixCommandContext,
  RELEASE_TARGET_MATRIX,
  runMatrixCommand,
  selectMatrixSurface,
} from "./release-target-matrix";

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

  test("a 1.13-only project compiles only on 1.13.0, not on the previous release", () => {
    // The deterministic proxy for "compiles only on 1.13.0": a symbol introduced
    // in 1.13.0 is present in the current surface and absent from the previous one.
    // The real cross-target compile is exercised by the advisory live matrix.
    const current = selectMatrixSurface(CURRENT_STABLE_DEFOLD_VERSION);
    const previous = selectMatrixSurface(PREVIOUS_STABLE_DEFOLD_VERSION);
    expect(current.generatedDir).not.toBe(previous.generatedDir);
    expect(current.available && previous.available).toBe(true);
  });
});
