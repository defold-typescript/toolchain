import type { ApiModule } from "./api-doc";
import { htmlToDocText, summaryFor } from "./doc-comment";
import { fnv1a64 } from "./fnv1a";

// A hand-authored TypeScript translation of one element's ref-doc `@example`,
// pinned by a hash of the exact source Lua it replaces. A ref-doc re-pin that
// changes the source Lua flips the hash, so a stale translation stops matching
// (drift guard) and the emit falls back to the Lua body.
export interface Translation {
  sourceHash: string;
  ts: string;
  // The authored replacement for the upstream sentence that introduces this
  // segment. Pinned by the same `sourceHash`, so an upstream rewrite of the
  // example body drops the caption together with the body.
  prose?: string;
}

// An FQN maps to one translation per distinct example body it carries: an
// overloaded element (same name, differing `@example` source) contributes one
// array entry per body, each pinned by its own `sourceHash`.
//
// add-don't-swap: a ref-doc re-pin that rewrites an element's example must
// *append* the translation for the new source hash, never overwrite the entry
// for the old one. Older API targets keep shipping the previous body, so
// replacing the entry silently regresses every demoted surface to raw Lua.
export type TranslationStore = Record<string, Translation[]>;

// A prose Lua fence deliberately left as Lua, pinned like a translation by the
// hash of the fence body, with the reason no TypeScript form fits. Keyed the
// way `proseLuaFences` keys the fence.
export type ProseLuaKeepStore = Record<string, { sourceHash: string; reason: string }[]>;

// The `fnv1a64` hash of an example's source, which must stay node- and Bun-free
// for the reason given there: this module is reachable from `index.ts` (via
// `emit-dts`).
//
// The input is the already-normalized post-`htmlToCodeText` string (per-line
// trailing whitespace and surrounding blank lines stripped), so the hash is
// independent of trailing whitespace in the original ref-doc HTML.
export function hashExampleSource(source: string): string {
  return fnv1a64(source);
}

// Return the stored TypeScript body only when the FQN exists and one of its
// pinned `sourceHash`es matches the source we are about to emit; any mismatch
// returns `null` so the caller keeps the Lua fallback.
export function lookupTranslation(
  store: TranslationStore,
  fqn: string,
  sourceHash: string,
): string | null {
  const entries = store[fqn];
  if (!entries) return null;
  const match = entries.find((entry) => entry.sourceHash === sourceHash);
  return match ? match.ts : null;
}

/**
 * The stored bodies for a blob's segment hashes, in the order given, or `null`
 * the moment one of them does not resolve.
 *
 * All-or-nothing on purpose: an element whose blob carries several examples is
 * emitted as several `@example` blocks only when every one of them has an
 * authored body. A partial resolve would document some of the element's
 * examples and silently drop the rest, so the caller falls back to the
 * upstream Lua instead. An empty hash list is a miss for the same reason —
 * it would otherwise report success while documenting nothing.
 */
export function lookupExampleTranslations(
  store: TranslationStore,
  fqn: string,
  sourceHashes: readonly string[],
): string[] | null {
  if (sourceHashes.length === 0) return null;
  const bodies: string[] = [];
  for (const sourceHash of sourceHashes) {
    const ts = lookupTranslation(store, fqn, sourceHash);
    if (ts === null) return null;
    bodies.push(ts);
  }
  return bodies;
}

/**
 * The stored body and caption for each of a blob's segments, in the order
 * given, or `null` the moment one of them does not resolve.
 *
 * Same all-or-nothing and empty-list rules as `lookupExampleTranslations`. Each
 * caption is the entry's authored `prose` when it carries one, else the
 * segment's upstream prose.
 */
export function lookupExampleSegments(
  store: TranslationStore,
  fqn: string,
  segments: readonly { code: string; prose: string }[],
): { ts: string; prose: string }[] | null {
  const entries = store[fqn];
  if (!entries || segments.length === 0) return null;
  const resolved: { ts: string; prose: string }[] = [];
  for (const segment of segments) {
    const sourceHash = hashExampleSource(segment.code);
    const entry = entries.find((candidate) => candidate.sourceHash === sourceHash);
    if (!entry) return null;
    resolved.push({ ts: entry.ts, prose: entry.prose ?? segment.prose });
  }
  return resolved;
}

// A fence `htmlToDocText` opened on a line of its own, located by line index:
// `open` is the opener, `close` the closing ``` line.
interface DocFence {
  open: number;
  close: number;
}

// The one reader of prose fences, shared by the enumeration and the swap so the
// body one hashes is the body the other replaces. Every fence is walked, so a
// closing ``` of a `text` fence is never read as the opener of the next one.
function luaDocFences(lines: readonly string[]): DocFence[] {
  const fences: DocFence[] = [];
  for (let open = 0; open < lines.length; open += 1) {
    if (!lines[open]?.startsWith("```")) continue;
    let close = open + 1;
    while (close < lines.length && !lines[close]?.startsWith("```")) close += 1;
    if (close >= lines.length) break;
    if (lines[open] === "```lua") fences.push({ open, close });
    open = close;
  }
  return fences;
}

function fenceBody(lines: readonly string[], fence: DocFence): string {
  return lines.slice(fence.open + 1, fence.close).join("\n");
}

/**
 * Swap each ```lua fence in `htmlToDocText` output for the TypeScript pinned
 * under `key` to its body's hash, leaving every other byte alone. A fence with
 * no matching entry stays Lua, the same fallback the `@example` ladder keeps.
 * With `keepSource`, each swapped fence is followed by a blank line and its
 * untouched body as a ```lua original fence, the pairing the API reference
 * renders as TypeScript and Lua tabs.
 */
export function translateProseFences(
  markdown: string,
  key: string,
  store: TranslationStore,
  options: { keepSource?: boolean } = {},
): string {
  if (!store[key]) return markdown;
  const lines = markdown.split("\n");
  const fences = luaDocFences(lines);
  for (const fence of fences.reverse()) {
    const lua = fenceBody(lines, fence);
    const ts = lookupTranslation(store, key, hashExampleSource(lua));
    if (ts === null) continue;
    const source = options.keepSource ? ["", "```lua original", ...lua.split("\n"), "```"] : [];
    lines.splice(
      fence.open,
      fence.close - fence.open + 1,
      "```ts",
      ...ts.split("\n"),
      "```",
      ...source,
    );
  }
  return lines.join("\n");
}

/**
 * Every ```lua fence in the prose a module documents, keyed the way the emit
 * and the API reference look its translation up: the namespace description
 * under the namespace, and a function's summary, parameter and return docs
 * under the function's name.
 */
export function proseLuaFences(module: ApiModule): { key: string; lua: string }[] {
  const slots: [string, string][] = [
    [module.namespace, summaryFor(module.brief, module.description)],
  ];
  for (const fn of module.functions) {
    slots.push([fn.name, summaryFor(fn.brief, fn.description)]);
    for (const slot of [...fn.parameters, ...fn.returnValues]) slots.push([fn.name, slot.doc]);
  }
  const out: { key: string; lua: string }[] = [];
  for (const [key, html] of slots) {
    const lines = htmlToDocText(html).split("\n");
    for (const fence of luaDocFences(lines)) out.push({ key, lua: fenceBody(lines, fence) });
  }
  return out;
}
