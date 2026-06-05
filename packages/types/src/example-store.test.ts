import { describe, expect, test } from "bun:test";
import { htmlToCodeText } from "./doc-comment";
import { hashExampleSource, lookupTranslation, type TranslationStore } from "./example-store";

describe("hashExampleSource", () => {
  test("is stable for the same input", () => {
    expect(hashExampleSource("local x = 1")).toBe(hashExampleSource("local x = 1"));
  });

  test("hashes the post-htmlToCodeText string verbatim, so trailing whitespace already removed by htmlToCodeText does not affect it", () => {
    const a = htmlToCodeText("local x = 1   \n");
    const b = htmlToCodeText("local x = 1\n");
    expect(a).toBe(b);
    expect(hashExampleSource(a)).toBe(hashExampleSource(b));
  });

  test("differs for differing source", () => {
    expect(hashExampleSource("local x = 1")).not.toBe(hashExampleSource("local x = 2"));
  });
});

describe("lookupTranslation", () => {
  const store: TranslationStore = {
    "go.get_position": { sourceHash: "abc", ts: "const p = go.get_position();" },
  };

  test("returns the ts body when the FQN exists and the sourceHash matches", () => {
    expect(lookupTranslation(store, "go.get_position", "abc")).toBe("const p = go.get_position();");
  });

  test("returns null when the FQN is absent", () => {
    expect(lookupTranslation(store, "go.set_position", "abc")).toBeNull();
  });

  test("returns null when the stored sourceHash does not match", () => {
    expect(lookupTranslation(store, "go.get_position", "stale")).toBeNull();
  });
});
