import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const LAMP = `import { defineMachine } from "@defold-typescript/types/hsm";
export const lamp = defineMachine("lamp")({
  initial: "/off",
  states: {
    off: { on: { TOGGLE: "/on" } },
    on: { on: { TOGGLE: "/off" } },
  },
});
`;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "hsm-view-bundle-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// The page runs the bundle the client build wrote, never these sources, so only running that
// bundle catches a build setting that breaks it.
test(
  "the built client renders the picked machine and its source into #root",
  async () => {
    const file = path.join(dir, "main.ts");
    writeFileSync(file, LAMP);
    const expected = 'defineMachine("lamp")';
    const child = Bun.spawn(
      [process.execPath, path.join(import.meta.dir, "bundle-run.ts"), file, expected],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [rendered, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);

    expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
    expect(rendered).toContain(expected);
  },
  { timeout: 30_000 },
);
