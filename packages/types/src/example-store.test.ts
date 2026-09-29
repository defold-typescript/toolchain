import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadTranslations } from "../scripts/example-store-io";
import { parseDefoldApiDoc } from "./api-doc";
import { htmlToCodeText, htmlToDocText, splitExampleSources } from "./doc-comment";
import {
  hashExampleSource,
  lookupExampleSegments,
  lookupExampleTranslations,
  lookupTranslation,
  proseLuaFences,
  type TranslationStore,
  translateProseFences,
} from "./example-store";

const FIXTURES_DIR = resolve(import.meta.dir, "..", "fixtures");

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
  test("gui.set resolves every example of both the default and the demoted source body", () => {
    const store = loadTranslations();
    const resolved = ["defold-1.13.1", "defold-1.12.4"].map((target) => {
      const doc = JSON.parse(readFileSync(resolve(FIXTURES_DIR, target, "gui_doc.json"), "utf8"));
      const fn = parseDefoldApiDoc(doc).functions.find((candidate) => candidate.name === "gui.set");
      return lookupExampleSegments(store, "gui.set", splitExampleSources(fn?.examples ?? ""));
    });
    for (const segments of resolved) {
      expect(segments).not.toBeNull();
      for (const { ts } of segments ?? []) expect(ts).not.toContain("local ");
    }
    expect(resolved[0]).not.toEqual(resolved[1]);
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

describe("translateProseFences", () => {
  const body = 'local function check()\n    return physics.get_group("#co")\nend';
  const markdown = ["Returns the group.", "", "```lua", body, "```", "", "Trailing *prose*."].join(
    "\n",
  );
  const ts = 'function check(): hash {\n  return physics.get_group("#co");\n}';
  const store: TranslationStore = {
    "physics.get_group": [{ sourceHash: hashExampleSource(body), ts }],
  };

  test("replaces a fence whose body hash is pinned under the key, leaving every other byte", () => {
    expect(translateProseFences(markdown, "physics.get_group", store)).toBe(
      ["Returns the group.", "", "```ts", ts, "```", "", "Trailing *prose*."].join("\n"),
    );
  });

  test("keeps the Lua fence when no entry under the key matches, or the match sits under another key", () => {
    expect(translateProseFences(markdown, "physics.get_group", {})).toBe(markdown);
    expect(
      translateProseFences(markdown, "physics.get_group", {
        "physics.get_group": [{ sourceHash: "0000000000000000", ts }],
      }),
    ).toBe(markdown);
    expect(translateProseFences(markdown, "physics.set_group", store)).toBe(markdown);
  });

  test("swaps only the matching fence when a doc carries several, and never reads a non-Lua fence", () => {
    const other = "if x then\nend";
    const mixed = ["```text", body, "```", "", "```lua", other, "```", "", markdown].join("\n");
    expect(translateProseFences(mixed, "physics.get_group", store)).toBe(
      [
        "```text",
        body,
        "```",
        "",
        "```lua",
        other,
        "```",
        "",
        "Returns the group.",
        "",
        "```ts",
        ts,
        "```",
        "",
        "Trailing *prose*.",
      ].join("\n"),
    );
  });
});

describe("proseLuaFences", () => {
  const FIXTURES = resolve(import.meta.dir, "..", "fixtures", "defold-1.13.1");
  const load = (name: string) =>
    parseDefoldApiDoc(JSON.parse(readFileSync(resolve(FIXTURES, `${name}_doc.json`), "utf8")));

  test("reads a return doc's fence body exactly as htmlToDocText renders it", () => {
    const physics = load("physics");
    const fences = proseLuaFences(physics).filter((fence) => fence.key === "physics.get_maskbit");
    expect(fences).toHaveLength(1);
    const lua = fences[0]?.lua ?? "";
    expect(lua).toStartWith("local function is_invincible()\n    -- check if");
    const returnDoc = physics.functions.find((fn) => fn.name === "physics.get_maskbit")
      ?.returnValues[0]?.doc;
    expect(htmlToDocText(returnDoc ?? "")).toContain(`\`\`\`lua\n${lua}\n\`\`\``);
  });

  test("keys a namespace description fence by the namespace and a summary fence by the function", () => {
    const keys = proseLuaFences(load("socket")).map((fence) => fence.key);
    expect(keys).toContain("socket");
    expect(keys).toContain("socket.dns.getaddrinfo");
  });
});
