import { describe, expect, test } from "bun:test";
import { filter, rejectAll, rejectAny, requireAll, requireAny, tryFilter } from "./index";

// tiny.filter accepts each of these but `a&()`: it reads most through a quirk of its
// scanner, builds a filter that fails only when it runs for `a!b`, and one that
// selects nothing for `""`. So only Bun can hold ecs to the documented grammar and
// its error message.
const REJECTED = ["", "a | b", "a&&b", "|a", "!!a", "(a", "a)", "(a)(b)", "a!b", "a-b", "a&()"];

// The 1-based position of the first character the grammar cannot accept; the
// end of input is the pattern's length plus one.
const POSITIONS: [string, number][] = [
  ["a&&b", 3],
  ["a | b", 2],
  ["a&", 3],
  ["|a", 1],
  ["", 1],
  ["!!a", 2],
  ["(a", 3],
  ["(a)(b)", 4],
  ["a&()", 4],
];

function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("filter rejects a pattern outside the documented grammar", () => {
  for (const pattern of REJECTED) {
    test(JSON.stringify(pattern), () => {
      const error = thrown(() => filter(pattern));
      expect(typeof error).toBe("string");
      expect(error as string).toStartWith(`ecs: bad filter pattern "${pattern}"`);
      expect(tryFilter(pattern)).toEqual({ ok: false, error: error as string });
    });
  }
});

describe("the error ends with the position the grammar stops at", () => {
  for (const [pattern, position] of POSITIONS) {
    test(`${JSON.stringify(pattern)} at ${position}`, () => {
      expect(thrown(() => filter(pattern)) as string).toEndWith(` at ${position}`);
    });
  }
});

describe("tryFilter", () => {
  test("returns the filter that filter builds for an accepted pattern", () => {
    const result = tryFilter("a&!b");
    const direct = filter("a&!b");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const verdicts: [object, boolean][] = [
      [{ a: 1 }, true],
      [{ a: 1, b: 1 }, false],
      [{}, false],
    ];
    for (const [entity, verdict] of verdicts) {
      expect(result.filter(undefined, entity)).toBe(verdict);
      expect(direct(undefined, entity)).toBe(verdict);
    }
  });
});

describe("a combinator rejects a token that is neither a component name nor a filter", () => {
  const builders: [string, (bad: never) => unknown][] = [
    ["requireAll", (bad) => requireAll("a", bad, requireAll("b"))],
    ["requireAny", (bad) => requireAny("a", bad, requireAll("b"))],
    ["rejectAll", (bad) => rejectAll("a", bad, requireAll("b"))],
    ["rejectAny", (bad) => rejectAny("a", bad, requireAll("b"))],
  ];
  const tokens: [string, unknown][] = [
    ["a number", 1],
    ["a table", {}],
  ];
  for (const [name, build] of builders) {
    for (const [label, bad] of tokens) {
      test(`${name} given ${label}`, () => {
        expect(thrown(() => build(bad as never))).toBe(
          "ecs: a filter token must be a component name or a filter",
        );
      });
    }
  }
});
