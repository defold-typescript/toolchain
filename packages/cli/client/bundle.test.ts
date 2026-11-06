import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CRITTERS } from "./test-viewer";

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

/** What the built bundle rendered into #root for `file`, once `expected` shows. */
async function renderBundle(file: string, expected: string, ...rest: string[]): Promise<string> {
  const child = Bun.spawn(
    [process.execPath, path.join(import.meta.dir, "bundle-run.ts"), file, expected, ...rest],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [rendered, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
  return rendered;
}

// The page runs the bundle the client build wrote, never these sources, so only running that
// bundle catches a build setting that breaks it.
test(
  "the built client renders the picked machine and its source into #root",
  async () => {
    const file = path.join(dir, "main.ts");
    writeFileSync(file, LAMP);
    const expected = 'defineMachine("lamp")';

    expect(await renderBundle(file, expected)).toContain(expected);
  },
  { timeout: 60_000 },
);

test(
  "the built client renders a file with a machine and a world on both tabs, opening on Worlds",
  async () => {
    const file = path.join(dir, "critters.ts");
    writeFileSync(file, CRITTERS);

    // The code view alone shows `tickMachines` and `drift`, so only the tab strip and the
    // Worlds panel's own text prove the tabs rendered.
    const panelText = "inactive, every 0.5 s";
    const rendered = await renderBundle(file, panelText, "worlds");

    expect(rendered).toContain("MachinesWorlds");
    expect(rendered).toContain(panelText);
  },
  { timeout: 60_000 },
);
