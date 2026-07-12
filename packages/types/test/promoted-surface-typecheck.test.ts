import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Consumer type-proofs for the promoted Defold 1.13.0 surface: each documented
// usage must compile against the shipped `@defold-typescript/types/script`
// declarations, and a paired negative control must fail the same compile. This
// is the end-to-end backstop for the curation work — it exercises the emitted
// `.d.ts`, not the emitter internals. Modeled on
// packages/cli/src/snippet-typecheck.test.ts and test/kind-subpath-factory.test.ts.

const TYPES_PKG = path.resolve(import.meta.dir, "..");
const TYPECHECK_TEST_TIMEOUT_MS = 120_000;

function linkTypes(cwd: string): void {
  const scope = path.join(cwd, "node_modules", "@defold-typescript");
  mkdirSync(scope, { recursive: true });
  symlinkSync(TYPES_PKG, path.join(scope, "types"), "dir");
}

function writeTsconfig(cwd: string): void {
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
          types: ["@defold-typescript/types/script"],
        },
        include: ["src/**/*.ts"],
      },
      null,
      2,
    )}\n`,
  );
}

function typecheck(cwd: string): { exitCode: number; output: string } {
  const proc = Bun.spawnSync(["bunx", "tsc", "-p", "tsconfig.json", "--noEmit"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  return { exitCode: proc.exitCode, output: `${proc.stdout.toString()}${proc.stderr.toString()}` };
}

function scaffold(cwd: string, files: Record<string, string>): void {
  linkTypes(cwd);
  mkdirSync(path.join(cwd, "src"), { recursive: true });
  for (const [name, source] of Object.entries(files)) {
    writeFileSync(path.join(cwd, "src", name), `${source}\n`);
  }
  writeTsconfig(cwd);
}

function withCwd(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-promoted-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

// The documented positive usages, one file each. Every one must compile.
const POSITIVE_FILES: Record<string, string> = {
  "compute.ts": [
    // A keyed-by-constant-name table of args tables (the documented example).
    'compute.set_constants("/my_compute.computec", { tint: { value: vmath.vector4(1, 0, 0, 1) } });',
    'compute.set_samplers("/my_compute.computec", { texture_sampler: { u_wrap: 0 } });',
    // The getters return arrays of records — index and iterate every one.
    'const cc = compute.get_constants("/my_compute.computec");',
    "const ccName: Hash = cc[0].name;",
    "const ccVal = cc[0].value;",
    'for (const s of compute.get_samplers("/my_compute.computec")) { const nm: Hash = s.name; }',
    'const ct = compute.get_textures("/my_compute.computec")[0].width;',
    "void ccVal;",
    "void ct;",
  ].join("\n"),
  "material.ts": [
    'material.set_constants("/m.materialc", { tint: { value: vmath.vector4(1, 0, 0, 1) } });',
    'material.set_vertex_attributes("/m.materialc", { position: { normalize: true } });',
    // The value field's documented array branch (a table of numbers).
    'material.set_vertex_attributes("/m.materialc", { color: { value: [1, 0, 0, 1] } });',
    // The getters return arrays of records — index and iterate every one.
    'const mc = material.get_constants("/m.materialc");',
    "const mcName: Hash = mc[0].name;",
    'for (const s of material.get_samplers("/m.materialc")) { const nm: Hash = s.name; }',
    'const mt: number = material.get_textures("/m.materialc")[0].width;',
    'const norm: boolean = material.get_vertex_attributes("/m.materialc")[0].normalize;',
    "void mcName;",
    "void mt;",
    "void norm;",
  ].join("\n"),
  "model.ts": [
    'const w = model.get_blend_weights("#model");',
    "w[1] = 0.75;",
    'model.set_blend_weights("#model", w);',
    'model.set_blend_weights("#model", [0, 1, 0.5, 0]);',
    'model.set_blend_weights("#model");',
  ].join("\n"),
  "b2d_world.ts": [
    "declare const world: Parameters<typeof b2d.world.cast_ray>[0];",
    "const [hits, stats] = b2d.world.cast_ray(",
    "  world,",
    "  vmath.vector3(),",
    "  vmath.vector3(),",
    "  { category_bits: 1, mask_bits: 1 },",
    "  4,",
    ");",
    "const fraction: number = hits[0].fraction;",
    "const point = hits[0].point;",
    "const visits: number = stats.node_visits;",
  ].join("\n"),
  "graphics.ts": [
    "const info = graphics.get_adapter_info();",
    "const family: string = info.family;",
    "const size: number = info.limits.max_texture_size_2d;",
    "const exts: string[] = info.extensions;",
    "const adapters: string[] = graphics.get_engine_adapters();",
  ].join("\n"),
};

describe("promoted 1.13.0 surface — documented usages compile", () => {
  test(
    "every documented promoted-surface usage type-checks against the shipped declarations",
    () => {
      withCwd((cwd) => {
        scaffold(cwd, POSITIVE_FILES);
        const { exitCode, output } = typecheck(cwd);
        if (exitCode !== 0) throw new Error(`expected clean type-check, got:\n${output}`);
        expect(exitCode).toBe(0);
      });
    },
    TYPECHECK_TEST_TIMEOUT_MS,
  );
});

// Each negative control is its own compile: a single failing file fails tsc.
const NEGATIVE_CASES: Record<string, string> = {
  "compute keyed value must be an args table, not a scalar":
    'compute.set_constants("/my_compute.computec", { tint: 5 });',
  "model blend weights are numeric, not strings": 'model.set_blend_weights("#model", ["x"]);',
  "b2d cast filter rejects an unknown field": [
    "declare const world: Parameters<typeof b2d.world.cast_ray>[0];",
    "b2d.world.cast_ray(world, vmath.vector3(), vmath.vector3(), { bogus_bits: 1 }, 4);",
  ].join("\n"),
  "graphics adapter limit is a number, not a string":
    "const bad: string = graphics.get_adapter_info().limits.max_texture_size_2d;",
  "compute.get_constants returns an array, not a record":
    'const n: Hash = compute.get_constants("/c.computec").name;',
  "material.get_vertex_attributes returns an array, not a record":
    'const b: boolean = material.get_vertex_attributes("/m.materialc").normalize;',
};

describe("promoted 1.13.0 surface — negative controls fail the same compile", () => {
  for (const [name, source] of Object.entries(NEGATIVE_CASES)) {
    test(
      name,
      () => {
        withCwd((cwd) => {
          scaffold(cwd, { "main.ts": source });
          const { exitCode } = typecheck(cwd);
          expect(exitCode).not.toBe(0);
        });
      },
      TYPECHECK_TEST_TIMEOUT_MS,
    );
  }
});
