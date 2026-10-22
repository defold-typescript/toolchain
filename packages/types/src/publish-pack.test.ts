import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const PKG_DIR = resolve(import.meta.dir, "..");

// The `cli-runtime` export's `default` target is built, not committed, so the
// listings below see it only once the bundle exists beside the source.
function buildCliRuntime(cwd: string): void {
  const proc = Bun.spawnSync(["bun", "run", "build:cli-runtime"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    throw new Error(`bun run build:cli-runtime failed in ${cwd}:\n${proc.stderr.toString()}`);
  }
}

// `release.yml` publishes with npm, whose packer reads a `files` glob
// differently from bun's (`fixtures/defold-*` matched the directory entries
// alone and shipped none of their documents), so the tarball a user installs
// is the one npm lists. A missing `npm` is a failure, not a skip.
function npmPackedPaths(cwd: string): string[] {
  const command =
    process.platform === "win32"
      ? ["cmd", "/c", "npm", "pack", "--dry-run", "--json"]
      : ["npm", "pack", "--dry-run", "--json"];
  const proc = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    throw new Error(`npm pack --dry-run --json failed in ${cwd}:\n${proc.stderr.toString()}`);
  }
  const [listing] = JSON.parse(proc.stdout.toString()) as { files: { path: string }[] }[];
  if (listing === undefined) {
    throw new Error(`npm pack --dry-run --json listed no package in ${cwd}`);
  }
  return listing.files.map((file) => file.path);
}

function packedPaths(cwd: string): string[] {
  const proc = Bun.spawnSync(["bun", "pm", "pack", "--dry-run"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = proc.stdout.toString();
  if (proc.exitCode !== 0) {
    throw new Error(`bun pm pack --dry-run failed in ${cwd}:\n${proc.stderr.toString()}`);
  }
  return stdout
    .split("\n")
    .map((line) => line.match(/^packed\s+\S+\s+(.+)$/)?.[1])
    .filter((path): path is string => path !== undefined);
}

function exportTargets(node: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof node === "string") {
    if (node.startsWith("./")) out.add(node.slice(2));
    return out;
  }
  if (node !== null && typeof node === "object") {
    for (const value of Object.values(node)) exportTargets(value, out);
  }
  return out;
}

describe("@defold-typescript/types publish surface", () => {
  buildCliRuntime(PKG_DIR);
  const paths = packedPaths(PKG_DIR);

  test("ships the runtime/type surface", () => {
    expect(paths).toContain("package.json");
    expect(paths).toContain("index.d.ts");
    expect(paths).toContain("generated/vmath.d.ts");
    expect(paths).toContain("generated/compute.d.ts");
    expect(paths).toContain("generated/versions/defold-1.12.4/camera.d.ts");
    expect(paths).toContain("generated/versions/defold-1.12.4/index.d.ts");
    expect(paths).toContain("src/index.ts");
    expect(paths).toContain("src/msg-overloads.d.ts");
    expect(paths).toContain("src/go-overloads.d.ts");
  });

  test("excludes tests, snapshots, and type-proofs", () => {
    for (const path of paths) {
      expect(path).not.toMatch(/\.test\.ts$/);
      expect(path).not.toMatch(/(^|\/)__snapshots__\//);
      expect(path).not.toMatch(/^test-d\//);
    }
  });

  // The shipped generator reads a registered target's documents from the
  // installed package, so those fixtures publish — `scripts/release-pack-proof.test.ts`
  // proves the set is complete. The rest of `fixtures/` is docs-only or
  // superseded input and stays repo-local, so the tarball does not carry it.
  test("ships the registered targets' fixtures and nothing else under fixtures/", () => {
    const shipped = paths.filter((path) => path.startsWith("fixtures/"));
    expect(shipped).toContain("fixtures/messages_doc.json");
    expect(shipped.some((path) => /^fixtures\/defold-[\d.]+\//.test(path))).toBe(true);
    for (const path of shipped) {
      expect(path).toMatch(/^fixtures\/(defold-[\d.]+\/.+|messages_doc\.json)$/);
    }
  });

  test("keeps the vendored engine binding sources and their tooling out of the tarball", () => {
    expect(paths.filter((path) => path.includes("/engine-bindings/"))).toEqual([]);
    expect(paths.filter((path) => path.includes("/engine-evidence/"))).toEqual([]);
    expect(paths).not.toContain("scripts/sync-engine-bindings.ts");
    expect(paths).not.toContain("scripts/engine-binding-extract.ts");
  });

  test("ships the on-the-fly generator and registry", () => {
    expect(paths).toContain("scripts/materialize-version.ts");
    expect(paths).toContain("scripts/regen.ts");
    expect(paths).toContain("scripts/doc-source.ts");
    expect(paths).toContain("scripts/sync-api-docs.ts");
    expect(paths).toContain("api-targets.json");
    expect(paths).toContain("url-parameters.json");
    for (const path of paths) {
      if (path.startsWith("scripts/")) {
        expect(path).not.toMatch(/\.test\.ts$/);
      }
    }
  });

  test("exports the url-parameters.json subpath", async () => {
    const manifest = await Bun.file(resolve(PKG_DIR, "package.json")).json();
    expect(manifest.exports?.["./url-parameters.json"]).toBe("./url-parameters.json");
  });

  test("ships every target reachable through exports", async () => {
    const manifest = await Bun.file(resolve(PKG_DIR, "package.json")).json();
    const targets = [...exportTargets(manifest.exports)];
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(paths).toContain(target);
    }
  });

  test("manifest opts into public publish access", async () => {
    const manifest = await Bun.file(resolve(PKG_DIR, "package.json")).json();
    expect(manifest.publishConfig?.access).toBe("public");
  });

  test("ships a README and LICENSE", () => {
    expect(paths).toContain("README.md");
    expect(paths).toContain("LICENSE");
  });

  test("declares the MIT license", async () => {
    const manifest = await Bun.file(resolve(PKG_DIR, "package.json")).json();
    expect(manifest.license).toBe("MIT");
  });
});

interface RegistryTarget {
  readonly fixturesDir: string;
  readonly source?: { readonly kind: string } | null;
  readonly modules?: readonly { readonly fixture: string }[];
  readonly editorModules?: readonly { readonly fixture: string }[];
}

const UNPUBLISHED_FIXTURE_SUBTREES = new Set(["engine-bindings", "engine-evidence", "annotations"]);

// Every regular file under `fixtures/defold-*/`, as a package-relative posix
// path, minus the subtrees the manifest negates.
function committedTargetFixtures(pkgDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!UNPUBLISHED_FIXTURE_SUBTREES.has(entry.name)) walk(abs);
      } else if (statSync(abs).isFile()) {
        out.push(relative(pkgDir, abs).split("\\").join("/"));
      }
    }
  };
  const fixtures = join(pkgDir, "fixtures");
  for (const entry of readdirSync(fixtures, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith("defold-")) walk(join(fixtures, entry.name));
  }
  return out.sort();
}

