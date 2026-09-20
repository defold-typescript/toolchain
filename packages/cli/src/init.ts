import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type BuildConfig,
  computeOutputRel,
  DEFAULT_INCLUDE,
  parseBuildConfig,
  projectRelativeBase,
  SCAFFOLDED_DEFIGNORE_LINES,
} from "@defold-typescript/transpiler";
import type { ScriptHookName } from "@defold-typescript/types";
import { isFileIncluded } from "./build-output";

import { repairDefoldNamespace } from "./defold-target";
import { CURRENT_STABLE_DEFOLD_VERSION } from "./defold-version";
import { formatJsonLikeBiome } from "./format-json";
import { runInitAgents } from "./init-agents";
import { mergeMiseToml } from "./mise-scaffold";
import { hasGeneratedBanner } from "./orphan-scan";
import { SCENE_ADDRESSES_DECLARATION } from "./scene-types-command";
import { DEFAULT_TYPES_ENTRYPOINT } from "./script-kind";
import { writeVscodeLaunch } from "./vscode-debug-scaffold";
import { readVscodeJson, reconcileManagedList, writeJson } from "./vscode-json";
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

// The component globs carry the `.ts.` infix no hand-authored Defold path has,
// so they need no folder to be correct and hold for any `include`. Generated
// `.lua` modules are deliberately absent: only the banner distinguishes them
// from authored Lua, which a glob cannot read, and `outDir` is the lever for
// keeping them out of the tree.
const GITIGNORE_LINES = [
  "node_modules",
  // `.vscode/defold-debug.ts` downloads the Defold engine binary beside itself
  // (`.vscode/dmengine`, `.vscode/dmengine.exe`); keep the multi-MB binary out of git.
  ".vscode/dmengine*",
  "**/*.ts.script",
  "**/*.ts.script.map",
  "**/*.ts.gui_script",
  "**/*.ts.gui_script.map",
  "**/*.ts.render_script",
  "**/*.ts.render_script.map",
  "/build",
  "/.internal",
  "/.editor_settings",
  "builtins/",
  ".DS_Store",
  "Thumbs.db",
  "/lualib_bundle.lua",
  "/lualib_bundle.lua.map",
  "/defold_typescript_timers.lua",
  "/defold_typescript_timers.lua.map",
];

// The Defold editor's empty-template `.gitattributes` verbatim: linguist-language
// overrides so GitHub renders and classifies Defold's protobuf-text assets, JSON
// buffers, GLSL shaders, and Lua scripts. Kept byte-for-byte identical to the
// editor's block so merging over an editor-created project is a no-op. Blank
// "" entries are the separators between sections.
const GITATTRIBUTES_LINES = [
  "# Defold Protocol Buffer Text Files (https://github.com/github/linguist/issues/5091)",
  "*.animationset linguist-language=JSON5",
  "*.atlas linguist-language=JSON5",
  "*.camera linguist-language=JSON5",
  "*.collection linguist-language=JSON5",
  "*.collectionfactory linguist-language=JSON5",
  "*.collectionproxy linguist-language=JSON5",
  "*.collisionobject linguist-language=JSON5",
  "*.cubemap linguist-language=JSON5",
  "*.display_profiles linguist-language=JSON5",
  "*.factory linguist-language=JSON5",
  "*.font linguist-language=JSON5",
  "*.gamepads linguist-language=JSON5",
  "*.go linguist-language=JSON5",
  "*.gui linguist-language=JSON5",
  "*.input_binding linguist-language=JSON5",
  "*.label linguist-language=JSON5",
  "*.material linguist-language=JSON5",
  "*.mesh linguist-language=JSON5",
  "*.model linguist-language=JSON5",
  "*.particlefx linguist-language=JSON5",
  "*.render linguist-language=JSON5",
  "*.sound linguist-language=JSON5",
  "*.sprite linguist-language=JSON5",
  "*.spinemodel linguist-language=JSON5",
  "*.spinescene linguist-language=JSON5",
  "*.texture_profiles linguist-language=JSON5",
  "*.tilemap linguist-language=JSON5",
  "*.tilesource linguist-language=JSON5",
  "",
  "# Defold JSON Files",
  "*.buffer linguist-language=JSON",
  "",
  "# Defold GLSL Shaders",
  "*.fp linguist-language=GLSL",
  "*.vp linguist-language=GLSL",
  "",
  "# Defold Lua Files",
  "*.editor_script linguist-language=Lua",
  "*.render_script linguist-language=Lua",
  "*.script linguist-language=Lua",
  "*.gui_script linguist-language=Lua",
];

