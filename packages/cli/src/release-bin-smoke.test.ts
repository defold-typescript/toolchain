import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { extensionArchiveKey } from "./extension-archive";

const PKG_DIR = path.resolve(import.meta.dir, "..");
const REPO_ROOT = path.resolve(PKG_DIR, "..", "..");
const TYPES_DIR = path.join(REPO_ROOT, "packages", "types");
const BIN = path.join(PKG_DIR, "dist", "bin.js");

// Cold-spawning real `node dist/bin.js` is slow and variable on the Windows
// CI runner (cold module cache, filesystem/AV overhead), so give these spawn
// tests far more headroom than Bun's 5s default.
const SPAWN_TEST_TIMEOUT_MS = 30_000;

function build(cwd: string): void {
  const proc = Bun.spawnSync(["bun", "run", "build"], { cwd, stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    throw new Error(`bun run build failed in ${cwd}:\n${proc.stderr.toString()}`);
  }
}

function node(args: string[], cwd: string): { code: number; output: string } {
  const proc = Bun.spawnSync(["node", BIN, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: proc.exitCode, output: `${proc.stdout.toString()}${proc.stderr.toString()}` };
}

function tmp(label: string): string {
  return mkdtempSync(path.join(os.tmpdir(), `defold-typescript-release-smoke-${label}-`));
}

describe("built bin scaffolds from dist", () => {
  build(PKG_DIR);

  test(
    "new-project mode: node dist/bin.js init writes game.project and src/main.ts",
    () => {
      const cwd = tmp("new");
      try {
        const { code, output } = node(["init", cwd], cwd);
        if (code !== 0) {
          throw new Error(`init exited ${code}:\n${output}`);
        }
        expect(code).toBe(0);
        expect(existsSync(path.join(cwd, "game.project"))).toBe(true);
        expect(existsSync(path.join(cwd, "src", "main.ts"))).toBe(true);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    SPAWN_TEST_TIMEOUT_MS,
  );

  test(
    "add-TS mode: node dist/bin.js init writes src/main.ts + tsconfig.json, leaves game.project",
    () => {
      const cwd = tmp("add");
      try {
        const seed = "[project]\ntitle = seeded\n";
        writeFileSync(path.join(cwd, "game.project"), seed);

        const { code, output } = node(["init", cwd], cwd);
        if (code !== 0) {
          throw new Error(`init exited ${code}:\n${output}`);
        }
        expect(code).toBe(0);
        expect(existsSync(path.join(cwd, "src", "main.ts"))).toBe(true);
        expect(existsSync(path.join(cwd, "tsconfig.json"))).toBe(true);
        expect(readFileSync(path.join(cwd, "game.project"), "utf8")).toBe(seed);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    SPAWN_TEST_TIMEOUT_MS,
  );
});

// The published CLI runs under plain `node`, where the `Bun` global is absent,
// so bob-command's spawn/download must use node built-ins. `bun test` executes
// under Bun (where `Bun` exists), so a `Bun.*` leak on the build path hides from
// the rest of the suite. This guard spawns a real `node` process and runs the
// actual spawn implementation through it — regressing to `Bun.spawn` there fails
// with `Bun is not defined` under node.
describe("bob-command spawn runs under plain node", () => {
  build(PKG_DIR);

  test(
    "defaultDefoldIo().spawn executes a command in both capture modes under node",
    () => {
      const distUrl = pathToFileURL(path.join(PKG_DIR, "dist", "index.js")).href;
      const script = [
        `const { defaultDefoldIo } = await import(${JSON.stringify(distUrl)});`,
        "const io = defaultDefoldIo();",
        "const noop = [process.execPath, '-e', 'process.exit(0)'];",
        "const cap = await io.spawn(noop, process.cwd(), { capture: true });",
        "if (cap.exitCode !== 0) { console.error('capture exitCode ' + cap.exitCode); process.exit(2); }",
        "const inh = await io.spawn(noop, process.cwd(), { capture: false });",
        "if (inh.exitCode !== 0) { console.error('inherit exitCode ' + inh.exitCode); process.exit(3); }",
        "console.log('NODE_SPAWN_OK');",
      ].join("\n");
      const proc = Bun.spawnSync(["node", "--input-type=module", "-e", script], {
        cwd: PKG_DIR,
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = `${proc.stdout.toString()}${proc.stderr.toString()}`;
      expect(output).toContain("NODE_SPAWN_OK");
      expect(proc.exitCode).toBe(0);
    },
    SPAWN_TEST_TIMEOUT_MS,
  );
});

const LAMP = `import { defineMachine } from "@defold-typescript/types/hsm";
export const lamp = defineMachine("lamp")({
  initial: "/off",
  states: {
    off: { on: { TOGGLE: "/on" } },
    on: { on: { TOGGLE: "/off" } },
  },
});
`;

async function firstLine(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (!text.includes("\n")) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  return text.split("\n")[0] ?? "";
}

// The spawn resolves externals from the repo's root `node_modules`, so declared
// dependencies are proven by the packed check, not here.
describe("built bin serves hsm-view under plain node", () => {
  build(PKG_DIR);

  test(
    "node dist/bin.js hsm-view serves the built page and the file index",
    async () => {
      const cwd = tmp("hsm-view");
      const file = path.join(cwd, "lamp.ts");
      writeFileSync(file, LAMP);
      const child = Bun.spawn(["node", BIN, "hsm-view", file], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      });
      try {
        const line = await firstLine(child.stdout);
        const url = /http:\/\/127\.0\.0\.1:\d+\/?/.exec(line)?.[0];
        if (url === undefined) {
          throw new Error(`no URL in "${line}":\n${await new Response(child.stderr).text()}`);
        }
        const base = url.endsWith("/") ? url : `${url}/`;

        const page = await fetch(base);
        expect(page.status).toBe(200);
        const built = readFileSync(
          path.join(PKG_DIR, "dist", "hsm-view-client", "main.js"),
          "utf8",
        );
        expect(await page.text()).toContain(built.slice(0, 200));

        const index = (await (await fetch(`${base}api/index`)).json()) as {
          machines: string[];
          files: { path: string }[];
        };
        expect(index.machines).toEqual(["lamp"]);
        expect(index.files.map((entry) => entry.path)).toEqual(["lamp.ts"]);
      } finally {
        child.kill();
        await child.exited;
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    SPAWN_TEST_TIMEOUT_MS,
  );
});

// Loaded by path: the root scripts sit outside this package's tsconfig.
interface PackProof {
  packPackage(pkg: "cli", dest: string): Uint8Array;
  packedEntryNames(tar: Uint8Array): Set<string>;
  undeclaredPackedDependencies(tar: Uint8Array): string[];
}

// The built `dist` keeps every bare import external, and a Node user's installer
// provides only what the packed manifest declares.
describe("packed CLI declares what its built dist loads", () => {
  build(PKG_DIR);

  test(
    "the tarball ships dist/bin.js and every bare package it loads is declared",
    async () => {
      const dest = tmp("pack");
      try {
        const { packedEntryNames, packPackage, undeclaredPackedDependencies } = (await import(
          path.join(REPO_ROOT, "scripts", "release-pack-proof.ts")
        )) as PackProof;
        const tar = packPackage("cli", dest);
        expect(packedEntryNames(tar).has("dist/bin.js")).toBe(true);
        expect(undeclaredPackedDependencies(tar)).toEqual([]);
      } finally {
        rmSync(dest, { recursive: true, force: true });
      }
    },
    SPAWN_TEST_TIMEOUT_MS,
  );
});

describe("release smoke harness is discoverable", () => {
  test("scripts/release-smoke.ts expects the TypeScript script artifact", () => {
    const script = readFileSync(path.join(REPO_ROOT, "scripts", "release-smoke.ts"), "utf8");
    expect(script).toContain('STARTER_ARTIFACT_REL = "src/main.ts.script"');
    expect(script).not.toContain('"src/main.lua"');
  });

  test("root package.json exposes a smoke script", () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    expect(pkg.scripts?.smoke).toBe("bun scripts/release-smoke.ts");
  });
});

const PIXELS_URL = "https://example.invalid/defold-pixels.zip";
const PIXELS_SCRIPT_API = [
  "- name: pixels",
  "  type: table",
  "  desc: Pixel drawing.",
  "  members:",
  "  - name: polyline",
  "    type: function",
  "    desc: Draws a polyline.",
  "    parameters:",
  "      - name: points",
  "        type: table",
  "        desc: the points",
  "",
].join("\n");

function buildTypesRuntime(): void {
  const proc = Bun.spawnSync(["bun", "run", "build:cli-runtime"], {
    cwd: TYPES_DIR,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    throw new Error(`bun run build:cli-runtime failed in ${TYPES_DIR}:\n${proc.stderr.toString()}`);
  }
}

// Loaded by path: the types package's test writer sits outside this package's
// tsconfig.
interface ZipFixture {
  writeZipArchive(entries: readonly { name: string; text: string; stored?: boolean }[]): Uint8Array;
}

// A project declaring one native extension, with that extension's archive
// already in the cache so the run touches no network.
async function seedNativeExtensionProject(): Promise<{
  root: string;
  project: string;
  cache: string;
}> {
  const { writeZipArchive } = (await import(
    path.join(TYPES_DIR, "test", "zip-fixture.ts")
  )) as ZipFixture;
  const root = tmp("resolve");
  const project = path.join(root, "project");
  mkdirSync(project);
  writeFileSync(
    path.join(project, "game.project"),
    `[project]\ntitle = smoke\ndependencies#0 = ${PIXELS_URL}\n`,
  );
  const cache = path.join(root, "cache");
  const archiveDir = path.join(cache, "extensions", extensionArchiveKey(PIXELS_URL));
  mkdirSync(archiveDir, { recursive: true });
  writeFileSync(
    path.join(archiveDir, "archive.zip"),
    writeZipArchive([
      { name: "defold-pixels-master/", text: "" },
      { name: "defold-pixels-master/ext.manifest", text: "name: pixels\n" },
      { name: "defold-pixels-master/api/pixels.script_api", text: PIXELS_SCRIPT_API },
    ]),
  );
  return { root, project, cache };
}

// The published `resolve` loads the types package's generator through
// `@defold-typescript/types/cli-runtime`, resolved by each runtime's own
// loader: Node to the built bundle, Bun to the source. Nothing is injected,
// so a path-based import, a wrong export condition, an unbuilt bundle or a
// Bun-only call anywhere in the resolve graph fails here, on every OS.
describe("built bin resolves a native extension from the cache", () => {
  buildTypesRuntime();
  build(PKG_DIR);

  for (const runtime of ["node", "bun"] as const) {
    test(
      `${runtime} dist/bin.js resolve writes .defold-types/extensions/pixels.d.ts`,
      async () => {
        const { root, project, cache } = await seedNativeExtensionProject();
        try {
          const proc = Bun.spawnSync([runtime, BIN, "resolve", project, "--json"], {
            cwd: project,
            env: { ...process.env, DEFOLD_TYPESCRIPT_CACHE: cache },
            stdout: "pipe",
            stderr: "pipe",
          });
          const stdout = proc.stdout.toString();
          if (proc.exitCode !== 0) {
            throw new Error(`resolve exited ${proc.exitCode}:\n${stdout}${proc.stderr.toString()}`);
          }
          const declaration = path.join(project, ".defold-types", "extensions", "pixels.d.ts");
          expect(existsSync(declaration)).toBe(true);
          expect(readFileSync(declaration, "utf8")).toContain("polyline");
          const report = JSON.parse(stdout) as {
            extensions: { url: string; provenance: string; namespaces: string[] }[];
          };
          expect(report.extensions).toEqual([
            expect.objectContaining({
              url: PIXELS_URL,
              provenance: "cache",
              namespaces: ["pixels"],
            }),
          ]);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      },
      SPAWN_TEST_TIMEOUT_MS,
    );
  }
});
