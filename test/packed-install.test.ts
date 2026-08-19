import { afterAll, describe, expect, test } from "bun:test";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import * as path from "node:path";
import { iterateTarEntries } from "../scripts/release-pack-proof";
import {
  installLinkPreflight,
  type LinkedDependencyRoot,
  linkThirdPartyDeps,
  packageDir,
  REPO_ROOT,
} from "./packed-install-links";

// Building and packing three workspaces, then cold-spawning `node`, costs far
// more than the sibling `release-bin-smoke` spawns that already needed 30s of
// headroom on the Windows runner.
const PACKED_INSTALL_TIMEOUT_MS = 180_000;

const BUILT_PACKAGES = ["transpiler", "cli"] as const;
const PACKED_PACKAGES = ["types", "transpiler", "cli"] as const;
const BUILT_ENTRIES = ["bin.js", "index.js"] as const;

function run(cmd: string[], cwd: string): { code: number; output: string } {
  const proc = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: proc.exitCode, output: `${proc.stdout.toString()}${proc.stderr.toString()}` };
}

function build(pkg: string): void {
  const { code, output } = run(["bun", "run", "build"], packageDir(pkg));
  if (code !== 0) throw new Error(`bun run build failed for ${pkg}:\n${output}`);
}

function pack(pkg: string, destination: string): string {
  const dir = packageDir(pkg);
  const { code, output } = run(["bun", "pm", "pack", "--destination", destination], dir);
  if (code !== 0) throw new Error(`bun pm pack failed for ${pkg}:\n${output}`);
  const line = output
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.endsWith(".tgz"));
  if (!line) throw new Error(`could not locate the ${pkg} tarball:\n${output}`);
  return path.isAbsolute(line) ? line : path.join(dir, line);
}

// npm/bun tarballs root every entry at `package/`; an installed tree drops that
// segment, so strip it rather than nesting the whole package one level deep.
function extractTarball(tarball: string, into: string): void {
  const tar = Bun.gunzipSync(new Uint8Array(readFileSync(tarball)));
  for (const entry of iterateTarEntries(tar)) {
    const prefix = "package/";
    if (!entry.name.startsWith(prefix)) continue;
    const target = path.join(into, entry.name.slice(prefix.length));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, entry.data);
  }
}

function staticDefoldSpecifiers(file: string): string[] {
  const source = readFileSync(file, "utf8").replace(/^#![^\n]*\n/, "");
  const scanner = new Bun.Transpiler({ loader: "js" });
  const paths = scanner
    .scanImports(source)
    .filter((entry) => entry.kind === "import-statement")
    .map((entry) => entry.path)
    .filter((specifier) => specifier.startsWith("@defold-typescript/"));
  return [...new Set(paths)].sort();
}

describe("a packed install runs under plain node", () => {
  // The consumer lives under the repo's gitignored `node_modules` so node's
  // parent-directory walk supplies the third-party runtime deps (`typescript`,
  // `typescript-to-lua`) with no network and no install step, while every
  // `@defold-typescript/*` package is a REAL extracted directory. The workspace
  // symlink is precisely what hides this class of defect: through it a
  // specifier's realpath escapes `node_modules`, where node would otherwise
  // refuse to strip types.
  const consumer = mkdtempSync(path.join(REPO_ROOT, "node_modules", ".packed-install-"));
  const tarballs = mkdtempSync(path.join(REPO_ROOT, "node_modules", ".packed-tarballs-"));
  const cliDist = path.join(consumer, "node_modules", "@defold-typescript", "cli", "dist");

  const linkedDependencyRoots: LinkedDependencyRoot[] = [];
  for (const pkg of BUILT_PACKAGES) build(pkg);
  for (const pkg of PACKED_PACKAGES) {
    const installed = path.join(consumer, "node_modules", "@defold-typescript", pkg);
    extractTarball(pack(pkg, tarballs), installed);
    linkedDependencyRoots.push(...linkThirdPartyDeps(pkg, installed));
  }

  afterAll(() => {
    rmSync(consumer, { recursive: true, force: true });
    rmSync(tarballs, { recursive: true, force: true });
  });

  installLinkPreflight(linkedDependencyRoots);

  test(
    "the published bin loads and prints its usage banner",
    () => {
      const { code, output } = run(["node", path.join(cliDist, "bin.js"), "--help"], consumer);

      expect(output).not.toContain("ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING");
      expect(output).toContain("Usage: bunx @defold-typescript/cli");
      expect(code).toBe(0);
    },
    PACKED_INSTALL_TIMEOUT_MS,
  );

  test(
    "every static top-level @defold-typescript specifier resolves to JavaScript",
    () => {
      const specifiers = [
        ...new Set(
          BUILT_ENTRIES.flatMap((entry) => staticDefoldSpecifiers(path.join(cliDist, entry))),
        ),
      ].sort();
      // A scan that silently found nothing would green this test while proving
      // nothing; the built bin always keeps at least one sibling external.
      expect(specifiers.length).toBeGreaterThan(0);

      // The probe sits beside `bin.js` so `import.meta.resolve` runs from the
      // exact resolution base the shipped entry points do.
      const probe = path.join(cliDist, "resolve-probe.mjs");
      writeFileSync(
        probe,
        `const resolved = {};\n` +
          `for (const specifier of ${JSON.stringify(specifiers)}) {\n` +
          `  resolved[specifier] = import.meta.resolve(specifier);\n` +
          `}\n` +
          `console.log(JSON.stringify(resolved));\n`,
      );
      const { code, output } = run(["node", probe], consumer);
      if (code !== 0) throw new Error(`resolution probe exited ${code}:\n${output}`);

      const resolved = JSON.parse(output.trim()) as Record<string, string>;
      expect(Object.keys(resolved).sort()).toEqual(specifiers);
      for (const [specifier, target] of Object.entries(resolved)) {
        expect(`${specifier} -> ${target}`).not.toMatch(/\.ts$/);
      }
    },
    PACKED_INSTALL_TIMEOUT_MS,
  );
  test("every linked dependency root reaches a real directory in one hop", () => {
    for (const root of linkedDependencyRoots) {
      expect(`${root.specifier} link exists`).toBe(
        `${root.specifier} ${lstatSync(root.link) ? "link exists" : ""}`,
      );
      expect(`${root.specifier} -> ${realpathSync(root.link)}`).toBe(
        `${root.specifier} -> ${root.target}`,
      );
      expect(`${root.specifier} target is real`).toBe(
        `${root.specifier} ${realpathSync(root.target) === root.target ? "target is real" : "target is itself a link"}`,
      );
    }
  });

  test("scoped dependencies are linked at @scope/name, and @defold-typescript stays real", () => {
    const scoped = linkedDependencyRoots.filter((root) => root.specifier.startsWith("@"));
    expect(scoped.length).toBeGreaterThan(0);
    for (const root of scoped) {
      expect(`${root.specifier} has ${root.specifier.split("/").length} segment(s)`).toBe(
        `${root.specifier} has 2 segment(s)`,
      );
    }

    expect(
      linkedDependencyRoots.filter((root) => root.specifier.startsWith("@defold-typescript")),
    ).toEqual([]);
    for (const pkg of PACKED_PACKAGES) {
      const installed = path.join(consumer, "node_modules", "@defold-typescript", pkg);
      expect(`${pkg} is a real directory: ${!lstatSync(installed).isSymbolicLink()}`).toBe(
        `${pkg} is a real directory: true`,
      );
    }
  });
});
