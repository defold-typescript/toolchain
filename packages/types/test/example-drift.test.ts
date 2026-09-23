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
import { htmlToCodeText, splitExampleSources } from "../src/doc-comment";
import {
  hashExampleSource,
  lookupExampleTranslations,
  lookupTranslation,
} from "../src/example-store";

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

// FQN -> every source a stored translation may legitimately be pinned to: an
// element's whole-blob post-htmlToCodeText body, and — when its blob carries
// several examples — each segment's body. Overloads can carry differing bodies
// under one FQN, so this is a set per name. Spans the editor manifest too: its
// emitted members carry translations, so their stored source hashes need a
// fixture body to match against or they read as stale. Spans the demoted
// surfaces for the same reason: a translation pinned to the body an older target
// still ships is live for that target, not stale.
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
      const segments = splitExampleSources(fn.examples ?? "");
      if (segments.length > 1) for (const segment of segments) set.add(segment.code);
      byFqn.set(fn.name, set);
    }
  }
  return byFqn;
}

// Every example-bearing element across every manifest, with the hashes the emit
// ladder consults for it: the whole-blob hash, and the per-segment hashes when
// its blob carries several examples.
function exampleElements(): { fqn: string; wholeHash: string; segmentHashes: string[] }[] {
  const out: { fqn: string; wholeHash: string; segmentHashes: string[] }[] = [];
  const seen = new Set<string>();
  for (const entry of [
    ...MODULE_MANIFEST,
    ...EDITOR_MODULE_MANIFEST,
    ...VERSIONED_MODULE_MANIFEST,
  ]) {
    for (const fn of parseDefoldApiDoc(entry.doc).functions) {
      const lua = htmlToCodeText(fn.examples ?? "");
      if (lua === "") continue;
      const wholeHash = hashExampleSource(lua);
      const key = `${fn.name}:${wholeHash}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const segments = splitExampleSources(fn.examples ?? "");
      out.push({
        fqn: fn.name,
        wholeHash,
        segmentHashes:
          segments.length > 1 ? segments.map((segment) => hashExampleSource(segment.code)) : [],
      });
    }
  }
  return out;
}

// Every example-bearing element, identified `<fqn>:<sourceHash>` by its
// whole-blob hash, that the emit ladder resolves to no authored body. Per
// element (not per FQN), so an overload-shadowed body under an already-
// translated FQN is still visible. Reads the ladder's own precedence, so an
// element documented by per-segment entries counts as translated even though no
// entry carries its whole-blob hash.
function untranslatedElements(): string[] {
  const store = loadTranslations();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of MODULE_MANIFEST) {
    for (const fn of parseDefoldApiDoc(entry.doc).functions) {
      const lua = htmlToCodeText(fn.examples ?? "");
      if (lua === "") continue;
      const sourceHash = hashExampleSource(lua);
      const segments = splitExampleSources(fn.examples ?? "");
      const perSegment =
        segments.length > 1
          ? lookupExampleTranslations(
              store,
              fn.name,
              segments.map((segment) => hashExampleSource(segment.code)),
            )
          : null;
      if (perSegment !== null) continue;
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

  test("no element that resolves to an authored body today loses one to segment re-keying", () => {
    const store = loadTranslations();
    const lost: string[] = [];
    for (const element of exampleElements()) {
      const perSegment = lookupExampleTranslations(store, element.fqn, element.segmentHashes);
      const whole = lookupTranslation(store, element.fqn, element.wholeHash);
      // The emit ladder's own precedence: per-segment when every segment
      // resolves, else the whole-blob body. An element with neither is one the
      // backfill goal still owns and ships its Lua fallback, as it does today.
      if (perSegment === null && whole === null && element.segmentHashes.length > 0) {
        const anySegment = element.segmentHashes.some(
          (hash) => lookupTranslation(store, element.fqn, hash) !== null,
        );
        if (anySegment) lost.push(`${element.fqn}:${element.wholeHash}`);
      }
    }
    if (lost.length > 0) {
      throw new Error(
        `these elements hold a segment translation but resolve to no complete body — split every segment or keep the whole-blob entry: ${lost.join(", ")}`,
      );
    }
    expect(lost).toEqual([]);
  });

  // `go.get` and `go.set` document cases whose Lua the segmenter leaves inside a
  // prose region rather than lifting into its own segment, so their final
  // segment's prose carries welded sentences and inline Lua. Splitting them
  // would render that prose above the fence and drop the authored TypeScript for
  // the swallowed cases, so they keep their whole-blob body until the segmenter
  // separates those regions. Membership is pinned both ways: a third element
  // reaching the fallback reds the first assertion, and either of these two
  // becoming splittable reds the second.
  const WELDED_PROSE_FQNS = ["go.get", "go.set"];

  test("every multi-example go element outside the welded-prose pair resolves a translation per example", () => {
    const store = loadTranslations();
    const onFallback: string[] = [];
    let multi = 0;
    for (const element of exampleElements()) {
      if (!element.fqn.startsWith("go.")) continue;
      if (element.segmentHashes.length < 2) continue;
      if (WELDED_PROSE_FQNS.includes(element.fqn)) continue;
      multi += 1;
      if (lookupExampleTranslations(store, element.fqn, element.segmentHashes) === null) {
        onFallback.push(`${element.fqn}:${element.wholeHash}`);
      }
    }
    expect(multi).toBe(20);
    if (onFallback.length > 0) {
      throw new Error(
        `these go elements still resolve through the whole-blob arm — split every segment: ${onFallback.join(", ")}`,
      );
    }
    expect(onFallback).toEqual([]);
  });

  test("the welded-prose pair still documents every example through its whole-blob body", () => {
    const store = loadTranslations();
    for (const fqn of WELDED_PROSE_FQNS) {
      const element = exampleElements().find((candidate) => candidate.fqn === fqn);
      expect(element?.segmentHashes.length ?? 0).toBeGreaterThan(1);
      expect(lookupTranslation(store, fqn, element?.wholeHash ?? "")).not.toBeNull();
      expect(lookupExampleTranslations(store, fqn, element?.segmentHashes ?? [])).toBeNull();
    }
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
