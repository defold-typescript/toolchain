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
import { ensureExtensionTypesReference } from "./extension-materialize";
import {
  ensureMaterializedReference,
  materializeApiSurface,
  materializeRefDocSurface,
} from "./materialize";
import {
  labelRefDocResolveOpts,
  multiKindRefDocResolveOpts,
  multiKindRefDocTarget,
} from "./ref-doc-test-fixture";

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
      materializedDir: ".defold-types/defold-1.12.4",
      active: "defold-1.12.4",
    });

    const dir = path.join(cwd, ".defold-types", "defold-1.12.4");
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

      const dir = path.join(cwd, ".defold-types", "defold-1.12.4");
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
    expect(materializedDir).toBe(".defold-types/defold-1.12.4");

    const dir = path.join(cwd, ".defold-types", "defold-1.12.4");
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

      const dir = path.join(cwd, ".defold-types", "defold-1.12.4");
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

    const dir = path.join(cwd, ".defold-types", "defold-1.12.4");
    expect(result).toEqual({
      materializedDir: ".defold-types/defold-1.12.4",
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
    const dir = path.join(cwd, ".defold-types", "defold-1.12.4");
    return readdirSync(dir).filter((file) => file.endsWith(".d.ts") && file !== "index.d.ts");
  }

  function indexContents(): string {
    return readFileSync(path.join(cwd, ".defold-types", "defold-1.12.4", "index.d.ts"), "utf8");
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

    ensureMaterializedReference(cwd, ".defold-types/defold-1.12.4");

    const tsconfig = JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types: string[]; typeRoots: string[] };
    };
    expect(tsconfig.compilerOptions.types).toEqual(["defold-1.12.4"]);
    expect(tsconfig.compilerOptions.types).not.toContain("@defold-typescript/types");
    expect(tsconfig.compilerOptions.typeRoots).toEqual([".defold-types"]);
  });

  test("adds .defold-types/ to .gitignore", () => {
    writeTsconfig({ compilerOptions: {} });
    writeFileSync(path.join(cwd, ".gitignore"), "src/**/*.lua\n");

    ensureMaterializedReference(cwd, ".defold-types/defold-1.12.4");

    const gitignore = readFileSync(path.join(cwd, ".gitignore"), "utf8");
    expect(gitignore).toContain(".defold-types/");
    expect(gitignore).toContain("src/**/*.lua");
  });

  test("is idempotent on re-run", () => {
    writeTsconfig({ compilerOptions: { types: ["@defold-typescript/types"] } });

    ensureMaterializedReference(cwd, ".defold-types/defold-1.12.4");
    const first = readFileSync(path.join(cwd, "tsconfig.json"), "utf8");
    ensureMaterializedReference(cwd, ".defold-types/defold-1.12.4");
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
      '    "types": ["defold-1.12.4"]',
      "  },",
      '  "include": ["src/**/*.ts"]',
      "}",
      "",
    ].join("\n");
    writeFileSync(path.join(cwd, "tsconfig.json"), inline);

    ensureMaterializedReference(cwd, ".defold-types/defold-1.12.4");

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
    ensureMaterializedReference(cwd, ".defold-types/defold-1.12.4");

    const tsconfig = JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types: string[]; typeRoots: string[] };
    };
    expect(tsconfig.compilerOptions.types).toEqual(["defold-1.12.4", "extensions"]);
    expect(tsconfig.compilerOptions.typeRoots).toEqual([".defold-types"]);
  });

  test("is idempotent once an extensions sibling is present", () => {
    writeTsconfig({ compilerOptions: { types: ["@defold-typescript/types"] } });

    ensureExtensionTypesReference(cwd, ".defold-types/extensions");
    ensureMaterializedReference(cwd, ".defold-types/defold-1.12.4");
    const first = readFileSync(path.join(cwd, "tsconfig.json"), "utf8");
    ensureMaterializedReference(cwd, ".defold-types/defold-1.12.4");
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
    expect(materializedDir).toBe(".defold-types/defold-1.12.4");

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
            types: ["defold-1.12.4"],
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

describe("materializeRefDocSurface full surface (no kind narrowing)", () => {
  test("keeps every module — gui and render are never dropped", async () => {
    const resolveOpts = multiKindRefDocResolveOpts();

    const { materializedDir } = await materializeRefDocSurface({
      cwd,
      surfaceId: "defold-1.9.8",
      resolveOpts,
      registry: [multiKindRefDocTarget()],
    });
    expect(materializedDir).toBe(".defold-types/defold-1.9.8");

    const dir = path.join(cwd, ".defold-types", "defold-1.9.8");
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
    expect(materializedDir).toBe(".defold-types/defold-1.9.8");

    const dir = path.join(cwd, ".defold-types", "defold-1.9.8");
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
    expect(materializedDir).toBe(".defold-types/defold-1.9.8");

    const kinds = path.join(cwd, ".defold-types", "defold-1.9.8", "kinds");
    for (const kind of ["script", "gui-script", "render-script"]) {
      expect(existsSync(path.join(kinds, `${kind}.d.ts`))).toBe(true);
    }
    const gui = readFileSync(path.join(kinds, "gui-script.d.ts"), "utf8");
    expect(gui).not.toContain('import "../gui";');
    const render = readFileSync(path.join(kinds, "render-script.d.ts"), "utf8");
    expect(render).not.toContain('import "../render";');

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
    expect(materializedDir).toBe(".defold-types/defold-1.9.8");

    ensureMaterializedReference(cwd, materializedDir);

    const dir = path.join(cwd, ".defold-types", "defold-1.9.8");
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
