import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  materializeApiSurface,
  resolveRegisteredSurfaceGeneratedDir,
} from "../packages/cli/src/materialize";
import {
  typecheckSurface,
  unexpectedDiagnostics,
  writeStrictSurfaceTsconfig,
} from "../packages/types/test/strict-resolution";

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const TYPES_ROOT = path.join(REPO_ROOT, "packages", "types");
const REGISTRY = path.join(TYPES_ROOT, "api-targets.json");

// The gated set is whatever the shipped registry currently offers a packaged
// materialization for, filtered by production's own resolver rather than a
// second copy of its `source == null && generatedDir` predicate. A target added
// to the registry is gated with no edit here.
function packagedTargetIds(): string[] {
  const { targets } = JSON.parse(readFileSync(REGISTRY, "utf8")) as {
    targets: ReadonlyArray<{ id: string }>;
  };
  return targets
    .map((target) => target.id)
    .filter((id) => resolveRegisteredSurfaceGeneratedDir(id) !== null);
}

const PACKAGED_TARGET_IDS = packagedTargetIds();

// bug-157's target: a pinned surface whose carried `msg-overloads` needs the
// generated `builtin-messages` module carried alongside it.
const MUTATION_TARGET = "defold-1.12.4";

interface Materialized {
  readonly cwd: string;
  readonly surfaceDir: string;
  readonly tsconfigPath: string;
}

function materialize(surfaceId: string): Materialized {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "packaged-strict-"));
  const { materializedDir } = materializeApiSurface({
    cwd,
    surface: { surfaceId, available: true },
    sourceGeneratedDir: resolveRegisteredSurfaceGeneratedDir(surfaceId),
  });
  if (materializedDir === null) {
    rmSync(cwd, { recursive: true, force: true });
    throw new Error(`materializeApiSurface wrote no surface for ${surfaceId}`);
  }

  // Resolve the package the way an install does. `lua-types` is a real
  // dependency of the types package that the editor kind index names; without
  // it the fixture reports TS2688 for something a real install provides, and
  // exempting that would hide a surface defect behind a harness defect.
  mkdirSync(path.join(cwd, "node_modules", "@defold-typescript"), { recursive: true });
  symlinkSync(TYPES_ROOT, path.join(cwd, "node_modules", "@defold-typescript", "types"));
  symlinkSync(
    path.join(TYPES_ROOT, "node_modules", "lua-types"),
    path.join(cwd, "node_modules", "lua-types"),
  );

  const tsconfigPath = writeStrictSurfaceTsconfig({
    dir: cwd,
    // The surface re-exports the package's `src/`, so it must be measured
    // against the repo's own target/lib/strictness — the same settings the
    // ref-doc gate extends — not a bare default.
    extendsPath: path.join(REPO_ROOT, "tsconfig.json"),
    include: [`${materializedDir}/**/*.d.ts`],
  });
  return { cwd, surfaceDir: path.join(cwd, materializedDir), tsconfigPath };
}

function diagnosticsFor({ tsconfigPath }: Materialized): string[] {
  return unexpectedDiagnostics(typecheckSurface(tsconfigPath).output);
}

const CARRIED_MUTATIONS = [
  {
    row: "missing module",
    file: "msg-overloads.d.ts",
    apply: (source: string) => source.replace('from "./core-types"', 'from "./core-types-gone"'),
    code: "TS2307",
  },
  {
    row: "missing export",
    file: "msg-overloads.d.ts",
    apply: (source: string) => source.replace("{ Hash, Url }", "{ HashNotAThing as Hash, Url }"),
    code: "TS2305",
  },
  {
    row: "duplicate",
    file: "msg-overloads.d.ts",
    apply: (source: string) => `${source}declare type DupProbe = { a: string; a: number };\n`,
    code: "TS2300",
  },
];

describe("packaged API surface — strict resolution", () => {
  test("the registry offers packaged targets to gate", () => {
    expect(PACKAGED_TARGET_IDS.length).toBeGreaterThan(0);
  });

  for (const surfaceId of PACKAGED_TARGET_IDS) {
    test(`no declaration in the ${surfaceId} packaged materialization references a name the surface does not declare`, () => {
      const fixture = materialize(surfaceId);
      try {
        expect(diagnosticsFor(fixture)).toEqual([]);
      } finally {
        rmSync(fixture.cwd, { recursive: true, force: true });
      }
    });
  }

  test("a carried declaration that cannot resolve its module or member is rejected", () => {
    const fixture = materialize(MUTATION_TARGET);
    try {
      for (const mutation of CARRIED_MUTATIONS) {
        const filePath = path.join(fixture.surfaceDir, mutation.file);
        const pristine = readFileSync(filePath, "utf8");
        const mutated = mutation.apply(pristine);
        if (mutated === pristine) {
          throw new Error(
            `mutation "${mutation.row}" was inert — the carried ${mutation.file} no longer ` +
              "carries the text this row rewrites, so the row proves nothing",
          );
        }
        writeFileSync(filePath, mutated);
        try {
          const rejected = diagnosticsFor(fixture);
          if (!rejected.some((line) => line.includes(`error ${mutation.code}:`))) {
            throw new Error(
              `mutation "${mutation.row}" was not rejected with ${mutation.code}; the gate ` +
                `returned:\n${rejected.join("\n")}`,
            );
          }
        } finally {
          writeFileSync(filePath, pristine);
        }
      }
    } finally {
      rmSync(fixture.cwd, { recursive: true, force: true });
    }
  });

  test("a carried module missing from the materialization is caught", () => {
    const fixture = materialize(MUTATION_TARGET);
    try {
      const dropped = path.join(fixture.surfaceDir, "builtin-messages.d.ts");
      expect(readdirSync(fixture.surfaceDir)).toContain("builtin-messages.d.ts");
      unlinkSync(dropped);
      const rejected = diagnosticsFor(fixture);
      expect(rejected.filter((line) => line.includes("error TS2304:")).length).toBeGreaterThan(0);
    } finally {
      rmSync(fixture.cwd, { recursive: true, force: true });
    }
  });
});
