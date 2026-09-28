import { describe, expect, test } from "bun:test";
import { loadTranslations } from "../scripts/example-store-io";
import { htmlToCodeText } from "./doc-comment";
import {
  hashExampleSource,
  lookupExampleSegments,
  lookupExampleTranslations,
  lookupTranslation,
  type TranslationStore,
} from "./example-store";

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

describe("translations.json multi-hash entries", () => {
  // `gui.set` carries one body on the default target and a different one on the
  // demoted targets, so both source hashes have to resolve to their own
  // translation. A re-pin that replaces rather than appends drops one of them
  // and the older surface silently falls back to raw Lua.
  test("gui.set resolves a translation for both the default and the demoted source body", () => {
    const store = loadTranslations();
    const hashes = (store["gui.set"] ?? []).map((entry) => entry.sourceHash);
    expect(hashes).toContain("a609fdbcee772fac");
    expect(hashes).toContain("d195edde0a9fd170");
    for (const hash of hashes) {
      const ts = lookupTranslation(store, "gui.set", hash);
      expect(ts).not.toBeNull();
      expect(ts).not.toContain("local ");
    }
    expect(lookupTranslation(store, "gui.set", "a609fdbcee772fac")).not.toBe(
      lookupTranslation(store, "gui.set", "d195edde0a9fd170"),
    );
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

describe("lookupExampleTranslations", () => {
  const store: TranslationStore = {
    "resource.set_texture": [
      { sourceHash: "s1", ts: "const a = 1;" },
      { sourceHash: "s2", ts: "const b = 2;" },
      { sourceHash: "s3", ts: "const c = 3;" },
    ],
  };

  test("returns the bodies in the order the hashes are given, not store order", () => {
    expect(lookupExampleTranslations(store, "resource.set_texture", ["s3", "s1"])).toEqual([
      "const c = 3;",
      "const a = 1;",
    ]);
  });

  test("returns null when any one hash is missing, so a partial split never half-emits", () => {
    expect(lookupExampleTranslations(store, "resource.set_texture", ["s1", "nope"])).toBeNull();
    expect(lookupExampleTranslations(store, "resource.set_texture", ["nope"])).toBeNull();
  });

  test("returns null for an unknown FQN and for an empty hash list", () => {
    expect(lookupExampleTranslations(store, "no.such", ["s1"])).toBeNull();
    expect(lookupExampleTranslations(store, "resource.set_texture", [])).toBeNull();
  });
});

describe("lookupExampleSegments", () => {
  const first = { code: "local a = 1", prose: "Upstream first caption" };
  const second = { code: "local b = 2", prose: "Upstream second caption" };
  const blank = { code: "local c = 3", prose: "" };
  const store: TranslationStore = {
    "resource.create_texture_async": [
      { sourceHash: hashExampleSource(first.code), ts: "const a = 1;" },
      { sourceHash: hashExampleSource(second.code), ts: "const b = 2;", prose: "Authored caption" },
      { sourceHash: hashExampleSource(blank.code), ts: "const c = 3;" },
    ],
  };

  test("an authored caption replaces the upstream one for the entry that carries it only", () => {
    expect(lookupExampleSegments(store, "resource.create_texture_async", [first, second])).toEqual([
      { ts: "const a = 1;", prose: "Upstream first caption" },
      { ts: "const b = 2;", prose: "Authored caption" },
    ]);
  });

  test("an entry without a caption keeps the upstream prose, blank included", () => {
    expect(lookupExampleSegments(store, "resource.create_texture_async", [blank, first])).toEqual([
      { ts: "const c = 3;", prose: "" },
      { ts: "const a = 1;", prose: "Upstream first caption" },
    ]);
  });

  test("returns null when any one segment is unresolved, for an unknown FQN, and for no segments", () => {
    const missing = { code: "local z = 0", prose: "Missing" };
    expect(
      lookupExampleSegments(store, "resource.create_texture_async", [first, missing]),
    ).toBeNull();
    expect(lookupExampleSegments(store, "no.such", [first])).toBeNull();
    expect(lookupExampleSegments(store, "resource.create_texture_async", [])).toBeNull();
  });
});
