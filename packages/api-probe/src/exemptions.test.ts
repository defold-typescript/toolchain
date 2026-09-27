import { describe, expect, test } from "bun:test";
import {
  type Exemption,
  ExemptionValidationError,
  evaluateProbe,
  parseExemptions,
  readExemptions,
} from "./exemptions";
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

const open = (result: Exemption["outcome"]): Exemption => ({
  outcome: result,
  verdict: "open",
  reason: "declared optional",
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

  test("an open exemption clears nothing and is listed as an open finding", () => {
    const failures = evaluateProbe(
      [
        {
          backend: "v2",
          calls: [call("a.bad"), call("a.err")],
          outcomes: [
            outcome("a.bad", "bad-argument", "bad argument #1"),
            outcome("a.err", "engine-error", "missing"),
          ],
        },
      ],
      { "a.bad:required": open("bad-argument"), "a.err:required": open("engine-error") },
    );
    expect(failures.badArguments).toEqual(["a.bad:required: bad argument #1"]);
    expect(failures.unexempted).toEqual(["a.err:required: missing"]);
    expect(failures.openFindings).toEqual([
      "a.bad:required: declared optional",
      "a.err:required: declared optional",
    ]);
    expect(failures.stale).toEqual([]);
  });

  test("an accepted exemption whose recorded outcome changed fails the call and is stale", () => {
    const failures = evaluateProbe(
      [
        {
          backend: "v2",
          calls: [call("a.now-bad"), call("a.now-err")],
          outcomes: [
            outcome("a.now-bad", "bad-argument", "bad argument #1"),
            outcome("a.now-err", "engine-error", "missing"),
          ],
        },
      ],
      {
        "a.now-bad:required": accepted("engine-error"),
        "a.now-err:required": accepted("bad-argument"),
      },
    );
    expect(failures.badArguments).toEqual(["a.now-bad:required: bad argument #1"]);
    expect(failures.unexempted).toEqual(["a.now-err:required: missing"]);
    expect(failures.stale).toEqual([
      "a.now-bad:required: now ends bad-argument; update or delete the exemption",
      "a.now-err:required: now ends engine-error; update or delete the exemption",
    ]);
  });

  test("an open exemption for a call that now passes, or no longer exists, is stale", () => {
    const failures = evaluateProbe(
      [{ backend: "v2", calls: [call("a.ok")], outcomes: [outcome("a.ok", "ok")] }],
      { "a.ok:required": open("bad-argument"), "a.gone:required": open("engine-error") },
    );
    expect(failures.stale).toEqual([
      "a.ok:required: now ends ok; delete the exemption",
      "a.gone:required: no such probe call; delete the exemption",
    ]);
  });
});

describe("parseExemptions", () => {
  const valid: Exemption = { outcome: "engine-error", verdict: "accepted", reason: "engine" };

  function parseEntry(entry: unknown): () => unknown {
    return () => parseExemptions(JSON.stringify({ "a.call:required": entry }));
  }

  test("a valid file round-trips to the same record", () => {
    const record: Record<string, Exemption> = {
      "a.call:required": valid,
      "b.call:optional@v3": { ...valid, verdict: "open" },
    };
    expect(parseExemptions(JSON.stringify(record))).toEqual(record);
  });

  test.each([
    ["verdict Accepted", { ...valid, verdict: "Accepted" }],
    ["verdict missing", { outcome: valid.outcome, reason: valid.reason }],
    ["outcome denied", { ...valid, outcome: "denied" }],
    ["outcome ok", { ...valid, outcome: "ok" }],
    ["empty reason", { ...valid, reason: "" }],
    ["blank reason", { ...valid, reason: "   " }],
    ["extra field", { ...valid, note: "x" }],
    ["string entry", "accepted"],
  ])("rejects an entry with %s, naming its key", (_label, entry) => {
    expect(parseEntry(entry)).toThrow(ExemptionValidationError);
    expect(parseEntry(entry)).toThrow("a.call:required");
  });

  test("rejects a top level that is not an object", () => {
    expect(() => parseExemptions(JSON.stringify([valid]))).toThrow(ExemptionValidationError);
  });
});

describe("committed probe-exemptions.json", () => {
  test("records only accepted exemptions", () => {
    const verdicts = new Set(Object.values(readExemptions()).map((e) => e.verdict));
    expect([...verdicts]).toEqual(["accepted"]);
  });
});
