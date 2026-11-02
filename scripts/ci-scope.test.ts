import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { localImports, PACKAGE_ROOT_MODULE, realDataTests, scopesOf } from "./ci-scope.ts";

const REPO_ROOT = join(import.meta.dir, "..");
const SCRIPT = join(import.meta.dir, "ci-scope.ts");
const SPAWN_TIMEOUT = 60_000;

const slash = (path: string): string => path.replaceAll("\\", "/");

function write(root: string, files: Record<string, string>): void {
  for (const [path, contents] of Object.entries(files)) {
    const out = join(root, path);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, contents);
  }
}

describe("scopesOf", () => {
  test("library data, its NOTICE and its LICENSE give the data scope", () => {
    expect(
      scopesOf([
        "packages/library-types/data/0.55.0/druid/library.json",
        "packages/library-types/NOTICE",
        "packages/library-types/LICENSE",
      ]),
    ).toEqual(["data"]);
  });

  test("library docs paths give the library-docs scope", () => {
    expect(
      scopesOf([
        "packages/library-docs/app/lib/api-content.ts",
        "packages/library-docs/package.json",
      ]),
    ).toEqual(["library-docs"]);
  });

  test("library data and library docs together give both", () => {
    expect(
      scopesOf([
        "packages/library-docs/vite.config.ts",
        "packages/library-types/data/0.55.0/a.json",
      ]),
    ).toEqual(["data", "library-docs"]);
  });

  test("any other path beside library data runs everything", () => {
    for (const other of [
      "packages/library-types/package.json",
      "packages/library-types/api-doc/druid.json",
      "packages/library-types/data-old/a.json",
      "packages/library-types/NOTICE.md",
      "packages/library-docs-legacy/a.ts",
      "packages/cli/src/bin.ts",
      "bun.lock",
      ".github/workflows/ci.yml",
      "README.md",
    ]) {
      expect(scopesOf(["packages/library-types/data/0.55.0/a.json", other])).toEqual(["full"]);
    }
  });

  test("an empty change runs everything", () => {
    expect(scopesOf([])).toEqual(["full"]);
  });
});

describe("realDataTests", () => {
  const root = mkdtempSync(join(tmpdir(), "ci-scope-real-data-"));
  write(root, {
    [PACKAGE_ROOT_MODULE]: 'export const LIBRARY_DATA_DIR = "data";\n',
    "packages/cli/src/library/helper.ts":
      'import { LIBRARY_DATA_DIR } from "./package-root";\nexport const dir = LIBRARY_DATA_DIR;\n',
    "packages/cli/src/library/deeper.ts": 'export { dir } from "./helper.ts";\n',
    "packages/cli/src/library/index.ts": 'export * from "./helper";\n',
    "packages/cli/src/other/package-root.ts": "export const x = 1;\n",
    "packages/cli/src/direct.test.ts":
      'import {\n  LIBRARY_DATA_DIR,\n} from "./library/package-root";\nconsole.log(LIBRARY_DATA_DIR);\n',
    "packages/cli/src/via-helper.test.ts":
      'import { dir } from "./library/deeper.js";\nconsole.log(dir);\n',
    "packages/cli/src/via-index.test.ts": 'import { dir } from "./library";\nconsole.log(dir);\n',
    "packages/cli/src/dynamic.test.ts":
      'const { LIBRARY_DATA_DIR } = await import("./library/package-root.ts");\nconsole.log(LIBRARY_DATA_DIR);\n',
    "packages/cli/src/loop-a.test.ts":
      'import "./loop-b.test.ts";\nimport { dir } from "./library/helper";\nconsole.log(dir);\n',
    "packages/cli/src/loop-b.test.ts": 'import "./loop-a.test.ts";\n',
    "scripts/cross.test.tsx":
      'import { LIBRARY_DATA_DIR } from "../packages/cli/src/library/package-root.ts";\nexport const el = <div>{LIBRARY_DATA_DIR}</div>;\n',
    "packages/cli/src/type-only.test.ts":
      'import type { LIBRARY_DATA_DIR } from "./library/package-root";\nexport type T = typeof LIBRARY_DATA_DIR;\n',
    "packages/cli/src/named-only.test.ts":
      'const graph: string[] = ["./library/package-root.ts"];\nconsole.log(graph);\n',
    "packages/cli/src/lookalike.test.ts":
      'import { x } from "./other/package-root";\nconsole.log(x);\n',
    "packages/cli/src/not-a-test.ts":
      'import { LIBRARY_DATA_DIR } from "./library/package-root";\nconsole.log(LIBRARY_DATA_DIR);\n',
    "node_modules/dep/vendored.test.ts":
      'import { LIBRARY_DATA_DIR } from "../../packages/cli/src/library/package-root";\nconsole.log(LIBRARY_DATA_DIR);\n',
  });

  test("lists exactly the tests that load package-root, directly or through other modules", () => {
    expect(realDataTests(root)).toEqual([
      "packages/cli/src/direct.test.ts",
      "packages/cli/src/dynamic.test.ts",
      "packages/cli/src/loop-a.test.ts",
      "packages/cli/src/loop-b.test.ts",
      "packages/cli/src/via-helper.test.ts",
      "packages/cli/src/via-index.test.ts",
      "scripts/cross.test.tsx",
    ]);
  });

  test("the CLI prints the list one per line for the working tree it runs in", () => {
    const proc = Bun.spawnSync([process.execPath, SCRIPT, "--real-data-tests"], { cwd: root });
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString()).toBe(`${realDataTests(root).join("\n")}\n`);
  });
});

