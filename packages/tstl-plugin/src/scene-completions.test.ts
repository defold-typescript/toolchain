import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ClassifiedSlot,
  createTranspileSession,
  resolveClassifiedSlotAtPosition,
} from "@defold-typescript/transpiler";
import type { UrlParameterTable } from "@defold-typescript/types";
import type ts from "typescript";
import {
  buildAddressPathCompletionEntries,
  buildSceneCompletionEntries,
  buildWholeLiteralCompletionEntries,
  DEFOLD_COMPLETION_SOURCE,
} from "./scene-completions";

const TABLE: UrlParameterTable = JSON.parse(
  readFileSync(join(import.meta.dir, "../../types/url-parameters.json"), "utf8"),
);

// Slots come from the production resolver rather than a hand-built offset
// table, so a span this test accepts is a span the editor would really be given.
function slotIn(source: string, literal: string): ClassifiedSlot {
  const session = createTranspileSession();
  session.update({ "main.ts": source });
  const program = session.getProgram();
  if (!program) {
    throw new Error("session produced no program");
  }
  const start = source.indexOf(literal);
  const slot = resolveClassifiedSlotAtPosition({
    program,
    table: TABLE,
    fileName: "main.ts",
    position: start + literal.length - 1,
  });
  if (!slot) {
    throw new Error(`${literal} did not resolve to an address slot`);
  }
  return slot;
}

// `ts.Completions.SortText` values, which the public API does not export:
// `LocationPriority`, `GlobalsOrKeywords`, `AutoImportSuggestions`, and
// `Deprecated(JavascriptIdentifiers)` — the greatest key TypeScript itself
// produces. `ABOVE_HOST` is beyond all of them, as another contributor's entry
// could be; only a derived key can sort after it.
const LOCATION_PRIORITY = "11";
const GLOBALS_OR_KEYWORDS = "15";
const AUTO_IMPORT_SUGGESTIONS = "16";
const DEPRECATED_IDENTIFIER = "z18";
const ABOVE_HOST = "zzzz";

// `sortText` is explicit at every call site on purpose: a shared hardcoded key
// is what let contributed entries outrank the base service unnoticed.
function entry(name: string, sortText: string): ts.CompletionEntry {
  return { name, kind: "string" as ts.ScriptElementKind, kindModifiers: "", sortText };
}

describe("buildSceneCompletionEntries", () => {
  test("offers every id, replacing exactly the fragment", () => {
    const slot = slotIn('msg.post("#bo", "hello");\n', '"#bo"');
    const entries = buildSceneCompletionEntries({
      slot,
      ids: new Set(["hud", "board"]),
      baseEntries: [],
    });
    expect(entries.map((e) => e.name)).toEqual(["board", "hud"]);
    for (const built of entries) {
      expect(built.kind).toBe("string" as ts.ScriptElementKind);
      expect(built.replacementSpan).toEqual({ start: slot.fragmentStart, length: 2 });
    }
  });

  test("an empty fragment replaces nothing — the span is the append position", () => {
    const slot = slotIn('msg.post("#", "hello");\n', '"#"');
    const [built] = buildSceneCompletionEntries({
      slot,
      ids: new Set(["board"]),
      baseEntries: [],
    });
    expect(built?.replacementSpan).toEqual({ start: slot.fragmentStart, length: 0 });
  });

  test("a slot with no fragment offers no component id — the path half is a different builder", () => {
    const slot = slotIn('go.get("/enemy", "position");\n', '"/enemy"');
    expect(slot.fragmentStart).toBe(-1);
    expect(buildSceneCompletionEntries({ slot, ids: new Set(["board"]), baseEntries: [] })).toEqual(
      [],
    );
  });

  test("an id the base already offers is dropped from ours, never from the base's", () => {
    const slot = slotIn('msg.post("#bo", "hello");\n', '"#bo"');
    const baseEntries = [entry("#board", LOCATION_PRIORITY), entry("#other", LOCATION_PRIORITY)];
    const entries = buildSceneCompletionEntries({
      slot,
      ids: new Set(["board", "hud"]),
      baseEntries,
    });
    expect(entries.map((e) => e.name)).toEqual(["hud"]);
    expect(baseEntries.map((e) => e.name)).toEqual(["#board", "#other"]);
  });

  test("every contributed key sorts after every base key in the same call", () => {
    const slot = slotIn('msg.post("#bo", "hello");\n', '"#bo"');
    const baseEntries = [
      entry("#a", LOCATION_PRIORITY),
      entry("#b", GLOBALS_OR_KEYWORDS),
      entry("#c", DEPRECATED_IDENTIFIER),
    ];
    const entries = buildSceneCompletionEntries({
      slot,
      ids: new Set(["hud", "board"]),
      baseEntries,
    });
    expect(entries.map((e) => e.name)).toEqual(["board", "hud"]);
    for (const built of entries) {
      for (const base of baseEntries) {
        expect(built.sortText > base.sortText).toBe(true);
      }
    }
    expect(baseEntries.map((e) => e.sortText)).toEqual([
      LOCATION_PRIORITY,
      GLOBALS_OR_KEYWORDS,
      DEPRECATED_IDENTIFIER,
    ]);
  });

  test("a base-less call still keys above every priority the host produces", () => {
    const slot = slotIn('msg.post("#bo", "hello");\n', '"#bo"');
    const entries = buildSceneCompletionEntries({
      slot,
      ids: new Set(["hud", "board"]),
      baseEntries: [],
    });
    expect(entries).toHaveLength(2);
    for (const built of entries) {
      for (const priority of [
        LOCATION_PRIORITY,
        GLOBALS_OR_KEYWORDS,
        AUTO_IMPORT_SUGGESTIONS,
        DEPRECATED_IDENTIFIER,
      ]) {
        expect(built.sortText > priority).toBe(true);
      }
    }
  });

  test("a base key above every host priority still sorts first — the key is derived, not constant", () => {
    const slot = slotIn('msg.post("#bo", "hello");\n', '"#bo"');
    const entries = buildSceneCompletionEntries({
      slot,
      ids: new Set(["hud", "board"]),
      baseEntries: [entry("#x", ABOVE_HOST)],
    });
    expect(entries).toHaveLength(2);
    for (const built of entries) {
      expect(built.sortText > ABOVE_HOST).toBe(true);
    }
  });
});

