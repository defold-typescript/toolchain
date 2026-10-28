import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PKG_DIR = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(PKG_DIR, "..", "..");
const BUNDLE = join(PKG_DIR, "dist", "cli-runtime.js");

// Cold-spawning `node` is slow and variable on the Windows CI runner, so the
// spawn test gets the same headroom the CLI's bin smoke uses.
const SPAWN_TEST_TIMEOUT_MS = 60_000;

const RUNTIME_EXPORTS = [
  "readZip",
  "scriptApiToFixtureJson",
  "generateModuleDeclaration",
  "buildVersionedSurfaceFiles",
  "materializeVersionedSurface",
] as const;

// Loaded by path: the root scripts sit outside this package's tsconfig.
interface PackProof {
  readonly PROOF_NAMESPACE: string;
  readonly PROOF_ZIP_ENTRY: string;
  readonly PROOF_DOC: string;
  readonly PROOF_TARGET: unknown;
}

function buildCliRuntime(): void {
  const proc = Bun.spawnSync(["bun", "run", "build:cli-runtime"], {
    cwd: PKG_DIR,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    throw new Error(`bun run build:cli-runtime failed in ${PKG_DIR}:\n${proc.stderr.toString()}`);
  }
}

// The published CLI runs the generator under plain `node`, where `Bun` and
// `import.meta.dir` are both absent and a `.ts` file under `node_modules`
// cannot load. `bun test` hides every one of those, so this runs the built
// artifact through Node's own loader from a directory outside the repo.
describe("cli-runtime bundle loads under plain node", () => {
  buildCliRuntime();

  test(
    "exports the generator surface and builds a ref-doc surface",
    async () => {
      const { PROOF_NAMESPACE, PROOF_ZIP_ENTRY, PROOF_DOC, PROOF_TARGET } = (await import(
        join(REPO_ROOT, "scripts", "release-pack-proof.ts")
      )) as PackProof;
      const outside = mkdtempSync(join(tmpdir(), "cli-runtime-node-"));
      const cacheDir = join(outside, "cache");
      try {
        const script = [
          `const mod = await import(${JSON.stringify(pathToFileURL(BUNDLE).href)});`,
          `for (const name of ${JSON.stringify(RUNTIME_EXPORTS)}) {`,
          '  console.log(name + ":" + typeof mod[name]);',
          "}",
          `const entry = ${JSON.stringify(PROOF_ZIP_ENTRY)};`,
          `const files = await mod.buildVersionedSurfaceFiles(${JSON.stringify(PROOF_TARGET)}, {`,
          "  resolveOpts: {",
          `    cacheDir: ${JSON.stringify(cacheDir)},`,
          "    download: async () => new Uint8Array([0]),",
          "    readZip: () => ({",
          "      has: (name) => name === entry,",
          "      entries: () => [entry],",
          "      read: (name) => {",
          '        if (name !== entry) throw new Error("unexpected zip entry: " + name);',
          `        return ${JSON.stringify(PROOF_DOC)};`,
          "      },",
          "    }),",
          "  },",
          "});",
          'console.log("paths:" + files.map((file) => file.path).join(","));',
        ].join("\n");
        const proc = Bun.spawnSync(["node", "--input-type=module", "-e", script], {
          cwd: outside,
          stdout: "pipe",
          stderr: "pipe",
        });
        const output = `${proc.stdout.toString()}${proc.stderr.toString()}`;
        for (const name of RUNTIME_EXPORTS) {
          expect(output).toContain(`${name}:function`);
        }
        const paths = /^paths:(.*)$/m.exec(output)?.[1]?.split(",") ?? [];
        expect(paths).toContain(`${PROOF_NAMESPACE}.d.ts`);
        expect(proc.exitCode).toBe(0);
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    },
    SPAWN_TEST_TIMEOUT_MS,
  );
});
