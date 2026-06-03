import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { CURRENT_STABLE_DEFOLD_VERSION } from "./defold-version";
import {
  detectScriptKinds,
  type ScriptKind,
  selectScriptKind,
  selectScriptKindEntrypoint,
} from "./script-kind";

export interface RunInitOptions {
  readonly cwd: string;
  readonly force?: boolean;
}

export interface RunInitResult {
  readonly written: string[];
  readonly scriptKind: ScriptKind | null;
}

const CONFLICTING_TS_CONFIGS = [
  "tsconfig.json",
  "defold-typescript.config.ts",
  "defold-typescript.config.mts",
  "defold-typescript.config.js",
];

const TSCONFIG_COMPILER_OPTIONS = {
  target: "ES2022",
  module: "ESNext",
  moduleResolution: "Bundler",
  lib: ["ES2022"],
  strict: true,
  skipLibCheck: true,
};

const GITIGNORE_LINES = ["src/**/*.lua", "src/**/*.lua.map"];

const BIOME_JSON_CONTENT = {
  $schema: "https://biomejs.dev/schemas/2.4.15/schema.json",
  files: {
    includes: ["src/**/*.ts", "!**/dist", "!**/node_modules", "!**/*.lua"],
  },
  formatter: {
    enabled: true,
    indentStyle: "space",
    indentWidth: 2,
    lineWidth: 100,
  },
  linter: {
    enabled: true,
    rules: {
      recommended: true,
      style: {
        useImportType: "error",
        useNodejsImportProtocol: "error",
      },
      correctness: {
        noUnusedImports: "error",
        noUnusedVariables: "warn",
      },
    },
  },
  javascript: {
    formatter: {
      quoteStyle: "double",
      semicolons: "always",
      trailingCommas: "all",
      arrowParentheses: "always",
    },
  },
};

const MAIN_TS_CONTENT = `export function init(): void {
  const start = vmath.vector3(0, 0, 0);
  msg.post("main:/hero", "spawn", { start });
}
`;

const MAIN_SCRIPT_CONTENT = `function init(self) end
function update(self, dt) end
function on_message(self, message_id, message, sender) end
function final(self) end
`;

const MAIN_COLLECTION_CONTENT = `name: "main"
scale_along_z: 0
embedded_instances {
  id: "main"
  data: "components {\\n  id: \\"main\\"\\n  component: \\"/main/main.script\\"\\n}\\n"
  position { x: 0.0 y: 0.0 z: 0.0 }
  rotation { x: 0.0 y: 0.0 z: 0.0 w: 1.0 }
  scale3 { x: 1.0 y: 1.0 z: 1.0 }
}
`;

interface PackageJson {
  name?: string;
  version?: string;
  type?: string;
  devDependencies?: Record<string, string>;
  "defold-typescript"?: { "defold-version"?: string };
  [key: string]: unknown;
}

function typesVersionSpec(): string {
  try {
    // Anchor on the module URL, not `import.meta.dir` — the latter is a
    // Bun-only property and is undefined when the bundled CLI runs under node
    // (the `npx` path), which would silently fall back to "latest".
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(path.join(here, "..", "package.json"), "utf8")) as {
      version?: string;
    };
    return pkg.version ? `^${pkg.version}` : "latest";
  } catch {
    return "latest";
  }
}

// Only @defold-typescript/types ships into the consumer (type-only, for the
// editor). The transpiler is a dependency of the CLI itself, pulled in when the
// user runs `build`/`watch`; the scaffold must not duplicate it. Pin types to
// this CLI's own version so the coordinated-release set stays in lockstep.
const SCAFFOLD_DEV_DEPS: Record<string, string> = {
  "@defold-typescript/types": typesVersionSpec(),
  "@biomejs/biome": "^2.2.0",
};

