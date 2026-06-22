import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  planSourceDirectoryWalls,
  resolveActivePinnedSurface,
  wireWallReferences,
  writeDirectoryWallTsconfigs,
} from "./directory-walls";
import { ensureMaterializedReference, materializeRefDocSurface } from "./materialize";
import { multiKindRefDocResolveOpts, multiKindRefDocTarget } from "./ref-doc-test-fixture";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
const BIN_DIR = path.join(REPO_ROOT, "node_modules", ".bin");

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

function writeRootTsconfig(): void {
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

function typecheckBuild(cwd: string): { code: number; output: string } {
  const proc = Bun.spawnSync([path.join(BIN_DIR, "tsc"), "-b", "--noEmit"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
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