describe("buildAddressPathCompletionEntries", () => {
  const PATH_AND_FRAGMENT = 'msg.post("/enemy#sprite", "hello");\n';

  test("replaces the path half alone, leaving the fragment the caret is not in", () => {
    const slot = slotIn(PATH_AND_FRAGMENT, '"/enemy#sprite"');
    const entries = buildAddressPathCompletionEntries({
      slot,
      paths: new Set(["/hero", "/hud"]),
      baseEntries: [],
    });
    expect(entries.map((e) => e.name)).toEqual(["/hero", "/hud"]);
    for (const built of entries) {
      expect(built.kind).toBe("string" as ts.ScriptElementKind);
      expect(built.replacementSpan).toEqual({
        start: slot.textStart,
        length: "/enemy".length,
      });
    }
  });

  test("a path the base already offers as the whole literal is dropped from ours", () => {
    const slot = slotIn(PATH_AND_FRAGMENT, '"/enemy#sprite"');
    const baseEntries = [entry("/hero#sprite", LOCATION_PRIORITY), entry("/hero", ABOVE_HOST)];
    const entries = buildAddressPathCompletionEntries({
      slot,
      paths: new Set(["/hero", "/hud"]),
      baseEntries,
    });
    // `/hero` alone is not the literal this entry would produce, so it is not
    // the duplicate — only the whole-literal `/hero#sprite` is.
    expect(entries.map((e) => e.name)).toEqual(["/hud"]);
    expect(baseEntries.map((e) => e.name)).toEqual(["/hero#sprite", "/hero"]);
  });

  test("every contributed key sorts after every base key in the same call", () => {
    const slot = slotIn(PATH_AND_FRAGMENT, '"/enemy#sprite"');
    const baseEntries = [
      entry("a", LOCATION_PRIORITY),
      entry("b", DEPRECATED_IDENTIFIER),
      entry("c", ABOVE_HOST),
    ];
    const entries = buildAddressPathCompletionEntries({
      slot,
      paths: new Set(["/hero", "/hud"]),
      baseEntries,
    });
    expect(new Set(entries.map((e) => e.sortText)).size).toBe(1);
    for (const built of entries) {
      for (const base of baseEntries) {
        expect(built.sortText > base.sortText).toBe(true);
      }
    }
  });

  test("a slot carrying no fragment replaces the whole inside-quotes text", () => {
    const slot = slotIn('go.get("/enemy", "position");\n', '"/enemy"');
    expect(slot.fragmentStart).toBe(-1);
    const entries = buildAddressPathCompletionEntries({
      slot,
      paths: new Set(["/hero"]),
      baseEntries: [entry("/hero", LOCATION_PRIORITY)],
    });
    // With no fragment to keep, the offered literal is the bare path — so the
    // base entry of that exact name *is* the duplicate here.
    expect(entries).toEqual([]);
    const offered = buildAddressPathCompletionEntries({
      slot,
      paths: new Set(["/hero"]),
      baseEntries: [],
    });
    expect(offered[0]?.replacementSpan).toEqual({
      start: slot.textStart,
      length: "/enemy".length,
    });
  });

  test("an empty literal replaces nothing — the span is the caret", () => {
    const slot = slotIn('go.get("", "position");\n', '""');
    const [built] = buildAddressPathCompletionEntries({
      slot,
      paths: new Set(["/hero"]),
      baseEntries: [],
    });
    expect(built?.replacementSpan).toEqual({ start: slot.textStart, length: 0 });
  });
});

