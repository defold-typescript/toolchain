import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadTranslations } from "../scripts/example-store-io";
import { MODULE_MANIFEST } from "../scripts/regen";
import { parseDefoldApiDoc } from "../src/api-doc";
import { htmlToCodeText } from "../src/doc-comment";
import { hashExampleSource, lookupTranslation } from "../src/example-store";

const EXAMPLES_DIR = resolve(import.meta.dir, "..", "examples");
const GENERATED_DIR = resolve(import.meta.dir, "..", "generated");

// FQN -> every distinct post-htmlToCodeText example body carried by an element
// with that name (overloads can carry differing bodies under one FQN).
function exampleSourcesByFqn(): Map<string, Set<string>> {
  const byFqn = new Map<string, Set<string>>();
  for (const entry of MODULE_MANIFEST) {
    for (const fn of parseDefoldApiDoc(entry.doc).functions) {
      const lua = htmlToCodeText(fn.examples ?? "");
      if (lua === "") continue;
      const set = byFqn.get(fn.name) ?? new Set<string>();
      set.add(lua);
      byFqn.set(fn.name, set);
    }
  }
  return byFqn;
}

// Every example-bearing element, identified `<fqn>:<sourceHash>`, that no stored
// translation matches. Per element (not per FQN), so an overload-shadowed body
// under an already-translated FQN is still visible.
function untranslatedElements(): string[] {
  const store = loadTranslations();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of MODULE_MANIFEST) {
    for (const fn of parseDefoldApiDoc(entry.doc).functions) {
      const lua = htmlToCodeText(fn.examples ?? "");
      if (lua === "") continue;
      const sourceHash = hashExampleSource(lua);
      if (lookupTranslation(store, fn.name, sourceHash) !== null) continue;
      const key = `${fn.name}:${sourceHash}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  return out.sort();
}

describe("example translation drift guard", () => {
  test("every stored sourceHash matches one of its fixture example bodies", () => {
    const store = loadTranslations();
    const byFqn = exampleSourcesByFqn();
    const stale: string[] = [];
    for (const [fqn, translations] of Object.entries(store)) {
      const hashes = new Set([...(byFqn.get(fqn) ?? [])].map(hashExampleSource));
      for (const translation of translations) {
        if (!hashes.has(translation.sourceHash)) stale.push(`${fqn}:${translation.sourceHash}`);
      }
    }
    if (stale.length > 0) {
      throw new Error(
        `translations.json sourceHash no longer matches a fixture example for: ${stale.join(", ")} — re-translate`,
      );
    }
    expect(stale).toEqual([]);
  });

  test("the per-element untranslated set matches the committed examples/untranslated.json snapshot", () => {
    const untranslated = untranslatedElements();
    const committed = JSON.parse(
      readFileSync(resolve(EXAMPLES_DIR, "untranslated.json"), "utf8"),
    ) as string[];
    expect(untranslated).toEqual(committed);
  });
});

describe("generated declarations carry no Lua example fallback", () => {
  // The emit renders an example as ` * @example` immediately followed by the
  // fence ` * ```<lang>` (`doc-comment.ts` renderDocComment). Lua fences inside
  // namespace/param prose are upstream doc text, not translations — scope the
  // guard to the fence line that directly follows `@example`.
  test("no @example block in generated/*.d.ts is fenced ```lua", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(GENERATED_DIR)) {
      if (!file.endsWith(".d.ts")) continue;
      const lines = readFileSync(resolve(GENERATED_DIR, file), "utf8").split("\n");
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i]?.trim() !== "* @example") continue;
        if (lines[i + 1]?.trim() === "* ```lua") offenders.push(`${file}:${i + 2}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
