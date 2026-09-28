import { describe, expect, test } from "bun:test";
import { INDEX_SLOT_CLASSIFICATIONS } from "../../types/src/index-slot-classifications";
import { indexProbeCalls, manualCoverage, PROBED_INDEX_CLASSES } from "./index-probes";
import { generateProbes, probeTarget } from "./witness";

const target = probeTarget().id;

describe("manualCoverage", () => {
  test("a manual verdict with no ok positive call is uncovered, a denylisted one is not", () => {
    const uncovered = manualCoverage([{ backend: "v2", calls: [], outcomes: [] }], target);
    expect(uncovered).toContain("*:go.set:manual:3: no positive call to go.set ended ok");
    expect(uncovered.some((line) => line.includes("http.request"))).toBe(false);
  });

  test("an ok positive call covers the function; a negative or index call does not", () => {
    const covered = manualCoverage(
      [
        {
          backend: "v2",
          calls: [{ name: "go.set", variant: "required", kind: "go", call: "go.set()" }],
          outcomes: [{ name: "go.set", variant: "required", outcome: "ok", message: "" }],
        },
      ],
      target,
    );
    expect(covered.some((line) => line.startsWith("*:go.set:"))).toBe(false);
    const negativeOnly = manualCoverage(
      [
        {
          backend: "v2",
          calls: [
            {
              name: "go.set",
              variant: "negative-1",
              kind: "go",
              call: "go.set({})",
              negative: { slot: 1, kind: "table", binding: "x.cpp" },
            },
          ],
          outcomes: [{ name: "go.set", variant: "negative-1", outcome: "ok", message: "" }],
        },
      ],
      target,
    );
    expect(negativeOnly).toContain("*:go.set:manual:3: no positive call to go.set ended ok");
  });
});

describe("indexProbeCalls", () => {
  const passes = [generateProbes(undefined, "v2"), generateProbes(undefined, "v3")];
  const calls = passes.flatMap((pass) => pass.calls.filter((call) => call.index !== undefined));
  const unverified = passes.flatMap((pass) => pass.indexUnverified);
  const probedKeys = [...INDEX_SLOT_CLASSIFICATIONS]
    .filter(([, c]) => PROBED_INDEX_CLASSES.has(c.class))
    .map(([key]) => key);

  test("each probed slot has a first, middle and last call, or is unverified with a reason", () => {
    const uncovered = probedKeys.filter((key) => {
      const variants = calls.filter((call) => call.index === key).map((call) => call.variant);
      const triple = ["first", "middle", "last"].every((position) =>
        variants.some((variant) => variant.endsWith(`-${position}`)),
      );
      return !triple && !unverified.some((u) => u.key === key && u.reason !== "");
    });
    expect(uncovered).toEqual([]);
    expect(calls.some((call) => call.index === "b2d.fixture.get_type:param:fixture_index")).toBe(
      true,
    );
    expect(unverified.map((u) => u.key)).toContain("client:send:param:i");
  });

  test("each return-to-argument pair of a probed slot has a round trip or is unverified", () => {
    const missing: string[] = [];
    for (const key of probedKeys) {
      if (!calls.some((call) => call.index === key)) continue;
      for (const pair of INDEX_SLOT_CLASSIFICATIONS.get(key)?.pairsWith ?? []) {
        const tripped = calls.some((call) => call.index === key && call.variant.includes("-from-"));
        const listed = unverified.some((u) => u.key === key && u.reason.includes(pair));
        if (!tripped && !listed) missing.push(`${key} <- ${pair}`);
      }
    }
    expect(missing).toEqual([]);
    expect(
      calls.some(
        (call) => call.index === "tilemap.get_tile:param:x" && call.variant === "index-x-from-x",
      ),
    ).toBe(true);
  });

  test("a probed-class slot with neither a context nor a reason is an error", () => {
    const table = new Map([
      ["tilemap.get_tile:param:z", { class: "native-1" as const, evidence: "" }],
    ]);
    expect(() => indexProbeCalls(new Map(), table)).toThrow("tilemap.get_tile:param:z");
  });
});
