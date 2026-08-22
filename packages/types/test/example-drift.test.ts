import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadTranslations } from "../scripts/example-store-io";
import {
  EDITOR_MODULE_MANIFEST,
  loadApiTargets,
  MODULE_MANIFEST,
  VERSIONED_MODULE_MANIFEST,
} from "../scripts/regen";
import { parseDefoldApiDoc } from "../src/api-doc";
import { htmlToCodeText } from "../src/doc-comment";
import { hashExampleSource, lookupTranslation } from "../src/example-store";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const EXAMPLES_DIR = resolve(PACKAGE_ROOT, "examples");

// One committed API surface per entry: a target's `generatedDir` is the
// directory that target emits its module declarations into, so the default
// surface (`generated/`) and each demoted surface (`generated/versions/<id>/`)
// are peers here. `ref-doc` targets are resolved on demand and never committed,
// so they have nothing on disk to scan. `editor-vm/` and `kinds/` are separate
// emit lanes nested inside the default surface, not surfaces of their own, and
// are deliberately outside this walk.
function allGeneratedSurfaces(): { id: string; dir: string }[] {
  return loadApiTargets()
    .filter((target) => (target.source ?? null) == null)
    .map((target) => ({ id: target.id, dir: resolve(PACKAGE_ROOT, target.generatedDir) }))
    .filter((surface) => existsSync(surface.dir));
}

// FQN -> every distinct post-htmlToCodeText example body carried by an element
// with that name (overloads can carry differing bodies under one FQN). Spans the
// editor manifest too: its emitted members carry translations, so their stored
// source hashes need a fixture body to match against or they read as stale.
// Spans the demoted surfaces for the same reason: a translation pinned to the
// body an older target still ships is live for that target, not stale.
function exampleSourcesByFqn(): Map<string, Set<string>> {
  const byFqn = new Map<string, Set<string>>();
  for (const entry of [
    ...MODULE_MANIFEST,
    ...EDITOR_MODULE_MANIFEST,
    ...VERSIONED_MODULE_MANIFEST,
  ]) {
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
  test("no @example block in any committed surface is fenced ```lua", () => {
    const offenders: string[] = [];
    for (const surface of allGeneratedSurfaces()) {
      for (const file of readdirSync(surface.dir)) {
        if (!file.endsWith(".d.ts")) continue;
        const lines = readFileSync(resolve(surface.dir, file), "utf8").split("\n");
        for (let i = 0; i < lines.length - 1; i++) {
          if (lines[i]?.trim() !== "* @example") continue;
          if (lines[i + 1]?.trim() === "* ```lua") {
            offenders.push(`${surface.id}/${file}:${i + 2}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // Without this the widened guard could pass by walking nothing at all.
  test("the surface walk reaches the default surface and every committed demoted one", () => {
    const ids = allGeneratedSurfaces().map((surface) => surface.id);
    expect(ids).toContain("defold-1.13.1");
    expect(ids).toContain("defold-1.12.4");
    expect(ids).toContain("defold-1.13.0");
  });
});
