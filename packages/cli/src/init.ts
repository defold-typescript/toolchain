import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ScriptHookName } from "@defold-typescript/types";
import { DEBUG_LAUNCHER_SOURCE, debugLaunchConfig, VSCODE_LAUNCH_CONTENT } from "./debug-launcher";
import { CURRENT_STABLE_DEFOLD_VERSION } from "./defold-version";
import { formatJsonLikeBiome } from "./format-json";
import { mergeMiseToml } from "./mise-scaffold";
import { DEFAULT_TYPES_ENTRYPOINT } from "./script-kind";
import { mergeVscodeTasks, VSCODE_TASKS_CONTENT } from "./vscode-tasks";

export interface RunInitOptions {
  readonly cwd: string;
  readonly force?: boolean;
  readonly template?: string;
}

export interface RunInitResult {
  readonly written: string[];
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

const GITIGNORE_LINES = [
  "node_modules",
  // `.vscode/defold-debug.ts` downloads the Defold engine binary beside itself
  // (`.vscode/dmengine`, `.vscode/dmengine.exe`); keep the multi-MB binary out of git.
  ".vscode/dmengine*",
  "src/**/*.ts.script",
  "src/**/*.ts.script.map",
  "src/**/*.ts.gui_script",
  "src/**/*.ts.gui_script.map",
  "src/**/*.ts.render_script",
  "src/**/*.ts.render_script.map",
  "src/**/*.lua",
  "src/**/*.lua.map",
];

export const BIOME_JSON_CONTENT = {
  $schema: "https://biomejs.dev/schemas/2.4.15/schema.json",
  files: {
    includes: [
      "src/**/*.ts",
      "!**/dist",
      "!**/node_modules",
      "!**/*.ts.script",
      "!**/*.ts.gui_script",
      "!**/*.ts.render_script",
      "!src/**/*.lua",
      "!src/**/*.lua.map",
    ],
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
      suspicious: {
        noDoubleEquals: "off",
      },
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

const VSCODE_EXTENSIONS_CONTENT = {
  recommendations: ["tomblind.local-lua-debugger-vscode"],
  unwantedRecommendations: ["johnnymorganz.luau-lsp"],
};

const MANAGED_RECOMMENDATIONS = [
  "tomblind.local-lua-debugger-vscode",
  "sumneko.lua",
  "astronachos.defold",
];
const MANAGED_UNWANTED = ["johnnymorganz.luau-lsp"];

const VSCODE_SETTINGS_CONTENT = {
  "Lua.workspace.ignoreDir": ["src"],
};

interface VscodeSnippet {
  scope: string;
  prefix: string;
  body: string[];
  description: string;
}

// One learn-more comment and one parameter list per lifecycle hook, keyed by
// `ScriptHookName` so a hook added to the types fails to compile here until both
// maps gain an entry (`satisfies` exhaustiveness — the type is derived from the
// canonical `SCRIPT_HOOK_NAMES`). The hook list is read off these keys rather
// than imported as a runtime value: the types package is type-only and not
// node-ESM-runnable, so the CLI bundle must not resolve it at runtime. `init` is
// special-cased by the body builders: it carries the return placeholder, so
// the `hookLines` walker skips it and writes the line itself with the typed
// return annotation. The `HOOK_SIGNATURES.init` entry is still required for
// the `satisfies` exhaustiveness check; the walker does not consume it, but
// the table documents the parameter list for readers.
const HOOK_COMMENTS = {
  init: "Initialize the component and return its state.",
  update: "Update the component every frame; `dt` is the time step.",
  fixed_update: "Update at the fixed physics time step.",
  late_update: "Update every frame after `update`.",
  on_message: "Handle an incoming message.",
  on_input: "Handle input once input focus is acquired.",
  final: "Clean up when the component is deleted.",
  on_reload: "React to a hot reload of this script.",
} satisfies Record<ScriptHookName, string>;

const HOOK_SIGNATURES = {
  init: "self",
  update: "self, dt",
  fixed_update: "self, dt",
  late_update: "self, dt",
  on_message: "self, message_id, message, sender",
  on_input: "self, action_id, action",
  final: "self",
  on_reload: "self",
} satisfies Record<ScriptHookName, string>;

const SNIPPET_HOOK_ORDER = Object.keys(HOOK_SIGNATURES) as ScriptHookName[];

// Emit every hook except `init` (the caller writes it with its return
// placeholder) and any hook in `omit` as a commented `name(sig) {$N},` line.
// `omit` tracks each kind's narrowed hook type: render omits `on_input`
// (`RenderScriptHooks`), gui omits `fixed_update`/`late_update` (`GuiScriptHooks`).
// Tab stops run sequentially from `startTabStop` across the hooks actually emitted.
function hookLines(omit: ReadonlySet<ScriptHookName>, startTabStop: number): string[] {
  const lines: string[] = [];
  let tabStop = startTabStop;
  for (const hook of SNIPPET_HOOK_ORDER) {
    if (hook === "init" || omit.has(hook)) {
      continue;
    }
    lines.push(`  // ${HOOK_COMMENTS[hook]}`);
    lines.push(`  ${hook}(${HOOK_SIGNATURES[hook]}) {$${tabStop}},`);
    tabStop += 1;
  }
  return lines;
}

// Whole-file TS scaffolds mirroring the Defold editor's empty script/gui/render
// templates over the lifecycle factories. Two self-typing variants per kind:
// inline-self (TSelf inferred from `init`'s return) and typed-self (an explicit
// dummy `Self` placeholder). Hook order mirrors the Lua templates; each kind's
// `omit` set drops the hooks its narrowed type rejects (render `on_input`, gui
// `fixed_update`/`late_update`). The final `$0` lands inside `init`.
function inlineSnippetBody(factory: string, omit: ReadonlySet<ScriptHookName>): string[] {
  return [
    `import { ${factory} } from "@defold-typescript/types";`,
    "",
    `export default ${factory}({`,
    `  // ${HOOK_COMMENTS.init}`,
    "  init(self) {",
    "    return { $0 };",
    "  },",
    ...hookLines(omit, 1),
    "});",
  ];
}

function typedSnippetBody(factory: string, omit: ReadonlySet<ScriptHookName>): string[] {
  return [
    `import { ${factory} } from "@defold-typescript/types";`,
    "",
    "type Self = {",
    "  // Your script's state type.",
    "  $1",
    "};",
    "",
    `export default ${factory}<Self>({`,
    `  // ${HOOK_COMMENTS.init}`,
    "  init(self): Self {",
    "    return { $0 };",
    "  },",
    ...hookLines(omit, 2),
    "});",
  ];
}

const NO_OMIT: ReadonlySet<ScriptHookName> = new Set();
const GUI_OMIT: ReadonlySet<ScriptHookName> = new Set(["fixed_update", "late_update"]);
const RENDER_OMIT: ReadonlySet<ScriptHookName> = new Set(["on_input"]);

const VSCODE_SNIPPETS_CONTENT: Record<string, VscodeSnippet> = {
  "Defold script (inferred self)": {
    scope: "typescript",
    prefix: "defold-script",
    body: inlineSnippetBody("defineScript", NO_OMIT),
    description: "Empty Defold script; state inferred from init's return.",
  },
  "Defold script (typed self)": {
    scope: "typescript",
    prefix: "defold-script-typed",
    body: typedSnippetBody("defineScript", NO_OMIT),
    description: "Empty Defold script with an explicit Self type.",
  },
  "Defold GUI script (inferred self)": {
    scope: "typescript",
    prefix: "defold-gui",
    body: inlineSnippetBody("defineGuiScript", GUI_OMIT),
    description: "Empty Defold GUI script; state inferred from init's return.",
  },
  "Defold GUI script (typed self)": {
    scope: "typescript",
    prefix: "defold-gui-typed",
    body: typedSnippetBody("defineGuiScript", GUI_OMIT),
    description: "Empty Defold GUI script with an explicit Self type.",
  },
  "Defold render script (inferred self)": {
    scope: "typescript",
    prefix: "defold-render",
    body: inlineSnippetBody("defineRenderScript", RENDER_OMIT),
    description: "Empty Defold render script; state inferred from init's return.",
  },
  "Defold render script (typed self)": {
    scope: "typescript",
    prefix: "defold-render-typed",
    body: typedSnippetBody("defineRenderScript", RENDER_OMIT),
    description: "Empty Defold render script with an explicit Self type.",
  },
};

const MAIN_TS_CONTENT = `import { defineScript } from "@defold-typescript/types";

export default defineScript({
  init() {
    const start = vmath.vector3(0, 0, 0);
    return { start };
  },
});
`;

const MAIN_TS_MINIMAL = `import { defineScript } from "@defold-typescript/types";

export default defineScript({
  init() {
    return {};
  },
});
`;

export const INIT_TEMPLATE_NAMES = ["default", "minimal"] as const;
export type InitTemplate = (typeof INIT_TEMPLATE_NAMES)[number];
const DEFAULT_INIT_TEMPLATE: InitTemplate = "default";

// A template varies only the synthesized entry script; the shared TS surface
// (tsconfig, package.json, .vscode, …) is template-independent.
const TEMPLATE_MAIN_TS: Record<InitTemplate, string> = {
  default: MAIN_TS_CONTENT,
  minimal: MAIN_TS_MINIMAL,
};

function resolveTemplate(template: string | undefined): InitTemplate {
  if (template === undefined) {
    return DEFAULT_INIT_TEMPLATE;
  }
  if ((INIT_TEMPLATE_NAMES as readonly string[]).includes(template)) {
    return template as InitTemplate;
  }
  throw new Error(
    `defold-typescript init: unknown template "${template}". Valid templates: ${INIT_TEMPLATE_NAMES.join(", ")}.`,
  );
}

const MAIN_COLLECTION_CONTENT = `name: "main"
scale_along_z: 0
embedded_instances {
  id: "main"
  data: "components {\\n  id: \\"main\\"\\n  component: \\"/src/main.ts.script\\"\\n}\\n"
  position { x: 0.0 y: 0.0 z: 0.0 }
  rotation { x: 0.0 y: 0.0 z: 0.0 w: 1.0 }
  scale3 { x: 1.0 y: 1.0 z: 1.0 }
}
`;

// Empty binding (zero triggers): the starter src/main.ts reads no input; it
// exists only so the default game_binding reference resolves at build time.
const GAME_INPUT_BINDING_CONTENT = "\n";

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

// @defold-typescript/types (type-only, for the editor) and @defold-typescript/cli
// (the local bin the managed `bunx @defold-typescript/cli` mise tasks resolve
// inside an installed project) both ship into the consumer. The transpiler must NOT be a direct
// consumer dep — it arrives transitively through the CLI. Pin both managed deps
// to this CLI's own version so the coordinated-release set stays in lockstep.
export const SCAFFOLD_DEV_DEPS: Record<string, string> = {
  "@defold-typescript/types": typesVersionSpec(),
  "@defold-typescript/cli": typesVersionSpec(),
  "@defold-typescript/tstl-plugin": typesVersionSpec(),
  "@biomejs/biome": "^2.2.0",
  // The `.vscode/defold-debug.ts` launcher is a Bun script importing `node:fs`/
  // `node:path` and using `Bun.*`/`process`/`fetch`; `@types/bun` resolves those
  // (it pulls in `@types/node`). The project tsconfig pins `types` to
  // `@defold-typescript/types`, so these never leak into the `src/` Defold compile.
  "@types/bun": "latest",
};

// Older scaffolds wrote the managed `@defold-typescript/*` devDeps as
// `workspace:*`, which only resolves inside this monorepo and breaks
// `bun install` in consumers. The additive merge in `writeTsSurface` never
// repairs an entry it didn't itself create, so repair them explicitly: the
// transpiler is CLI-internal and must not be a consumer dep at all, and a
// `workspace:` types/cli pin must become a concrete published version. A
// concrete user-chosen pin is left alone unless `force` is set, the explicit
// opt-in to refresh the managed pins (and only those) to the CLI's version.
function repairManagedDevDeps(devDeps: Record<string, string>, force = false): void {
  delete devDeps["@defold-typescript/transpiler"];
  for (const name of [
    "@defold-typescript/types",
    "@defold-typescript/cli",
    "@defold-typescript/tstl-plugin",
  ]) {
    if (force || devDeps[name]?.startsWith("workspace:")) {
      devDeps[name] = typesVersionSpec();
    }
  }
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${formatJsonLikeBiome(value)}\n`);
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

function writeMiseTasks(cwd: string, written: string[]): void {
  const misePath = path.join(cwd, "mise.toml");
  const existing = existsSync(misePath) ? readFileSync(misePath, "utf8") : undefined;
  writeFileSync(misePath, mergeMiseToml(existing));
  written.push("mise.toml");
}

// Strip `//` line comments, `/* */` block comments, and trailing commas so a
// hand-edited JSONC `.vscode` file parses with `JSON.parse`. The walk tracks
// string state so a `//` or comma inside a value (e.g. a URL) is preserved.
function parseJsonc(text: string): unknown {
  let out = "";
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        out += ch;
      }
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === "/" && next === "/") {
      inLineComment = true;
      i++;
    } else if (ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
    } else {
      out += ch;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unionStrings(existing: unknown, additions: readonly string[]): string[] {
  const out = Array.isArray(existing)
    ? existing.filter((v): v is string => typeof v === "string")
    : [];
  for (const value of additions) {
    if (!out.includes(value)) {
      out.push(value);
    }
  }
  return out;
}

export function reconcileManagedList(
  existing: unknown,
  managed: readonly string[],
  canonical: readonly string[],
): string[] {
  const managedSet = new Set(managed);
  const canonicalSet = new Set(canonical);
  const out: string[] = [];
  const values = Array.isArray(existing)
    ? existing.filter((value): value is string => typeof value === "string")
    : [];
  for (const value of values) {
    if (out.includes(value)) {
      continue;
    }
    if (managedSet.has(value) && !canonicalSet.has(value)) {
      continue;
    }
    out.push(value);
  }
  for (const value of canonical) {
    if (!out.includes(value)) {
      out.push(value);
    }
  }
  return out;
}

function readVscodeJson(filePath: string): Record<string, unknown> | null {
  try {
    const parsed = parseJsonc(readFileSync(filePath, "utf8"));
    return isJsonObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeVscodeExtensions(cwd: string, written: string[]): void {
  const dir = path.join(cwd, ".vscode");
  const filePath = path.join(dir, "extensions.json");
  if (existsSync(filePath)) {
    const existing = readVscodeJson(filePath);
    if (existing === null) {
      return;
    }
    const before = JSON.stringify(existing);
    existing.recommendations = reconcileManagedList(
      existing.recommendations,
      MANAGED_RECOMMENDATIONS,
      VSCODE_EXTENSIONS_CONTENT.recommendations,
    );
    existing.unwantedRecommendations = reconcileManagedList(
      existing.unwantedRecommendations,
      MANAGED_UNWANTED,
      VSCODE_EXTENSIONS_CONTENT.unwantedRecommendations,
    );
    if (JSON.stringify(existing) !== before) {
      writeJson(filePath, existing);
    }
    return;
  }
  mkdirSync(dir, { recursive: true });
  writeJson(filePath, VSCODE_EXTENSIONS_CONTENT);
  written.push(".vscode/extensions.json");
}

function writeVscodeSettings(cwd: string, written: string[]): void {
  const dir = path.join(cwd, ".vscode");
  const filePath = path.join(dir, "settings.json");
  if (existsSync(filePath)) {
    const existing = readVscodeJson(filePath);
    if (existing === null) {
      return;
    }
    existing["Lua.workspace.ignoreDir"] = unionStrings(
      existing["Lua.workspace.ignoreDir"],
      VSCODE_SETTINGS_CONTENT["Lua.workspace.ignoreDir"],
    );
    writeJson(filePath, existing);
    return;
  }
  mkdirSync(dir, { recursive: true });
  writeJson(filePath, VSCODE_SETTINGS_CONTENT);
  written.push(".vscode/settings.json");
}

function writeVscodeSnippets(cwd: string, written: string[]): void {
  const dir = path.join(cwd, ".vscode");
  const filePath = path.join(dir, "defold-typescript.code-snippets");
  if (existsSync(filePath)) {
    const existing = readVscodeJson(filePath);
    if (existing === null) {
      return;
    }
    for (const [key, snippet] of Object.entries(VSCODE_SNIPPETS_CONTENT)) {
      if (!(key in existing)) {
        existing[key] = snippet;
      }
    }
    writeJson(filePath, existing);
    return;
  }
  mkdirSync(dir, { recursive: true });
  writeJson(filePath, VSCODE_SNIPPETS_CONTENT);
  written.push(".vscode/defold-typescript.code-snippets");
}

function writeVscodeLaunch(cwd: string, written: string[]): void {
  const dir = path.join(cwd, ".vscode");
  const filePath = path.join(dir, "launch.json");
  const ours = debugLaunchConfig();
  if (existsSync(filePath)) {
    const existing = readVscodeJson(filePath);
    if (existing === null) {
      return;
    }
    const configs = Array.isArray(existing.configurations) ? [...existing.configurations] : [];
    const names = new Set(configs.map((c) => (isJsonObject(c) ? c.name : undefined)));
    if (!names.has(ours.name)) {
      configs.push(ours);
    }
    existing.configurations = configs;
    existing.version ??= VSCODE_LAUNCH_CONTENT.version;
    writeJson(filePath, existing);
    return;
  }
  mkdirSync(dir, { recursive: true });
  writeJson(filePath, VSCODE_LAUNCH_CONTENT);
  written.push(".vscode/launch.json");
}

function writeVscodeTasks(cwd: string, written: string[]): void {
  const dir = path.join(cwd, ".vscode");
  const filePath = path.join(dir, "tasks.json");
  if (existsSync(filePath)) {
    const existing = readVscodeJson(filePath);
    if (existing === null) {
      return;
    }
    writeJson(filePath, mergeVscodeTasks(existing));
    return;
  }
  mkdirSync(dir, { recursive: true });
  writeJson(filePath, VSCODE_TASKS_CONTENT);
  written.push(".vscode/tasks.json");
}

function writeVscodeDebugLauncher(cwd: string, written: string[]): void {
  const dir = path.join(cwd, ".vscode");
  const filePath = path.join(dir, "defold-debug.ts");
  if (existsSync(filePath)) {
    return;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, DEBUG_LAUNCHER_SOURCE);
  written.push(".vscode/defold-debug.ts");
}

function writeTsSurface(
  cwd: string,
  written: string[],
  force = false,
  mainTs: string = MAIN_TS_CONTENT,
): void {
  mkdirSync(path.join(cwd, "src"), { recursive: true });
  const mainPath = path.join(cwd, "src", "main.ts");
  if (!existsSync(mainPath)) {
    writeFileSync(mainPath, mainTs);
    written.push("src/main.ts");
  }

  const tsconfig = {
    compilerOptions: {
      ...TSCONFIG_COMPILER_OPTIONS,
      types: [DEFAULT_TYPES_ENTRYPOINT],
      plugins: [{ name: "@defold-typescript/tstl-plugin" }],
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
    repairManagedDevDeps(devDeps, force);
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
  writeMiseTasks(cwd, written);

  writeVscodeExtensions(cwd, written);
  writeVscodeSettings(cwd, written);
  writeVscodeSnippets(cwd, written);
  writeVscodeLaunch(cwd, written);
  writeVscodeTasks(cwd, written);
  writeVscodeDebugLauncher(cwd, written);
}

export function runNewProjectInit(
  cwd: string,
  force = false,
  mainTs: string = MAIN_TS_CONTENT,
): RunInitResult {
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
    `[project]\ntitle = ${path.basename(cwd)}\n\n` +
      `[bootstrap]\nmain_collection = /main/main.collectionc\n\n` +
      `[input]\ngame_binding = /input/game.input_bindingc\n`,
  );
  written.push("game.project");

  mkdirSync(path.join(cwd, "main"), { recursive: true });
  writeFileSync(path.join(cwd, "main", "main.collection"), MAIN_COLLECTION_CONTENT);
  written.push("main/main.collection");

  mkdirSync(path.join(cwd, "input"), { recursive: true });
  writeFileSync(path.join(cwd, "input", "game.input_binding"), GAME_INPUT_BINDING_CONTENT);
  written.push("input/game.input_binding");

  writeTsSurface(cwd, written, force, mainTs);

  return { written };
}

export function runInit(opts: RunInitOptions): RunInitResult {
  const { cwd, force = false, template } = opts;
  const resolvedTemplate = resolveTemplate(template);
  const hasGameProject = existsSync(path.join(cwd, "game.project"));

  if (hasGameProject && resolvedTemplate !== DEFAULT_INIT_TEMPLATE) {
    throw new Error(
      `defold-typescript init: --template applies only when creating a new project; ${cwd} already contains a Defold project.`,
    );
  }

  if (!hasGameProject) {
    return runNewProjectInit(cwd, force, TEMPLATE_MAIN_TS[resolvedTemplate]);
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
  writeTsSurface(cwd, written, force);
  return { written };
}
