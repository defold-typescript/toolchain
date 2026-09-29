import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProseLuaKeeps, loadTranslations } from "../scripts/example-store-io";
import {
  EDITOR_MODULE_MANIFEST,
  loadApiTargets,
  MODULE_MANIFEST,
  VERSIONED_MODULE_MANIFEST,
} from "../scripts/regen";
import { parseDefoldApiDoc } from "../src/api-doc";
import { htmlToCodeText, segmentExampleRegions, splitExampleSources } from "../src/doc-comment";
import {
  hashExampleSource,
  lookupExampleTranslations,
  lookupTranslation,
  proseLuaFences,
} from "../src/example-store";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const EXAMPLES_DIR = resolve(PACKAGE_ROOT, "examples");
const WELDED_FENCE = /^\s*`[A-Za-z0-9_+-]+$/;

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

// FQN -> every source a stored translation may legitimately be pinned to: each
// body `splitExampleSources` carves from an element's blob, which for a
// single-example element is the whole blob. Overloads can carry differing bodies
// under one FQN, so this is a set per name. Spans the editor manifest too: its
// emitted members carry translations, so their stored source hashes need a
// fixture body to match against or they read as stale. Spans the demoted
// surfaces for the same reason: a translation pinned to the body an older target
// still ships is live for that target, not stale. A prose Lua fence is a source
// too, under the key `proseLuaFences` gives it.
function exampleSourcesByFqn(): Map<string, Set<string>> {
  const byFqn = new Map<string, Set<string>>();
  for (const { key, lua } of allProseLuaFences()) {
    const set = byFqn.get(key) ?? new Set<string>();
    set.add(lua);
    byFqn.set(key, set);
  }
  for (const entry of [
    ...MODULE_MANIFEST,
    ...EDITOR_MODULE_MANIFEST,
    ...VERSIONED_MODULE_MANIFEST,
  ]) {
    for (const fn of parseDefoldApiDoc(entry.doc).functions) {
      const segments = splitExampleSources(fn.examples ?? "");
      if (segments.length === 0) continue;
      const set = byFqn.get(fn.name) ?? new Set<string>();
      for (const segment of segments) set.add(segment.code);
      byFqn.set(fn.name, set);
    }
  }
  return byFqn;
}

// Every prose Lua fence across every manifest, once per `<key>:<hash>`.
function allProseLuaFences(): { key: string; lua: string; hash: string }[] {
  const out: { key: string; lua: string; hash: string }[] = [];
  const seen = new Set<string>();
  for (const entry of [
    ...MODULE_MANIFEST,
    ...EDITOR_MODULE_MANIFEST,
    ...VERSIONED_MODULE_MANIFEST,
  ]) {
    for (const { key, lua } of proseLuaFences(parseDefoldApiDoc(entry.doc))) {
      const hash = hashExampleSource(lua);
      if (seen.has(`${key}:${hash}`)) continue;
      seen.add(`${key}:${hash}`);
      out.push({ key, lua, hash });
    }
  }
  return out;
}

// Every example-bearing element across every manifest, with the hashes the emit
// ladder consults for it: one per example `splitExampleSources` carves out, the
// lone one of a single-example element being its whole-blob hash.
function exampleElements(): { fqn: string; wholeHash: string; segmentHashes: string[] }[] {
  const out: { fqn: string; wholeHash: string; segmentHashes: string[] }[] = [];
  const seen = new Set<string>();
  for (const entry of [
    ...MODULE_MANIFEST,
    ...EDITOR_MODULE_MANIFEST,
    ...VERSIONED_MODULE_MANIFEST,
  ]) {
    for (const fn of parseDefoldApiDoc(entry.doc).functions) {
      const segments = splitExampleSources(fn.examples ?? "");
      if (segments.length === 0) continue;
      const wholeHash = hashExampleSource(htmlToCodeText(fn.examples ?? ""));
      const key = `${fn.name}:${wholeHash}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        fqn: fn.name,
        wholeHash,
        segmentHashes: segments.map((segment) => hashExampleSource(segment.code)),
      });
    }
  }
  return out;
}