describe("buildWholeLiteralCompletionEntries", () => {
  const NODE_SOURCE = 'gui.get_node("sco");\n';
  const ANIMATION_SOURCE = 'sprite.play_flipbook("#sprite", "wa");\n';

  test("an animation slot gets the identical whole-literal treatment as a node id", () => {
    // One builder serves both kinds: an id and a node name have the same span
    // rule, so a second exported builder would only be a copy free to drift.
    const slot = slotIn(ANIMATION_SOURCE, '"wa"');
    expect(slot.class).toBe("animation");
    const entries = buildWholeLiteralCompletionEntries({
      slot,
      ids: new Set(["walk", "jump"]),
      baseEntries: [entry("walk", LOCATION_PRIORITY)],
    });
    expect(entries.map((e) => e.name)).toEqual(["jump"]);
    expect(new Set(entries.map((e) => e.sortText)).size).toBe(1);
    for (const built of entries) {
      expect(built.replacementSpan).toEqual({ start: slot.textStart, length: "wa".length });
      expect(built.sortText > LOCATION_PRIORITY).toBe(true);
    }
  });

  test("offers every node id, replacing the whole literal rather than a fragment", () => {
    const slot = slotIn(NODE_SOURCE, '"sco"');
    expect(slot.class).toBe("gui-node");
    const entries = buildWholeLiteralCompletionEntries({
      slot,
      ids: new Set(["score", "level"]),
      baseEntries: [],
    });
    expect(entries.map((e) => e.name)).toEqual(["level", "score"]);
    for (const built of entries) {
      expect(built.kind).toBe("string" as ts.ScriptElementKind);
      expect(built.replacementSpan).toEqual({ start: slot.textStart, length: "sco".length });
    }
  });

  test("an empty literal replaces nothing — the span is the caret", () => {
    const slot = slotIn('gui.get_node("");\n', '""');
    const [built] = buildWholeLiteralCompletionEntries({
      slot,
      ids: new Set(["score"]),
      baseEntries: [],
    });
    expect(built?.replacementSpan).toEqual({ start: slot.textStart, length: 0 });
  });

  test("an id the base already offers is dropped from ours, never from the base's", () => {
    const slot = slotIn(NODE_SOURCE, '"sco"');
    const baseEntries = [entry("score", LOCATION_PRIORITY)];
    const entries = buildWholeLiteralCompletionEntries({
      slot,
      ids: new Set(["score", "level"]),
      baseEntries,
    });
    expect(entries.map((e) => e.name)).toEqual(["level"]);
    expect(baseEntries.map((e) => e.name)).toEqual(["score"]);
  });

  test("one shared key sorts every node id after every base key", () => {
    const slot = slotIn(NODE_SOURCE, '"sco"');
    const baseEntries = [
      entry("a", LOCATION_PRIORITY),
      entry("b", DEPRECATED_IDENTIFIER),
      entry("c", ABOVE_HOST),
    ];
    const entries = buildWholeLiteralCompletionEntries({
      slot,
      ids: new Set(["score", "level"]),
      baseEntries,
    });
    expect(new Set(entries.map((e) => e.sortText)).size).toBe(1);
    for (const built of entries) {
      for (const base of baseEntries) {
        expect(built.sortText > base.sortText).toBe(true);
      }
    }
  });

  test("a base-less call still keys above every priority the host produces", () => {
    const slot = slotIn(NODE_SOURCE, '"sco"');
    const entries = buildWholeLiteralCompletionEntries({
      slot,
      ids: new Set(["score"]),
      baseEntries: [],
    });
    for (const priority of [
      LOCATION_PRIORITY,
      GLOBALS_OR_KEYWORDS,
      AUTO_IMPORT_SUGGESTIONS,
      DEPRECATED_IDENTIFIER,
    ]) {
      expect(entries[0]?.sortText ?? "").toBeTruthy();
      expect((entries[0]?.sortText ?? "") > priority).toBe(true);
    }
  });
});

