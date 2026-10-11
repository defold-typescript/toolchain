import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { requireHsmSourceDir } from "@defold-typescript/transpiler";
import { ruleId } from "../src/hsm-view-index";
import type { LiveInstance, LiveRule } from "../src/hsm-view-live";
import { createHsmViewApp, type HsmViewIndex } from "../src/hsm-view-server";
import { createSession } from "../src/hsm-view-session";
import { liveSnapshot } from "./live";

const GUARD = `import { defineMachine } from "@defold-typescript/types/hsm";
export const guard = defineMachine("guard")({
  initial: "/patrol",
  states: {
    patrol: {
      initial: "/patrol/walk",
      on: { SEE: "/chase" },
      states: { walk: {}, look: {} },
    },
    chase: { on: { LOST: "/patrol" } },
  },
});
`;

const RULES = `import { defineMachine } from "@defold-typescript/types/hsm";
export const rules = defineMachine("rules")({
  initial: "/a",
  on: { RESET: "/a" },
  states: {
    a: {
      on: { GO: [{ to: "/b", when: () => false }, { to: "/b" }], after: "/b" },
      after: { 0: "/b", 0.5: "/c" },
    },
    b: { after: [{ delay: 2, to: "/a" }, { delay: () => 0.5, to: "/c" }], update: () => "/c" },
    c: { always: [{ to: "/a", when: () => false }, { to: "/d" }] },
    d: { on: { after: "/a" } },
  },
});
`;

let dir: string;
let index: HsmViewIndex;
let rulesIndex: HsmViewIndex;

async function indexOf(name: string, source: string): Promise<HsmViewIndex> {
  const file = path.join(dir, name);
  writeFileSync(file, source);
  const session = createSession({ file, hsmSourceDir: requireHsmSourceDir() });
  const app = createHsmViewApp({ session, client: { js: "", css: "" } });
  return (await (await app.request("/api/index")).json()) as HsmViewIndex;
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "hsm-view-live-"));
  index = await indexOf("main.ts", GUARD);
  rulesIndex = await indexOf("rules.ts", RULES);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const instance = (leaves: readonly string[]): LiveInstance => ({
  label: "guard",
  leaves,
  stopped: leaves.length === 0,
});

describe("liveSnapshot", () => {
  test("activates each known leaf with its ancestors and enters all of them on the first frame", () => {
    const { snapshot, unknown } = liveSnapshot(index, undefined, instance(["/patrol/walk"]));
    expect(snapshot.running).toBe(true);
    expect(snapshot.active).toEqual(["/patrol", "/patrol/walk"]);
    expect(snapshot.leaves).toEqual(["/patrol/walk"]);
    expect([...snapshot.entered].sort()).toEqual(["/patrol", "/patrol/walk"]);
    expect(snapshot.fired).toEqual([]);
    expect(snapshot.rejected).toEqual([]);
    expect(snapshot.accepts).toEqual([]);
    expect(snapshot.entries).toEqual([]);
    expect(unknown).toEqual([]);
  });

  test("enters only what the move entered and logs the move as one transition", () => {
    const first = liveSnapshot(index, undefined, instance(["/patrol/walk"])).snapshot;
    const byEvent = liveSnapshot(index, first, instance(["/chase"]), {
      move: { label: "guard", from: "/patrol/walk", to: "/chase", reason: "SEE" },
      t: 1.5,
    }).snapshot;
    expect(byEvent.active).toEqual(["/chase"]);
    expect(byEvent.entered).toEqual(["/chase"]);
    expect(byEvent.t).toBe(1.5);
    expect(byEvent.entries).toEqual([
      {
        kind: "transition",
        t: 1.5,
        from: "/patrol/walk",
        to: "/chase",
        cause: "event",
        event: { type: "SEE" },
      },
    ]);

    const byCause = liveSnapshot(index, byEvent, instance([]), {
      move: { label: "guard", from: "/chase", to: undefined, reason: "stop" },
      t: 2,
    }).snapshot;
    expect(byCause.entries).toEqual([
      { kind: "transition", t: 2, from: "/chase", to: undefined, cause: "stop", event: undefined },
    ]);
  });

  test("keeps the same states without entering them again", () => {
    const first = liveSnapshot(index, undefined, instance(["/patrol/walk"])).snapshot;
    const second = liveSnapshot(index, first, instance(["/patrol/look"])).snapshot;
    expect(second.active).toEqual(["/patrol", "/patrol/look"]);
    expect(second.entered).toEqual(["/patrol/look"]);
  });

  test("reports a leaf the machine does not define and keeps its known siblings active", () => {
    const { snapshot, unknown } = liveSnapshot(
      index,
      undefined,
      instance(["/flee", "/patrol/walk"]),
    );
    expect(unknown).toEqual(["/flee"]);
    expect(snapshot.active).toEqual(["/patrol", "/patrol/walk"]);
    expect(snapshot.active).not.toContain("/flee");
    expect(snapshot.leaves).toEqual(["/patrol/walk"]);
  });

  test("shows a stopped instance as not running with nothing active", () => {
    const { snapshot } = liveSnapshot(index, undefined, instance([]));
    expect(snapshot.running).toBe(false);
    expect(snapshot.active).toEqual([]);
    expect(snapshot.leaves).toEqual([]);
  });

  const moved = (reason: string, rule?: LiveRule) =>
    liveSnapshot(rulesIndex, undefined, instance(["/a"]), {
      move: {
        label: "guard",
        from: "/a",
        to: "/a",
        reason,
        ...(rule === undefined ? {} : { rule }),
      },
    }).snapshot;

  test("glows the rule the game names", () => {
    const byEvent = moved("GO", { source: "/a", key: 1 });
    expect(byEvent.fired).toEqual([ruleId("/a", "on", "GO", 1)]);
    expect(byEvent.entries).toEqual([
      { kind: "transition", t: 0, from: "/a", to: "/a", cause: "event", event: { type: "GO" } },
    ]);

    expect(moved("after", { source: "/a", key: 0.5 }).fired).toEqual([
      ruleId("/a", "after", "0.5"),
    ]);
    expect(moved("after", { source: "/b", key: 1 }).fired).toEqual([ruleId("/b", "after", 1)]);
    expect(moved("always", { source: "/c", key: 1 }).fired).toEqual([ruleId("/c", "always", 1)]);
    expect(moved("update", { source: "/b" }).fired).toEqual([ruleId("/b", "update")]);
    expect(moved("RESET", { source: "", key: 0 }).fired).toEqual([ruleId("", "on", "RESET", 0)]);
    expect(moved("after", { source: "/d", key: 0 }).fired).toEqual([
      ruleId("/d", "on", "after", 0),
    ]);
  });

  test("glows no rule a report leaves open", () => {
    expect(moved("GO").fired).toEqual([]);
    expect(moved("stop").fired).toEqual([]);
    expect(moved("GO", { source: "/a", key: 7 }).fired).toEqual([]);
    expect(moved("GO", { source: "/zzz", key: 0 }).fired).toEqual([]);
    // `/a` places both the timer under `0` and entry `0` of its rule for an event typed `after`.
    expect(rulesIndex.rules[ruleId("/a", "after", "0")]).toBeDefined();
    expect(rulesIndex.rules[ruleId("/a", "on", "after", 0)]).toBeDefined();
    expect(moved("after", { source: "/a", key: 0 }).fired).toEqual([]);
  });
});