// A file names the library data by path when it spells the data folder, or the
// package that holds it, as a path or as path segments.
const NAMES_LIBRARY_DATA =
  /packages[\s"',/\\]+library-types(?![\w-])|library-types[\s"',/\\]+data\b|\.\.[/\\]library-types(?![\w-])/;

// The scope rules spell the data folder to match changed paths, not to read it.
const SCOPE_RULE_FILES = new Set(["scripts/ci-scope.ts", "scripts/ci-scope.test.ts"]);

function repoTestFiles(): string[] {
  const listed = Bun.spawnSync(
    [
      "git",
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      "*.test.ts",
      "*.test.tsx",
    ],
    { cwd: REPO_ROOT },
  );
  expect(listed.exitCode).toBe(0);
  return listed.stdout
    .toString()
    .split("\0")
    .filter((path) => path !== "" && existsSync(join(REPO_ROOT, path)));
}

describe("this repo", () => {
  test("no file a test outside realDataTests loads names the library data by path", () => {
    const readers = new Set(realDataTests(REPO_ROOT));
    const importsOf = new Map<string, string[]>();
    const offenders: string[] = [];
    for (const testFile of repoTestFiles()) {
      if (readers.has(testFile)) continue;
      const seen = new Set<string>();
      const pending = [join(REPO_ROOT, testFile)];
      for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
        if (seen.has(file)) continue;
        seen.add(file);
        const rel = slash(relative(REPO_ROOT, file));
        if (rel === PACKAGE_ROOT_MODULE) continue;
        if (!SCOPE_RULE_FILES.has(rel) && NAMES_LIBRARY_DATA.test(readFileSync(file, "utf8"))) {
          offenders.push(rel === testFile ? testFile : `${testFile} -> ${rel}`);
        }
        let imports = importsOf.get(file);
        if (imports === undefined) {
          imports = localImports(file);
          importsOf.set(file, imports);
        }
        pending.push(...imports);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the CLI over a git history", () => {
  const repo = mkdtempSync(join(tmpdir(), "ci-scope-git-"));
  const git = (...args: string[]): string => {
    const proc = Bun.spawnSync(
      [
        "git",
        "-c",
        "user.name=ci-scope",
        "-c",
        "user.email=ci-scope@example.com",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd: repo },
    );
    if (proc.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${proc.stderr.toString()}`);
    return proc.stdout.toString().trim();
  };
  const commit = (message: string): string => {
    git("add", "-A");
    git("commit", "-q", "-m", message);
    return git("rev-parse", "HEAD");
  };
  const scopes = (base: string, head: string): string => {
    const proc = Bun.spawnSync([process.execPath, SCRIPT, "--base", base, "--head", head], {
      cwd: repo,
    });
    expect(proc.exitCode).toBe(0);
    return proc.stdout.toString();
  };

  git("init", "-q");
  const shared = '{ "moved": "this file keeps its content across the rename" }\n';
  write(repo, {
    "scripts/moved.json": shared,
    "packages/library-types/data/0.55.0/a.json": "{}\n",
    "packages/library-docs/app/page.ts": "export {};\n",
  });
  const start = commit("start");
  write(repo, { "packages/library-types/data/0.55.0/a.json": '{ "a": 1 }\n' });
  const dataOnly = commit("data");
  write(repo, { "packages/library-docs/app/page.ts": "export const page = 1;\n" });
  const docsOnly = commit("docs");
  renameSync(
    join(repo, "scripts/moved.json"),
    join(repo, "packages/library-types/data/0.55.0/moved.json"),
  );
  const renamedIn = commit("rename into data");
  write(repo, { "packages/library-types/data/0.55.0/café.json": "{}\n" });
  const unicode = commit("unicode name");

  test(
    "prints the scopes of the change between two commits",
    () => {
      expect(scopes(start, dataOnly)).toBe("scopes=data\n");
      expect(scopes(dataOnly, docsOnly)).toBe("scopes=library-docs\n");
      expect(scopes(start, docsOnly)).toBe("scopes=data,library-docs\n");
    },
    SPAWN_TIMEOUT,
  );

  test(
    "counts both paths of a rename, so a file moved into library data runs everything",
    () => {
      expect(scopes(docsOnly, renamedIn)).toBe("scopes=full\n");
    },
    SPAWN_TIMEOUT,
  );

  test(
    "reads a path with non-ASCII characters as written",
    () => {
      expect(scopes(renamedIn, unicode)).toBe("scopes=data\n");
    },
    SPAWN_TIMEOUT,
  );

  test(
    "runs everything when the base is all zeros or unknown to git",
    () => {
      expect(scopes("0".repeat(40), unicode)).toBe("scopes=full\n");
      expect(scopes("f".repeat(40), unicode)).toBe("scopes=full\n");
    },
    SPAWN_TIMEOUT,
  );
});
