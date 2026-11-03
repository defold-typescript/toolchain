/**
 * The prose half of an upstream LuaDoc block, and the `docSource` mark the api-doc
 * puts on a member whose printed doc comment came from it.
 *
 * Which members take upstream's prose is decided once, when the fork is printed
 * (`merge-fork-docs.ts`); the api-doc is lowered from that printed declaration, so
 * this module only names where the prose came from. The rules for reading a block
 * stay here:
 *
 * - **Tags never come with the summary.** Every block in this corpus is a summary
 *   followed by `@param`/`@return` lines, and a tag's continuation lines carry no
 *   marker of their own, so truncating at the *first* `@` line is what keeps
 *   LuaDoc-derived types and parameter names out of the printed doc.
 * - **A summary never restates its own symbol.** A leading line that is exactly the
 *   member's name is upstream's heading, not prose, and is dropped. That is
 *   `upstreamSummary`'s knowledge, not `summarizeLuaDoc`'s, which stays a pure
 *   block-to-prose function.
 */

import type { LuaMember } from "./parse-lua-surface";

/** One `api-doc/<namespace>.json` element, open at the edges: this module reads the
 * keys the mark turns on and passes every other key through in place. */
export interface ApiDocElement {
  type: string;
  name: string;
  global?: boolean;
  brief?: string;
  description?: string;
  docSource?: string;
  [key: string]: unknown;
}

/**
 * The prose half of a LuaDoc block: its lines up to the first whose trimmed text
 * starts with `@`, rejoined and trimmed. Empty for a block that is only tags.
 *
 * Interior newlines and blank lines survive. Markdown collapses a soft break at
 * render time, so no unwrapping is done and the printed summary stays upstream's
 * own text.
 */
export function summarizeLuaDoc(doc: string): string {
  const summary: string[] = [];
  for (const line of doc.split("\n")) {
    if (line.trim().startsWith("@")) break;
    summary.push(line);
  }
  return summary.join("\n").trim();
}

/** The summary without a leading line that is only the member's own name. nakama writes
 * `--- <member_name>` above the real summary, and a brief is the first line, so leaving
 * it in ships a brief that restates the symbol it sits under. The comparison is exact: a
 * first line that merely mentions the name is prose and survives. */
function withoutNameLine(summary: string, name: string): string {
  const [first, ...rest] = summary.split("\n");
  return (first as string).trim() === name ? rest.join("\n").trim() : summary;
}

/** Upstream's summary for the member published as `name`: its block's prose with the
 * name-line rule applied. Empty when nothing but tags and the name is left. */
export function upstreamSummary(member: LuaMember, name: string): string {
  return withoutNameLine(summarizeLuaDoc(member.doc), name);
}

/** The element with `docSource: "upstream"` inserted immediately after `description`,
 * by copying the element's own entries in order rather than assigning onto it — the
 * key order is what the committed api-doc golden diffs on. */
function withUpstreamMark(element: ApiDocElement): ApiDocElement {
  const marked: ApiDocElement = { type: element.type, name: element.name };
  let placed = false;
  for (const [key, value] of Object.entries(element)) {
    if (key === "type" || key === "name" || key === "docSource") continue;
    marked[key] = value;
    if (key === "description") {
      marked.docSource = "upstream";
      placed = true;
    }
  }
  if (!placed) marked.docSource = "upstream";
  return marked;
}

/**
 * The api-doc element list with every module-level `FUNCTION` or `VARIABLE` named in
 * `names` marked `docSource: "upstream"`, as a new list. `names` is what
 * `mergeForkDocs` reports it filled, so the docs site marks exactly the members whose
 * printed comment is upstream's. A `TYPEDEF` is a type rather than a runtime member and
 * a `global: true` element lives outside the module block, so neither is ever marked;
 * every other element is returned unchanged.
 */
export function markUpstreamDocs(
  elements: readonly ApiDocElement[],
  names: readonly string[],
): ApiDocElement[] {
  const filled = new Set(names);
  return elements.map((element) => {
    if (element.type !== "FUNCTION" && element.type !== "VARIABLE") return element;
    if (element.global === true || !filled.has(element.name)) return element;
    return withUpstreamMark(element);
  });
}
