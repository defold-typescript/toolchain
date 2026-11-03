import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type CheckRun, fetchCheckRuns, gateVerdict } from "./release-ci-gate.ts";

// Sorts a change's files into the CI scopes it needs. Only library data and the
// library docs site get a narrower scope: any other path, an empty change, or a
// base git cannot read runs everything. A release tag needs no scope when its
// commit already has the green full run the release gate accepts, and runs
// everything otherwise.

export type Scope = "data" | "library-docs" | "full";

export async function tagScopes(fetchRuns: () => Promise<CheckRun[]>): Promise<Scope[]> {
  try {
    return gateVerdict(await fetchRuns()).state === "pass" ? [] : ["full"];
  } catch {
    return ["full"];
  }
}

// The one module that names where real library data lives. A test reads that data
// exactly when it loads this module, directly or through other modules.
export const PACKAGE_ROOT_MODULE = "packages/cli/src/library/package-root.ts";

const DATA_PREFIX = "packages/library-types/data/";
const DATA_FILES = new Set(["packages/library-types/NOTICE", "packages/library-types/LICENSE"]);
const LIBRARY_DOCS_PREFIX = "packages/library-docs/";
const NARROW_SCOPES = ["data", "library-docs"] as const;

function scopeOf(path: string): Scope {
  if (path.startsWith(DATA_PREFIX) || DATA_FILES.has(path)) return "data";
  if (path.startsWith(LIBRARY_DOCS_PREFIX)) return "library-docs";
  return "full";
}

export function scopesOf(paths: readonly string[]): Scope[] {
  const scopes = new Set(paths.map(scopeOf));
  if (scopes.size === 0 || scopes.has("full")) return ["full"];
  return NARROW_SCOPES.filter((scope) => scopes.has(scope));
}

const TEST_FILE = /\.test\.tsx?$/;
const SKIPPED_DIRS = new Set(["node_modules", "dist"]);
const RELATIVE_SPECIFIER = /^\.\.?(\/|$)/;

const transpilers = {
  ts: new Bun.Transpiler({ loader: "ts" }),
  tsx: new Bun.Transpiler({ loader: "tsx" }),
  js: new Bun.Transpiler({ loader: "js" }),
};
const LOADERS: Record<string, keyof typeof transpilers> = {
  ".ts": "ts",
  ".mts": "ts",
  ".cts": "ts",
  ".tsx": "tsx",
  ".jsx": "tsx",
  ".js": "js",
  ".mjs": "js",
  ".cjs": "js",
};

function listTestFiles(root: string, dir = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = dir === "" ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!entry.name.startsWith(".") && !SKIPPED_DIRS.has(entry.name)) {
        found.push(...listTestFiles(root, path));
      }
    } else if (entry.isFile() && TEST_FILE.test(entry.name)) {
      found.push(path);
    }
  }
  return found.sort();
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function resolveLocal(from: string, specifier: string): string | undefined {
  if (!RELATIVE_SPECIFIER.test(specifier)) return undefined;
  const base = resolve(dirname(from), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  if (base.endsWith(".js")) candidates.push(`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`);
  return candidates.find(isFile);
}

// The files `file` loads by a relative specifier, as absolute paths. Type-only
// imports load nothing at run time, so they are left out.
export function localImports(file: string): string[] {
  const loader = LOADERS[extname(file)];
  if (loader === undefined) return [];
  return transpilers[loader].scanImports(readFileSync(file, "utf8")).flatMap(({ path }) => {
    const resolved = resolveLocal(file, path);
    return resolved === undefined ? [] : [resolved];
  });
}

// The test files under `root` that load PACKAGE_ROOT_MODULE, as sorted
// forward-slash paths relative to `root`.
export function realDataTests(root: string): string[] {
  const absoluteRoot = resolve(root);
  const tests = listTestFiles(absoluteRoot);
  const importersOf = new Map<string, string[]>();
  const seen = new Set<string>();
  const pending = tests.map((test) => join(absoluteRoot, test));
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    for (const imported of localImports(file)) {
      const importers = importersOf.get(imported);
      if (importers === undefined) importersOf.set(imported, [file]);
      else importers.push(file);
      pending.push(imported);
    }
  }
  const reaching = new Set<string>();
  const frontier = [join(absoluteRoot, PACKAGE_ROOT_MODULE)];
  for (let file = frontier.pop(); file !== undefined; file = frontier.pop()) {
    for (const importer of importersOf.get(file) ?? []) {
      if (reaching.has(importer)) continue;
      reaching.add(importer);
      frontier.push(importer);
    }
  }
  return tests.filter((test) => reaching.has(join(absoluteRoot, test)));
}

const ZERO_SHA = /^0+$/;

// Every path the change touches, both sides of a rename included; null when git
// cannot diff the two commits.
function changedPaths(base: string, head: string): string[] | null {
  if (ZERO_SHA.test(base)) return null;
  const diff = Bun.spawnSync(
    ["git", "diff", "--name-only", "--no-renames", "-z", base, head, "--"],
    { stderr: "ignore" },
  );
  if (diff.exitCode !== 0) return null;
  return diff.stdout
    .toString()
    .split("\0")
    .filter((path) => path !== "");
}

const USAGE =
  "usage: ci-scope.ts --base <sha> --head <sha> | --tag --repo <owner/name> --sha <commit> | --real-data-tests";

async function main(argv: string[]): Promise<number> {
  let values: {
    base?: string;
    head?: string;
    tag?: boolean;
    repo?: string;
    sha?: string;
    "real-data-tests"?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        base: { type: "string" },
        head: { type: "string" },
        tag: { type: "boolean" },
        repo: { type: "string" },
        sha: { type: "string" },
        "real-data-tests": { type: "boolean" },
      },
    }));
  } catch {
    console.error(USAGE);
    return 2;
  }
  const { repo, sha } = values;
  if (values.tag) {
    const diffOrList =
      values.base !== undefined || values.head !== undefined || values["real-data-tests"];
    if (diffOrList || repo === undefined || sha === undefined) {
      console.error(USAGE);
      return 2;
    }
    console.log(`scopes=${(await tagScopes(() => fetchCheckRuns(repo, sha))).join(",")}`);
    return 0;
  }
  if (repo !== undefined || sha !== undefined) {
    console.error(USAGE);
    return 2;
  }
  if (values["real-data-tests"] && values.base === undefined && values.head === undefined) {
    for (const test of realDataTests(process.cwd())) console.log(test);
    return 0;
  }
  if (values["real-data-tests"] || values.base === undefined || values.head === undefined) {
    console.error(USAGE);
    return 2;
  }
  const paths = changedPaths(values.base, values.head);
  console.log(`scopes=${(paths === null ? ["full"] : scopesOf(paths)).join(",")}`);
  return 0;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
