import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..");
const GUIDE = resolve(REPO_ROOT, "docs", "guide");

async function readGuide(relPath: string): Promise<string> {
  return Bun.file(resolve(GUIDE, relPath)).text();
}

describe("docs/guide scaffold", () => {
  test("docs/guide/README.md exists", async () => {
    const f = Bun.file(resolve(GUIDE, "README.md"));
    expect(await f.exists()).toBe(true);
  });

  test("docs/guide/getting-started.md exists", async () => {
    const f = Bun.file(resolve(GUIDE, "getting-started.md"));
    expect(await f.exists()).toBe(true);
  });

  test("docs/guide/vector-math.md exists and cross-links the unary-minus gotcha", async () => {
    const f = Bun.file(resolve(GUIDE, "vector-math.md"));
    expect(await f.exists()).toBe(true);
    const body = await readGuide("vector-math.md");
    expect(body).toContain("unary minus on Vector3 silently produces number");
  });

  test("docs/guide/typescript-gotchas.md exists and contains the unary-minus entry", async () => {
    const f = Bun.file(resolve(GUIDE, "typescript-gotchas.md"));
    expect(await f.exists()).toBe(true);
    const body = await readGuide("typescript-gotchas.md");
    expect(body).toContain("## Unary minus on Vector3 / Vector4 silently produces `number`");
    expect(body).toContain("v.unm()");
  });

  test("docs/guide/defold-editor.md exists and names the script build output", async () => {
    const f = Bun.file(resolve(GUIDE, "defold-editor.md"));
    expect(await f.exists()).toBe(true);
    const body = await readGuide("defold-editor.md");
    expect(body).toContain("src/main.ts.script");
  });

  test("docs/guide/add-typescript.md exists and explains add-TS mode", async () => {
    const f = Bun.file(resolve(GUIDE, "add-typescript.md"));
    expect(await f.exists()).toBe(true);
    const body = await readGuide("add-typescript.md");
    expect(body).toContain("game.project");
  });

  test("docs/guide/editor-setup.md exists and names the watch loop", async () => {
    const f = Bun.file(resolve(GUIDE, "editor-setup.md"));
    expect(await f.exists()).toBe(true);
    const body = await readGuide("editor-setup.md");
    expect(body).toContain("bunx @defold-typescript/cli watch");
  });

  test("docs/guide/editor-setup.md documents the opinionated mise.toml tasks", async () => {
    const body = await readGuide("editor-setup.md");
    expect(body).toContain("opinionated `mise.toml`");
    expect(body).toContain("defold-typescript:build");
    expect(body).toContain("defold-typescript:watch");
    expect(body).toContain("defold-typescript:upgrade");
  });

  test("docs/guide/script-lifecycle.md exists", async () => {
    const f = Bun.file(resolve(GUIDE, "script-lifecycle.md"));
    expect(await f.exists()).toBe(true);
  });

  test("docs/guide/script-lifecycle.md documents the per-kind ambient API walls", async () => {
    const body = await readGuide("script-lifecycle.md");
    expect(body).toContain("## API availability by script kind");
    expect(body).toContain("@defold-typescript/types/gui-script");
  });

  test("docs/guide/script-lifecycle.md documents the onMessage dispatcher", async () => {
    const body = await readGuide("script-lifecycle.md");
    expect(body).toContain("## Routing many messages with `onMessage`");
  });

  test("docs/guide/script-lifecycle.md documents the value-keyed properties field", async () => {
    const body = await readGuide("script-lifecycle.md");
    expect(body).toContain("## Script properties on `self`");
    // The value-keyed `properties` field replaces the descriptor idiom.
    expect(body).toContain("properties: {");
    expect(body).not.toContain("ScriptProperties");
  });

  test("docs/guide/README.md links to script lifecycle", async () => {
    const body = await readGuide("README.md");
    expect(body).toContain("script-lifecycle.md");
  });

  test("docs/guide/README.md links to the toolchain setup pages", async () => {
    const body = await readGuide("README.md");
    expect(body).toContain("defold-editor.md");
    expect(body).toContain("add-typescript.md");
    expect(body).toContain("editor-setup.md");
  });

  test("root README.md links to docs/guide/README.md", async () => {
    const body = await Bun.file(resolve(REPO_ROOT, "README.md")).text();
    expect(body).toContain("docs/guide/README.md");
  });

  test("typescript-gotchas.md carries the front skim digest", async () => {
    const body = await readGuide("typescript-gotchas.md");
    expect(body).toContain("## Before you start: Lua vs TypeScript gotchas");
  });

  test("typescript-gotchas.md documents the four narrowing traps and the any wildcard", async () => {
    const body = await readGuide("typescript-gotchas.md");
    expect(body).toContain('## `if (x)` truthiness differs — `0` and `""` are truthy in Lua');
    expect(body).toContain("## `typeof` cannot narrow engine values — they are Lua `userdata`");
    expect(body).toContain("## `null`, `undefined`, and `== null` all collapse to `nil`");
    expect(body).toContain("## `as` is a compile-time assertion, not a runtime check");
    expect(body).toContain("## Some slots are `unknown` on purpose — the `any` wildcard");
  });

  test("docs/guide/typescript-vs-lua.md exists with its section markers", async () => {
    const f = Bun.file(resolve(GUIDE, "typescript-vs-lua.md"));
    expect(await f.exists()).toBe(true);
    const body = await readGuide("typescript-vs-lua.md");
    expect(body).toContain("## Syntax at a glance");
    expect(body).toContain("## Tables vs objects, arrays, and Maps");
    expect(body).toContain("## Modules: `require` vs `import`");
    expect(body).toContain("## Standard library and built-ins");
  });

  test("docs/guide/typescript-vs-lua.md carries the not-equal translation row", async () => {
    const body = await readGuide("typescript-vs-lua.md");
    expect(body).toContain("~=");
    expect(body).toContain("!==");
  });

  test("docs/guide/README.md links the TypeScript-vs-Lua cheat sheet", async () => {
    const body = await readGuide("README.md");
    expect(body).toContain("typescript-vs-lua.md");
  });

  test("docs/guide/getting-started.md cross-links the TypeScript-vs-Lua cheat sheet", async () => {
    const body = await readGuide("getting-started.md");
    expect(body).toContain("typescript-vs-lua.md");
  });

  test("guide build-output pages document helper modules as .lua outputs", async () => {
    for (const rel of [
      "add-typescript.md",
      "editor-setup.md",
      "defold-editor.md",
      "getting-started.md",
      "typescript-vs-lua.md",
    ]) {
      const body = await readGuide(rel);
      expect(body).toContain("src/util.lua");
    }
  });

  test("docs/guide/debugging.md points at the pinned lldebugger release URL", async () => {
    const body = await readGuide("debugging.md");
    expect(body).toContain("releases/download/lldebugger-v1/lldebugger.zip");
  });

  test("docs/guide/transpile-diagnostics.md exists and states the advisory contract", async () => {
    const f = Bun.file(resolve(GUIDE, "transpile-diagnostics.md"));
    expect(await f.exists()).toBe(true);
    const body = await readGuide("transpile-diagnostics.md");
    expect(body).toContain("@defold-typescript/tstl-plugin");
    expect(body).toContain("Suggestion");
    expect(body).toContain("tsc --noEmit");
    expect(body).toContain("typescript-gotchas.md");
  });

  test("docs/guide/README.md links the transpile-diagnostics page", async () => {
    const body = await readGuide("README.md");
    expect(body).toContain("transpile-diagnostics.md");
  });

  test("docs/guide/extensions.md exists", async () => {
    const f = Bun.file(resolve(GUIDE, "extensions.md"));
    expect(await f.exists()).toBe(true);
  });

  test("docs/guide/extensions.md documents the resolve verb", async () => {
    const body = await readGuide("extensions.md");
    expect(body).toContain("defold-typescript resolve");
  });

  test("docs/guide/extensions.md documents declaring a dependency", async () => {
    const body = await readGuide("extensions.md");
    expect(body).toContain("[dependencies]");
  });

  test("docs/guide/extensions.md notes the asset-only case", async () => {
    const body = await readGuide("extensions.md");
    expect(body).toContain("asset-only");
  });

  test("docs/guide/extensions.md names the cache override env var", async () => {
    const body = await readGuide("extensions.md");
    expect(body).toContain("DEFOLD_TYPESCRIPT_CACHE");
  });

  test("docs/guide/README.md links the extensions page", async () => {
    const body = await readGuide("README.md");
    expect(body).toContain("](./extensions.md)");
  });
});

