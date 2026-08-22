import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SelectedApiSurface } from "./api-surface";
import { readCliVersion } from "./cli-version";
import { ensureExtensionTypesReference } from "./extension-materialize";
import {
  ensureMaterializedReference,
  materializeApiSurface,
  materializeRefDocSurface,
  surfaceDirName,
  surfaceStampStatus,
} from "./materialize";
import {
  editorRefDocTarget,
  labelRefDocResolveOpts,
  multiKindRefDocResolveOpts,
  multiKindRefDocTarget,
} from "./ref-doc-test-fixture";

// The materialized surface directory carries the generating toolchain version;
// these tests defend other behavior, so they derive the name from production
// rather than restating it.
function surfaceDir(surfaceId: string): string {
  return surfaceDirName(surfaceId, readCliVersion());
}

function typecheck(tsconfigPath: string): { exitCode: number; output: string } {
  const proc = Bun.spawnSync(["bunx", "tsc", "-p", tsconfigPath, "--noEmit"], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  return {
    exitCode: proc.exitCode,
    output: `${proc.stdout.toString()}${proc.stderr.toString()}`,
  };
}

let cwd: string;
let sourceDir: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-materialize-"));
  sourceDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-generated-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(sourceDir, { recursive: true, force: true });
});

function seedSource(modules: string[]): void {
  for (const mod of modules) {
    writeFileSync(path.join(sourceDir, `${mod}.d.ts`), `declare const __${mod}: unknown;\n`);
  }
}

const CURRENT: SelectedApiSurface = { surfaceId: "defold-1.12.4", available: true };
const UNAVAILABLE: SelectedApiSurface = { surfaceId: null, available: false };

