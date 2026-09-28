import { beforeAll, describe, expect, test } from "bun:test";
import { INDEX_SLOT_CLASSIFICATIONS } from "../../types/src/index-slot-classifications";
import { evaluateProbe, type ProbeFailures, readExemptions } from "./exemptions";
import { manualCoverage, PROBED_INDEX_CLASSES } from "./index-probes";
import { type ProbeRun, runProbe } from "./run-probe";

let run: ProbeRun;
let failures: ProbeFailures;

beforeAll(async () => {
  run = await runProbe();
  failures = evaluateProbe(run.passes, readExemptions());
}, 900_000);

describe(`runtime probe (${process.env.PROBE_TARGET ?? "default target"})`, () => {
  test("every Box2D pass runs to PROBE_DONE within its timeout", () => {
    expect(run.passes.map((pass) => [pass.backend, pass.done])).toEqual(
      run.passes.map((pass) => [pass.backend, true]),
    );
  });

  test("every generated call reports an outcome", () => {
    expect(failures.unreported).toEqual([]);
  });

  test("no positive call ends in a bad argument without an accepted exemption", () => {
    expect(failures.badArguments).toEqual([]);
  });

  test("every engine error is exempted with a reason", () => {
    expect(failures.unexempted).toEqual([]);
  });

  test("no exemption is open", () => {
    expect(failures.openFindings).toEqual([]);
  });

  test("every exemption still reproduces", () => {
    expect(failures.stale).toEqual([]);
  });

  test("every negative call raises a bad argument at its own slot and every accepted call ends ok", () => {
    expect(failures.misfires).toEqual([]);
  });

  test("the engine accepts every kind the extractor reads a binding slot as accepting", () => {
    expect(failures.acceptedRefused).toEqual([]);
  });

  test("no negative call is accepted without an exemption naming the lenient binding", () => {
    expect(failures.tooNarrow).toEqual([]);
  });

  test("every ok positive call returns the kinds and count it declares", () => {
    expect(failures.returnKinds).toEqual([]);
  });

  test("every probed index slot behaves as its class says", () => {
    expect(failures.indexSemantics).toEqual([]);
  });

  test("every classified index position is probed or listed as unverified", () => {
    const probed = new Set(run.passes.flatMap((pass) => pass.calls.flatMap((c) => c.index ?? [])));
    const unverified = new Map(
      run.passes.flatMap((pass) => pass.indexUnverified.map((u) => [u.key, u.reason] as const)),
    );
    for (const key of probed) unverified.delete(key);
    console.log(
      `unverified index slots:\n${[...unverified].map(([key, reason]) => `  ${key}: ${reason}`).join("\n")}`,
    );
    const classified = [...INDEX_SLOT_CLASSIFICATIONS]
      .filter(([, c]) => PROBED_INDEX_CLASSES.has(c.class))
      .map(([key]) => key);
    expect(classified.filter((key) => !probed.has(key) && !unverified.has(key))).toEqual([]);
  });

  test("no write to a property declared readonly succeeds", () => {
    expect(failures.writableReadonly).toEqual([]);
  });

  test("an incoming message the probe project does not trigger is listed as unverified", () => {
    const unverified = run.passes.flatMap((pass) => {
      const reported = new Set(pass.outcomes.map((o) => `${o.name}:${o.variant}`));
      return pass.calls
        .filter((call) => call.message?.direction === "incoming")
        .filter((call) => !reported.has(`${call.name}:${call.variant}`))
        .map((call) => call.name);
    });
    console.log(`unverified incoming messages:\n${unverified.map((n) => `  ${n}`).join("\n")}`);
    const triggered = run.passes.flatMap((pass) =>
      pass.calls.filter((call) => call.message?.triggered === true).map((call) => call.name),
    );
    expect(unverified.filter((name) => triggered.includes(name))).toEqual([]);
  });

  test("every manual verdict of the static oracle has an ok positive call or a denylist reason", () => {
    expect(manualCoverage(run.passes, run.target)).toEqual([]);
  });
});
