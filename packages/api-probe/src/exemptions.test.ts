import { describe, expect, test } from "bun:test";
import { type Exemption, evaluateProbe } from "./exemptions";
import type { ProbeOutcome } from "./outcome";
import type { ProbeCall } from "./witness";

function call(name: string, variant = "required"): ProbeCall {
  return { name, variant, kind: "go", call: `${name}()` };
}

function outcome(name: string, result: ProbeOutcome["outcome"], message = ""): ProbeOutcome {
  return { name, variant: "required", outcome: result, message };
}

const accepted = (result: Exemption["outcome"]): Exemption => ({
  outcome: result,
  verdict: "accepted",
  reason: "test",
});

describe("evaluateProbe", () => {
  test("fails a bad argument and an engine error with no exemption", () => {
    const failures = evaluateProbe(
      [
        {
          backend: "v2",
          calls: [call("a.bad"), call("a.err")],
          outcomes: [
            { ...outcome("a.bad", "bad-argument", "bad argument #2"), slot: 2 },
            outcome("a.err", "engine-error", "missing"),
          ],
        },
      ],
      {},
    );
    expect(failures.badArguments).toEqual(["a.bad:required slot 2: bad argument #2"]);
    expect(failures.unexempted).toEqual(["a.err:required: missing"]);
  });

  test("an exemption covers only the outcome it records, keyed per Box2D pass", () => {
    const failures = evaluateProbe(
      [
        {
          backend: "v3",
          calls: [call("b2d.x"), call("b2d.y")],
          outcomes: [outcome("b2d.x", "engine-error"), outcome("b2d.y", "bad-argument")],
        },
      ],
      {
        "b2d.x:required@v3": accepted("engine-error"),
        "b2d.y:required@v3": accepted("engine-error"),
      },
    );
    expect(failures.unexempted).toEqual([]);
    expect(failures.badArguments).toEqual(["b2d.y:required@v3: "]);
  });

  test("an exemption for a call that now passes, or no longer exists, is stale", () => {
    const failures = evaluateProbe(
      [{ backend: "v2", calls: [call("a.ok")], outcomes: [outcome("a.ok", "ok")] }],
      { "a.ok:required": accepted("engine-error"), "a.gone:required": accepted("engine-error") },
    );
    expect(failures.stale).toEqual([
      "a.ok:required: now ends ok; delete the exemption",
      "a.gone:required: no such probe call; delete the exemption",
    ]);
  });

  test("a call with no outcome names the last call that reported", () => {
    const failures = evaluateProbe(
      [
        {
          backend: "v2",
          calls: [call("a.first"), call("a.second")],
          outcomes: [outcome("a.first", "ok")],
        },
      ],
      {},
    );
    expect(failures.unreported).toEqual([
      "a.second:required: no outcome; the script died after a.first",
    ]);
  });
});