describe("materializeApiSurface", () => {
  test("copies every .d.ts and writes an aggregate index + faux package.json", () => {
    seedSource(["label", "sprite"]);

    const result = materializeApiSurface({ cwd, surface: CURRENT, sourceGeneratedDir: sourceDir });

    expect(result).toEqual({
      materializedDir: `.defold-types/${surfaceDir("defold-1.12.4")}`,
      active: "defold-1.12.4",
    });

    const dir = path.join(cwd, ".defold-types", surfaceDir("defold-1.12.4"));
    expect(readFileSync(path.join(dir, "label.d.ts"), "utf8")).toContain("__label");
    expect(readFileSync(path.join(dir, "sprite.d.ts"), "utf8")).toContain("__sprite");

    expect(readFileSync(path.join(dir, "index.d.ts"), "utf8")).toBe(
      'import "./label";\nimport "./sprite";\n\nexport {};\n',
    );

    const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as {
      name: string;
      types: string;
    };
    expect(pkg.types).toBe("index.d.ts");
    expect(pkg.name.length).toBeGreaterThan(0);
  });

  test("materializes every kind-imported src overload and core-types alongside the modules", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-typesroot-"));
    try {
      const gen = path.join(root, "generated");
      const kinds = path.join(gen, "kinds");
      const src = path.join(root, "src");
      mkdirSync(kinds, { recursive: true });
      mkdirSync(src);
      writeFileSync(path.join(gen, "msg.d.ts"), "declare const __msg: unknown;\n");
      // The full-script entrypoint is the single source of truth for the src
      // augmentation set; engine-globals rides its own copy branch, not overloads.
      writeFileSync(
        path.join(kinds, "script.d.ts"),
        [
          'import "../../src/engine-globals";',
          'import "../../src/go-overloads";',
          'import "../../src/message-guard";',
          'import "../../src/msg-overloads";',
          'import "../../src/vmath-overloads";',
          'import "../../src/window-event-guard";',
          "",
        ].join("\n"),
      );
      writeFileSync(
        path.join(src, "core-types.ts"),
        "export type Hash = { readonly __hash: unique symbol };\n",
      );
      writeFileSync(
        path.join(src, "msg-overloads.d.ts"),
        'import type { Hash } from "./core-types";\ndeclare global {\n  namespace msg {\n    function post(receiver: Hash): void;\n  }\n}\nexport {};\n',
      );
      writeFileSync(
        path.join(src, "go-overloads.d.ts"),
        "declare global {\n  namespace go {\n    function get(): void;\n  }\n}\nexport {};\n",
      );
      writeFileSync(
        path.join(src, "message-guard.d.ts"),
        'import type { Hash } from "./core-types";\ndeclare global {\n  function isMessage(id: Hash, m: Record<string, unknown>, e: string): m is Record<string, unknown>;\n}\nexport {};\n',
      );
      writeFileSync(
        path.join(src, "vmath-overloads.d.ts"),
        "declare global {\n  namespace vmath {\n    function normalize<T>(v: T): T;\n  }\n}\nexport {};\n",
      );
      writeFileSync(
        path.join(src, "window-event-guard.d.ts"),
        "declare global {\n  function isWindowEvent(e: number): boolean;\n}\nexport {};\n",
      );

      materializeApiSurface({ cwd, surface: CURRENT, sourceGeneratedDir: gen });

      const dir = path.join(cwd, ".defold-types", surfaceDir("defold-1.12.4"));
      expect(existsSync(path.join(dir, "msg-overloads.d.ts"))).toBe(true);
      expect(existsSync(path.join(dir, "message-guard.d.ts"))).toBe(true);
      expect(existsSync(path.join(dir, "go-overloads.d.ts"))).toBe(true);
      expect(existsSync(path.join(dir, "vmath-overloads.d.ts"))).toBe(true);
      expect(existsSync(path.join(dir, "window-event-guard.d.ts"))).toBe(true);
      expect(existsSync(path.join(dir, "core-types.d.ts"))).toBe(true);
      const index = readFileSync(path.join(dir, "index.d.ts"), "utf8");
      expect(index).toContain('import "./msg-overloads";');
      expect(index).toContain('import "./message-guard";');
      expect(index).toContain('import "./go-overloads";');
      expect(index).toContain('import "./vmath-overloads";');
      expect(index).toContain('import "./window-event-guard";');
      // engine-globals is excluded from the derived overloads set — it flows
      // through the dedicated includeEngineGlobals copy branch, and here its
      // src file is absent so nothing is copied or imported for it.
      expect(existsSync(path.join(dir, "engine-globals.d.ts"))).toBe(false);
      expect(index).not.toContain('import "./engine-globals";');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("drift guard: materializes every src overload the real script kind imports", () => {
    const pkgRoot = path.resolve(import.meta.dir, "..", "..", "types");
    const gen = path.join(pkgRoot, "generated");
    const scriptKind = readFileSync(path.join(gen, "kinds", "script.d.ts"), "utf8");
    const wanted = [...scriptKind.matchAll(/import "\.\.\/\.\.\/src\/([^"]+)";/g)]
      .map((m) => m[1])
      .filter((name) => name !== "engine-globals");
    expect(wanted).toContain("vmath-overloads");
    expect(wanted).toContain("window-event-guard");

    const { materializedDir } = materializeApiSurface({
      cwd,
      surface: CURRENT,
      sourceGeneratedDir: gen,
    });
    expect(materializedDir).toBe(`.defold-types/${surfaceDir("defold-1.12.4")}`);

    const dir = path.join(cwd, ".defold-types", surfaceDir("defold-1.12.4"));
    const index = readFileSync(path.join(dir, "index.d.ts"), "utf8");
    for (const name of wanted) {
      expect(existsSync(path.join(dir, `${name}.d.ts`))).toBe(true);
      expect(index).toContain(`import "./${name}";`);
    }
  });

  test("falls back to the historical trio when no generated/kinds/ dir exists", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-typesroot-"));
    try {
      const gen = path.join(root, "generated");
      const src = path.join(root, "src");
      mkdirSync(gen);
      mkdirSync(src);
      writeFileSync(path.join(gen, "msg.d.ts"), "declare const __msg: unknown;\n");
      writeFileSync(
        path.join(src, "core-types.ts"),
        "export type Hash = { readonly __hash: unique symbol };\n",
      );
      for (const file of [
        "msg-overloads.d.ts",
        "message-guard.d.ts",
        "go-overloads.d.ts",
        "vmath-overloads.d.ts",
        "window-event-guard.d.ts",
      ]) {
        writeFileSync(path.join(src, file), "export {};\n");
      }

      materializeApiSurface({ cwd, surface: CURRENT, sourceGeneratedDir: gen });

      const dir = path.join(cwd, ".defold-types", surfaceDir("defold-1.12.4"));
      expect(existsSync(path.join(dir, "msg-overloads.d.ts"))).toBe(true);
      expect(existsSync(path.join(dir, "message-guard.d.ts"))).toBe(true);
      expect(existsSync(path.join(dir, "go-overloads.d.ts"))).toBe(true);
      // Without the kinds entrypoint the derivation cannot see these; the
      // synthetic-fixture fallback intentionally ships only the historical trio.
      expect(existsSync(path.join(dir, "vmath-overloads.d.ts"))).toBe(false);
      expect(existsSync(path.join(dir, "window-event-guard.d.ts"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an unavailable surface writes nothing and returns nulls", () => {
    seedSource(["label"]);

    const result = materializeApiSurface({
      cwd,
      surface: UNAVAILABLE,
      sourceGeneratedDir: sourceDir,
    });

    expect(result).toEqual({ materializedDir: null, active: null });
    expect(existsSync(path.join(cwd, ".defold-types"))).toBe(false);
  });

  test("re-running is idempotent and prunes stale modules from a prior surface", () => {
    seedSource(["label", "sprite"]);
    materializeApiSurface({ cwd, surface: CURRENT, sourceGeneratedDir: sourceDir });

    rmSync(path.join(sourceDir, "sprite.d.ts"));
    const result = materializeApiSurface({ cwd, surface: CURRENT, sourceGeneratedDir: sourceDir });

    const dir = path.join(cwd, ".defold-types", surfaceDir("defold-1.12.4"));
    expect(result).toEqual({
      materializedDir: `.defold-types/${surfaceDir("defold-1.12.4")}`,
      active: "defold-1.12.4",
    });
    expect(existsSync(path.join(dir, "sprite.d.ts"))).toBe(false);
    expect(existsSync(path.join(dir, "label.d.ts"))).toBe(true);
    expect(readFileSync(path.join(dir, "index.d.ts"), "utf8")).toBe(
      'import "./label";\n\nexport {};\n',
    );
  });
});

describe("materializeApiSurface full surface (no kind narrowing)", () => {
  function materializedNames(): string[] {
    const dir = path.join(cwd, ".defold-types", surfaceDir("defold-1.12.4"));
    return readdirSync(dir).filter((file) => file.endsWith(".d.ts") && file !== "index.d.ts");
  }

  function indexContents(): string {
    return readFileSync(
      path.join(cwd, ".defold-types", surfaceDir("defold-1.12.4"), "index.d.ts"),
      "utf8",
    );
  }

  test("copies every module — gui and render are never dropped", () => {
    seedSource(["label", "gui", "render"]);

    materializeApiSurface({ cwd, surface: CURRENT, sourceGeneratedDir: sourceDir });

    expect(materializedNames().sort()).toEqual(["gui.d.ts", "label.d.ts", "render.d.ts"]);
    expect(indexContents()).toBe(
      'import "./gui";\nimport "./label";\nimport "./render";\n\nexport {};\n',
    );
  });

  test("re-materializing is stable and keeps the full surface", () => {
    seedSource(["label", "gui", "render"]);
    const expectedIndex = 'import "./gui";\nimport "./label";\nimport "./render";\n\nexport {};\n';

    materializeApiSurface({ cwd, surface: CURRENT, sourceGeneratedDir: sourceDir });
    materializeApiSurface({ cwd, surface: CURRENT, sourceGeneratedDir: sourceDir });

    expect(materializedNames().sort()).toEqual(["gui.d.ts", "label.d.ts", "render.d.ts"]);
    expect(indexContents()).toBe(expectedIndex);
  });
});

describe("ensureMaterializedReference", () => {
  function writeTsconfig(value: unknown): void {
    writeFileSync(path.join(cwd, "tsconfig.json"), `${JSON.stringify(value, null, 2)}\n`);
  }

  test("repoints tsconfig at the materialized package as the sole ambient surface", () => {
    writeTsconfig({
      compilerOptions: { strict: true, types: ["@defold-typescript/types"] },
      include: ["src/**/*.ts"],
    });

    ensureMaterializedReference(cwd, `.defold-types/${surfaceDir("defold-1.12.4")}`);

    const tsconfig = JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types: string[]; typeRoots: string[] };
    };
    expect(tsconfig.compilerOptions.types).toEqual([surfaceDir("defold-1.12.4")]);
    expect(tsconfig.compilerOptions.types).not.toContain("@defold-typescript/types");
    expect(tsconfig.compilerOptions.typeRoots).toEqual([".defold-types"]);
  });

  test("adds .defold-types/ to .gitignore", () => {
    writeTsconfig({ compilerOptions: {} });
    writeFileSync(path.join(cwd, ".gitignore"), "src/**/*.lua\n");

    ensureMaterializedReference(cwd, `.defold-types/${surfaceDir("defold-1.12.4")}`);

    const gitignore = readFileSync(path.join(cwd, ".gitignore"), "utf8");
    expect(gitignore).toContain(".defold-types/");
    expect(gitignore).toContain("src/**/*.lua");
  });

  test("is idempotent on re-run", () => {
    writeTsconfig({ compilerOptions: { types: ["@defold-typescript/types"] } });

    ensureMaterializedReference(cwd, `.defold-types/${surfaceDir("defold-1.12.4")}`);
    const first = readFileSync(path.join(cwd, "tsconfig.json"), "utf8");
    ensureMaterializedReference(cwd, `.defold-types/${surfaceDir("defold-1.12.4")}`);
    const second = readFileSync(path.join(cwd, "tsconfig.json"), "utf8");

    expect(second).toBe(first);
  });

  test("leaves an already-repointed tsconfig byte-identical regardless of formatting", () => {
    // Biome-style inline arrays: semantically already repointed, but not the
    // multi-line shape JSON.stringify emits. The repoint must not reformat it.
    const inline = [
      "{",
      '  "compilerOptions": {',
      '    "strict": true,',
      '    "typeRoots": [".defold-types"],',
      `    "types": ["${surfaceDir("defold-1.12.4")}"]`,
      "  },",
      '  "include": ["src/**/*.ts"]',
      "}",
      "",
    ].join("\n");
    writeFileSync(path.join(cwd, "tsconfig.json"), inline);

    ensureMaterializedReference(cwd, `.defold-types/${surfaceDir("defold-1.12.4")}`);

    expect(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")).toBe(inline);
  });

  test("a null materializedDir leaves tsconfig and .gitignore untouched", () => {
    writeTsconfig({ compilerOptions: { types: ["@defold-typescript/types"] } });
    const before = readFileSync(path.join(cwd, "tsconfig.json"), "utf8");

    ensureMaterializedReference(cwd, null);

    expect(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")).toBe(before);
    expect(existsSync(path.join(cwd, ".gitignore"))).toBe(false);
  });

  test("preserves a sibling extensions entry when the engine surface repoints", () => {
    writeTsconfig({ compilerOptions: { types: ["@defold-typescript/types"] } });

    ensureExtensionTypesReference(cwd, ".defold-types/extensions");
    ensureMaterializedReference(cwd, `.defold-types/${surfaceDir("defold-1.12.4")}`);

    const tsconfig = JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types: string[]; typeRoots: string[] };
    };
    expect(tsconfig.compilerOptions.types).toEqual([surfaceDir("defold-1.12.4"), "extensions"]);
    expect(tsconfig.compilerOptions.typeRoots).toEqual([".defold-types"]);
  });

  test("is idempotent once an extensions sibling is present", () => {
    writeTsconfig({ compilerOptions: { types: ["@defold-typescript/types"] } });

    ensureExtensionTypesReference(cwd, ".defold-types/extensions");
    ensureMaterializedReference(cwd, `.defold-types/${surfaceDir("defold-1.12.4")}`);
    const first = readFileSync(path.join(cwd, "tsconfig.json"), "utf8");
    ensureMaterializedReference(cwd, `.defold-types/${surfaceDir("defold-1.12.4")}`);
    const second = readFileSync(path.join(cwd, "tsconfig.json"), "utf8");

    expect(second).toBe(first);
  });
});

describe("materializeApiSurface consumer proof — imported + ambient types unify (bug-11)", () => {
  test("a built consumer importing Hash and using ambient hash() type-checks", () => {
    const pkgRoot = path.resolve(import.meta.dir, "..", "..", "types");
    const gen = path.join(pkgRoot, "generated");

    const { materializedDir } = materializeApiSurface({
      cwd,
      surface: CURRENT,
      sourceGeneratedDir: gen,
    });
    expect(materializedDir).toBe(`.defold-types/${surfaceDir("defold-1.12.4")}`);

    // Resolve `@defold-typescript/types` like an install: the import then hits
    // the package copy while ambient globals come from the materialized surface
    // — the exact mix that minted two distinct branded `Hash` copies (bug-11).
    mkdirSync(path.join(cwd, "node_modules", "@defold-typescript"), { recursive: true });
    symlinkSync(pkgRoot, path.join(cwd, "node_modules", "@defold-typescript", "types"));

    writeFileSync(
      path.join(cwd, "tsconfig.json"),
      `${JSON.stringify(
        {
          compilerOptions: {
            strict: true,
            module: "ESNext",
            moduleResolution: "bundler",
            lib: ["ES2022"],
            skipLibCheck: true,
            noEmit: true,
            typeRoots: [".defold-types"],
            types: [surfaceDir("defold-1.12.4")],
          },
          include: ["proof.ts"],
        },
        null,
        2,
      )}\n`,
    );
    writeFileSync(
      path.join(cwd, "proof.ts"),
      [
        'import type { Hash } from "@defold-typescript/types";',
        'const obstacle: Hash = hash("obstacle");',
        "function handle(message_id: Hash): void {",
        '  if (message_id === hash("contact_point_response")) void obstacle;',
        "}",
        "void handle;",
        "",
      ].join("\n"),
    );

    const { exitCode, output } = typecheck(path.join(cwd, "tsconfig.json"));
    if (exitCode !== 0) {
      throw new Error(
        `bug-11: imported Hash and ambient hash() must unify, but tsc failed:\n${output}`,
      );
    }
    expect(exitCode).toBe(0);
  });
});

const PINNED: SelectedApiSurface = { surfaceId: "defold-1.13.0", available: true };

function walkDts(dir: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...walkDts(path.join(dir, entry.name), rel));
    } else if (entry.name.endsWith(".d.ts")) {
      found.push(rel);
    }
  }
  return found;
}

