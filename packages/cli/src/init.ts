import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ScriptHookName } from "@defold-typescript/types";
import { DEBUG_LAUNCHER_SOURCE, debugLaunchConfig, VSCODE_LAUNCH_CONTENT } from "./debug-launcher";
import { repairDefoldNamespace } from "./defold-target";
import { CURRENT_STABLE_DEFOLD_VERSION } from "./defold-version";
import { formatJsonLikeBiome } from "./format-json";
import { runInitAgents } from "./init-agents";
import { mergeMiseToml } from "./mise-scaffold";
import { DEFAULT_TYPES_ENTRYPOINT } from "./script-kind";
import { mergeVscodeTasks, VSCODE_TASKS_CONTENT } from "./vscode-tasks";

export interface RunInitOptions {
  readonly cwd: string;
  readonly force?: boolean;
  readonly template?: string;
}

export interface InitOperation {
  readonly target: string;
  readonly status: "written" | "merged" | "skipped";
  readonly detail?: string;
}

export interface RunInitResult {
  readonly written: string[];
  readonly operations: InitOperation[];
  readonly warnings: string[];
}

const CONFLICTING_TS_CONFIGS = ["tsconfig.json"];

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
  "/build",
  "/.internal",
  "/.editor_settings",
  "builtins/",
  ".DS_Store",
  "/lualib_bundle.lua",
  "/lualib_bundle.lua.map",
  "/defold_typescript_timers.lua",
  "/defold_typescript_timers.lua.map",
];

