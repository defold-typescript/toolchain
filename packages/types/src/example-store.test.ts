import { describe, expect, test } from "bun:test";
import { loadTranslations } from "../scripts/example-store-io";
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
    "vmath.vector3": [
      { sourceHash: "h1", ts: "const a = vmath.vector3();" },
      { sourceHash: "h2", ts: "const b = vmath.vector3(1.0);" },
      { sourceHash: "h3", ts: "const c = vmath.vector3(vmath.vector3(1.0));" },
    ],
    "go.get_position": [{ sourceHash: "abc", ts: "const p = go.get_position();" }],
  };

  test("returns the matching element's ts when an FQN holds several overload translations and a later hash matches", () => {
    expect(lookupTranslation(store, "vmath.vector3", "h2")).toBe("const b = vmath.vector3(1.0);");
    expect(lookupTranslation(store, "vmath.vector3", "h3")).toBe(
      "const c = vmath.vector3(vmath.vector3(1.0));",
    );
  });

  test("returns the single element's ts for a one-translation FQN", () => {
    expect(lookupTranslation(store, "go.get_position", "abc")).toBe("const p = go.get_position();");
  });

  test("returns null when the FQN is present but no array element matches the hash", () => {
    expect(lookupTranslation(store, "vmath.vector3", "nope")).toBeNull();
  });

  test("returns null when the FQN is absent", () => {
    expect(lookupTranslation(store, "go.set_position", "abc")).toBeNull();
  });
});

describe("translations.json array migration", () => {
  test("every stored array element resolves back to its own ts via lookupTranslation", () => {
    const store = loadTranslations();
    const entries = Object.entries(store);
    expect(entries.length).toBeGreaterThanOrEqual(264);
    for (const [fqn, translations] of entries) {
      expect(Array.isArray(translations)).toBe(true);
      for (const translation of translations) {
        expect(lookupTranslation(store, fqn, translation.sourceHash)).toBe(translation.ts);
      }
    }
  });
});
