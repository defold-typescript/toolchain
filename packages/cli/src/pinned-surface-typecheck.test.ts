import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readCliVersion } from "./cli-version";
import { ensureMaterializedReference, materializeApiSurface, surfaceDirName } from "./materialize";

// The materialized surface directory carries the generating toolchain version;
// these tests defend other behavior, so they derive the name from production
// rather than restating it.
function surfaceDir(surfaceId: string): string {
  return surfaceDirName(surfaceId, readCliVersion());
}

// A pin is only enforced if the *compiler* rejects a newer API. Every
// config-shape assertion passed while `@defold-typescript/types` still resolved
// through `node_modules`, merged the installed ambient namespaces over the
// pinned ones, and left the pin defeated program-wide.
const PKG_ROOT = path.resolve(import.meta.dir, "..", "..", "types");
const PINNED_SOURCE = path.join(PKG_ROOT, "generated", "versions", "defold-1.12.4");

// `collectionproxy.load` arrived after 1.12.4; `collectionproxy.get_resources`
// is in it. The pair is what separates "the pin is enforced" from "the fixture
// fails to compile for some unrelated reason".
const ABSENT_FROM_PIN = "load";
const PRESENT_IN_PIN = "get_resources";

interface Fixture {
  readonly cwd: string;
  readonly tsconfigPath: string;
}

function scaffold(sources: Record<string, string>): Fixture {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-pin-proof-"));

  const { materializedDir } = materializeApiSurface({
    cwd,
    surface: { surfaceId: "defold-1.12.4", available: true },
    sourceGeneratedDir: PINNED_SOURCE,
  });
  expect(materializedDir).toBe(`.defold-types/${surfaceDir("defold-1.12.4")}`);

  // Resolve the package the way an install does, so the remap has something to
  // out-rank: without this the bare specifier simply fails to resolve and the
  // fixture would "pass" for the wrong reason.
  mkdirSync(path.join(cwd, "node_modules", "@defold-typescript"), { recursive: true });
  symlinkSync(PKG_ROOT, path.join(cwd, "node_modules", "@defold-typescript", "types"));

  const tsconfigPath = path.join(cwd, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
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
        include: Object.keys(sources),
      },
      null,
      2,
    )}\n`,
  );

  ensureMaterializedReference(cwd, materializedDir);

  for (const [name, contents] of Object.entries(sources)) {
    writeFileSync(path.join(cwd, name), contents);
  }
  return { cwd, tsconfigPath };
}

function typecheck({ tsconfigPath }: Fixture): { exitCode: number; output: string } {
  const proc = Bun.spawnSync(["bunx", "tsc", "-p", tsconfigPath, "--noEmit"], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  });
  return {
    exitCode: proc.exitCode,
    output: `${proc.stdout.toString()}${proc.stderr.toString()}`,
  };
}

const IDIOMATIC_IMPORT = 'import { defineScript } from "@defold-typescript/types";';

describe("a materialized pin binds the package specifier", () => {
  test("rejects an API the pinned surface lacks, with the idiomatic import present", () => {
    const fixture = scaffold({
      "proof.ts": [
        IDIOMATIC_IMPORT,
        "void defineScript;",
        `collectionproxy.${ABSENT_FROM_PIN}(msg.url(), undefined, () => {});`,
        "",
      ].join("\n"),
    });
    try {
      const { exitCode, output } = typecheck(fixture);
      expect(exitCode).not.toBe(0);
      expect(output).toContain(`Property '${ABSENT_FROM_PIN}' does not exist`);
    } finally {
      rmSync(fixture.cwd, { recursive: true, force: true });
    }
  });

  test("accepts an API the pinned surface has, so the rejection is not blanket breakage", () => {
    const fixture = scaffold({
      "proof.ts": [
        IDIOMATIC_IMPORT,
        "void defineScript;",
        `void collectionproxy.${PRESENT_IN_PIN}(msg.url());`,
        "",
      ].join("\n"),
    });
    try {
      const { exitCode, output } = typecheck(fixture);
      if (exitCode !== 0) {
        throw new Error(`pinned surface must still compile its own API:\n${output}`);
      }
      expect(exitCode).toBe(0);
    } finally {
      rmSync(fixture.cwd, { recursive: true, force: true });
    }
  });

  test("the pin holds for a file that never imports the package itself", () => {
    // The leak was ambient merging across the whole program: one idiomatic
    // import in any file disabled the pin for every other file.
    const fixture = scaffold({
      "importer.ts": [IDIOMATIC_IMPORT, "void defineScript;", ""].join("\n"),
      "bare.ts": [`collectionproxy.${ABSENT_FROM_PIN}(msg.url(), undefined, () => {});`, ""].join(
        "\n",
      ),
    });
    try {
      const { exitCode, output } = typecheck(fixture);
      expect(exitCode).not.toBe(0);
      expect(output).toContain("bare.ts");
      expect(output).toContain(`Property '${ABSENT_FROM_PIN}' does not exist`);
    } finally {
      rmSync(fixture.cwd, { recursive: true, force: true });
    }
  });

  test("the remapped specifier still carries the package's exported API", () => {
    const fixture = scaffold({
      "proof.ts": [
        'import { defineScript, defineGuiScript, defineRenderScript } from "@defold-typescript/types";',
        'import { defineEditorScript } from "@defold-typescript/types";',
        'import type { Hash, Url, Vector3 } from "@defold-typescript/types";',
        "void defineScript;",
        "void defineGuiScript;",
        "void defineRenderScript;",
        "void defineEditorScript;",
        'const h: Hash = hash("obstacle");',
        "const u: Url = msg.url();",
        "const v: Vector3 = vmath.vector3(1, 2, 3);",
        "void h;",
        "void u;",
        "void v;",
        "",
      ].join("\n"),
    });
    try {
      const { exitCode, output } = typecheck(fixture);
      if (exitCode !== 0) {
        throw new Error(`the pinned root entrypoint must re-export the package API:\n${output}`);
      }
      expect(exitCode).toBe(0);
    } finally {
      rmSync(fixture.cwd, { recursive: true, force: true });
    }
  });

  test("the branded Hash an import yields still unifies with the ambient one", () => {
    // The remap must not mint a second `unique symbol` brand: `core-types` is
    // re-exported from the installed package precisely so the two unify.
    const fixture = scaffold({
      "proof.ts": [
        'import type { Hash } from "@defold-typescript/types";',
        'const obstacle: Hash = hash("obstacle");',
        "function handle(message_id: Hash): void {",
        '  if (message_id === hash("contact_point_response")) void obstacle;',
        "}",
        "void handle;",
        "",
      ].join("\n"),
    });
    try {
      const { exitCode, output } = typecheck(fixture);
      if (exitCode !== 0) {
        throw new Error(`imported and ambient Hash must unify under a pin:\n${output}`);
      }
      expect(exitCode).toBe(0);
    } finally {
      rmSync(fixture.cwd, { recursive: true, force: true });
    }
  });

  test("the written tsconfig is what enforces the pin, not the fixture", () => {
    const fixture = scaffold({ "proof.ts": ["export {};", ""].join("\n") });
    try {
      const tsconfig = JSON.parse(readFileSync(fixture.tsconfigPath, "utf8")) as {
        compilerOptions: { paths?: Record<string, string[]> };
      };
      expect(tsconfig.compilerOptions.paths?.["@defold-typescript/types"]).toBeDefined();
    } finally {
      rmSync(fixture.cwd, { recursive: true, force: true });
    }
  });
});