export const BIOME_JSON_CONTENT = {
  $schema: "https://biomejs.dev/schemas/2.5.1/schema.json",
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
      preset: "recommended",
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

export const VSCODE_SNIPPETS_CONTENT: Record<string, VscodeSnippet> = {
  "Defold script (inferred self)": {
    scope: "typescript",
    prefix: "def-ts-defineScript-inferred-self",
    body: inlineSnippetBody("defineScript", NO_OMIT),
    description: "Empty Defold script; state inferred from init's return.",
  },
  "Defold script (typed self)": {
    scope: "typescript",
    prefix: "def-ts-defineScript-typed-self",
    body: typedSnippetBody("defineScript", NO_OMIT),
    description: "Empty Defold script with an explicit Self type.",
  },
  "Defold GUI script (inferred self)": {
    scope: "typescript",
    prefix: "def-ts-defineGuiScript-inferred-self",
    body: inlineSnippetBody("defineGuiScript", GUI_OMIT),
    description: "Empty Defold GUI script; state inferred from init's return.",
  },
  "Defold GUI script (typed self)": {
    scope: "typescript",
    prefix: "def-ts-defineGuiScript-typed-self",
    body: typedSnippetBody("defineGuiScript", GUI_OMIT),
    description: "Empty Defold GUI script with an explicit Self type.",
  },
  "Defold render script (inferred self)": {
    scope: "typescript",
    prefix: "def-ts-defineRenderScript-inferred-self",
    body: inlineSnippetBody("defineRenderScript", RENDER_OMIT),
    description: "Empty Defold render script; state inferred from init's return.",
  },
  "Defold render script (typed self)": {
    scope: "typescript",
    prefix: "def-ts-defineRenderScript-typed-self",
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
  "defold-typescript"?: unknown;
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

// The Lua stdlib globals (`math`, `string`, `table`, `os`, ...) reach a consumer
// only through the `/// <reference types="lua-types/5.1" />` at the top of
// `@defold-typescript/types`; declaring `lua-types` directly guarantees a
// resolvable copy even when the transitive one is absent or unhoisted. Kept in
// lockstep with the range `packages/types` requires — `init.test.ts`'s drift
// guard fails loud if the two diverge.
export const LUA_TYPES_SPEC = "^2.13.1";

// The exact `typescript` pin `typescript-to-lua`'s peer and `packages/types`
// require. An unbounded range lets `bun install` resolve the TS7 native port,
// whose JS surface lacks `ts.DiagnosticCategory` that tstl 1.x reads at
// module-eval — crashing every command that loads the transpiler (bug-46). Kept
// in lockstep with `packages/types` by the drift guard.
export const TYPESCRIPT_SPEC = "6.0.2";

// @defold-typescript/types (type-only, for the editor) and @defold-typescript/cli
// (the local bin the managed `bunx @defold-typescript/cli` mise tasks resolve
// inside an installed project) both ship into the consumer. The transpiler must NOT be a direct
// consumer dep — it arrives transitively through the CLI. Pin both managed deps
// to this CLI's own version so the coordinated-release set stays in lockstep.
export const SCAFFOLD_DEV_DEPS: Record<string, string> = {
  "@defold-typescript/types": typesVersionSpec(),
  "@defold-typescript/cli": typesVersionSpec(),
  "@defold-typescript/tstl-plugin": typesVersionSpec(),
  "@biomejs/biome": "^2.5.0",
  // The `.vscode/defold-debug.ts` launcher is a Bun script importing `node:fs`/
  // `node:path` and using `Bun.*`/`process`/`fetch`; `@types/bun` resolves those
  // (it pulls in `@types/node`). The project tsconfig pins `types` to
  // `@defold-typescript/types`, so these never leak into the `src/` Defold compile.
  "@types/bun": "latest",
  "lua-types": LUA_TYPES_SPEC,
  typescript: TYPESCRIPT_SPEC,
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
  // typescript is managed too, but tracks TYPESCRIPT_SPEC (tstl's peer), not
  // this CLI's version. Repin under --force or a stale workspace: spec so an
  // upgrade migrates a project off an unbounded range that resolves the TS7
  // native port; a user's concrete pin is left alone on plain init.
  if (force || devDeps.typescript?.startsWith("workspace:")) {
    devDeps.typescript = TYPESCRIPT_SPEC;
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

// Surgically migrate the one deprecated Biome 2.5.x key
// (`linter.rules.recommended: <bool>` -> `linter.rules.preset: "recommended" | "none"`),
// preserving every other user key. Returns the re-serialized JSON, or `null` when
// there is nothing to migrate (no own boolean `recommended`) or the file does not
// parse as JSON (hand-edited JSONC) — the caller then leaves the file untouched.
function migrateBiomeRecommended(raw: string): string | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const root = value as { $schema?: string; linter?: { rules?: Record<string, unknown> } };
  const rules = root.linter?.rules;
  if (!rules || !Object.hasOwn(rules, "recommended") || typeof rules.recommended !== "boolean") {
    return null;
  }
  if (!Object.hasOwn(rules, "preset")) {
    rules.preset = rules.recommended ? "recommended" : "none";
  }
  delete rules.recommended;
  root.$schema = BIOME_JSON_CONTENT.$schema;
  return `${formatJsonLikeBiome(value)}\n`;
}

function writeBiome(cwd: string, written: string[], force = false): void {
  const biomePath = path.join(cwd, "biome.json");
  if (existsSync(biomePath)) {
    if (!force) {
      return;
    }
    const migrated = migrateBiomeRecommended(readFileSync(biomePath, "utf8"));
    if (migrated !== null) {
      writeFileSync(biomePath, migrated);
      written.push("biome.json");
    }
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

// Reconcile the owned snippet keys into an already-parsed file. Missing keys are
// always added; a present owned key is overwritten only under `force` and only
// when it drifted from the shipped snippet. Keys absent from
// VSCODE_SNIPPETS_CONTENT (a user's own snippets) are never touched. Returns
// whether it mutated `existing`.
function refreshManagedSnippets(existing: Record<string, unknown>, force: boolean): boolean {
  let changed = false;
  for (const [key, snippet] of Object.entries(VSCODE_SNIPPETS_CONTENT)) {
    if (!(key in existing)) {
      existing[key] = snippet;
      changed = true;
    } else if (force && JSON.stringify(existing[key]) !== JSON.stringify(snippet)) {
      existing[key] = snippet;
      changed = true;
    }
  }
  return changed;
}

function writeVscodeSnippets(cwd: string, written: string[], force = false): void {
  const dir = path.join(cwd, ".vscode");
  const filePath = path.join(dir, "defold-typescript.code-snippets");
  if (existsSync(filePath)) {
    const existing = readVscodeJson(filePath);
    if (existing === null) {
      return;
    }
    const changed = refreshManagedSnippets(existing, force);
    if (changed) {
      writeJson(filePath, existing);
    }
    // Non-force merges backfill missing keys silently (as before); a forced
    // refresh that actually changed the file is surfaced in `written`.
    if (changed && force) {
      written.push(".vscode/defold-typescript.code-snippets");
    }
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

// Dirs whose contents never count as user-authored project files: an installed
// dependency's `.ts` or a build artifact must not false-trigger an init signal.
const INIT_SCAN_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "build",
  ".internal",
  "dist",
  "builtins",
  ".editor_settings",
]);

// Yields every file under `root` as a `path.join`-built relative path (so the
// separator matches on every OS), skipping the heavy/irrelevant dirs above. A
// missing root yields nothing.
function* walkProjectFiles(root: string, rel = ""): Generator<string> {
  const abs = rel ? path.join(root, rel) : root;
  if (!existsSync(abs)) {
    return;
  }
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!INIT_SCAN_SKIP_DIRS.has(entry.name)) {
        yield* walkProjectFiles(root, path.join(rel, entry.name));
      }
    } else {
      yield path.join(rel, entry.name);
    }
  }
}

// Whether any file under `root` ends with `ext`, optionally ignoring one known
// relative path (used to exclude the managed entry file from an "other" scan).
function anyFileWithExt(root: string, ext: string, exceptRel = ""): boolean {
  for (const rel of walkProjectFiles(root)) {
    if (rel.endsWith(ext) && rel !== exceptRel) {
      return true;
    }
  }
  return false;
}

// The wired entry script belongs in the program; a merge only strips a
// tool-added exclude, never adds one, so upgrades self-heal bug-41's regression.
function pruneMainTsExclude(existing: unknown): string[] | undefined {
  if (!Array.isArray(existing)) return undefined;
  const remaining = existing.filter((entry) => entry !== "src/main.ts");
  return remaining.length > 0 ? (remaining as string[]) : undefined;
}

function writeTsSurface(
  cwd: string,
  written: string[],
  operations: InitOperation[],
  warnings: string[],
  force = false,
  mainTs: string = MAIN_TS_CONTENT,
  writeMainTs = true,
): void {
  const mainPath = path.join(cwd, "src", "main.ts");
  if (writeMainTs && !existsSync(mainPath)) {
    mkdirSync(path.join(cwd, "src"), { recursive: true });
    writeFileSync(mainPath, mainTs);
    written.push("src/main.ts");
    operations.push({ target: "src/main.ts", status: "written" });
  } else {
    operations.push({
      target: "src/main.ts",
      status: "skipped",
      detail: writeMainTs ? "a src/main.ts already exists" : "existing project sources present",
    });
  }

  // init: tsconfig-merge-preserves-config
  const tsconfigPath = path.join(cwd, "tsconfig.json");
  const existing = existsSync(tsconfigPath)
    ? (JSON.parse(readFileSync(tsconfigPath, "utf8")) as {
        compilerOptions?: Record<string, unknown>;
        include?: unknown;
        exclude?: unknown;
      })
    : undefined;
  const tstlPlugin = { name: "@defold-typescript/tstl-plugin" };
  const existingCompiler = existing?.compilerOptions ?? {};
  const compilerOptions: Record<string, unknown> = {
    ...TSCONFIG_COMPILER_OPTIONS,
    types: [DEFAULT_TYPES_ENTRYPOINT],
    plugins: [tstlPlugin],
    ...existingCompiler,
  };
  const existingPlugins = Array.isArray(existingCompiler.plugins)
    ? (existingCompiler.plugins as Array<{ name?: string }>)
    : [];
  const plugins = [...existingPlugins];
  if (!plugins.some((entry) => entry?.name === tstlPlugin.name)) {
    plugins.push(tstlPlugin);
  }
  compilerOptions.plugins = plugins;

  const tsconfig: Record<string, unknown> = {
    compilerOptions,
    include: existing?.include ?? ["src/**/*.ts"],
  };
  const pruned = pruneMainTsExclude(existing?.exclude);
  if (pruned !== undefined) {
    tsconfig.exclude = pruned;
  }
  writeJson(tsconfigPath, tsconfig);
  written.push("tsconfig.json");
  operations.push({
    target: "tsconfig.json",
    status: existing === undefined ? "written" : "merged",
  });

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
    const repair = repairDefoldNamespace(
      existing["defold-typescript"],
      CURRENT_STABLE_DEFOLD_VERSION,
    );
    existing["defold-typescript"] = repair.namespace;
    warnings.push(...repair.warnings);
    writeJson(pkgPath, existing);
  } else {
    const fresh: PackageJson = {
      name: path.basename(cwd),
      version: "0.0.0",
      type: "module",
      devDependencies: { ...SCAFFOLD_DEV_DEPS },
      "defold-typescript": { "defold-target": CURRENT_STABLE_DEFOLD_VERSION },
    };
    writeJson(pkgPath, fresh);
  }
  written.push("package.json");

  writeGitignore(cwd);
  written.push(".gitignore");

  writeBiome(cwd, written, force);
  writeMiseTasks(cwd, written);

  writeVscodeExtensions(cwd, written);
  writeVscodeSettings(cwd, written);
  writeVscodeSnippets(cwd, written, force);
  writeVscodeLaunch(cwd, written);
  writeVscodeTasks(cwd, written);
  writeVscodeDebugLauncher(cwd, written);

  for (const target of runInitAgents({ cwd, force }).written) {
    if (!written.includes(target)) {
      written.push(target);
    }
  }
}

// Give every scaffolded file that isn't already reported a "written" operation,
// so callers surface the full write set alongside the merge/skip specifics.
function withScaffoldOperations(
  written: string[],
  operations: InitOperation[],
  warnings: string[],
): RunInitResult {
  for (const target of written) {
    if (!operations.some((op) => op.target === target)) {
      operations.push({ target, status: "written" });
    }
  }
  return { written, operations, warnings };
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

  // init: skip-on-user-authored-project
  const skipUserAuthored = anyFileWithExt(cwd, ".collection") && anyFileWithExt(cwd, ".ts");

  const written: string[] = [];
  const operations: InitOperation[] = [];
  const warnings: string[] = [];

  writeFileSync(
    path.join(cwd, "game.project"),
    `[project]\ntitle = ${path.basename(cwd)}\n\n` +
      `[bootstrap]\nmain_collection = /main/main.collectionc\n\n` +
      `[input]\ngame_binding = /input/game.input_bindingc\n`,
  );
  written.push("game.project");

  if (!skipUserAuthored) {
    mkdirSync(path.join(cwd, "main"), { recursive: true });
    writeFileSync(path.join(cwd, "main", "main.collection"), MAIN_COLLECTION_CONTENT);
    written.push("main/main.collection");
  }

  mkdirSync(path.join(cwd, "input"), { recursive: true });
  writeFileSync(path.join(cwd, "input", "game.input_binding"), GAME_INPUT_BINDING_CONTENT);
  written.push("input/game.input_binding");

  writeTsSurface(cwd, written, operations, warnings, force, mainTs, !skipUserAuthored);

  return withScaffoldOperations(written, operations, warnings);
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

  // init: greenfield-starter-carveout
  const mainCollectionRel = path.join("main", "main.collection");
  const mainTsRel = path.join("src", "main.ts");
  const mcPath = path.join(cwd, mainCollectionRel);
  const mcExists = existsSync(mcPath);
  const mcRefs = mcExists && readFileSync(mcPath, "utf8").includes("src/main.ts.script");
  const otherCollection = anyFileWithExt(cwd, ".collection", mainCollectionRel);
  const otherTs = anyFileWithExt(cwd, ".ts", mainTsRel);
  const writeMainTs = !(mcExists && !mcRefs) && !otherCollection && !otherTs;

  const written: string[] = [];
  const operations: InitOperation[] = [];
  const warnings: string[] = [];
  writeTsSurface(cwd, written, operations, warnings, force, MAIN_TS_CONTENT, writeMainTs);
  return withScaffoldOperations(written, operations, warnings);
}
