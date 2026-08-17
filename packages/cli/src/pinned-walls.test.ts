import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  materializedSurfaceKinds,
  planSourceDirectoryWalls,
  resolveActivePinnedSurface,
  wireWallReferences,
  writeDirectoryWallTsconfigs,
} from "./directory-walls";
import {
  ensureMaterializedReference,
  materializeApiSurface,
  materializeRefDocSurface,
} from "./materialize";
import { multiKindRefDocResolveOpts, multiKindRefDocTarget } from "./ref-doc-test-fixture";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
const BIN_DIR = path.join(REPO_ROOT, "node_modules", ".bin");
const TYPES_PKG = path.join(REPO_ROOT, "packages", "types");

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-pinned-walls-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function touch(rel: string, contents = ""): void {
  const full = path.join(cwd, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, contents);
}

// Symlink the materialized ref-doc surface as the consumer-side `@defold-typescript/types`
// entrypoint. Distinct from `composite-walls.test.ts`'s installed-package symlink:
// this project has no installed package — the materialized surface itself plays
// that role via its `exports` map (`./gui-script` -> `./kinds/gui-script.d.ts`).
function linkMaterializedSurface(): void {
  const scope = path.join(cwd, "node_modules", "@defold-typescript");
  mkdirSync(scope, { recursive: true });
  symlinkSync(path.join(cwd, ".defold-types", "defold-1.9.8"), path.join(scope, "types"), "dir");
}

function writeRootTsconfig(extraCompilerOptions: Record<string, unknown> = {}): void {
  touch(
    "tsconfig.json",
    `${JSON.stringify(
      {
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "bundler",
          lib: ["ES2022"],
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          types: ["@defold-typescript/types"],
          ...extraCompilerOptions,
        },
        include: ["src/**/*.ts"],
      },
      null,
      2,
    )}\n`,
  );
}

function scaffoldSources(guiBody: string, renderBody: string): void {
  touch("src/ui/hud.gui_script");
  touch("src/rendering/camera.render_script");
  touch(
    "src/ui/hud.ts",
    [
      'import { defineGuiScript } from "@defold-typescript/types/gui-script";',
      "defineGuiScript({",
      "  init() {",
      guiBody,
      "  },",
      "});",
    ].join("\n"),
  );
  touch(
    "src/rendering/camera.ts",
    [
      'import { defineRenderScript } from "@defold-typescript/types/render-script";',
      "defineRenderScript({",
      "  update() {",
      renderBody,
      "  },",
      "});",
    ].join("\n"),
  );
}

// `force` defeats the composite build's up-to-date cache, which otherwise
// survives an edit to a wall's own `tsconfig.json` and replays the prior result.
function typecheckBuild(cwd: string, force = false): { code: number; output: string } {
  const proc = Bun.spawnSync(
    [path.join(BIN_DIR, "tsc"), "-b", "--noEmit", ...(force ? ["--force"] : [])],
    {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 60_000,
    },
  );
  return { code: proc.exitCode, output: `${proc.stdout.toString()}${proc.stderr.toString()}` };
}

async function materializPinnedMultiKind(): Promise<void> {
  const resolveOpts = multiKindRefDocResolveOpts();
  const result = await materializeRefDocSurface({
    cwd,
    surfaceId: "defold-1.9.8",
    resolveOpts,
    registry: [multiKindRefDocTarget()],
  });
  if (result.materializedDir === null) {
    throw new Error("materializeRefDocSurface returned null");
  }
  ensureMaterializedReference(cwd, result.materializedDir);
  rmSync(resolveOpts.cacheDir, { recursive: true, force: true });
}

describe("composite directory walls under a pinned ref-doc surface", () => {
  test("tsc -b accepts a gui wall using the per-kind subpath factory and gui namespace", async () => {
    // Order matters: write the user-side root tsconfig FIRST so
    // `ensureMaterializedReference` (called inside `materializPinnedMultiKind`)
    // repoints it with `typeRoots: [".defold-types"]` and `types: ["defold-1.9.8"]`.
    writeRootTsconfig();
    await materializPinnedMultiKind();
    linkMaterializedSurface();
    scaffoldSources('    gui.get_node("x");', "    render.set_depth_mask(true);");

    // Mirror `applyWallSelection`: resolve the pinned surface first so the
    // consumer-side per-kind subdirs are mirrored into the materialized
    // surface before the wall tsconfigs are written.
    const pinned = resolveActivePinnedSurface(cwd);
    expect(pinned).toBe("defold-1.9.8");

    const walls = planSourceDirectoryWalls(cwd);
    writeDirectoryWallTsconfigs(cwd, walls, pinned);
    wireWallReferences(cwd, walls);

    const { code, output } = typecheckBuild(cwd);
    if (code !== 0) {
      throw new Error(
        `expected clean composite type-check under a pinned surface, got:\n${output}`,
      );
    }
    expect(code).toBe(0);
  });

  test("tsc -b rejects render namespace access inside a gui wall under a pinned surface", async () => {
    writeRootTsconfig();
    await materializPinnedMultiKind();
    linkMaterializedSurface();
    scaffoldSources("    render.set_depth_mask(true);", "    render.set_depth_mask(true);");

    const pinned = resolveActivePinnedSurface(cwd);
    expect(pinned).toBe("defold-1.9.8");

    const walls = planSourceDirectoryWalls(cwd);
    writeDirectoryWallTsconfigs(cwd, walls, pinned);
    wireWallReferences(cwd, walls);

    const { code, output } = typecheckBuild(cwd);
    expect(code).not.toBe(0);
    expect(output).toContain("render");
  });
});

