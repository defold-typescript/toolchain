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

function negative(name: string, slot: number): ProbeCall {
  return {
    name,
    variant: `negative-${slot}`,
    kind: "go",
    call: `${name}({})`,
    witness: {
      slot,
      kind: "table",
      binding: "gamesys/src/x.cpp",
      expect: "raise",
      declared: false,
    },
  };
}

function negativeOutcome(
  name: string,
  slot: number,
  result: ProbeOutcome["outcome"],
  raisedAt?: number,
): ProbeOutcome {
  return {
    name,
    variant: `negative-${slot}`,
    outcome: result,
    ...(raisedAt === undefined ? {} : { slot: raisedAt }),
    message: result === "ok" ? "" : "raised",
  };
}

describe("evaluateProbe on negative calls", () => {
  test("a negative call the engine accepts is too narrow or lenient, naming the binding", () => {
    const failures = evaluateProbe(
      [{ backend: "v2", calls: [negative("a.f", 2)], outcomes: [negativeOutcome("a.f", 2, "ok")] }],
      {},
    );
    expect(failures.tooNarrow).toEqual([
      "a.f:negative-2: the engine accepts a table in slot 2; the declaration is too narrow or gamesys/src/x.cpp is lenient",
    ]);
  });

  test("a bad argument naming the call's own slot, or no slot, is the expected outcome", () => {
    const failures = evaluateProbe(
      [
        {
          backend: "v2",
          calls: [negative("a.f", 2), negative("a.g", 1)],
          outcomes: [
            negativeOutcome("a.f", 2, "bad-argument", 2),
            negativeOutcome("a.g", 1, "bad-argument"),
          ],
        },
      ],
      {},
    );
    expect(failures).toEqual({
      unreported: [],
      badArguments: [],
      unexempted: [],
      stale: [],
      openFindings: [],
      tooNarrow: [],
      acceptedRefused: [],
      misfires: [],
      returnKinds: [],
      indexSemantics: [],
      writableReadonly: [],
    });
  });

  test("a negative call raising at another slot, or an engine error, misfires", () => {
    const failures = evaluateProbe(
      [
        {
          backend: "v2",
          calls: [negative("a.f", 2), negative("a.g", 1)],
          outcomes: [
            negativeOutcome("a.f", 2, "bad-argument", 1),
            negativeOutcome("a.g", 1, "engine-error"),
          ],
        },
      ],
      {},
    );
    expect(failures.misfires).toEqual([
      "a.f:negative-2 slot 1: raised bad-argument, expected a bad argument #2: raised",
      "a.g:negative-1: raised engine-error, expected a bad argument #1: raised",
    ]);
  });

  test("an accepted ok exemption clears a lenient binding and goes stale once it raises", () => {
    const lenient = { "a.f:negative-2": accepted("ok") };
    const accepts = evaluateProbe(
      [{ backend: "v2", calls: [negative("a.f", 2)], outcomes: [negativeOutcome("a.f", 2, "ok")] }],
      lenient,
    );
    expect(accepts.tooNarrow).toEqual([]);
    expect(accepts.stale).toEqual([]);
    const raises = evaluateProbe(
      [
        {
          backend: "v2",
          calls: [negative("a.f", 2)],
          outcomes: [negativeOutcome("a.f", 2, "bad-argument", 2)],
        },
      ],
      lenient,
    );
    expect(raises.stale).toEqual(["a.f:negative-2: now raises on its slot; delete the exemption"]);
  });
});

function acceptedCall(name: string, slot: number): ProbeCall {
  return {
    name,
    variant: `accepted-${slot}-hash`,
    kind: "go",
    call: `${name}(hash("probe"))`,
    witness: { slot, kind: "hash", binding: "gamesys/src/x.cpp", expect: "ok", declared: true },
  };
}

function acceptedOutcome(
  name: string,
  slot: number,
  result: ProbeOutcome["outcome"],
  raisedAt?: number,
): ProbeOutcome {
  return { ...negativeOutcome(name, slot, result, raisedAt), variant: `accepted-${slot}-hash` };
}

