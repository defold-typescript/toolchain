import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { requireHsmSourceDir } from "@defold-typescript/transpiler";
import type { LiveInstance } from "../src/hsm-view-live";
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

let dir: string;
let index: HsmViewIndex;

beforeAll(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "hsm-view-live-"));
  writeFileSync(path.join(dir, "main.ts"), GUARD);
  const session = createSession({
    file: path.join(dir, "main.ts"),
    hsmSourceDir: requireHsmSourceDir(),
  });
  const app = createHsmViewApp({ session, client: { js: "", css: "" } });
  index = (await (await app.request("/api/index")).json()) as HsmViewIndex;
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
});
