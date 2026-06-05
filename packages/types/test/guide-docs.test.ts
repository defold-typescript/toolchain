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
});