// One call per exported builder, each in the slot class that builder serves.
// Every case below runs all three, so a discriminator stamped in one place only
// is a failure rather than a coincidence.
function everyBuilder(): { name: string; entries: ts.CompletionEntry[] }[] {
  const fragmentSlot = slotIn('msg.post("#bo", "hello");\n', '"#bo"');
  const addressSlot = slotIn('msg.post("/enemy#sprite", "hello");\n', '"/enemy#sprite"');
  const literalSlot = slotIn('gui.get_node("sco");\n', '"sco"');
  return [
    {
      name: "buildSceneCompletionEntries",
      entries: buildSceneCompletionEntries({
        slot: fragmentSlot,
        ids: new Set(["hud", "board"]),
        baseEntries: [],
      }),
    },
    {
      name: "buildAddressPathCompletionEntries",
      entries: buildAddressPathCompletionEntries({
        slot: addressSlot,
        paths: new Set(["/hero", "/hud"]),
        baseEntries: [],
      }),
    },
    {
      name: "buildWholeLiteralCompletionEntries",
      entries: buildWholeLiteralCompletionEntries({
        slot: literalSlot,
        ids: new Set(["score", "level"]),
        baseEntries: [],
      }),
    },
  ];
}

describe("contributed entries carry a discriminator", () => {
  test("every entry from every builder names this plugin as its source", () => {
    for (const { name, entries } of everyBuilder()) {
      expect(entries.length).toBeGreaterThan(0);
      for (const built of entries) {
        expect({ builder: name, source: built.source }).toEqual({
          builder: name,
          source: DEFOLD_COMPLETION_SOURCE,
        });
      }
    }
  });

  test("the source is namespaced to this tool rather than a bare word", () => {
    expect(DEFOLD_COMPLETION_SOURCE).toContain("defold-typescript");
  });

  test("adding the field leaves every other field of every entry as it was", () => {
    const fragmentSlot = slotIn('msg.post("#bo", "hello");\n', '"#bo"');
    const addressSlot = slotIn('msg.post("/enemy#sprite", "hello");\n', '"/enemy#sprite"');
    const literalSlot = slotIn('gui.get_node("sco");\n', '"sco"');
    const [fragment, address, literal] = everyBuilder().map(({ entries }) => entries);

    expect(fragment?.map((e) => e.name)).toEqual(["board", "hud"]);
    for (const built of fragment ?? []) {
      expect(built.kind).toBe("string" as ts.ScriptElementKind);
      expect(built.kindModifiers).toBe("");
      expect(built.replacementSpan).toEqual({ start: fragmentSlot.fragmentStart, length: 2 });
      expect(built.sortText > DEPRECATED_IDENTIFIER).toBe(true);
    }

    expect(address?.map((e) => e.name)).toEqual(["/hero", "/hud"]);
    for (const built of address ?? []) {
      expect(built.replacementSpan).toEqual({
        start: addressSlot.textStart,
        length: "/enemy".length,
      });
    }

    expect(literal?.map((e) => e.name)).toEqual(["level", "score"]);
    for (const built of literal ?? []) {
      expect(built.replacementSpan).toEqual({
        start: literalSlot.textStart,
        length: "sco".length,
      });
    }
  });

  test("a base entry is deduped against but never stamped — the plugin marks only what it builds", () => {
    const slot = slotIn('gui.get_node("sco");\n', '"sco"');
    const baseEntries = [entry("score", LOCATION_PRIORITY)];
    const entries = buildWholeLiteralCompletionEntries({
      slot,
      ids: new Set(["score", "level"]),
      baseEntries,
    });
    expect(entries.map((e) => e.name)).toEqual(["level"]);
    expect(baseEntries.map((e) => e.source)).toEqual([undefined]);
  });
});
