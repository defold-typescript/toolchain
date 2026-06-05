import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadTranslations } from "../scripts/example-store-io";
import { MODULE_MANIFEST } from "../scripts/regen";
import { parseDefoldApiDoc } from "../src/api-doc";
import { htmlToCodeText } from "../src/doc-comment";
import { hashExampleSource } from "../src/example-store";

const EXAMPLES_DIR = resolve(import.meta.dir, "..", "examples");

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

describe("example translation drift guard", () => {
  test("every translated FQN's stored sourceHash matches one of its fixture example bodies", () => {
    const store = loadTranslations();
    const byFqn = exampleSourcesByFqn();
    const stale: string[] = [];
    for (const [fqn, translation] of Object.entries(store)) {
      const sources = byFqn.get(fqn);
      const matches =
        sources != null &&
        [...sources].some((s) => hashExampleSource(s) === translation.sourceHash);
      if (!matches) stale.push(fqn);
    }
    if (stale.length > 0) {
      throw new Error(
        `translations.json sourceHash no longer matches the fixture example for: ${stale.join(", ")} — re-translate`,
      );
    }
    expect(stale).toEqual([]);
  });

  test("the untranslated FQN set matches the committed examples/untranslated.json snapshot", () => {
    const store = loadTranslations();
    const byFqn = exampleSourcesByFqn();
    const untranslated = [...byFqn.keys()].filter((fqn) => !(fqn in store)).sort();
    const committed = JSON.parse(
      readFileSync(resolve(EXAMPLES_DIR, "untranslated.json"), "utf8"),
    ) as string[];
    expect(untranslated).toEqual(committed);
  });
});
