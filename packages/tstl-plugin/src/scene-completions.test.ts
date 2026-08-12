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
import { buildGuiNodeCompletionEntries, buildSceneCompletionEntries } from "./scene-completions";

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

  test("a slot with no fragment offers nothing — path completion is not this slice", () => {
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

describe("buildGuiNodeCompletionEntries", () => {
  const NODE_SOURCE = 'gui.get_node("sco");\n';

  test("offers every node id, replacing the whole literal rather than a fragment", () => {
    const slot = slotIn(NODE_SOURCE, '"sco"');
    expect(slot.class).toBe("gui-node");
    const entries = buildGuiNodeCompletionEntries({
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
    const [built] = buildGuiNodeCompletionEntries({
      slot,
      ids: new Set(["score"]),
      baseEntries: [],
    });
    expect(built?.replacementSpan).toEqual({ start: slot.textStart, length: 0 });
  });

  test("an id the base already offers is dropped from ours, never from the base's", () => {
    const slot = slotIn(NODE_SOURCE, '"sco"');
    const baseEntries = [entry("score", LOCATION_PRIORITY)];
    const entries = buildGuiNodeCompletionEntries({
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
    const entries = buildGuiNodeCompletionEntries({
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
    const entries = buildGuiNodeCompletionEntries({
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
