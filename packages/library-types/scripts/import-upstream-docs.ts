/**
 * Carrying upstream's own LuaDoc into the authored lane's api-doc, for members the
 * fork documents nowhere.
 *
 * `parse-lua-surface.ts` already reads each upstream member's `---` block and
 * `authored-parity.ts` already counts how many of them the fork drops, so the text
 * exists on one side of the pipeline and was thrown away before the docs-site saw
 * it. This module is the merge, and it runs at api-doc lowering rather than in the
 * vendored `.d.ts`: writing upstream prose into `fixtures/authored/*.d.ts` would
 * still pass the forked-vs-generated identity diff while destroying what that diff
 * exists to prove — that the emitted surface *is* the vendored fork — and imported
 * prose would be indistinguishable from fork prose forever after.
 *
 * Two rules carry the whole merge:
 *
 * - **Fork prose always wins.** An element the fork gave either a `brief` or a
 *   `description` is returned untouched and gains no `docSource`, so authoring the
 *   fork's own doc-comment is how a member opts out. There is no exclusion list:
 *   the only thing one would add is "show no prose at all for a member upstream
 *   documented", which is worse than writing the correct brief.
 * - **Tags never come with the summary.** Every block in this corpus is a summary
 *   followed by `@param`/`@return` lines, and a tag's continuation lines carry no
 *   marker of their own, so truncating at the *first* `@` line is what keeps
 *   LuaDoc-derived types and parameter names out of the api-doc.
 */

import type { LuaMember } from "./parse-lua-surface";

/** One `api-doc/<namespace>.json` element, open at the edges: this module reads the
 * four keys the merge turns on and passes every other key through in place. */
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
 * render time, so no unwrapping is done and the imported description stays
 * upstream's own text.
 */
export function summarizeLuaDoc(doc: string): string {
  const summary: string[] = [];
  for (const line of doc.split("\n")) {
    if (line.trim().startsWith("@")) break;
    summary.push(line);
  }
  return summary.join("\n").trim();
}

/** The element with upstream's summary in place, `docSource` inserted immediately
 * after `description` by copying the element's own entries in order rather than
 * assigning onto it — the key order is what the committed api-doc golden diffs on. */
function withImportedDoc(element: ApiDocElement, summary: string): ApiDocElement {
  const brief = summary.split("\n")[0]?.trim() ?? "";
  const imported: ApiDocElement = { type: element.type, name: element.name };
  let placedBrief = false;
  let placedDescription = false;
  for (const [key, value] of Object.entries(element)) {
    if (key === "type" || key === "name") continue;
    if (key === "brief") {
      imported.brief = brief;
      placedBrief = true;
    } else if (key === "description") {
      imported.description = summary;
      imported.docSource = "upstream";
      placedDescription = true;
    } else imported[key] = value;
  }
  if (!placedDescription) {
    imported.description = summary;
    imported.docSource = "upstream";
  }
  if (!placedBrief) imported.brief = brief;
  return imported;
}

/**
 * The api-doc element list with upstream prose merged in, as a new list.
 *
 * An element is imported when it is a `FUNCTION` or a `VARIABLE` — the two kinds
 * `authored-parity.ts` compares, a `TYPEDEF` being a type rather than a runtime
 * member — is not `global: true`, has an empty `brief` *and* an empty
 * `description`, matches an upstream member by exact name, and that member's
 * summary survives tag stripping. Every other element is returned unchanged.
 *
 * The name match is exact on purpose: a namespace-qualified api-doc name
 * (`bridge.bridge`) never matches a bare upstream name, which is the same non-match
 * the parity pass makes.
 */
export function importUpstreamDocs(
  elements: readonly ApiDocElement[],
  members: ReadonlyMap<string, LuaMember>,
): ApiDocElement[] {
  return elements.map((element) => {
    if (element.type !== "FUNCTION" && element.type !== "VARIABLE") return element;
    if (element.global === true) return element;
    if ((element.brief ?? "") !== "" || (element.description ?? "") !== "") return element;
    const member = members.get(element.name);
    if (member === undefined) return element;
    const summary = summarizeLuaDoc(member.doc);
    if (summary === "") return element;
    return withImportedDoc(element, summary);
  });
}
