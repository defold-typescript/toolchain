import { describe, expect, test } from "bun:test";
import { type EmphasisRange, functionTypeEmphasis, signatureEmphasis } from "./signature-emphasis";

const pieces = (text: string, ranges: readonly EmphasisRange[]) =>
  ranges.map(({ start, end }) => text.slice(start, end));

const names = (text: string) => pieces(text, signatureEmphasis(text));

const NEWTRY =
  "socket.newtry(finalizer?: () => void): <T>(value: T | undefined, ...rest: T extends { readonly __tstlMultiReturn: unknown } ? [boxedMultiReturn: never] : unknown[]) => T";

describe("signatureEmphasis", () => {
  test("bolds the member name, its parameters and the returned function's parameters", () => {
    expect(names(NEWTRY)).toEqual(["newtry", "finalizer", "value", "...rest"]);
  });

  test("bolds a callback parameter's own parameters", () => {
    expect(
      names(
        "timer.delay(delay: number, repeat: boolean, callback: (self: unknown, handle: hash, time_elapsed: number) => void): hash",
      ),
    ).toEqual(["delay", "delay", "repeat", "callback", "self", "handle", "time_elapsed"]);
  });

  test("a function type that is not the whole slot type contributes nothing", () => {
    expect(names("ns.f(a: (() => void) | undefined)")).toEqual(["f", "a"]);
    expect(names("ns.f(b: Array<(a: number) => void>)")).toEqual(["f", "b"]);
  });

  test("a whole-slot function type is read one level deep", () => {
    expect(names("ns.f(p: (cb: (x: number) => void) => void)")).toEqual(["f", "p", "cb"]);
  });

  test("a property bolds its name, and a function-typed property its parameters", () => {
    expect(names("GUITextMetrics.height: number")).toEqual(["height"]);
    expect(names("X.on_event: (event: hash) => void")).toEqual(["on_event", "event"]);
  });

  test("a generic head is skipped", () => {
    expect(names("go.get<P>(url: string): P")).toEqual(["get", "url"]);
  });

  test("a string literal type neither closes nor splits the call list", () => {
    expect(names('f(a: ")", b: number)')).toEqual(["f", "a", "b"]);
    expect(names('f(a: ",", b: number)')).toEqual(["f", "a", "b"]);
  });

  test("an overload placeholder bolds only the name", () => {
    expect(names("ns.fn(...)")).toEqual(["fn"]);
  });

  test("text with no leading identifier bolds nothing", () => {
    expect(names("(shape_id: number): void")).toEqual([]);
    expect(names("")).toEqual([]);
  });

  test("ranges are sorted and non-overlapping", () => {
    const ranges = signatureEmphasis(NEWTRY);
    for (const [index, range] of ranges.entries()) {
      expect(range.start).toBeLessThan(range.end);
      if (index > 0) expect(range.start).toBeGreaterThanOrEqual(ranges[index - 1]?.end ?? 0);
    }
  });
});

describe("functionTypeEmphasis", () => {
  test("a function type answers with its parameter names", () => {
    const type = "<T>(value: T, ...rest: unknown[]) => T";
    expect(pieces(type, functionTypeEmphasis(type))).toEqual(["value", "...rest"]);
  });

  test("a type that is not a function type answers nothing", () => {
    expect(functionTypeEmphasis("number")).toEqual([]);
    expect(functionTypeEmphasis("(A | B)")).toEqual([]);
    expect(functionTypeEmphasis("(() => void) | undefined")).toEqual([]);
  });

  test("ranges index into the untrimmed type", () => {
    const type = "  (a: number) => void";
    expect(pieces(type, functionTypeEmphasis(type))).toEqual(["a"]);
  });
});