const BIOME_SCHEMA = "https://biomejs.dev/schemas/2.5.1/schema.json";

// The `src`-shaped managed rules v0.36.0 shipped, quoted from that tag. A user's
// file records no provenance, so retirement runs per file only when that file
// carries the *complete* released set — the scaffold's signature. A partial set
// may be the user's own and is never touched.
export const RETIRED_MANAGED_ENTRIES = {
  gitignore: [
    "src/**/*.ts.script",
    "src/**/*.ts.script.map",
    "src/**/*.ts.gui_script",
    "src/**/*.ts.gui_script.map",
    "src/**/*.ts.render_script",
    "src/**/*.ts.render_script.map",
    "src/**/*.lua",
    "src/**/*.lua.map",
  ],
  biomeIncludes: ["src/**/*.ts", "!src/**/*.lua", "!src/**/*.lua.map"],
  ignoreDir: ["src"],
} as const;

// `include` answers two different questions, and conflating them is what these
// rules got wrong. `sourceRootsFromInclude` names folders the scaffold may make
// claims about; `biomeIncludesFromInclude` names files the program reads.
//
export function sourceRootsFromInclude(include: readonly string[]): string[] {
  const roots: string[] = [];
  for (const pattern of include) {
    if (!/[*?[]/.test(pattern)) {
      continue;
    }
    const base = projectRelativeBase(pattern);
    if (base === undefined || base === "") {
      continue;
    }
    const root = base.endsWith("/") ? base.slice(0, -1) : base;
    if (root !== "" && !roots.includes(root)) {
      roots.push(root);
    }
  }
  return roots;
}

const STARTER_BASENAME = "main.ts";

export interface StarterTarget {
  readonly sourceRel: string;
  readonly outputRel: string;
  readonly componentPath: string;
}

// The one starter path every scaffold site spells: the `main.ts` the configured
// program actually reads, plus the resource the build emits for it. The first
// include entry that both speaks for a project folder and admits its own
// `main.ts` wins, so the winner is include order rather than disk or sort order.
export function resolveStarterTarget(config: BuildConfig): StarterTarget | undefined {
  for (const pattern of config.include) {
    const base = projectRelativeBase(pattern);
    if (base === undefined) {
      continue;
    }
    const sourceRel = path.posix.join(base, STARTER_BASENAME);
    if (!isFileIncluded(sourceRel, [pattern.split("\\").join("/")])) {
      continue;
    }
    const outputRel = computeOutputRel(sourceRel, config, "script");
    return { sourceRel, outputRel, componentPath: `/${outputRel}` };
  }
  return undefined;
}

function readBuildConfig(cwd: string): BuildConfig {
  const tsconfigPath = path.join(cwd, "tsconfig.json");
  if (!existsSync(tsconfigPath)) {
    return { outDir: undefined, include: [...DEFAULT_INCLUDE] };
  }
  return parseBuildConfig(readFileSync(tsconfigPath, "utf8"));
}

export function biomeIncludesFromInclude(include: readonly string[]): string[] {
  return [
    ...include,
    "!**/dist",
    "!**/node_modules",
    "!**/*.ts.script",
    "!**/*.ts.gui_script",
    "!**/*.ts.render_script",
    // The materialized type surface is generated, so it is read by the compiler
    // but never linted or formatted.
    "!.defold-types/**",
  ];
}

export const BIOME_JSON_CONTENT = {
  $schema: BIOME_SCHEMA,
  files: {
    includes: biomeIncludesFromInclude(DEFAULT_INCLUDE),
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
  recommendations: [] as string[],
  unwantedRecommendations: ["johnnymorganz.luau-lsp"],
};

// The Local Lua Debugger id is deliberately absent from both lists: `setup-debug`
// writes it, and `reconcileManagedList` prunes a managed id that has left the
// canonical set, so claiming it here would strip it on every later `upgrade`.
const MANAGED_RECOMMENDATIONS = ["sumneko.lua", "astronachos.defold"];
const MANAGED_UNWANTED = ["johnnymorganz.luau-lsp"];

const LUA_IGNORE_DIR_KEY = "Lua.workspace.ignoreDir";

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

// With no resolvable starter the collection is written empty rather than
// pointing at a component the build will never emit.
function mainCollectionContent(componentPath: string | undefined): string {
  const components =
    componentPath === undefined
      ? ""
      : `components {\\n  id: \\"main\\"\\n  component: \\"${componentPath}\\"\\n}\\n`;
  return `name: "main"
scale_along_z: 0
embedded_instances {
  id: "main"
  data: "${components}"
  position { x: 0.0 y: 0.0 z: 0.0 }
  rotation { x: 0.0 y: 0.0 z: 0.0 w: 1.0 }
  scale3 { x: 1.0 y: 1.0 z: 1.0 }
}
`;
}

// Empty binding (zero triggers): the starter script reads no input; it
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

// Whether a file carries every entry the released scaffold wrote, which is the
// only evidence that the entries are ours to retire rather than the user's.
function carriesRetiredSet(present: ReadonlySet<string>, retired: readonly string[]): boolean {
  return retired.every((entry) => present.has(entry));
}

function writeGitignore(cwd: string): void {
  const gitignorePath = path.join(cwd, ".gitignore");
  if (existsSync(gitignorePath)) {
    const existing = readFileSync(gitignorePath, "utf8");
    let lines = existing.split("\n");
    const present = new Set(lines.map((line) => line.trim()));
    const retiring = carriesRetiredSet(present, RETIRED_MANAGED_ENTRIES.gitignore);
    if (retiring) {
      const retired = new Set<string>(RETIRED_MANAGED_ENTRIES.gitignore);
      lines = lines.filter((line) => !retired.has(line.trim()));
    }
    const kept = new Set(lines.map((line) => line.trim()));
    const missing = GITIGNORE_LINES.filter((line) => !kept.has(line));
    if (!retiring && missing.length === 0) {
      return;
    }
    const body = lines.join("\n");
    const prefix = body.endsWith("\n") || body === "" ? "" : "\n";
    writeFileSync(
      gitignorePath,
      missing.length === 0 ? body : `${body}${prefix}${missing.join("\n")}\n`,
    );
  } else {
    writeFileSync(gitignorePath, `${GITIGNORE_LINES.join("\n")}\n`);
  }
}

function writeGitattributes(cwd: string): void {
  const gitattributesPath = path.join(cwd, ".gitattributes");
  if (existsSync(gitattributesPath)) {
    const existing = readFileSync(gitattributesPath, "utf8");
    const present = new Set(existing.split("\n").map((line) => line.trim()));
    // Skip blank separators so they never re-append; only real rules merge.
    const missing = GITATTRIBUTES_LINES.filter((line) => line.trim() !== "" && !present.has(line));
    if (missing.length === 0) {
      return;
    }
    const prefix = existing.endsWith("\n") || existing === "" ? "" : "\n";
    writeFileSync(gitattributesPath, `${existing}${prefix}${missing.join("\n")}\n`);
  } else {
    writeFileSync(gitattributesPath, `${GITATTRIBUTES_LINES.join("\n")}\n`);
  }
}

function writeDefignore(cwd: string): void {
  const defignorePath = path.join(cwd, ".defignore");
  if (existsSync(defignorePath)) {
    const existing = readFileSync(defignorePath, "utf8");
    const present = new Set(existing.split("\n").map((line) => line.trim()));
    const missing = SCAFFOLDED_DEFIGNORE_LINES.filter((line) => !present.has(line));
    if (missing.length === 0) {
      return;
    }
    const prefix = existing.endsWith("\n") || existing === "" ? "" : "\n";
    writeFileSync(defignorePath, `${existing}${prefix}${missing.join("\n")}\n`);
  } else {
    writeFileSync(defignorePath, `${SCAFFOLDED_DEFIGNORE_LINES.join("\n")}\n`);
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

// Replace the released `src`-shaped include list with one derived from the
// project's own `include`, keeping every pattern the user added. Returns the
// re-serialized JSON, or `null` when there is nothing to retire or the file does
// not parse as JSON — the caller then leaves the file untouched.
function migrateBiomeIncludes(raw: string, include: readonly string[]): string | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const root = value as { files?: { includes?: unknown } };
  const includes = root.files?.includes;
  if (!Array.isArray(includes)) {
    return null;
  }
  const entries = includes.filter((entry): entry is string => typeof entry === "string");
  if (!carriesRetiredSet(new Set(entries), RETIRED_MANAGED_ENTRIES.biomeIncludes)) {
    return null;
  }
  const retired = new Set<string>(RETIRED_MANAGED_ENTRIES.biomeIncludes);
  const derived = biomeIncludesFromInclude(include);
  const kept = entries.filter((entry) => !retired.has(entry) && !derived.includes(entry));
  (root.files as { includes: string[] }).includes = [...derived, ...kept];
  return `${formatJsonLikeBiome(value)}\n`;
}

function writeBiome(
  cwd: string,
  written: string[],
  warnings: string[],
  include: readonly string[],
  force = false,
): void {
  const biomePath = path.join(cwd, "biome.json");
  if (existsSync(biomePath)) {
    if (!force) {
      return;
    }
    const raw = readFileSync(biomePath, "utf8");
    // Both passes are independent: a project can carry the deprecated rules key
    // and the retired include list at once, so the second runs on the first's
    // output rather than instead of it.
    const withPreset = migrateBiomeRecommended(raw);
    const migrated = migrateBiomeIncludes(withPreset ?? raw, include) ?? withPreset;
    if (migrated !== null) {
      writeFileSync(biomePath, migrated);
      written.push("biome.json");
      return;
    }
    // `migrateBiomeRecommended` and the include reconciliation both take a plain
    // `JSON.parse`, so a hand-edited JSONC file is reported rather than rewritten
    // with its comments destroyed.
    try {
      JSON.parse(raw);
    } catch {
      warnings.push(
        "left biome.json untouched: it contains comments, so the managed `files.includes` were not reconciled — update them by hand.",
      );
    }
    return;
  }
  writeJson(biomePath, {
    ...BIOME_JSON_CONTENT,
    files: { includes: biomeIncludesFromInclude(include) },
  });
  written.push("biome.json");
}

function writeMiseTasks(cwd: string, written: string[]): void {
  const misePath = path.join(cwd, "mise.toml");
  const existing = existsSync(misePath) ? readFileSync(misePath, "utf8") : undefined;
  writeFileSync(misePath, mergeMiseToml(existing));
  written.push("mise.toml");
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

// Claiming a folder holds only generated Lua is a claim the scaffold has to
// earn: the build's own module output shares the `.lua` extension, so an
// extension-only probe answers yes on every project that has ever been built.
// The banner is the distinguishing signal. Returns the first authored file
// found, for the warning to name, or `undefined` when the claim holds.
export function authoredLuaUnder(cwd: string, root: string): string | undefined {
  for (const rel of walkProjectFiles(path.join(cwd, root))) {
    const projectRel = path.join(root, rel);
    if (rel.endsWith(".lua") && !hasGeneratedBanner(cwd, projectRel)) {
      return projectRel;
    }
  }
  return undefined;
}

function ignoreDirRoots(cwd: string, include: readonly string[], warnings: string[]): string[] {
  const claimed: string[] = [];
  for (const root of sourceRootsFromInclude(include)) {
    const authored = authoredLuaUnder(cwd, root);
    if (authored === undefined) {
      claimed.push(root);
    } else {
      warnings.push(
        `left \`${LUA_IGNORE_DIR_KEY}\` without ${root}: ${authored} is hand-authored Lua, so ignoring the folder would hide it from the Lua language server.`,
      );
    }
  }
  return claimed;
}

function writeVscodeSettings(
  cwd: string,
  written: string[],
  warnings: string[],
  include: readonly string[],
): void {
  const dir = path.join(cwd, ".vscode");
  const filePath = path.join(dir, "settings.json");
  const claimed = ignoreDirRoots(cwd, include, warnings);
  if (existsSync(filePath)) {
    const existing = readVscodeJson(filePath);
    if (existing === null) {
      return;
    }
    const current = Array.isArray(existing[LUA_IGNORE_DIR_KEY])
      ? (existing[LUA_IGNORE_DIR_KEY] as unknown[]).filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    // The released `"src"` is replaced rather than unioned beside the derived
    // root: leaving both would keep a stale claim about a folder this project
    // does not build from.
    const retired = new Set<string>(RETIRED_MANAGED_ENTRIES.ignoreDir);
    const kept = current.filter((value) => !retired.has(value));
    const merged = unionStrings(kept, claimed);
    if (merged.length === 0) {
      delete existing[LUA_IGNORE_DIR_KEY];
    } else {
      existing[LUA_IGNORE_DIR_KEY] = merged;
    }
    writeJson(filePath, existing);
    return;
  }
  mkdirSync(dir, { recursive: true });
  writeJson(filePath, claimed.length === 0 ? {} : { [LUA_IGNORE_DIR_KEY]: claimed });
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
// Only the starter this configuration resolves is stripped — a retired entry
// from a root the project has since moved off is the user's.
function pruneMainTsExclude(
  existing: unknown,
  starterRel: string | undefined,
): string[] | undefined {
  if (!Array.isArray(existing)) return undefined;
  const remaining = existing.filter((entry) => entry !== starterRel);
  return remaining.length > 0 ? (remaining as string[]) : undefined;
}

interface TsSurfaceOptions {
  readonly cwd: string;
  readonly written: string[];
  readonly operations: InitOperation[];
  readonly warnings: string[];
  readonly config: BuildConfig;
  readonly starter: StarterTarget | undefined;
  readonly force?: boolean;
  readonly mainTs?: string;
  readonly writeMainTs?: boolean;
}

function writeTsSurface(opts: TsSurfaceOptions): void {
  const {
    cwd,
    written,
    operations,
    warnings,
    config,
    starter,
    force = false,
    mainTs = MAIN_TS_CONTENT,
    writeMainTs = true,
  } = opts;
  if (starter === undefined) {
    const searched = config.include.join(", ");
    const detail = `no include pattern reaches a writable starter path (searched ${searched})`;
    warnings.push(`defold-typescript init: ${detail}; no starter script was written.`);
    operations.push({ target: STARTER_BASENAME, status: "skipped", detail });
  } else {
    const mainPath = path.join(cwd, ...starter.sourceRel.split("/"));
    if (writeMainTs && !existsSync(mainPath)) {
      mkdirSync(path.dirname(mainPath), { recursive: true });
      writeFileSync(mainPath, mainTs);
      written.push(starter.sourceRel);
      operations.push({ target: starter.sourceRel, status: "written" });
    } else {
      operations.push({
        target: starter.sourceRel,
        status: "skipped",
        detail: writeMainTs
          ? `a ${starter.sourceRel} already exists`
          : "existing project sources present",
      });
    }
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

  const existingInclude = Array.isArray(existing?.include)
    ? (existing.include as unknown[]).filter((entry): entry is string => typeof entry === "string")
    : [...DEFAULT_INCLUDE];
  // The exact declaration path, never a glob: `.defold-types` is the project's
  // typeRoots, so a pattern there would sweep every other materialized surface
  // into the transpile source set. An `include` entry matching nothing is
  // silently ignored, so naming it before `scene-types` first runs is safe.
  const include = existingInclude.includes(SCENE_ADDRESSES_DECLARATION)
    ? existingInclude
    : [...existingInclude, SCENE_ADDRESSES_DECLARATION];

  const tsconfig: Record<string, unknown> = {
    compilerOptions,
    include,
  };
  const pruned = pruneMainTsExclude(existing?.exclude, starter?.sourceRel);
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

  writeGitattributes(cwd);
  written.push(".gitattributes");

  writeDefignore(cwd);
  written.push(".defignore");

  writeBiome(cwd, written, warnings, include, force);
  writeMiseTasks(cwd, written);

  writeVscodeExtensions(cwd, written);
  writeVscodeSettings(cwd, written, warnings, include);
  writeVscodeSnippets(cwd, written, force);
  const launchAction = writeVscodeLaunch(
    cwd,
    {
      outDir: typeof compilerOptions.outDir === "string" ? compilerOptions.outDir : undefined,
      include,
    },
    "refresh",
  );
  if (launchAction === "refreshed") {
    written.push(".vscode/launch.json");
  }
  writeVscodeTasks(cwd, written);

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
  const config = readBuildConfig(cwd);
  const starter = resolveStarterTarget(config);

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
    writeFileSync(
      path.join(cwd, "main", "main.collection"),
      mainCollectionContent(starter?.componentPath),
    );
    written.push("main/main.collection");
  }

  mkdirSync(path.join(cwd, "input"), { recursive: true });
  writeFileSync(path.join(cwd, "input", "game.input_binding"), GAME_INPUT_BINDING_CONTENT);
  written.push("input/game.input_binding");

  writeTsSurface({
    cwd,
    written,
    operations,
    warnings,
    config,
    starter,
    force,
    mainTs,
    writeMainTs: !skipUserAuthored,
  });

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
  const config = readBuildConfig(cwd);
  const starter = resolveStarterTarget(config);
  const mainCollectionRel = path.join("main", "main.collection");
  const mainTsRel = starter === undefined ? "" : path.join(...starter.sourceRel.split("/"));
  const mcPath = path.join(cwd, mainCollectionRel);
  const mcExists = existsSync(mcPath);
  const mcRefs =
    starter !== undefined &&
    mcExists &&
    readFileSync(mcPath, "utf8").includes(starter.componentPath);
  const otherCollection = anyFileWithExt(cwd, ".collection", mainCollectionRel);
  const otherTs = anyFileWithExt(cwd, ".ts", mainTsRel);
  const writeMainTs = !(mcExists && !mcRefs) && !otherCollection && !otherTs;

  const written: string[] = [];
  const operations: InitOperation[] = [];
  const warnings: string[] = [];
  writeTsSurface({ cwd, written, operations, warnings, config, starter, force, writeMainTs });
  return withScaffoldOperations(written, operations, warnings);
}
