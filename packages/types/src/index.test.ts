import { describe, expect, test } from "bun:test";
import {
  hashExampleSource,
  lookupTranslation,
  type Translation,
  type TranslationStore,
} from "./index";

describe("@defold-typescript/types public surface", () => {
  test("re-exports the example-store lookup helpers", () => {
    expect(typeof lookupTranslation).toBe("function");
    expect(typeof hashExampleSource).toBe("function");
  });

  test("re-exports the Translation and TranslationStore types", () => {
    const translation: Translation = { sourceHash: "abc", ts: "go.get()" };
    const store: TranslationStore = { "go.get": translation };
    expect(lookupTranslation(store, "go.get", "abc")).toBe("go.get()");
  });
});