describe("evaluateProbe on accepted calls", () => {
  test("an accepted call ending ok passes", () => {
    const failures = evaluateProbe(
      [
        {
          backend: "v2",
          calls: [acceptedCall("a.f", 1)],
          outcomes: [acceptedOutcome("a.f", 1, "ok")],
        },
      ],
      {},
    );
    expect(Object.values(failures).flat()).toEqual([]);
  });

  test("a bad argument at its own slot is a kind the binding refuses, naming the binding", () => {
    const failures = evaluateProbe(
      [
        {
          backend: "v2",
          calls: [acceptedCall("a.f", 2), acceptedCall("a.g", 1)],
          outcomes: [
            acceptedOutcome("a.f", 2, "bad-argument", 2),
            acceptedOutcome("a.g", 1, "bad-argument"),
          ],
        },
      ],
      {},
    );
    expect(failures.acceptedRefused).toEqual([
      "a.f:accepted-2-hash: gamesys/src/x.cpp refuses a hash in slot 2, a kind the extractor reads as accepted: raised",
      "a.g:accepted-1-hash: gamesys/src/x.cpp refuses a hash in slot 1, a kind the extractor reads as accepted: raised",
    ]);
    expect(failures.misfires).toEqual([]);
    expect(failures.badArguments).toEqual([]);
  });

  test("an engine error, or a bad argument at another slot, misfires", () => {
    const failures = evaluateProbe(
      [
        {
          backend: "v2",
          calls: [acceptedCall("a.f", 2), acceptedCall("a.g", 1)],
          outcomes: [
            acceptedOutcome("a.f", 2, "bad-argument", 1),
            acceptedOutcome("a.g", 1, "engine-error"),
          ],
        },
      ],
      {},
    );
    expect(failures.misfires).toEqual([
      "a.f:accepted-2-hash slot 1: raised bad-argument, expected ok: raised",
      "a.g:accepted-1-hash: raised engine-error, expected ok: raised",
    ]);
    expect(failures.acceptedRefused).toEqual([]);
    expect(failures.unexempted).toEqual([]);
  });

  test("an accepted exemption clears the exact outcome it records; one recording ok is stale", () => {
    const calls = [acceptedCall("a.f", 1), acceptedCall("a.g", 1), acceptedCall("a.h", 1)];
    const failures = evaluateProbe(
      [
        {
          backend: "v2",
          calls,
          outcomes: [
            acceptedOutcome("a.f", 1, "engine-error"),
            acceptedOutcome("a.g", 1, "bad-argument", 1),
            acceptedOutcome("a.h", 1, "ok"),
          ],
        },
      ],
      {
        "a.f:accepted-1-hash": accepted("engine-error"),
        "a.g:accepted-1-hash": accepted("engine-error"),
        "a.h:accepted-1-hash": accepted("ok"),
      },
    );
    expect(failures.misfires).toEqual([]);
    expect(failures.acceptedRefused).toEqual([
      "a.g:accepted-1-hash: gamesys/src/x.cpp refuses a hash in slot 1, a kind the extractor reads as accepted: raised",
    ]);
    expect(failures.stale).toEqual([
      "a.g:accepted-1-hash: now ends bad-argument; update or delete the exemption",
      "a.h:accepted-1-hash: ok is the expected outcome; delete the exemption",
    ]);
  });

  test("an accepted call failing like its exempted positive call inherits the exemption", () => {
    const unlinked = "main/probe_go.ts.script:12: attempt to index global 'compute' (a nil value)";
    const failures = evaluateProbe(
      [
        {
          backend: "v2",
          calls: [call("compute.get_samplers"), acceptedCall("compute.get_samplers", 1)],
          outcomes: [
            outcome("compute.get_samplers", "engine-error", unlinked),
            {
              ...acceptedOutcome("compute.get_samplers", 1, "engine-error"),
              message: unlinked.replace(":12:", ":40:"),
            },
          ],
        },
      ],
      { "compute.get_samplers:required": accepted("engine-error") },
    );
    expect(failures.misfires).toEqual([]);
    expect(failures.unexempted).toEqual([]);
  });
});