describe("@defold-typescript/types release packer", () => {
  buildCliRuntime(PKG_DIR);
  const npmPaths = npmPackedPaths(PKG_DIR);
  const bunPaths = packedPaths(PKG_DIR);

  test("ships the runtime entry and every document it reads at load", () => {
    for (const file of [
      "dist/cli-runtime.js",
      "scripts/cli-runtime.ts",
      "api-targets.json",
      "examples/translations.json",
      "url-parameters.json",
      "fixtures/messages_doc.json",
    ]) {
      expect(npmPaths).toContain(file);
    }
  });

  test("ships every fixture the committed registry targets declare", () => {
    const { targets } = JSON.parse(readFileSync(join(PKG_DIR, "api-targets.json"), "utf8")) as {
      targets: RegistryTarget[];
    };
    const committed = targets.filter((target) => (target.source ?? null) === null);
    expect(committed.length).toBeGreaterThan(0);
    for (const target of committed) {
      for (const module of [...(target.modules ?? []), ...(target.editorModules ?? [])]) {
        expect(npmPaths).toContain(`${target.fixturesDir}/${module.fixture}`);
      }
    }
  });

  test("ships every file under fixtures/defold-*/ outside the negated subtrees", () => {
    const onDisk = committedTargetFixtures(PKG_DIR);
    expect(onDisk.length).toBeGreaterThan(0);
    const shipped = new Set(npmPaths);
    expect(onDisk.filter((file) => !shipped.has(file))).toEqual([]);
    for (const subtree of UNPUBLISHED_FIXTURE_SUBTREES) {
      expect(npmPaths.filter((file) => file.includes(`/${subtree}/`))).toEqual([]);
    }
  });

  test("npm and bun list the same fixtures/ subset", () => {
    const fixturesOf = (paths: string[]): string[] =>
      paths.filter((file) => file.startsWith("fixtures/")).sort();
    expect(fixturesOf(npmPaths)).toEqual(fixturesOf(bunPaths));
  });
});