// Every `.` specifier a materialized surface writes must land on a file the same
// surface holds. A byte assertion says which specifier changed; this says the
// whole rewritten graph closes, which is what `tsc` needs and what
// `skipLibCheck` (on in every consumer scaffold) hides.
function danglingSpecifiers(dir: string): string[] {
  const dangling: string[] = [];
  for (const rel of walkDts(dir)) {
    const file = path.join(dir, ...rel.split("/"));
    const contents = readFileSync(file, "utf8");
    for (const match of contents.matchAll(/(?:import|from) "(\.[^"]*)"/g)) {
      const target = path.resolve(path.dirname(file), match[1] ?? "");
      if (!existsSync(`${target}.d.ts`) && !existsSync(path.join(target, "index.d.ts"))) {
        dangling.push(`${rel} -> ${match[1]}`);
      }
    }
  }
  return dangling;
}

describe("materializeApiSurface editor surface", () => {
  const TYPES_ROOT = path.resolve(import.meta.dir, "..", "..", "types");
  const REAL_GENERATED = path.join(TYPES_ROOT, "generated");

  function materializeReal(): string {
    const { materializedDir } = materializeApiSurface({
      cwd,
      surface: PINNED,
      sourceGeneratedDir: REAL_GENERATED,
    });
    expect(materializedDir).toBe(`.defold-types/${surfaceDir("defold-1.13.0")}`);
    return path.join(cwd, ".defold-types", surfaceDir("defold-1.13.0"));
  }

  test("carries the declaring target's editor modules, hand-authored deps and editor kind", () => {
    const dir = materializeReal();

    for (const rel of [
      "editor.d.ts",
      "editor-vm/http.d.ts",
      "editor-vm/localization.d.ts",
      "editor-overloads.d.ts",
      "editor-vm-globals.d.ts",
      "editor-vm-types.d.ts",
      "kinds/editor-script.d.ts",
    ]) {
      expect(existsSync(path.join(dir, ...rel.split("/")))).toBe(true);
    }

    // The aggregate index stays the runtime surface: `editor.d.ts` is a
    // top-level module and was always in it, but the editor VM and the
    // hand-authored ambients belong to the editor kind alone.
    const index = readFileSync(path.join(dir, "index.d.ts"), "utf8");
    expect(index).toContain('import "./editor";');
    expect(index).not.toContain("editor-vm");
    expect(index).not.toContain("editor-overloads");

    const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(Object.keys(pkg).sort()).toEqual(["name", "types", "version"]);
  });

  test("the relocated kind index resolves from its new location", () => {
    const dir = materializeReal();
    const source = readFileSync(path.join(REAL_GENERATED, "kinds", "editor-script.d.ts"), "utf8");
    const written = readFileSync(path.join(dir, "kinds", "editor-script.d.ts"), "utf8");

    const sourceSpecs = [...source.matchAll(/^import "([^"]+)";$/gm)].map(
      (match) => match[1] ?? "",
    );
    expect(sourceSpecs.some((spec) => spec.includes("/src/"))).toBe(true);
    expect([...written.matchAll(/^import "([^"]+)";$/gm)].map((match) => match[1])).toEqual(
      sourceSpecs.map((spec) => (spec.includes("/src/") ? `../${spec.split("/src/")[1]}` : spec)),
    );

    expect(written).toContain(
      'export { defineEditorScript, defineEditorCommand } from "@defold-typescript/types/editor";',
    );
    expect(written).toContain(
      'export type { EditorCommandQuery, EditorNode } from "@defold-typescript/types/editor";',
    );
    expect(written).not.toContain("/src/");
  });

  test("a copied editor-vm module's core-types import is depth-aware", () => {
    const dir = materializeReal();

    const localization = readFileSync(path.join(dir, "editor-vm", "localization.d.ts"), "utf8");
    expect(localization).toContain('from "../core-types"');
    expect(localization).not.toContain('from "./core-types"');
    expect(localization).not.toContain("src/core-types");

    // A surface-root module keeps today's flat rewrite.
    expect(readFileSync(path.join(dir, "editor.d.ts"), "utf8")).toContain('from "./core-types"');
  });

  test("every relative specifier in the materialized surface resolves on disk", () => {
    expect(danglingSpecifiers(materializeReal())).toEqual([]);
  });

  test("derives the editor surface from the pinned target's kind index, not the package's", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-typesroot-"));
    try {
      const gen = path.join(root, "generated");
      const kinds = path.join(gen, "kinds");
      const src = path.join(root, "src");
      mkdirSync(kinds, { recursive: true });
      mkdirSync(path.join(gen, "editor-vm"), { recursive: true });
      mkdirSync(src);

      writeFileSync(path.join(gen, "editor.d.ts"), "declare const __editor: unknown;\n");
      writeFileSync(
        path.join(gen, "editor-vm", "pinned_only.d.ts"),
        'import type { Opaque } from "../../src/core-types";\ndeclare const __pinned: Opaque<"pinned">;\n',
      );
      writeFileSync(
        path.join(kinds, "editor-script.d.ts"),
        [
          'import "../editor";',
          'import "../editor-vm/pinned_only";',
          'import "../../src/pinned-overloads";',
          "",
          'export { defineEditorScript } from "../../src/editor";',
          "",
        ].join("\n"),
      );
      writeFileSync(
        path.join(src, "core-types.ts"),
        "export type Opaque<T extends string> = { readonly __brand: T };\n",
      );
      writeFileSync(
        path.join(src, "pinned-overloads.d.ts"),
        'import type { Opaque } from "./core-types";\ndeclare const __po: Opaque<"po">;\nexport {};\n',
      );
      for (const file of ["msg-overloads.d.ts", "message-guard.d.ts", "go-overloads.d.ts"]) {
        writeFileSync(path.join(src, file), "export {};\n");
      }

      materializeApiSurface({ cwd, surface: PINNED, sourceGeneratedDir: gen });

      const dir = path.join(cwd, ".defold-types", surfaceDir("defold-1.13.0"));
      expect(existsSync(path.join(dir, "editor-vm", "pinned_only.d.ts"))).toBe(true);
      expect(existsSync(path.join(dir, "pinned-overloads.d.ts"))).toBe(true);
      // The packaged default target's editor surface must never leak in.
      expect(existsSync(path.join(dir, "editor-vm-globals.d.ts"))).toBe(false);
      expect(existsSync(path.join(dir, "editor-vm", "localization.d.ts"))).toBe(false);

      const written = readFileSync(path.join(dir, "kinds", "editor-script.d.ts"), "utf8");
      expect(written).toContain('import "../pinned-overloads";');
      expect(written).toContain(
        'export { defineEditorScript } from "@defold-typescript/types/editor";',
      );
      expect(danglingSpecifiers(dir)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a target declaring no editor document writes no kinds/, and a stale one is pruned", () => {
    const dir = materializeReal();
    expect(existsSync(path.join(dir, "kinds"))).toBe(true);
    expect(existsSync(path.join(dir, "editor-vm"))).toBe(true);

    seedSource(["label"]);
    materializeApiSurface({ cwd, surface: PINNED, sourceGeneratedDir: sourceDir });

    expect(existsSync(path.join(dir, "kinds"))).toBe(false);
    expect(existsSync(path.join(dir, "editor-vm"))).toBe(false);
    expect(existsSync(path.join(dir, "editor-overloads.d.ts"))).toBe(false);
    expect(existsSync(path.join(dir, "label.d.ts"))).toBe(true);
  });

  test("a kind index naming a file that does not exist writes no kinds/ at all", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-typesroot-"));
    try {
      const gen = path.join(root, "generated");
      const kinds = path.join(gen, "kinds");
      mkdirSync(kinds, { recursive: true });
      mkdirSync(path.join(root, "src"));
      writeFileSync(path.join(gen, "editor.d.ts"), "declare const __editor: unknown;\n");
      writeFileSync(
        path.join(kinds, "editor-script.d.ts"),
        ['import "../editor";', 'import "../editor-vm/absent";', ""].join("\n"),
      );

      materializeApiSurface({ cwd, surface: PINNED, sourceGeneratedDir: gen });

      const dir = path.join(cwd, ".defold-types", surfaceDir("defold-1.13.0"));
      expect(existsSync(path.join(dir, "kinds"))).toBe(false);
      expect(existsSync(path.join(dir, "editor-vm"))).toBe(false);
      // Today's behavior for the rest of the surface is untouched.
      expect(existsSync(path.join(dir, "editor.d.ts"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("materializeRefDocSurface full surface (no kind narrowing)", () => {
  test("keeps every module — gui and render are never dropped", async () => {
    const resolveOpts = multiKindRefDocResolveOpts();

    const { materializedDir } = await materializeRefDocSurface({
      cwd,
      surfaceId: "defold-1.9.8",
      resolveOpts,
      registry: [multiKindRefDocTarget()],
    });
    expect(materializedDir).toBe(`.defold-types/${surfaceDir("defold-1.9.8")}`);

    const dir = path.join(cwd, ".defold-types", surfaceDir("defold-1.9.8"));
    expect(existsSync(path.join(dir, "gui.d.ts"))).toBe(true);
    expect(existsSync(path.join(dir, "render.d.ts"))).toBe(true);
    expect(existsSync(path.join(dir, "sprite.d.ts"))).toBe(true);

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });
});

describe("materializeRefDocSurface per-kind subpaths", () => {
  test("emits kinds/<kind>.d.ts for all three kinds plus an exports-bearing package.json", async () => {
    const resolveOpts = multiKindRefDocResolveOpts();

    const { materializedDir } = await materializeRefDocSurface({
      cwd,
      surfaceId: "defold-1.9.8",
      resolveOpts,
      registry: [multiKindRefDocTarget()],
    });
    expect(materializedDir).toBe(`.defold-types/${surfaceDir("defold-1.9.8")}`);

    const dir = path.join(cwd, ".defold-types", surfaceDir("defold-1.9.8"));
    const kinds = path.join(dir, "kinds");
    expect(existsSync(path.join(kinds, "script.d.ts"))).toBe(true);
    expect(existsSync(path.join(kinds, "gui-script.d.ts"))).toBe(true);
    expect(existsSync(path.join(kinds, "render-script.d.ts"))).toBe(true);

    const gui = readFileSync(path.join(kinds, "gui-script.d.ts"), "utf8");
    expect(gui).toContain('import "../gui";');
    expect(gui).not.toContain('import "../render";');

    const render = readFileSync(path.join(kinds, "render-script.d.ts"), "utf8");
    expect(render).toContain('import "../render";');
    expect(render).not.toContain('import "../gui";');

    const script = readFileSync(path.join(kinds, "script.d.ts"), "utf8");
    expect(script).not.toContain('import "../gui";');
    expect(script).not.toContain('import "../render";');

    const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };
    expect(Object.keys(pkg.exports).sort()).toEqual(
      [".", "./core-types", "./gui-script", "./render-script", "./script"].sort(),
    );

    const index = readFileSync(path.join(dir, "index.d.ts"), "utf8");
    expect(index).toContain('import "./gui";');
    expect(index).toContain('import "./render";');
    expect(index).toContain('import "./sprite";');

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });

  test("a surface without gui or render still emits all three kinds", async () => {
    const resolveOpts = labelRefDocResolveOpts();

    const { materializedDir } = await materializeRefDocSurface({
      cwd,
      surfaceId: "defold-1.9.8",
      resolveOpts,
    });
    expect(materializedDir).toBe(`.defold-types/${surfaceDir("defold-1.9.8")}`);

    const kinds = path.join(cwd, ".defold-types", surfaceDir("defold-1.9.8"), "kinds");
    for (const kind of ["script", "gui-script", "render-script"]) {
      expect(existsSync(path.join(kinds, `${kind}.d.ts`))).toBe(true);
    }
    const gui = readFileSync(path.join(kinds, "gui-script.d.ts"), "utf8");
    expect(gui).not.toContain('import "../gui";');
    const render = readFileSync(path.join(kinds, "render-script.d.ts"), "utf8");
    expect(render).not.toContain('import "../render";');

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });

  test("the editor kind is absent from the versioned manifest, so a surface carries no editor subpath", async () => {
    const { RUNTIME_KIND_MANIFEST } = (await import(
      path.resolve(import.meta.dir, "../../types/scripts/regen.ts")
    )) as { RUNTIME_KIND_MANIFEST: ReadonlyArray<{ kind: string }> };
    expect(RUNTIME_KIND_MANIFEST.map((entry) => entry.kind)).not.toContain("editor-script");

    const resolveOpts = labelRefDocResolveOpts();
    await materializeRefDocSurface({ cwd, surfaceId: "defold-1.9.8", resolveOpts });

    const dir = path.join(cwd, ".defold-types", surfaceDir("defold-1.9.8"));
    expect(existsSync(path.join(dir, "kinds", "editor-script.d.ts"))).toBe(false);
    const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };
    expect(Object.keys(pkg.exports)).not.toContain("./editor-script");

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });

  test("every kind a surface can carry is one a wall may narrow against", async () => {
    const { RUNTIME_KIND_MANIFEST, targetKindManifest } = (await import(
      path.resolve(import.meta.dir, "../../types/scripts/regen.ts")
    )) as {
      RUNTIME_KIND_MANIFEST: ReadonlyArray<{ kind: string }>;
      targetKindManifest: (target: unknown) => ReadonlyArray<{ kind: string }>;
    };
    const { PINNED_KIND_SUBPATHS } = await import("./directory-walls");
    const declaring = targetKindManifest(editorRefDocTarget()).map((entry) => entry.kind);
    // A wall that could never name a kind the surface writes would leave that
    // kind unreachable through a pinned surface.
    for (const kind of declaring) {
      expect(PINNED_KIND_SUBPATHS).toContain(kind);
    }
    expect(declaring).toEqual([
      ...RUNTIME_KIND_MANIFEST.map((entry) => entry.kind),
      "editor-script",
    ]);
    expect(targetKindManifest(multiKindRefDocTarget()).map((entry) => entry.kind)).toEqual(
      RUNTIME_KIND_MANIFEST.map((entry) => entry.kind),
    );
  });

  test("a declaring target's surface carries its editor modules, kind index and subpath export", async () => {
    const resolveOpts = multiKindRefDocResolveOpts();

    const { materializedDir } = await materializeRefDocSurface({
      cwd,
      surfaceId: "defold-1.9.8",
      resolveOpts,
      registry: [editorRefDocTarget()],
    });
    expect(materializedDir).toBe(`.defold-types/${surfaceDir("defold-1.9.8")}`);

    const dir = path.join(cwd, ".defold-types", surfaceDir("defold-1.9.8"));
    for (const rel of [
      "editor.d.ts",
      path.join("editor-vm", "zip.d.ts"),
      "editor-overloads.d.ts",
      "editor-vm-globals.d.ts",
      path.join("kinds", "editor-script.d.ts"),
    ]) {
      expect(existsSync(path.join(dir, rel))).toBe(true);
    }

    const index = readFileSync(path.join(dir, "kinds", "editor-script.d.ts"), "utf8");
    expect([...index.matchAll(/^import "([^"]+)";$/gm)].map((match) => match[1])).toEqual([
      "../editor",
      "../editor-vm/zip",
      "../editor-overloads",
      "../editor-vm-globals",
    ]);
    expect(index).toContain(
      'export { defineEditorScript, defineEditorCommand } from "@defold-typescript/types/editor";',
    );
    expect(index).toContain(
      'export type { EditorCommandQuery, EditorNode } from "@defold-typescript/types/editor";',
    );
    // Editor scripts run plain Lua 5.1 and have no script properties.
    expect(index).not.toContain("ScriptProperty");
    expect(index).not.toContain("jit-only");

    // The editor surface stays out of the runtime programs entirely.
    const script = readFileSync(path.join(dir, "kinds", "script.d.ts"), "utf8");
    for (const forbidden of ['import "../editor";', 'import "../editor-overloads";']) {
      expect(script).not.toContain(forbidden);
    }
    expect(readFileSync(path.join(dir, "index.d.ts"), "utf8")).not.toContain('import "./editor";');

    const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };
    expect(pkg.exports["./editor-script"]).toEqual({ types: "./kinds/editor-script.d.ts" });

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });

  test("a target declaring no editor document writes no editor file at all", async () => {
    const resolveOpts = multiKindRefDocResolveOpts();

    await materializeRefDocSurface({
      cwd,
      surfaceId: "defold-1.9.8",
      resolveOpts,
      registry: [multiKindRefDocTarget()],
    });

    const dir = path.join(cwd, ".defold-types", surfaceDir("defold-1.9.8"));
    for (const rel of ["editor.d.ts", "editor-overloads.d.ts", "editor-vm"]) {
      expect(existsSync(path.join(dir, rel))).toBe(false);
    }
    expect(existsSync(path.join(dir, "kinds", "script.d.ts"))).toBe(true);

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });
});

describe("materializeRefDocSurface consumer proof", () => {
  test("a generated .defold-types/<id>/ surface type-checks via tsc", async () => {
    const resolveOpts = labelRefDocResolveOpts();
    writeFileSync(
      path.join(cwd, "tsconfig.json"),
      `${JSON.stringify(
        {
          compilerOptions: {
            strict: true,
            module: "ESNext",
            moduleResolution: "bundler",
            lib: ["ES2022"],
            skipLibCheck: true,
            noEmit: true,
          },
          include: ["proof.ts"],
        },
        null,
        2,
      )}\n`,
    );

    const { materializedDir } = await materializeRefDocSurface({
      cwd,
      surfaceId: "defold-1.9.8",
      resolveOpts,
    });
    expect(materializedDir).toBe(`.defold-types/${surfaceDir("defold-1.9.8")}`);

    ensureMaterializedReference(cwd, materializedDir);

    const dir = path.join(cwd, ".defold-types", surfaceDir("defold-1.9.8"));
    expect(existsSync(path.join(dir, "label.d.ts"))).toBe(true);
    expect(existsSync(path.join(dir, "core-types.d.ts"))).toBe(true);

    writeFileSync(
      path.join(cwd, "proof.ts"),
      'export {};\nconst _t: string = label.get_text("score");\nconst _h: Hash = hash("score");\nvoid _t;\nvoid _h;\n',
    );

    const { exitCode, output } = typecheck(path.join(cwd, "tsconfig.json"));
    if (exitCode !== 0) {
      throw new Error(`materialized defold-1.9.8 surface did not type-check:\n${output}`);
    }
    expect(exitCode).toBe(0);

    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });
});

describe("pinned root paths", () => {
  const PKG_ROOT = path.resolve(import.meta.dir, "..", "..", "types");
  const MANAGED = "@defold-typescript/types";

  function writeTsconfig(compilerOptions: Record<string, unknown>): void {
    writeFileSync(
      path.join(cwd, "tsconfig.json"),
      `${JSON.stringify({ compilerOptions, include: ["src/**/*.ts"] }, null, 2)}\n`,
    );
  }

  function readPaths(): Record<string, string[]> | undefined {
    const tsconfig = JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { paths?: Record<string, string[]> };
    };
    return tsconfig.compilerOptions.paths;
  }

  function pin(): void {
    seedSource(["label"]);
    materializeApiSurface({ cwd, surface: CURRENT, sourceGeneratedDir: sourceDir });
    ensureMaterializedReference(cwd, `.defold-types/${surfaceDir("defold-1.12.4")}`);
  }

  test("binds the package specifier to the materialized surface alongside types/typeRoots", () => {
    writeTsconfig({ strict: true, types: ["@defold-typescript/types"] });

    pin();

    const tsconfig = JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types: string[]; typeRoots: string[]; paths: Record<string, string[]> };
    };
    expect(tsconfig.compilerOptions.types).toEqual([surfaceDir("defold-1.12.4")]);
    expect(tsconfig.compilerOptions.typeRoots).toEqual([".defold-types"]);
    expect(tsconfig.compilerOptions.paths[MANAGED]).toEqual([
      `./.defold-types/${surfaceDir("defold-1.12.4")}/root/index.d.ts`,
    ]);
  });

  test("the substitution target is a relative specifier tsc accepts without baseUrl", () => {
    // TS5090 rejects a `paths` target that is neither `./`-prefixed nor
    // absolute when `baseUrl` is unset — `.defold-types/...` is not enough.
    writeTsconfig({ strict: true });

    pin();

    for (const targets of Object.values(readPaths() ?? {})) {
      for (const target of targets) {
        expect(target.startsWith("./") || target.startsWith("../")).toBe(true);
      }
    }
  });

  test("resolves the substitution against the root config's baseUrl", () => {
    writeTsconfig({ strict: true, baseUrl: "src" });

    pin();

    expect(readPaths()?.[MANAGED]).toEqual([
      `../.defold-types/${surfaceDir("defold-1.12.4")}/root/index.d.ts`,
    ]);
  });

  test("keeps the project's own aliases and merges the managed entry beside them", () => {
    writeTsconfig({ strict: true, paths: { "@game/*": ["src/*"] } });

    pin();

    expect(readPaths()).toEqual({
      "@game/*": ["src/*"],
      [MANAGED]: [`./.defold-types/${surfaceDir("defold-1.12.4")}/root/index.d.ts`],
    });
  });

  test("a project alias for the package specifier itself is not clobbered", () => {
    writeTsconfig({ strict: true, paths: { [MANAGED]: ["./vendor/types/index.d.ts"] } });

    pin();

    expect(readPaths()?.[MANAGED]).toEqual(["./vendor/types/index.d.ts"]);
  });

  test("dropping the pin removes the managed entries and leaves the aliases untouched", () => {
    writeTsconfig({ strict: true, paths: { "@game/*": ["src/*"] } });
    pin();

    ensureMaterializedReference(cwd, null);

    expect(readPaths()).toEqual({ "@game/*": ["src/*"] });
  });

  test("dropping the pin deletes the paths key when only managed entries remained", () => {
    writeTsconfig({ strict: true });
    pin();
    expect(readPaths()).toBeDefined();

    ensureMaterializedReference(cwd, null);

    expect(readPaths()).toBeUndefined();
  });

  test("re-pinning to another surface repoints rather than accumulating entries", () => {
    writeTsconfig({ strict: true });
    pin();

    materializeApiSurface({ cwd, surface: PINNED, sourceGeneratedDir: sourceDir });
    ensureMaterializedReference(cwd, `.defold-types/${surfaceDir("defold-1.13.0")}`);

    expect(readPaths()?.[MANAGED]).toEqual([
      `./.defold-types/${surfaceDir("defold-1.13.0")}/root/index.d.ts`,
    ]);
  });

  test("is idempotent — a second pin leaves the file byte-identical", () => {
    writeTsconfig({ strict: true, paths: { "@game/*": ["src/*"] } });
    pin();
    const first = readFileSync(path.join(cwd, "tsconfig.json"), "utf8");

    ensureMaterializedReference(cwd, `.defold-types/${surfaceDir("defold-1.12.4")}`);

    expect(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")).toBe(first);
  });

  test("an unpinned project with no managed entries is left byte-identical", () => {
    writeTsconfig({ strict: true, paths: { "@game/*": ["src/*"] } });
    const before = readFileSync(path.join(cwd, "tsconfig.json"), "utf8");

    ensureMaterializedReference(cwd, null);

    expect(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")).toBe(before);
  });

  test("maps each published subpath the surface actually serves", async () => {
    const resolveOpts = multiKindRefDocResolveOpts();
    const { materializedDir } = await materializeRefDocSurface({
      cwd,
      surfaceId: "defold-1.9.8",
      resolveOpts,
      registry: [multiKindRefDocTarget()],
    });
    writeTsconfig({ strict: true });

    ensureMaterializedReference(cwd, materializedDir);

    const paths = readPaths() ?? {};
    for (const kind of ["script", "gui-script", "render-script"]) {
      expect(paths[`${MANAGED}/${kind}`]).toEqual([
        `./.defold-types/${surfaceDir("defold-1.9.8")}/kinds/${kind}.d.ts`,
      ]);
    }
    rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
  });

  test("never maps a subpath the surface does not hold", () => {
    writeTsconfig({ strict: true });

    pin();

    // The engine surface writes no runtime kind indexes, so a `script` redirect
    // would dangle — and a dangling `paths` target silently disables the pin
    // for that specifier instead of narrowing it.
    expect(readPaths()?.[`${MANAGED}/script`]).toBeUndefined();
    for (const targets of Object.values(readPaths() ?? {})) {
      for (const target of targets) {
        const abs = path.resolve(cwd, target);
        expect(existsSync(abs) || existsSync(path.join(abs, "index.d.ts"))).toBe(true);
      }
    }
  });

  test("never remaps the shared core-types brand or a JSON data subpath", () => {
    writeTsconfig({ strict: true });

    pin();

    const paths = readPaths() ?? {};
    expect(paths[`${MANAGED}/core-types`]).toBeUndefined();
    expect(paths[`${MANAGED}/api-availability.json`]).toBeUndefined();
    expect(paths[`${MANAGED}/package.json`]).toBeUndefined();
  });

  test("the surface root entrypoint imports the pinned ambient index and re-exports the package API", () => {
    seedSource(["label"]);

    materializeApiSurface({ cwd, surface: CURRENT, sourceGeneratedDir: sourceDir });

    const root = readFileSync(
      path.join(cwd, ".defold-types", surfaceDir("defold-1.12.4"), "root", "index.d.ts"),
      "utf8",
    );
    expect(root).toContain('import "../index";');
    expect(root).toContain(`export * from "${MANAGED}/lifecycle";`);
    expect(root).toContain(`export * from "${MANAGED}/core-types";`);
    // Kind indexes carry the ambient generated namespaces the pin narrows; a
    // re-export of one would load the installed surface right back in.
    expect(root).not.toContain(`export * from "${MANAGED}/script";`);
    expect(root).not.toContain(`export * from "${MANAGED}/api-availability.json";`);
    expect(PKG_ROOT.length).toBeGreaterThan(0);
  });
});

describe("materialized surface identity", () => {
  const PKG_ROOT = path.resolve(import.meta.dir, "..", "..", "types");

  function readCompilerOptions(): {
    types?: string[];
    typeRoots?: string[];
    paths?: Record<string, string[]>;
  } {
    const tsconfig = JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: {
        types?: string[];
        typeRoots?: string[];
        paths?: Record<string, string[]>;
      };
    };
    return tsconfig.compilerOptions;
  }

  function writeBareTsconfig(): void {
    writeFileSync(
      path.join(cwd, "tsconfig.json"),
      `${JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }, null, 2)}\n`,
    );
  }

  test("the surface directory names the Defold target and the generating toolchain", () => {
    expect(surfaceDirName("defold-1.12.4", "0.26.0")).toBe("defold-1.12.4@0.26.0");
  });

  test("the directory, the tsconfig types entry and every paths target name one surface", () => {
    seedSource(["label"]);
    writeBareTsconfig();

    const { materializedDir } = materializeApiSurface({
      cwd,
      surface: CURRENT,
      sourceGeneratedDir: sourceDir,
      cliVersion: "0.26.0",
    });
    ensureMaterializedReference(cwd, materializedDir);

    expect(materializedDir).toBe(".defold-types/defold-1.12.4@0.26.0");
    expect(existsSync(path.join(cwd, ".defold-types", "defold-1.12.4@0.26.0", "label.d.ts"))).toBe(
      true,
    );

    const options = readCompilerOptions();
    expect(options.types).toEqual(["defold-1.12.4@0.26.0"]);
    const targets = Object.values(options.paths ?? {}).flat();
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(target).toContain("/defold-1.12.4@0.26.0/");
    }
  });

  test("a toolchain upgrade leaves the earlier surface intact and repoints tsconfig", () => {
    seedSource(["label"]);
    writeBareTsconfig();

    const first = materializeApiSurface({
      cwd,
      surface: CURRENT,
      sourceGeneratedDir: sourceDir,
      cliVersion: "0.26.0",
    });
    ensureMaterializedReference(cwd, first.materializedDir);
    const firstDir = path.join(cwd, ".defold-types", "defold-1.12.4@0.26.0");
    writeFileSync(path.join(firstDir, "sentinel.txt"), "written by 0.26.0\n");

    const second = materializeApiSurface({
      cwd,
      surface: CURRENT,
      sourceGeneratedDir: sourceDir,
      cliVersion: "0.27.0",
    });
    ensureMaterializedReference(cwd, second.materializedDir);

    expect(second.materializedDir).toBe(".defold-types/defold-1.12.4@0.27.0");
    expect(readFileSync(path.join(firstDir, "sentinel.txt"), "utf8")).toBe("written by 0.26.0\n");
    expect(existsSync(path.join(firstDir, "label.d.ts"))).toBe(true);
    expect(readCompilerOptions().types).toEqual(["defold-1.12.4@0.27.0"]);
    expect(readdirSync(path.join(cwd, ".defold-types")).sort()).toEqual([
      "defold-1.12.4@0.26.0",
      "defold-1.12.4@0.27.0",
    ]);
  });

  test("a surface missing its stamp is never served as-is; the re-run rewrites it", () => {
    seedSource(["label"]);

    const first = materializeApiSurface({
      cwd,
      surface: CURRENT,
      sourceGeneratedDir: sourceDir,
      cliVersion: "0.26.0",
    });
    const dir = path.join(cwd, first.materializedDir as string);
    rmSync(path.join(dir, "package.json"), { force: true });
    expect(surfaceStampStatus(dir)).toBe("missing");
    writeFileSync(path.join(dir, "index.d.ts"), "// stale\n");

    const second = materializeApiSurface({
      cwd,
      surface: CURRENT,
      sourceGeneratedDir: sourceDir,
      cliVersion: "0.26.0",
    });

    expect(second.materializedDir).toBe(first.materializedDir);
    expect(readFileSync(path.join(dir, "index.d.ts"), "utf8")).toContain('import "./label";');
    expect(surfaceStampStatus(dir)).toBe("match");
  });

  test("a surface whose stamp disagrees with its name is never served as-is", () => {
    seedSource(["label"]);

    const first = materializeApiSurface({
      cwd,
      surface: CURRENT,
      sourceGeneratedDir: sourceDir,
      cliVersion: "0.26.0",
    });
    const dir = path.join(cwd, first.materializedDir as string);
    const pkgPath = path.join(dir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
    writeFileSync(pkgPath, JSON.stringify({ ...pkg, version: "0.1.0" }));
    expect(surfaceStampStatus(dir)).toBe("mismatch");
    writeFileSync(path.join(dir, "index.d.ts"), "// stale\n");

    materializeApiSurface({
      cwd,
      surface: CURRENT,
      sourceGeneratedDir: sourceDir,
      cliVersion: "0.26.0",
    });

    expect(readFileSync(path.join(dir, "index.d.ts"), "utf8")).toContain('import "./label";');
    expect(surfaceStampStatus(dir)).toBe("match");
  });

  test("the surface stamps its generating toolchain and a disagreeing stamp is detected", () => {
    seedSource(["label"]);

    const { materializedDir } = materializeApiSurface({
      cwd,
      surface: CURRENT,
      sourceGeneratedDir: sourceDir,
      cliVersion: "0.26.0",
    });
    const dir = path.join(cwd, materializedDir as string);
    const pkgPath = path.join(dir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, unknown>;

    expect(pkg.version).toBe("0.26.0");
    expect(surfaceStampStatus(dir)).toBe("match");

    writeFileSync(pkgPath, JSON.stringify({ ...pkg, version: "0.1.0" }));
    expect(surfaceStampStatus(dir)).toBe("mismatch");

    const { version: _stamp, ...unstamped } = pkg;
    writeFileSync(pkgPath, JSON.stringify(unstamped));
    expect(surfaceStampStatus(dir)).toBe("missing");
  });

  test("an @-bearing surface directory resolves through tsc", () => {
    const { materializedDir } = materializeApiSurface({
      cwd,
      surface: CURRENT,
      sourceGeneratedDir: path.join(PKG_ROOT, "generated"),
      cliVersion: "0.26.0",
    });
    expect(materializedDir).toBe(".defold-types/defold-1.12.4@0.26.0");

    mkdirSync(path.join(cwd, "node_modules", "@defold-typescript"), { recursive: true });
    symlinkSync(PKG_ROOT, path.join(cwd, "node_modules", "@defold-typescript", "types"));
    writeFileSync(
      path.join(cwd, "tsconfig.json"),
      `${JSON.stringify(
        {
          compilerOptions: {
            strict: true,
            module: "ESNext",
            moduleResolution: "bundler",
            lib: ["ES2022"],
            skipLibCheck: true,
            noEmit: true,
          },
          include: ["proof.ts"],
        },
        null,
        2,
      )}\n`,
    );
    ensureMaterializedReference(cwd, materializedDir);
    writeFileSync(
      path.join(cwd, "proof.ts"),
      [
        'import type { Hash } from "@defold-typescript/types";',
        'const obstacle: Hash = hash("obstacle");',
        "void obstacle;",
        "",
      ].join("\n"),
    );

    const { exitCode, output } = typecheck(path.join(cwd, "tsconfig.json"));
    if (exitCode !== 0) {
      throw new Error(`the @-separated surface directory must resolve, but tsc failed:\n${output}`);
    }
    expect(exitCode).toBe(0);
  });

  test("a materialization that fails after the declarations are written leaves no stamp", () => {
    seedSource(["label"]);
    const dir = path.join(cwd, ".defold-types", surfaceDir("defold-1.12.4"));
    mkdirSync(dir, { recursive: true });
    // `writePinnedRootEntrypoint` has to create `root/` as a directory, so a
    // plain file there fails the real write at the point a late failure would.
    // The name carries no `.d.ts`, so the stale-declaration sweep leaves it.
    writeFileSync(path.join(dir, "root"), "");

    expect(() =>
      materializeApiSurface({ cwd, surface: CURRENT, sourceGeneratedDir: sourceDir }),
    ).toThrow();

    expect(existsSync(path.join(dir, "label.d.ts"))).toBe(true);
    expect(surfaceStampStatus(dir)).toBe("missing");
  });

  test("a failed rewrite of a complete surface does not leave the previous stamp vouching for it", () => {
    seedSource(["label"]);
    const first = materializeApiSurface({ cwd, surface: CURRENT, sourceGeneratedDir: sourceDir });
    const dir = path.join(cwd, first.materializedDir as string);
    expect(surfaceStampStatus(dir)).toBe("match");

    rmSync(path.join(dir, "root"), { recursive: true, force: true });
    writeFileSync(path.join(dir, "root"), "");

    expect(() =>
      materializeApiSurface({ cwd, surface: CURRENT, sourceGeneratedDir: sourceDir }),
    ).toThrow();

    expect(surfaceStampStatus(dir)).toBe("missing");
  });

  test("a failure in the editor carry-over leaves no stamp, though the root entrypoint already landed", () => {
    const generated = path.join(PKG_ROOT, "generated");
    const first = materializeApiSurface({
      cwd,
      surface: PINNED,
      sourceGeneratedDir: generated,
    });
    const dir = path.join(cwd, first.materializedDir as string);
    expect(surfaceStampStatus(dir)).toBe("match");

    // A directory where a carried editor declaration must be written. The
    // surface wants that name, so the stale sweep leaves it and the carry-over
    // `writeFileSync` fails on it — strictly after the root entrypoint, which
    // is removed here so its reappearance proves the run got that far.
    const carried = path.join(dir, "editor-overloads.d.ts");
    rmSync(carried, { force: true });
    mkdirSync(carried);
    rmSync(path.join(dir, "root"), { recursive: true, force: true });

    expect(() =>
      materializeApiSurface({ cwd, surface: PINNED, sourceGeneratedDir: generated }),
    ).toThrow();

    expect(existsSync(path.join(dir, "root", "index.d.ts"))).toBe(true);
    expect(surfaceStampStatus(dir)).toBe("missing");
  });
});
