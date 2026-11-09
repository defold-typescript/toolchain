import { describe, expect, test } from "bun:test";
import {
  awaitCiGate,
  type CheckRun,
  GATED_CHECKS,
  gateVerdict,
  parseGateArgs,
} from "./release-ci-gate.ts";

const names = [...GATED_CHECKS];

function completed(firstId: number, conclusion: (name: string) => string): CheckRun[] {
  return names.map((name, i) => ({
    id: firstId + i,
    name,
    status: "completed",
    conclusion: conclusion(name),
  }));
}

function running(firstId: number): CheckRun[] {
  return names.map((name, i) => ({
    id: firstId + i,
    name,
    status: "in_progress",
    conclusion: null,
  }));
}

// A run that only checked library data: the full-scope jobs report as skipped, and
// a skipped matrix job may report under its bare job name.
function dataOnly(firstId: number): CheckRun[] {
  return [
    ...completed(firstId, (name) => (name === "library-data" ? "success" : "skipped")),
    { id: firstId + names.length, name: "test", status: "completed", conclusion: "skipped" },
  ];
}

const foreign: CheckRun[] = [
  { id: 900, name: "build", status: "completed", conclusion: "failure" },
  { id: 901, name: "check", status: "in_progress", conclusion: null },
];

describe("gateVerdict", () => {
  test("passes once every gated check succeeded", () => {
    expect(gateVerdict(completed(1, () => "success"))).toEqual({ state: "pass" });
  });

  test("ignores check runs other workflows create", () => {
    expect(gateVerdict([...completed(1, () => "success"), ...foreign])).toEqual({ state: "pass" });
  });

  test("counts only the newest run of each check", () => {
    const [first] = names;
    const later = names.length + 1;

    // A branch push cancelled mid-test, then the main push of the same commit green.
    const cancelledThenGreen = [
      ...completed(1, (name) => (name === first ? "success" : "cancelled")),
      ...completed(later, () => "success"),
    ];
    expect(gateVerdict(cancelledThenGreen)).toEqual({ state: "pass" });

    // A later red run still blocks an earlier green one.
    const greenThenRed = [
      ...completed(1, () => "success"),
      ...completed(later, (name) => (name === first ? "success" : "failure")),
    ];
    const verdict = gateVerdict(greenThenRed);
    expect(verdict.state).toBe("fail");
    expect(verdict.state === "fail" ? verdict.failed : []).toEqual(
      names.filter((name) => name !== first).map((name) => `${name}: failure`),
    );
  });

  test("a skipped check proves nothing, so a data-only run waits for a full run", () => {
    const waiting = gateVerdict(dataOnly(1));
    expect(waiting.state).toBe("wait");
    expect(waiting.state === "wait" ? waiting.pending : []).toEqual(
      names.filter((name) => name !== "library-data").map((name) => `${name}: not run`),
    );

    const tagRun = names.length + 2;
    expect(gateVerdict([...dataOnly(1), ...running(tagRun)]).state).toBe("wait");
    expect(gateVerdict([...dataOnly(1), ...completed(tagRun, () => "success")])).toEqual({
      state: "pass",
    });
  });

  test("a later data-only run leaves an earlier full run on the same commit standing", () => {
    expect(gateVerdict([...completed(1, () => "success"), ...dataOnly(100)])).toEqual({
      state: "pass",
    });
  });

  test("waits while no gated check has run", () => {
    expect(gateVerdict(foreign).state).toBe("wait");
  });
});

describe("parseGateArgs", () => {
  const base = ["--repo", "o/r", "--sha", "abc"];

  test("requires CI's full scope unless the caller names the checks", () => {
    expect(parseGateArgs(base)).toEqual({
      repo: "o/r",
      sha: "abc",
      timeoutMinutes: 120,
      checks: [...GATED_CHECKS],
    });
    expect(parseGateArgs([...base, "--check", "ci-done"])?.checks).toEqual(["ci-done"]);
    expect(
      parseGateArgs([...base, "--check", "ci-done", "--check", "library-data"])?.checks,
    ).toEqual(["ci-done", "library-data"]);
  });

  test("rejects a call without a commit", () => {
    expect(parseGateArgs(["--repo", "o/r", "--check", "ci-done"])).toBeNull();
  });
});

describe("awaitCiGate", () => {
  const MINUTE = 60_000;

  function polling(pages: Array<CheckRun[] | Error>, required: readonly string[] = GATED_CHECKS) {
    let time = 0;
    let calls = 0;
    return {
      calls: () => calls,
      now: () => time,
      sleep: async (ms: number) => {
        time += ms;
      },
      fetchRuns: async () => {
        const page = pages[Math.min(calls, pages.length - 1)];
        calls += 1;
        if (page instanceof Error) throw page;
        return page ?? [];
      },
      required,
      timeoutMs: 120 * MINUTE,
      intervalMs: MINUTE,
      log: () => {},
    };
  }

  // A data-only push runs the scope, library-data and library-docs jobs; the
  // full-scope jobs report as skipped, and ci-done always runs.
  function dataOnlyRun(ciDone: Pick<CheckRun, "status" | "conclusion">): CheckRun[] {
    const done = { status: "completed", conclusion: "success" };
    const skipped = { status: "completed", conclusion: "skipped" };
    return [
      { id: 1, name: "scope", ...done },
      { id: 2, name: "lint-typecheck", ...skipped },
      { id: 3, name: "test", ...skipped },
      { id: 4, name: "library-data", ...done },
      { id: 5, name: "library-docs", ...done },
      { id: 6, name: "ci-done", ...ciDone },
    ];
  }

  test("requires only the checks the caller names", async () => {
    const green = dataOnlyRun({ status: "completed", conclusion: "success" });
    expect(await awaitCiGate(polling([green], ["ci-done"]))).toEqual({ state: "pass" });

    const red = dataOnlyRun({ status: "completed", conclusion: "failure" });
    expect(await awaitCiGate(polling([red], ["ci-done"]))).toEqual({
      state: "fail",
      failed: ["ci-done: failure"],
    });

    const unfinished = dataOnlyRun({ status: "in_progress", conclusion: null });
    expect(await awaitCiGate(polling([unfinished], ["ci-done"]))).toEqual({
      state: "wait",
      pending: ["ci-done: in_progress"],
    });
  });

  test("waits through a running suite and passes once it is green", async () => {
    const loop = polling([running(1), running(1), completed(1, () => "success")]);
    expect(await awaitCiGate(loop)).toEqual({ state: "pass" });
    expect(loop.calls()).toBe(3);
  });

  test("stops at the first red check without waiting", async () => {
    const loop = polling([completed(1, () => "failure")]);
    expect((await awaitCiGate(loop)).state).toBe("fail");
    expect(loop.calls()).toBe(1);
  });

  test("gives up once the wait runs past its deadline", async () => {
    const loop = polling([running(1)]);
    expect((await awaitCiGate(loop)).state).toBe("wait");
    expect(loop.now()).toBeGreaterThanOrEqual(loop.timeoutMs);
    expect(loop.calls()).toBe(loop.timeoutMs / loop.intervalMs + 1);
  });

  test("retries a failed read of the check runs", async () => {
    const loop = polling([new Error("HTTP 502"), completed(1, () => "success")]);
    expect(await awaitCiGate(loop)).toEqual({ state: "pass" });
    expect(loop.calls()).toBe(2);
  });
});
