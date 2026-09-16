import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { selectCompleteVersionSurfaces } from "../scripts/generate-api-availability";
import { materializeVersionedSurface } from "../scripts/materialize-version";
import { loadApiTargets } from "../scripts/regen";
import { SYNC_MANIFEST, type ZipAccessor } from "../scripts/sync-api-docs";
import { OVERLOAD_COVERED_SKIPS } from "../src/emit-dts";
import {
  ABSENCE_PROOF,
  absenceDirectiveLine,
  partialNamespaceStub,
  rotatingNamespace,
  unusedDirectiveLines,
} from "./absence-proof";
import {
  typecheckSurface as typecheck,
  unexpectedDiagnostics,
  writeStrictSurfaceTsconfig,
} from "./strict-resolution";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const VERSIONS_DIR = resolve(PACKAGE_ROOT, "test-d", "versions");

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

// Every committed surface a consumer can select: the default entrypoint plus each
// pinned `generated/versions/<target>/index.d.ts`, read from disk so a newly
// committed target is covered without editing this list.
function committedSurfaceIndexes(): string[] {
  const versionsDir = resolve(PACKAGE_ROOT, "generated", "versions");
  const pinned = readdirSync(versionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `generated/versions/${entry.name}/index.d.ts`);
  for (const index of pinned) {
    if (!existsSync(resolve(PACKAGE_ROOT, index))) {
      throw new Error(`${index} is missing; tsc would compile the proof without the surface`);
    }
  }
  if (pinned.length === 0) {
    throw new Error(
      "no committed generated/versions/*/index.d.ts found; the wall would pass vacuously",
    );
  }
  return ["index.d.ts", ...pinned];
}

describe("committed API surfaces — extensions are never ambient", () => {
  for (const index of committedSurfaceIndexes()) {
    test(`${index} declares none of iac, iap, push, webview`, () => {
      const root = mkdtempSync(resolve(PACKAGE_ROOT, "ext-wall-"));
      try {
        const tsconfigPath = resolve(root, "tsconfig.json");
        writeFileSync(
          tsconfigPath,
          `${JSON.stringify(
            {
              extends: "../../../tsconfig.json",
              compilerOptions: { noEmit: true, types: [] },
              include: [ABSENCE_PROOF, resolve(PACKAGE_ROOT, index)],
            },
            null,
            2,
          )}\n`,
        );
        const { exitCode, output } = typecheck(tsconfigPath);
        if (exitCode !== 0) {
          throw new Error(
            `${index} proof failed — an extension namespace is declared on this surface ` +
              `(unused @ts-expect-error):\n${output}`,
          );
        }
        expect(exitCode).toBe(0);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

// A surface that declares one of the four but omits the member a proof happens
// to call leaves that `@ts-expect-error` satisfied by a property error, so the
// wall above still exits 0 while the namespace is ambient. Each case injects
// exactly that shape and demands the proof notice.
describe("committed API surfaces — a partial extension namespace still fails the wall", () => {
  committedSurfaceIndexes().forEach((index, position) => {
    const namespace = rotatingNamespace(position);
    test(`${index} proof reacts to an ambient ${namespace} that declares no proven member`, () => {
      const root = mkdtempSync(resolve(PACKAGE_ROOT, "ext-partial-"));
      try {
        const stub = resolve(root, "partial-namespace.d.ts");
        writeFileSync(stub, partialNamespaceStub(namespace));
        const tsconfigPath = resolve(root, "tsconfig.json");
        writeFileSync(
          tsconfigPath,
          `${JSON.stringify(
            {
              extends: "../../../tsconfig.json",
              compilerOptions: { noEmit: true, types: [] },
              include: [ABSENCE_PROOF, resolve(PACKAGE_ROOT, index), stub],
            },
            null,
            2,
          )}\n`,
        );
        const { exitCode, output } = typecheck(tsconfigPath);
        expect(exitCode).not.toBe(0);
        expect(unusedDirectiveLines(output)).toContain(absenceDirectiveLine(namespace));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
});

const ARITY_OVERLOAD_PROOF = resolve(VERSIONS_DIR, "engine-arity-overloads-proof.ts");

describe("committed API surfaces — overload-covered arity holds per target", () => {
  for (const index of committedSurfaceIndexes()) {
    test(`${index} withholds the generated euler_to_quat arm`, () => {
      const root = mkdtempSync(resolve(PACKAGE_ROOT, "arity-wall-"));
      try {
        const tsconfigPath = resolve(root, "tsconfig.json");
        writeFileSync(
          tsconfigPath,
          `${JSON.stringify(
            {
              extends: "../../../tsconfig.json",
              compilerOptions: { noEmit: true, types: [] },
              include: [ARITY_OVERLOAD_PROOF, resolve(PACKAGE_ROOT, index)],
            },
            null,
            2,
          )}\n`,
        );
        const { exitCode, output } = typecheck(tsconfigPath);
        if (exitCode !== 0) {
          throw new Error(
            `${index} proof failed — the generated euler_to_quat declaration survives on ` +
              `this surface, so its skipFunctions entry is missing:\n${output}`,
          );
        }
        expect(exitCode).toBe(0);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

// The compile wall above cannot see a missing `render_target` skip: the authored
// wide arm repeats the generated signature verbatim, so an un-skipped surface
// accepts exactly the same calls. Parity between the two production registries
// is what catches a skip wired into one target and forgotten in another.
describe("api-targets — every overload-covered skip is wired into every target", () => {
  const completeTargets = selectCompleteVersionSurfaces(loadApiTargets());

  test("the complete-target listing is not empty", () => {
    expect(completeTargets.length).toBeGreaterThan(0);
  });

  for (const target of completeTargets) {
    test(`${target.id} skips every OVERLOAD_COVERED_SKIPS symbol it declares`, () => {
      const missing: string[] = [];
      for (const fqn of OVERLOAD_COVERED_SKIPS) {
        const dot = fqn.indexOf(".");
        const namespace = fqn.slice(0, dot);
        const local = fqn.slice(dot + 1);
        const module = target.modules.find((m) => m.namespace === namespace);
        if (!module) continue;
        if (!(module.skipFunctions ?? []).includes(local)) missing.push(fqn);
      }
      expect(missing).toEqual([]);
    });
  }
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

describe("versioned API surface — the Lua stdlib reaches the consumer", () => {
  test("stdlib call sites compile against a materialized surface", async () => {
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
          "const _floor: number = math.floor(1.5);",
          'const _fmt: string = string.format("%d", 1);',
          "const _list: number[] = [];",
          "table.insert(_list, 1);",
          "const _now: number = os.time();",
          // `bit` rides the jit-only directive alone, so it is the only call
          // here that fails if that second line is dropped on its own.
          "const _band: number = bit.band(1, 2);",
          "void _floor;",
          "void _fmt;",
          "void _now;",
          "void _band;",
          "",
        ].join("\n"),
        "defold-1.12.4",
      );
      const { exitCode, output } = typecheck(tsconfigPath);
      if (exitCode !== 0) {
        throw new Error(
          `defold-1.12.4 surface did not carry the Lua stdlib to the consumer:\n${output}`,
        );
      }
      expect(exitCode).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

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
  const tsconfigPath = writeStrictSurfaceTsconfig({
    dir: root,
    extendsPath: "../../../tsconfig.json",
    include: ["versions/defold-1.12.4/**/*.d.ts"],
    paths: { "@defold-typescript/types/*": ["../src/*"] },
  });
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
    row: "duplicate",
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
        } finally {
          writeFileSync(guardPath, pristine);
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