describe("evaluateProbe on a negative call its function's exemption covers", () => {
  const unlinked = "main/probe_go.ts.script:12: attempt to index global 'compute' (a nil value)";

  test("a negative call failing like its exempted positive call inherits the exemption", () => {
    const failures = evaluateProbe(
      [
        {
          backend: "v2",
          calls: [call("compute.get_samplers"), negative("compute.get_samplers", 1)],
          outcomes: [
            outcome("compute.get_samplers", "engine-error", unlinked),
            {
              ...negativeOutcome("compute.get_samplers", 1, "engine-error"),
              message: unlinked.replace(":12:", ":40:"),
            },
          ],
        },
      ],
      { "compute.get_samplers:required": accepted("engine-error") },
    );
    expect(failures.misfires).toEqual([]);
    expect(failures.unexempted).toEqual([]);
  });

  test("a different message, or an ok positive call, inherits nothing", () => {
    const failures = evaluateProbe(
      [
        {
          backend: "v2",
          calls: [call("compute.get_samplers"), negative("compute.get_samplers", 1)],
          outcomes: [
            outcome("compute.get_samplers", "engine-error", unlinked),
            { ...negativeOutcome("compute.get_samplers", 1, "engine-error"), message: "other" },
          ],
        },
      ],
      { "compute.get_samplers:required": accepted("engine-error") },
    );
    expect(failures.misfires).toEqual([
      "compute.get_samplers:negative-1: raised engine-error, expected a bad argument #1: other",
    ]);
  });
});

describe("evaluateProbe on index probes", () => {
  test("an index probe that raises is an index semantics failure, not an engine error", () => {
    const probe: ProbeCall = {
      name: "go.set",
      variant: "index-options-index",
      kind: "go",
      call: "{}",
      index: "go.set:param:options:index",
    };
    const failures = evaluateProbe(
      [
        {
          backend: "v2",
          calls: [probe],
          outcomes: [
            {
              name: "go.set",
              variant: "index-options-index",
              outcome: "engine-error",
              message: "{ index: 0 } missed the first element",
            },
          ],
        },
      ],
      {},
    );
    expect(failures.indexSemantics).toEqual([
      "go.set:index-options-index (go.set:param:options:index): { index: 0 } missed the first element",
    ]);
    expect(failures.unexempted).toEqual([]);
  });
});

describe("evaluateProbe on returns", () => {
  test("an ok positive call whose values differ from its declared returns fails", () => {
    const returning: ProbeCall = {
      ...call("go.get_id"),
      returns: { kinds: [["hash"]], variadic: false },
    };
    const failures = evaluateProbe(
      [
        {
          backend: "v2",
          calls: [returning],
          outcomes: [{ ...outcome("go.get_id", "ok"), returns: ["number"] }],
        },
      ],
      {},
    );
    expect(failures.returnKinds).toEqual(["go.get_id:required: value 1 is number, declared hash"]);
  });
});

describe("evaluateProbe on property writes and received messages", () => {
  test("a set of a readonly property must raise, and one the engine accepts fails", () => {
    const set = (name: string): ProbeCall => ({ ...call(name, "set"), readonlySet: true });
    const failures = evaluateProbe(
      [
        {
          backend: "v2",
          calls: [set("sprite.properties.a"), set("sprite.properties.b")],
          outcomes: [
            { ...outcome("sprite.properties.a", "ok"), variant: "set" },
            { ...outcome("sprite.properties.b", "engine-error", "read only"), variant: "set" },
          ],
        },
      ],
      {},
    );
    expect(failures.writableReadonly).toEqual([
      "sprite.properties.a:set: the engine accepts a write to a property declared readonly",
    ]);
    expect(failures.unexempted).toEqual([]);
  });

  test("an incoming message the probe project does not trigger may go unreported", () => {
    const incoming = (id: string, triggered: boolean): ProbeCall => ({
      ...call(`message.${id}`, "receive"),
      message: { id, direction: "incoming", triggered },
    });
    const failures = evaluateProbe(
      [
        {
          backend: "v2",
          calls: [incoming("proxy_loaded", true), incoming("ray_cast_missed", false)],
          outcomes: [],
        },
      ],
      {},
    );
    expect(failures.unreported).toEqual([
      "message.proxy_loaded:receive: no outcome; the script died before any call reported",
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