// Older scaffolds wrote both managed `@defold-typescript/*` devDeps as
// `workspace:*`, which only resolves inside this monorepo and breaks
// `bun install` in consumers. The additive merge in `writeTsSurface` never
// repairs an entry it didn't itself create, so repair them explicitly: the
// transpiler is CLI-internal and must not be a consumer dep at all, and a
// `workspace:` types pin must become a concrete published version. A concrete
// user-chosen types pin is left alone.
function repairManagedDevDeps(devDeps: Record<string, string>): void {
  delete devDeps["@defold-typescript/transpiler"];
  if (devDeps["@defold-typescript/types"]?.startsWith("workspace:")) {
    devDeps["@defold-typescript/types"] = typesVersionSpec();
  }
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeGitignore(cwd: string): void {
  const gitignorePath = path.join(cwd, ".gitignore");
  if (existsSync(gitignorePath)) {
    const existing = readFileSync(gitignorePath, "utf8");
    const present = new Set(existing.split("\n").map((line) => line.trim()));
    const missing = GITIGNORE_LINES.filter((line) => !present.has(line));
    if (missing.length === 0) {
      return;
    }
    const prefix = existing.endsWith("\n") || existing === "" ? "" : "\n";
    writeFileSync(gitignorePath, `${existing}${prefix}${missing.join("\n")}\n`);
  } else {
    writeFileSync(gitignorePath, `${GITIGNORE_LINES.join("\n")}\n`);
  }
}

function writeBiome(cwd: string, written: string[]): void {
  const biomePath = path.join(cwd, "biome.json");
  if (existsSync(biomePath)) {
    return;
  }
  writeJson(biomePath, BIOME_JSON_CONTENT);
  written.push("biome.json");
}

function writeTsSurface(cwd: string, written: string[]): ScriptKind | null {
  mkdirSync(path.join(cwd, "src"), { recursive: true });
  writeFileSync(path.join(cwd, "src", "main.ts"), MAIN_TS_CONTENT);
  written.push("src/main.ts");

  const kinds = detectScriptKinds(cwd);
  const tsconfig = {
    compilerOptions: {
      ...TSCONFIG_COMPILER_OPTIONS,
      types: [selectScriptKindEntrypoint(kinds)],
    },
    include: ["src/**/*.ts"],
  };
  writeJson(path.join(cwd, "tsconfig.json"), tsconfig);
  written.push("tsconfig.json");

  const pkgPath = path.join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    const existing = JSON.parse(readFileSync(pkgPath, "utf8")) as PackageJson;
    const devDeps = { ...(existing.devDependencies ?? {}) };
    for (const [name, version] of Object.entries(SCAFFOLD_DEV_DEPS)) {
      if (!(name in devDeps)) {
        devDeps[name] = version;
      }
    }
    repairManagedDevDeps(devDeps);
    existing.devDependencies = devDeps;
    existing["defold-typescript"] ??= { "defold-version": CURRENT_STABLE_DEFOLD_VERSION };
    writeJson(pkgPath, existing);
  } else {
    const fresh: PackageJson = {
      name: path.basename(cwd),
      version: "0.0.0",
      type: "module",
      devDependencies: { ...SCAFFOLD_DEV_DEPS },
      "defold-typescript": { "defold-version": CURRENT_STABLE_DEFOLD_VERSION },
    };
    writeJson(pkgPath, fresh);
  }
  written.push("package.json");

  writeGitignore(cwd);
  written.push(".gitignore");

  writeBiome(cwd, written);

  return selectScriptKind(kinds);
}

export function runNewProjectInit(cwd: string, force = false): RunInitResult {
  if (!existsSync(cwd)) {
    mkdirSync(cwd, { recursive: true });
  } else if (readdirSync(cwd).length > 0 && !force) {
    throw new Error(
      `defold-typescript init: refusing to synthesize a new Defold project into non-empty directory ${cwd}. Pass --force to proceed.`,
    );
  }

  const written: string[] = [];

  writeFileSync(
    path.join(cwd, "game.project"),
    `[project]\ntitle = ${path.basename(cwd)}\nmain_collection = /main/main.collectionc\n`,
  );
  written.push("game.project");

  mkdirSync(path.join(cwd, "main"), { recursive: true });
  writeFileSync(path.join(cwd, "main", "main.collection"), MAIN_COLLECTION_CONTENT);
  written.push("main/main.collection");
  writeFileSync(path.join(cwd, "main", "main.script"), MAIN_SCRIPT_CONTENT);
  written.push("main/main.script");

  const scriptKind = writeTsSurface(cwd, written);

  return { written, scriptKind };
}

export function runInit(opts: RunInitOptions): RunInitResult {
  const { cwd, force = false } = opts;

  if (!existsSync(path.join(cwd, "game.project"))) {
    return runNewProjectInit(cwd, force);
  }

  if (!force) {
    for (const rel of CONFLICTING_TS_CONFIGS) {
      if (existsSync(path.join(cwd, rel))) {
        throw new Error(
          `defold-typescript init: refusing to overwrite existing TS config: ${rel}. Pass --force to overwrite.`,
        );
      }
    }
  }

  const written: string[] = [];
  const scriptKind = writeTsSurface(cwd, written);
  return { written, scriptKind };
}