describe("docs/guide/vector-math.md worked example", () => {
  test("contains the worked-example heading", async () => {
    const body = await readGuide("vector-math.md");
    expect(body).toContain("## A worked example: the platformer");
  });

  test("makes the ambient-globals point", async () => {
    const body = await readGuide("vector-math.md");
    expect(body).toContain("ambient global");
    expect(body).toContain("no import");
  });

  test("quotes the real method chain from the platformer", async () => {
    const body = await readGuide("vector-math.md");
    expect(body).toContain("go.get_position().add(self.velocity.mul(dt)).add(self.adj)");
  });

  test("contrasts component access with whole-vector arithmetic", async () => {
    const body = await readGuide("vector-math.md");
    expect(body).toContain("self.velocity.x");
  });

  test("labels the entrypoint fixed_update", async () => {
    const body = await readGuide("vector-math.md");
    expect(body).toContain("fixed_update(self, dt)");
  });

  test("prose names the corrected hook and drops the stale one", async () => {
    const body = await readGuide("vector-math.md");
    expect(body).toContain("`fixed_update` body");
    expect(body).not.toContain("`update` body");
  });

  test("attributes the projection line to the collision helper", async () => {
    const body = await readGuide("vector-math.md");
    expect(body).toContain("handle_obstacle_contact");
  });
});

