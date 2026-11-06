/**
 * The last lesson of "Entity systems, one system at a time", run in the viewer session: the
 * project the page builds, written from its `ts step` fences, must load, run its script's `init`
 * and keep its garden running with the simulated engine values the session provides.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ECS_LIBRARY, HSM_LIBRARY, requireLibrarySourceDir } from "@defold-typescript/transpiler";
import { SCRIPT, TUTORIAL_PAGE, tutorialLessons } from "./ecs-lesson-run.test-support";
import { GUIDE_DIR } from "./guide-fence-gate";
import { createSession, type HsmViewSession, type Snapshot } from "./hsm-view-session";

const FRAMES = 120;

const lesson = tutorialLessons(readFileSync(path.join(GUIDE_DIR, TUTORIAL_PAGE), "utf8")).at(-1);
if (lesson === undefined) {
  throw new Error(`${TUTORIAL_PAGE} has no lessons`);
}

let dir: string;
let view: HsmViewSession;
let opened: Snapshot;

beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "view-tutorial-"));
  for (const [title, text] of lesson.files) {
    const file = path.join(dir, title);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  view = createSession({
    file: path.join(dir, SCRIPT),
    hsmSourceDir: requireLibrarySourceDir(HSM_LIBRARY),
    ecsSourceDir: requireLibrarySourceDir(ECS_LIBRARY),
  });
  opened = view.snapshot();
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe(`the last lesson of ${TUTORIAL_PAGE} in the viewer`, () => {
  test("opens on the garden and keeps it running with every system timed", () => {
    expect(opened.error).toBeUndefined();
    expect(opened.worlds).toContain("garden");
    expect(opened.world).toBe("garden");

    let last = opened;
    for (let frame = 0; frame < FRAMES; frame++) {
      last = view.update(1 / 60);
      expect(last.error).toBeUndefined();
    }
    expect(last).toMatchObject({ running: true, frame: FRAMES });
    expect(last.systems.length).toBeGreaterThan(0);
    for (const system of last.systems) {
      expect(Number.isFinite(system.ms)).toBe(true);
      expect(Number.isFinite(system.avgMs)).toBe(true);
    }
  });

  test("logs the lesson's own inspect lines as prints", () => {
    const printed = opened.entries.flatMap((entry) => (entry.kind === "print" ? [entry.text] : []));
    expect(printed.some((text) => text.startsWith("ecs garden frame 0: inspecting"))).toBe(true);
  });
});