// Every example-bearing element, identified `<fqn>:<sourceHash>` by its
// whole-blob hash, that the emit ladder resolves to no authored body. Per
// element (not per FQN), so an overload-shadowed body under an already-
// translated FQN is still visible. Reads the ladder's own rule: an element is
// translated only when every example it carries resolves.
function untranslatedElements(): string[] {
  const store = loadTranslations();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of MODULE_MANIFEST) {
    for (const fn of parseDefoldApiDoc(entry.doc).functions) {
      const segments = splitExampleSources(fn.examples ?? "");
      if (segments.length === 0) continue;
      const segmentHashes = segments.map((segment) => hashExampleSource(segment.code));
      if (lookupExampleTranslations(store, fn.name, segmentHashes) !== null) continue;
      const sourceHash = hashExampleSource(htmlToCodeText(fn.examples ?? ""));
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

  // An element whose FQN carries no stored entry at all is untranslated, not
  // unsplit, and ships its Lua fallback; `untranslated.json` tracks those.
  test("every multi-example element resolves a translation per example", () => {
    const store = loadTranslations();
    const unsplit: string[] = [];
    for (const element of exampleElements()) {
      if (element.segmentHashes.length < 2) continue;
      if ((store[element.fqn] ?? []).length === 0) continue;
      if (lookupExampleTranslations(store, element.fqn, element.segmentHashes) === null) {
        unsplit.push(`${element.fqn}:${element.wholeHash}`);
      }
    }
    if (unsplit.length > 0) {
      throw new Error(
        `these elements carry several examples but no translation per example — split every segment: ${unsplit.join(", ")}`,
      );
    }
    expect(unsplit).toEqual([]);
  });

  // A mangled upstream fence reaches prose as `<code>lua\n...</code>`, which
  // `htmlToDocText` renders as a line holding a backtick and a bare language
  // token. Seeing one here means the segmenter left an example's code in prose.
  test("no example prose across any fixture holds a welded fence", () => {
    const welded = new Set<string>();
    const opensFence = (text: string) => text.split("\n").some((line) => WELDED_FENCE.test(line));
    for (const entry of [
      ...MODULE_MANIFEST,
      ...EDITOR_MODULE_MANIFEST,
      ...VERSIONED_MODULE_MANIFEST,
    ]) {
      for (const fn of parseDefoldApiDoc(entry.doc).functions) {
        const { segments, trailingProse } = segmentExampleRegions(fn.examples ?? "");
        if (segments.some((segment) => opensFence(segment.prose)) || opensFence(trailingProse)) {
          welded.add(fn.name);
        }
      }
    }
    expect([...welded].sort()).toEqual([]);
  });

  test("the per-element untranslated set matches the committed examples/untranslated.json snapshot", () => {
    const untranslated = untranslatedElements();
    const committed = JSON.parse(
      readFileSync(resolve(EXAMPLES_DIR, "untranslated.json"), "utf8"),
    ) as string[];
    expect(untranslated).toEqual(committed);
  });
});

describe("prose Lua fences", () => {
  test("every prose Lua fence resolves to a translation or a recorded keep", () => {
    const store = loadTranslations();
    const keeps = loadProseLuaKeeps();
    const unresolved = allProseLuaFences()
      .filter(({ key, hash }) => lookupTranslation(store, key, hash) === null)
      .filter(({ key, hash }) => !(keeps[key] ?? []).some((keep) => keep.sourceHash === hash))
      .map(({ key, hash }) => `${key}:${hash}`);
    expect(unresolved).toEqual([]);
  });

  test("every recorded keep matches a live prose Lua fence under its key", () => {
    const live = new Set(allProseLuaFences().map(({ key, hash }) => `${key}:${hash}`));
    const stale = Object.entries(loadProseLuaKeeps()).flatMap(([key, keeps]) =>
      keeps.map((keep) => `${key}:${keep.sourceHash}`).filter((id) => !live.has(id)),
    );
    expect(stale).toEqual([]);
  });

  // An `@example` fence is the translation ladder's, gated above; every other
  // ```lua fence in a committed surface came from prose, so it must be one the
  // keep record excuses. Reads the emitted bytes, so an emit site that stops
  // translating reds here even while the parse-level gate stays green.
  test("every ```lua fence outside an @example in a committed surface is a recorded keep", () => {
    const kept = new Set(
      Object.values(loadProseLuaKeeps()).flatMap((keeps) => keeps.map((keep) => keep.sourceHash)),
    );
    const offenders: string[] = [];
    for (const surface of allGeneratedSurfaces()) {
      for (const file of readdirSync(surface.dir)) {
        if (!file.endsWith(".d.ts")) continue;
        const lines = readFileSync(resolve(surface.dir, file), "utf8").split("\n");
        for (let i = 0; i < lines.length; i++) {
          const opener = /^\s*\* ( *)```lua$/.exec(lines[i] ?? "");
          if (!opener || lines[i - 1]?.trim() === "* @example") continue;
          const indent = opener[1] ?? "";
          const body: string[] = [];
          let close = i + 1;
          for (; close < lines.length; close++) {
            const text = (lines[close] ?? "").replace(/^\s*\* ?/, "");
            if (text.trim() === "```" || /^\s*\*\/$/.test(lines[close] ?? "")) break;
            body.push(text.startsWith(indent) ? text.slice(indent.length) : text);
          }
          if (!kept.has(hashExampleSource(body.join("\n")))) {
            offenders.push(`${surface.id}/${file}:${i + 1}`);
          }
          i = close;
        }
      }
    }
    expect(offenders).toEqual([]);
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