// A committed target goes through `materializeApiSurface`, and only its editor
// kind is ever carried: `regen` emits only `only`-kinds per versioned target, so
// a runtime sibling wall must keep the installed entrypoint.
describe("composite directory walls under a pinned committed surface", () => {
  const COMMITTED = "defold-1.13.0";

  function linkTypesPackage(): void {
    const scope = path.join(cwd, "node_modules", "@defold-typescript");
    mkdirSync(scope, { recursive: true });
    symlinkSync(TYPES_PKG, path.join(scope, "types"), "dir");
  }

  function materializeCommitted(): void {
    const { materializedDir } = materializeApiSurface({
      cwd,
      surface: { surfaceId: COMMITTED, available: true },
      sourceGeneratedDir: path.join(TYPES_PKG, "generated"),
    });
    expect(materializedDir).toBe(`.defold-types/${COMMITTED}`);
    ensureMaterializedReference(cwd, materializedDir);
  }

  function scaffoldEditorAndRuntime(): void {
    touch("src/game/logic.script");
    touch(
      "src/game/logic.ts",
      [
        'import { defineScript } from "@defold-typescript/types/script";',
        "defineScript({",
        "  init() {",
        '    msg.post("#", "hello");',
        "  },",
        "});",
      ].join("\n"),
    );
    // The factory comes from the plain `editor` subpath, not the installed
    // `editor-script` kind index: importing that index would inject the
    // *installed* default target's ambient editor surface into this program and
    // the wall's pinned surface would no longer be the only thing declaring
    // `editor` and `localization`.
    touch(
      "src/tooling/bundle.ts",
      [
        'import { defineEditorScript } from "@defold-typescript/types/editor";',
        "export default defineEditorScript({",
        "  get_commands: () => {",
        "    void editor.platform;",
        '    void localization.message("bundle.done", { count: 1 });',
        "    return [];",
        "  },",
        "});",
      ].join("\n"),
    );
  }

  function wallUnderPin(): {
    pinned: string | null;
    walls: ReturnType<typeof planSourceDirectoryWalls>;
  } {
    const pinned = resolveActivePinnedSurface(cwd);
    const walls = planSourceDirectoryWalls(cwd);
    writeDirectoryWallTsconfigs(cwd, walls, pinned);
    wireWallReferences(cwd, walls);
    return { pinned, walls };
  }

  function readWallTypes(dir: string): { typeRoots: unknown; types: unknown } {
    const parsed = JSON.parse(readFileSync(path.join(cwd, dir, "tsconfig.json"), "utf8")) as {
      compilerOptions: { typeRoots: unknown; types: unknown };
    };
    return {
      typeRoots: parsed.compilerOptions.typeRoots,
      types: parsed.compilerOptions.types,
    };
  }

  test("only the editor wall narrows to the pinned surface; a runtime sibling does not", () => {
    writeRootTsconfig();
    materializeCommitted();
    linkTypesPackage();
    scaffoldEditorAndRuntime();

    const { pinned, walls } = wallUnderPin();
    expect(pinned).toBe(COMMITTED);
    expect(materializedSurfaceKinds(cwd, pinned)).toEqual(["editor-script"]);
    expect(walls.map((wall) => `${wall.dir}:${wall.kind}`)).toEqual([
      "src/game:script",
      "src/tooling:editor-script",
    ]);

    expect(readWallTypes("src/tooling")).toEqual({
      typeRoots: ["../../.defold-types"],
      types: [`${COMMITTED}/editor-script`],
    });
    expect(readWallTypes("src/game")).toEqual({
      typeRoots: null,
      types: ["@defold-typescript/types/script"],
    });
  });

  // A `.d.ts` alias target is required: a `.ts` one outside the wall directory
  // draws TS6307 from the composite program, an unrelated constraint.
  test("a root import alias still resolves inside a walled directory, pinned and un-pinned", () => {
    writeRootTsconfig({ paths: { "@shared/*": ["./shared/*"] } });
    materializeCommitted();
    linkTypesPackage();
    touch("shared/labels.d.ts", "export declare const BUNDLE_LABEL: string;\n");
    touch("src/game/logic.script");
    touch(
      "src/game/logic.ts",
      [
        'import { defineScript } from "@defold-typescript/types/script";',
        "defineScript({",
        "  init() {",
        '    msg.post("#", "hello");',
        "  },",
        "});",
      ].join("\n"),
    );
    touch(
      "src/tooling/bundle.ts",
      [
        'import { defineEditorScript } from "@defold-typescript/types/editor-script";',
        'import { BUNDLE_LABEL } from "@shared/labels";',
        "export default defineEditorScript({",
        "  get_commands: () => {",
        "    void BUNDLE_LABEL;",
        "    return [];",
        "  },",
        "});",
      ].join("\n"),
    );

    const { pinned, walls } = wallUnderPin();
    expect(pinned).toBe(COMMITTED);
    const pinnedBuild = typecheckBuild(cwd);
    if (pinnedBuild.code !== 0) {
      throw new Error(`expected the root alias to resolve inside a pinned wall, got:
${pinnedBuild.output}`);
    }

    writeDirectoryWallTsconfigs(cwd, walls, null);
    const unpinnedBuild = typecheckBuild(cwd);
    if (unpinnedBuild.code !== 0) {
      throw new Error(`expected the root alias to keep resolving after un-pinning, got:
${unpinnedBuild.output}`);
    }
  });

  test("tsc -b accepts an editor wall reading the carried editor VM declarations", () => {
    writeRootTsconfig();
    materializeCommitted();
    linkTypesPackage();
    scaffoldEditorAndRuntime();
    wallUnderPin();

    const { code, output } = typecheckBuild(cwd);
    if (code !== 0) {
      throw new Error(
        `expected clean type-check under a pinned committed surface, got:\n${output}`,
      );
    }
    expect(code).toBe(0);
  });
});

