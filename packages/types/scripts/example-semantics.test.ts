import { describe, expect, test } from "bun:test";
import {
  arrayTextureDimensionDefects,
  freedHandleReuseDefects,
  unbackedTexturePageDefects,
  undeclaredAttachmentQueryDefects,
} from "./example-semantics";
import { loadTranslations } from "./example-store-io";

const store = loadTranslations();

function defectsAcrossStore(
  rule: (body: string) => readonly string[],
): readonly { fqn: string; defect: string }[] {
  const found: { fqn: string; defect: string }[] = [];
  for (const [fqn, entries] of Object.entries(store)) {
    const seen = new Set<string>();
    for (const entry of entries) {
      for (const defect of rule(entry.ts)) {
        if (seen.has(defect)) continue;
        seen.add(defect);
        found.push({ fqn, defect });
      }
    }
  }
  return found;
}

function report(defects: readonly { fqn: string; defect: string }[]): string[] {
  return defects.map(({ fqn, defect }) => `${fqn}: ${defect}`);
}

describe("example semantics", () => {
  test("a render target handle is not freed from a repeating hook", () => {
    expect(report(defectsAcrossStore(freedHandleReuseDefects))).toEqual([]);
  });

  test("a queried attachment is one the target's specification declares", () => {
    expect(report(defectsAcrossStore(undeclaredAttachmentQueryDefects))).toEqual([]);
  });

  test("a written texture page is one the created array contains", () => {
    expect(report(defectsAcrossStore(unbackedTexturePageDefects))).toEqual([]);
  });

  test("an array texture is created at the dimensions of the image it is written from", () => {
    expect(report(defectsAcrossStore(arrayTextureDimensionDefects))).toEqual([]);
  });
});
