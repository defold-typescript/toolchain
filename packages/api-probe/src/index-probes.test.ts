import { describe, expect, test } from "bun:test";
import { manualCoverage } from "./index-probes";
import { probeTarget } from "./witness";

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