describe("docs/guide/pinning-defold-version.md release-channel section", () => {
  test("contains the channel section heading", async () => {
    const body = await readGuide("pinning-defold-version.md");
    expect(body).toContain("## Pinning a release channel");
  });

  test("names all three channels and the stable default", async () => {
    const body = await readGuide("pinning-defold-version.md");
    expect(body).toContain("stable");
    expect(body).toContain("beta");
    expect(body).toContain("alpha");
    expect(body).toContain("default stays `stable`");
  });

  test("documents the --channel flag and the package.json channel pin precedence", async () => {
    const body = await readGuide("pinning-defold-version.md");
    expect(body).toContain("--channel");
    expect(body).toContain('"channel"');
  });

  test("documents --json reporting the channel", async () => {
    const body = await readGuide("pinning-defold-version.md");
    expect(body).toContain("defoldChannel");
  });

  test("states beta/alpha are experimental pre-release surfaces", async () => {
    const body = await readGuide("pinning-defold-version.md");
    expect(body).toContain("experimental");
  });
});

describe("docs/guide/pinning-defold-version.md installed-editor detection tier", () => {
  test("names the installed-editor detection as a pin-tier between pin and default", async () => {
    const body = await readGuide("pinning-defold-version.md");
    expect(body).toContain("installed Defold editor");
    // Precedence chain has four tiers, with detection the lowest-precedence
    // fallback.
    expect(body).toMatch(/1\..*--defold-version/);
    expect(body).toMatch(/2\..*`package\.json` pin/);
    expect(body).toMatch(/3\..*installed Defold editor/);
    expect(body).toMatch(/4\..*current-stable default/);
  });

  test("names the per-OS candidate paths the probe checks", async () => {
    const body = await readGuide("pinning-defold-version.md");
    expect(body).toContain("Defold.app/Contents/Resources/config");
    expect(body).toContain("~/Defold/config");
    expect(body).toContain("%LOCALAPPDATA%");
  });

  test("reports defoldVersionSource in --json with the four source values", async () => {
    const body = await readGuide("pinning-defold-version.md");
    expect(body).toContain("defoldVersionSource");
    expect(body).toContain("`flag`");
    expect(body).toContain("`pin`");
    expect(body).toContain("`detected`");
    expect(body).toContain("`default`");
  });
});

describe("docs/guide/api-docs-vs-ts-defold.md", () => {
  test("keeps the dimension comparison naming both surfaces as columns", async () => {
    const body = await readGuide("api-docs-vs-ts-defold.md");
    expect(body).toContain("## Dimension comparison");
    expect(body).toContain("| ts-defold-types |");
    expect(body).toContain("@defold-typescript/types");
  });

  test("renames the partisan cleaner heading to name the surface", async () => {
    const body = await readGuide("api-docs-vs-ts-defold.md");
    expect(body).toContain("## Where ts-defold-types is arguably cleaner");
    expect(body).not.toContain("## Where they are arguably cleaner");
  });

  test("carries the neutral picker section", async () => {
    const body = await readGuide("api-docs-vs-ts-defold.md");
    expect(body).toContain("## Which surface fits your project");
  });

  test("drops the partisan superset phrasing", async () => {
    const body = await readGuide("api-docs-vs-ts-defold.md");
    expect(body).not.toContain("our docs are a superset");
  });
});

describe("docs/guide/migrating-from-ts-defold.md", () => {
  test("exists", async () => {
    const f = Bun.file(resolve(GUIDE, "migrating-from-ts-defold.md"));
    expect(await f.exists()).toBe(true);
  });

  test("carries the package-map, step-by-step, and provenance marker headings", async () => {
    const body = await readGuide("migrating-from-ts-defold.md");
    expect(body).toContain("## Package and tooling map");
    expect(body).toContain("## Step-by-step migration");
    expect(body).toContain("## What this guide verified");
  });

  test("names the provenance label instead of the in-group voice", async () => {
    const body = await readGuide("migrating-from-ts-defold.md");
    expect(body).toContain("**@defold-typescript side**");
    expect(body).not.toContain("**Our side**");
  });

  test("names the toolchain in the step-1 heading instead of the in-group voice", async () => {
    const body = await readGuide("migrating-from-ts-defold.md");
    expect(body).toContain("Add the defold-typescript toolchain");
    expect(body).not.toContain("Add our toolchain");
  });

  test("docs/guide/README.md Contents links the migration guide", async () => {
    const body = await readGuide("README.md");
    expect(body).toContain("./migrating-from-ts-defold.md");
  });
});
