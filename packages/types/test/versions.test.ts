import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { materializeVersionedSurface } from "../scripts/materialize-version";
import { loadApiTargets } from "../scripts/regen";
import { SYNC_MANIFEST, type ZipAccessor } from "../scripts/sync-api-docs";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const VERSIONS_DIR = resolve(PACKAGE_ROOT, "test-d", "versions");

function typecheck(tsconfigPath: string): { exitCode: number; output: string } {
  const proc = Bun.spawnSync(["bunx", "tsc", "-p", tsconfigPath, "--noEmit"], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  return {
    exitCode: proc.exitCode,
    output: `${proc.stdout.toString()}${proc.stderr.toString()}`,
  };
}

const noDownload = async (): Promise<Uint8Array> => {
  throw new Error("download should not be called");
};

function labelRefDocZip(opts: { dropSetText?: boolean } = {}): {
  fakeZip: ZipAccessor;
  cacheDir: string;
} {
  const version = "1.9.8";
  const labelEntry = SYNC_MANIFEST.find((e) => e.namespace === "label");
  if (!labelEntry) throw new Error("no label SYNC_MANIFEST entry");
  const doc = JSON.parse(
    readFileSync(resolve(PACKAGE_ROOT, "fixtures", "label_doc.json"), "utf8"),
  ) as { elements: { name: string }[] };
  if (opts.dropSetText) {
    doc.elements = doc.elements.filter((e) => e.name !== "label.set_text");
  }
  const json = JSON.stringify(doc);
  const fakeZip: ZipAccessor = {
    has: (e) => e === labelEntry.zipEntry,
    entries: () => [labelEntry.zipEntry],
    read: (e) => {
      if (e !== labelEntry.zipEntry) throw new Error(`unexpected zip entry ${e}`);
      return json;
    },
  };
  const cacheDir = mkdtempSync(resolve(PACKAGE_ROOT, "ref-doc-cache-"));
  mkdirSync(resolve(cacheDir, version), { recursive: true });
  writeFileSync(resolve(cacheDir, version, "ref-doc.zip"), "seeded");
  return { fakeZip, cacheDir };
}

// Materialize a real ref-doc-sourced defold-1.9.8 surface (label, with
// set_text dropped) into a faux @types package three levels under the package
// root, so the target's `../../../src/core-types` import resolves to the real
// core-types and `@typescript-to-lua/language-extensions` resolves via the
// package's node_modules. Returns the materialize root for tsconfig wiring.
async function materializeProofSurface(): Promise<{ root: string; cacheDir: string }> {
  const target = loadApiTargets().find((t) => t.id === "defold-1.9.8");
  if (!target) throw new Error("no defold-1.9.8 target");
  const { fakeZip, cacheDir } = labelRefDocZip({ dropSetText: true });
  const root = mkdtempSync(resolve(PACKAGE_ROOT, "mat-proof-"));
  const destDir = resolve(root, "versions", "defold-1.9.8");
  await materializeVersionedSurface(target, {
    destDir,
    resolveOpts: { cacheDir, readZip: () => fakeZip, download: noDownload },
  });
  return { root, cacheDir };
}

function writeProofConfig(root: string, proof: string, surfaceId = "defold-1.9.8"): string {
  writeFileSync(resolve(root, "proof.ts"), proof);
  const tsconfigPath = resolve(root, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    `${JSON.stringify(
      {
        extends: "../../../tsconfig.json",
        compilerOptions: {
          noEmit: true,
          typeRoots: ["versions"],
          types: [surfaceId],
          // A materialized surface reaches its brand types through the
          // installed package specifier, exactly as a real consumer does; the
          // proof root is not under a node_modules that carries the link, so
          // map it to the package this test is part of.
          paths: { "@defold-typescript/types/*": ["../src/*"] },
        },
        include: ["proof.ts"],
      },
      null,
      2,
    )}\n`,
  );
  return tsconfigPath;
}

const SHARED_MEMBER = 'const _t: string = label.get_text("score");\nvoid _t;\n';
const CURRENT_ONLY_CALL = 'label.set_text("score", "x");\n';

describe("versioned API surface — consumer tsconfig proof", () => {
  test("current surface accepts the current-only member", () => {
    const { exitCode, output } = typecheck(resolve(VERSIONS_DIR, "tsconfig.current.json"));
    if (exitCode !== 0) {
      throw new Error(`current surface should accept label.set_text, but tsc failed:\n${output}`);
    }
    expect(exitCode).toBe(0);
  });

  test("real defold-1.9.8 surface rejects the current-only member, accepts the shared member", async () => {
    const { root, cacheDir } = await materializeProofSurface();
    try {
      const tsconfigPath = writeProofConfig(
        root,
        `export {};\n${SHARED_MEMBER}// @ts-expect-error set_text is absent on defold-1.9.8\n${CURRENT_ONLY_CALL}`,
      );
      const { exitCode, output } = typecheck(tsconfigPath);
      if (exitCode !== 0) {
        throw new Error(
          `defold-1.9.8 proof failed — either set_text leaked in (unused @ts-expect-error) ` +
            `or get_text did not resolve:\n${output}`,
        );
      }
      expect(exitCode).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  test("committed defold-1.12.4 remains selectable and rejects 1.13-only APIs", async () => {
    const target = loadApiTargets().find((candidate) => candidate.id === "defold-1.12.4");
    if (!target) throw new Error("no defold-1.12.4 target");
    const root = mkdtempSync(resolve(PACKAGE_ROOT, "mat-proof-"));
    try {
      await materializeVersionedSurface(target, {
        destDir: resolve(root, "versions", "defold-1.12.4"),
      });
      const tsconfigPath = writeProofConfig(
        root,
        `export {};\nconst _fov: number = camera.get_fov();\nvoid _fov;\n// @ts-expect-error get_orthographic_auto_zoom is new in 1.13.0\ncamera.get_orthographic_auto_zoom();\n`,
        "defold-1.12.4",
      );
      const { exitCode, output } = typecheck(tsconfigPath);
      if (exitCode !== 0) throw new Error(`defold-1.12.4 proof failed:\n${output}`);
      expect(exitCode).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("harness can fail: defold-1.9.8 surface call without @ts-expect-error errors", async () => {
    const { root, cacheDir } = await materializeProofSurface();
    try {
      const tsconfigPath = writeProofConfig(
        root,
        `export {};\n${SHARED_MEMBER}${CURRENT_ONLY_CALL}`,
      );
      const { exitCode } = typecheck(tsconfigPath);
      expect(exitCode).not.toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });
});

describe("versioned API surface — src augmentations reach the consumer", () => {
  test("augmentation-dependent call sites compile against a materialized surface", async () => {
    const target = loadApiTargets().find((candidate) => candidate.id === "defold-1.12.4");
    if (!target) throw new Error("no defold-1.12.4 target");
    const root = mkdtempSync(resolve(PACKAGE_ROOT, "mat-proof-"));
    try {
      await materializeVersionedSurface(target, {
        destDir: resolve(root, "versions", "defold-1.12.4"),
      });
      const tsconfigPath = writeProofConfig(
        root,
        [
          "export {};",
          // vmath-overloads: the generic clamp preserves its input type.
          "const _clamped: number = vmath.clamp(1, 0, 2);",
          // go-overloads + scene-addresses: the property overload set.
          'const _pos = go.get("/player", "position");',
          // engine-globals: the hash brand round-trips.
          'const _h: Hash = hash("score");',
          "const _hex: string = hash_to_hex(_h);",
          "void _clamped;",
          "void _pos;",
          "void _hex;",
          "",
        ].join("\n"),
        "defold-1.12.4",
      );
      const { exitCode, output } = typecheck(tsconfigPath);
      if (exitCode !== 0) {
        throw new Error(
          `defold-1.12.4 surface did not carry the src augmentations to the consumer:\n${output}`,
        );
      }
      expect(exitCode).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// The one diagnostic a clean materialized surface is allowed to carry:
// `physics.get_shape` records `diameter` twice, a defect in the generated
// record that this gate tolerates rather than fixes. Keyed on file basename +
// code + message and deliberately not on a line number, so regenerating
// `physics.d.ts` moves the duplicate without re-baselining the exemption.
const KNOWN_SURFACE_DEFECT = {
  file: "physics.d.ts",
  code: "TS2300",
  message: "Duplicate identifier 'diameter'.",
};

const DIAGNOSTIC_LINE = /^(.+)\(\d+,\d+\): error (TS\d+): (.+)$/;

function isKnownSurfaceDefect(line: string): boolean {
  const match = DIAGNOSTIC_LINE.exec(line);
  if (!match) return false;
  const [, path, code, message] = match;
  if (path === undefined) return false;
  return (
    basename(path) === KNOWN_SURFACE_DEFECT.file &&
    code === KNOWN_SURFACE_DEFECT.code &&
    message === KNOWN_SURFACE_DEFECT.message
  );
}

function unexpectedDiagnostics(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /error TS\d+:/.test(line))
    .filter((line) => !isKnownSurfaceDefect(line));
}

async function materializeStrictSurface(): Promise<{
  root: string;
  destDir: string;
  tsconfigPath: string;
}> {
  const target = loadApiTargets().find((candidate) => candidate.id === "defold-1.12.4");
  if (!target) throw new Error("no defold-1.12.4 target");
  const root = mkdtempSync(resolve(PACKAGE_ROOT, "mat-strict-"));
  const destDir = resolve(root, "versions", "defold-1.12.4");
  await materializeVersionedSurface(target, { destDir });
  const tsconfigPath = resolve(root, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    `${JSON.stringify(
      {
        extends: "../../../tsconfig.json",
        compilerOptions: {
          noEmit: true,
          // The consumer shape (`typeRoots` + `types`, inheriting
          // `skipLibCheck: true`) is exactly what hides an unresolved name
          // in a shipped declaration, so check the surface's own files
          // directly with lib checking on.
          skipLibCheck: false,
          types: [],
          paths: { "@defold-typescript/types/*": ["../src/*"] },
        },
        include: ["versions/defold-1.12.4/**/*.d.ts"],
      },
      null,
      2,
    )}\n`,
  );
  return { root, destDir, tsconfigPath };
}

const GUARD_MUTATIONS = [
  {
    row: "missing module",
    apply: (source: string) => source.replace('from "./core-types"', 'from "./core-types-gone"'),
    code: "TS2307",
  },
  {
    row: "missing export",
    apply: (source: string) => source.replace("{ Hash }", "{ HashNotAThing as Hash }"),
    code: "TS2305",
  },
  {
    row: "duplicate outside the exemption",
    apply: (source: string) => `${source}declare type DupProbe = { a: string; a: number };\n`,
    code: "TS2300",
  },
];

describe("versioned API surface — strict resolution", () => {
  test("no declaration in a materialized surface references a name the surface does not resolve", async () => {
    const { root, tsconfigPath } = await materializeStrictSurface();
    try {
      const { output } = typecheck(tsconfigPath);
      expect(unexpectedDiagnostics(output)).toEqual([]);
      if (!output.split("\n").some((line) => isKnownSurfaceDefect(line.trim()))) {
        throw new Error(
          "the physics.d.ts duplicate-'diameter' exemption no longer has a subject — the " +
            "defect appears fixed. Delete KNOWN_SURFACE_DEFECT, its filter in " +
            "unexpectedDiagnostics, and this assertion.",
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a carried declaration that cannot resolve its module or member is rejected", async () => {
    const { root, destDir, tsconfigPath } = await materializeStrictSurface();
    try {
      const guardPath = resolve(destDir, "message-guard.d.ts");
      const pristine = readFileSync(guardPath, "utf8");
      for (const mutation of GUARD_MUTATIONS) {
        const mutated = mutation.apply(pristine);
        if (mutated === pristine) {
          throw new Error(
            `mutation "${mutation.row}" was inert — the carried message-guard.d.ts no longer ` +
              "carries the text this row rewrites, so the row proves nothing",
          );
        }
        writeFileSync(guardPath, mutated);
        try {
          const rejected = unexpectedDiagnostics(typecheck(tsconfigPath).output);
          if (!rejected.some((line) => line.includes(`error ${mutation.code}:`))) {
            throw new Error(
              `mutation "${mutation.row}" was not rejected with ${mutation.code}; the gate ` +
                `returned:\n${rejected.join("\n")}`,
            );
          }
          expect(rejected.filter((line) => line.includes(KNOWN_SURFACE_DEFECT.file))).toEqual([]);
        } finally {
          writeFileSync(guardPath, pristine);
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
