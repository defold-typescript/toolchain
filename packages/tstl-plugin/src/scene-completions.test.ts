import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AddressSlot,
  createTranspileSession,
  resolveAddressSlotAtPosition,
} from "@defold-typescript/transpiler";
import type { UrlParameterTable } from "@defold-typescript/types";
import type ts from "typescript";
import { buildSceneCompletionEntries } from "./scene-completions";

const TABLE: UrlParameterTable = JSON.parse(
  readFileSync(join(import.meta.dir, "../../types/url-parameters.json"), "utf8"),
);

// Slots come from the production resolver rather than a hand-built offset
// table, so a span this test accepts is a span the editor would really be given.
function slotIn(source: string, literal: string): AddressSlot {
  const session = createTranspileSession();
  session.update({ "main.ts": source });
  const program = session.getProgram();
  if (!program) {
    throw new Error("session produced no program");
  }
  const start = source.indexOf(literal);
  const slot = resolveAddressSlotAtPosition({
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

function entry(name: string): ts.CompletionEntry {
  return { name, kind: "string" as ts.ScriptElementKind, kindModifiers: "", sortText: "0" };
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
    const baseEntries = [entry("#board"), entry("#other")];
    const entries = buildSceneCompletionEntries({
      slot,
      ids: new Set(["board", "hud"]),
      baseEntries,
    });
    expect(entries.map((e) => e.name)).toEqual(["hud"]);
    expect(baseEntries.map((e) => e.name)).toEqual(["#board", "#other"]);
  });
});
