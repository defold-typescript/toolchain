import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { transpileProject } from "@defold-typescript/transpiler";
import { type ExtensionZip, extensionArchiveKey } from "./extension-archive";
import { runResolve } from "./resolve";

// The three `.script_api` docs are vendored unmodified from
// https://github.com/defold/extension-spine/tree/4.8.0/defold-spine/api — the
// upstream input production parses, not a hand-written stand-in for it. Spine is
// the worked case because two of its docs declare engine-owned namespaces
// (`gui`, `resource`) while the third declares its own, and its signatures are
// branded almost throughout.
const FIXTURES = join(import.meta.dir, "..", "test", "fixtures", "extension-spine-4.8.0");
const URL = "https://github.com/defold/extension-spine/archive/4.8.0.zip";
const DOCS = ["spine", "spine_gui", "spine_resource"] as const;

// Nested under the GitHub wrapper dir exactly as the archive ships them, so the
// wrapper strip and the plain `\.script_api$` locator are both exercised.
const entryFor = (doc: string): string =>
  `extension-spine-4.8.0/defold-spine/api/${doc}.script_api`;

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "spine-e2e-"));
}

const someBytes = async (): Promise<Uint8Array> => new TextEncoder().encode("z");

function spineReadZip(zipPath: string): ExtensionZip {
  if (basename(dirname(zipPath)) !== extensionArchiveKey(URL)) {
    throw new Error(`no fake archive for ${zipPath}`);
  }
  return {
    entries: () => [...DOCS.map(entryFor), "extension-spine-4.8.0/README.md"],
    read: (entry: string) => {
      const doc = DOCS.find((name) => entry === entryFor(name));
      if (doc === undefined) {
        throw new Error(`unexpected read of ${entry}`);
      }
      return readFileSync(join(FIXTURES, `${doc}.script_api`), "utf8");
    },
  };
}

interface ResolvedSpine {
  readonly dir: string;
  readonly declarations: Record<string, string>;
}

async function resolveSpine(): Promise<ResolvedSpine> {
  const cwd = tmp();
  writeFileSync(join(cwd, "game.project"), `[project]\ndependencies#0 = ${URL}\n`);
  writeFileSync(
    join(cwd, "tsconfig.json"),
    `${JSON.stringify({ compilerOptions: { types: ["@defold-typescript/types"] } }, null, 2)}\n`,
  );

  const result = await runResolve({
    cwd,
    cacheDir: tmp(),
    download: someBytes,
    readZip: spineReadZip,
  });
  expect(result.ok).toBe(true);

  const dir = join(cwd, ".defold-types", "extensions");
  const declarations: Record<string, string> = {};
  for (const entry of readdirSync(dir)) {
    if (entry.endsWith(".d.ts")) {
      declarations[entry] = readFileSync(join(dir, entry), "utf8");
    }
  }
  return { dir, declarations };
}

function errorDiagnostics(consumer: string, declarations: Record<string, string>): string[] {
  const files: Record<string, string> = { ...declarations, "main.ts": consumer };
  delete files["index.d.ts"];
  return transpileProject({ files })
    .diagnostics.filter((d) => d.category !== "warning")
    .map((d) => d.message);
}

describe("extension-spine resolves and its materialized types are usable end to end", () => {
  test("all three docs resolve to the namespaces they declare", async () => {
    const cwd = tmp();
    writeFileSync(join(cwd, "game.project"), `[project]\ndependencies#0 = ${URL}\n`);
    writeFileSync(
      join(cwd, "tsconfig.json"),
      `${JSON.stringify({ compilerOptions: { types: ["@defold-typescript/types"] } }, null, 2)}\n`,
    );

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: spineReadZip,
    });

    expect(result.ok).toBe(true);
    expect(result.materializedSurface).toBe(".defold-types/extensions");
    expect(result.extensions).toEqual([
      {
        url: URL,
        provenance: "download",
        namespaces: ["gui", "resource", "spine"],
        scriptApiCount: 3,
        sceneSources: 0,
        assetOnly: false,
        resolvedVersion: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) as unknown as string,
        pinStatus: "unpinned",
      },
    ]);

    const dir = join(cwd, ".defold-types", "extensions");
    expect(
      readdirSync(dir)
        .filter((e) => e.endsWith(".d.ts"))
        .sort(),
    ).toEqual(["gui.d.ts", "index.d.ts", "resource.d.ts", "spine.d.ts"]);
    expect(readFileSync(join(dir, "index.d.ts"), "utf8")).toBe(
      'import "./gui";\nimport "./resource";\nimport "./spine";\n\nexport {};\n',
    );
  });

  test("no materialized declaration dangles on the emitter's relative core-types path", async () => {
    const { declarations } = await resolveSpine();

    const branded = Object.entries(declarations).filter(([, text]) => text.includes("core-types"));
    expect(branded.map(([name]) => name).sort()).toEqual([
      "gui.d.ts",
      "resource.d.ts",
      "spine.d.ts",
    ]);
    for (const [, text] of branded) {
      expect(text).toContain('from "@defold-typescript/types/core-types"');
    }
    for (const [, text] of Object.entries(declarations)) {
      expect(text).not.toContain("/src/core-types");
    }
  });

  test("the extension's gui members merge with the engine's rather than shadow them", async () => {
    const { declarations } = await resolveSpine();

    const consumer = [
      "export function run(): void {",
      '  const node = gui.get_node("spineboy");',
      '  gui.set_spine_skin(node, "default");',
      '  gui.get_spine_bone(node, hash("root"));',
      // Referenced rather than called: the doc types its `playback` slot
      // `constant`, which maps to `Opaque<"constant">` and no engine value
      // produces one. Naming the member still reds if `gui` were shadowed.
      "  void gui.play_spine_anim;",
      "  gui.set_position(gui.get_parent(node) ?? node, vmath.vector3(0, 0, 0));",
      '  gui.new_spine_node(vmath.vector3(0, 0, 0), "spinescene");',
      "}",
      "",
    ].join("\n");

    expect(errorDiagnostics(consumer, declarations)).toEqual([]);
  });

  test("the extension's resource members merge with the engine's too", async () => {
    const { declarations } = await resolveSpine();

    const consumer = [
      "export function run(): void {",
      '  resource.create_spinescene("/dyn/character.spinescenec", {',
      '    spine_data: "{}",',
      '    atlas_path: "/textures/character.a.texturesetc",',
      "  });",
      '  resource.load("/textures/character.a.texturesetc");',
      "}",
      "",
    ].join("\n");

    expect(errorDiagnostics(consumer, declarations)).toEqual([]);
  });

  test("branded slots type as brands, not any (the compile check is not vacuous)", async () => {
    const { declarations } = await resolveSpine();

    const good = [
      "export function run(): void {",
      '  spine.play_anim(hash("/go#spinemodel"), "run", go.PLAYBACK_ONCE_FORWARD, undefined, () => {});',
      "}",
      "",
    ].join("\n");
    expect(errorDiagnostics(good, declarations)).toEqual([]);

    const bad = [
      "export function run(): void {",
      '  spine.play_anim(1, "run", go.PLAYBACK_ONCE_FORWARD, undefined, () => {});',
      "}",
      "",
    ].join("\n");
    expect(errorDiagnostics(bad, declarations).length).toBeGreaterThan(0);
  });
});
