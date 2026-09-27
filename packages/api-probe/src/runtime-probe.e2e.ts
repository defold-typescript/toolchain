import { beforeAll, describe, expect, test } from "bun:test";
import { evaluateProbe, type ProbeFailures, readExemptions } from "./exemptions";
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

  test("no positive call ends in a bad argument the exemptions do not record", () => {
    expect(failures.badArguments).toEqual([]);
  });

  test("every engine error is exempted with a reason", () => {
    expect(failures.unexempted).toEqual([]);
  });

  test("every exemption still reproduces", () => {
    expect(failures.stale).toEqual([]);
  });
});