// The documented consumer form: the factory comes from the `<kind>` index, whose
// bare specifier resolves through `node_modules` to the *installed* package. Each
// test therefore needs the real package installed and a pinned surface that
// **differs** from it — a byte-identical copy satisfies any assertion, and the
// `linkMaterializedSurface` arrangement above hides the second channel entirely.
describe("a pinned wall's documented kind-index import resolves into the pinned surface", () => {
  function linkInstalledTypesPackage(): void {
    const scope = path.join(cwd, "node_modules", "@defold-typescript");
    mkdirSync(scope, { recursive: true });
    symlinkSync(TYPES_PKG, path.join(scope, "types"), "dir");
  }

  // Rename a member out of the materialized surface so it survives only in the
  // installed package. Throws rather than silently proving nothing when the
  // upstream member is gone.
  function renameInSurface(rel: string, member: string, renamed: string): void {
    const full = path.join(cwd, rel);
    const before = readFileSync(full, "utf8");
    const after = before.split(member).join(renamed);
    if (after === before) {
      throw new Error(`fixture drift: ${member} no longer appears in ${rel}`);
    }
    writeFileSync(full, after);
  }

  function wallUnderPin(): string | null {
    const pinned = resolveActivePinnedSurface(cwd);
    const walls = planSourceDirectoryWalls(cwd);
    writeDirectoryWallTsconfigs(cwd, walls, pinned);
    wireWallReferences(cwd, walls);
    return pinned;
  }

  // One program reading both members settles both halves at once: the pinned-only
  // member drawing no diagnostic proves the redirect resolves into the surface,
  // and the installed-only member drawing TS2339 proves nothing else is loaded.
  // TS reports the missing property as TS2339, or TS2551 when it can suggest a
  // near-miss from the pinned surface; both are the same rejection.
  function expectOnlyPinnedSurface(pinnedOnly: string, installedOnly: string): void {
    const { code, output } = typecheckBuild(cwd);
    expect(code).not.toBe(0);
    expect(output).toMatch(
      new RegExp(`error TS2(339|551): Property '${installedOnly}' does not exist`),
    );
    expect(output).not.toContain(pinnedOnly);
    // The rejection is evidence about the pinned surface's *contents* only when
    // the program around it resolved. An unresolvable factory import (TS2307), a
    // `types` entry naming a subpath the surface never wrote (TS2688), or a
    // missing ambient namespace (TS2304) each exit nonzero carrying the property
    // diagnostic too, and the assertions above would accept every one of them.
    const unexpected = [...output.matchAll(/error TS(\d+)/g)]
      .map((match) => match[1])
      .filter((diagnostic) => diagnostic !== "2339" && diagnostic !== "2551");
    expect(unexpected).toEqual([]);
  }

  // Strip the wall's managed redirect and rebuild. This is the pre-bug-125
  // arrangement: the documented import falls back through `node_modules`, the
  // installed ambient surface loads beside the pinned one, and the
  // installed-only member resolves. Returned rather than asserted so the
  // negative control below can arrange for it to fail.
  function buildWithoutWallRedirect(wallDir: string): { code: number; output: string } {
    const configPath = path.join(cwd, wallDir, "tsconfig.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    const paths: Record<string, string[]> = config.compilerOptions?.paths ?? {};
    const managed = Object.keys(paths).filter((key) => key.startsWith("@defold-typescript/types/"));
    const [managedKey] = managed;
    if (managed.length !== 1 || managedKey === undefined) {
      throw new Error(
        `expected one managed redirect in ${wallDir}/tsconfig.json, got ${JSON.stringify(managed)}`,
      );
    }
    delete paths[managedKey];
    if (Object.keys(paths).length === 0) {
      delete config.compilerOptions.paths;
    }
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    return typecheckBuild(cwd, true);
  }

  // Without this, `expectOnlyPinnedSurface` passes just as well when no second
  // channel exists at all — it would then assert only that the pinned surface
  // loaded, which is the whole vacuity being ruled out.
  function expectInstalledMemberReachable(wallDir: string, member: string): void {
    const { code, output } = buildWithoutWallRedirect(wallDir);
    if (code !== 0) {
      throw new Error(
        `expected '${member}' to resolve through the installed package once the wall redirect is gone, got:\n${output}`,
      );
    }
  }

  const COMMITTED = "defold-1.13.0";

  function arrangeCommittedEditorWall(installed: boolean): void {
    writeRootTsconfig();
    const { materializedDir } = materializeApiSurface({
      cwd,
      surface: { surfaceId: COMMITTED, available: true },
      sourceGeneratedDir: path.join(TYPES_PKG, "generated"),
    });
    ensureMaterializedReference(cwd, materializedDir);
    if (installed) {
      linkInstalledTypesPackage();
    }
    renameInSurface(`.defold-types/${COMMITTED}/editor.d.ts`, "engine_sha1", "only_in_pinned");

    touch(
      "src/tooling/bundle.ts",
      [
        'import { defineEditorScript } from "@defold-typescript/types/editor-script";',
        "export default defineEditorScript({",
        "  get_commands: () => {",
        "    void editor.only_in_pinned;",
        "    void editor.engine_sha1;",
        "    return [];",
        "  },",
        "});",
      ].join("\n"),
    );

    expect(wallUnderPin()).toBe(COMMITTED);
  }

  test("an editor wall over a committed surface rejects a member only the installed release declares", () => {
    arrangeCommittedEditorWall(true);
    expectOnlyPinnedSurface("only_in_pinned", "engine_sha1");
    expectInstalledMemberReachable("src/tooling", "engine_sha1");
  });

  // The control's own negative control. Arrangement, not a production mutation:
  // with no installed package the narrowing assertion still passes — and the
  // control is what refuses to call that a single-surface proof.
  test("the installed-channel control fails when nothing is installed to reach", () => {
    arrangeCommittedEditorWall(false);
    expectOnlyPinnedSurface("only_in_pinned", "engine_sha1");
    expect(buildWithoutWallRedirect("src/tooling").code).not.toBe(0);
  });

  test("a gui wall over a ref-doc surface rejects a member only the installed release declares", async () => {
    writeRootTsconfig();
    await materializPinnedMultiKind();
    linkInstalledTypesPackage();
    renameInSurface(".defold-types/defold-1.9.8/gui.d.ts", "get_node", "only_in_pinned");

    touch("src/ui/hud.gui_script");
    touch(
      "src/ui/hud.ts",
      [
        'import { defineGuiScript } from "@defold-typescript/types/gui-script";',
        "defineGuiScript({",
        "  init() {",
        "    void gui.only_in_pinned;",
        "    void gui.get_node;",
        "  },",
        "});",
      ].join("\n"),
    );

    expect(wallUnderPin()).toBe("defold-1.9.8");
    expectOnlyPinnedSurface("only_in_pinned", "get_node");
    expectInstalledMemberReachable("src/ui", "get_node");
  });
});
