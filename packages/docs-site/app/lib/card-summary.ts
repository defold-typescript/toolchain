import { parseMarkdownFragment } from "@defold-typescript/docs-render/docs-markdown";
import { toHtml } from "hast-util-to-html";
import type { PhrasingContent } from "mdast";
import { toHast } from "mdast-util-to-hast";

// Card summaries are drawn from raw markdown lead paragraphs, so they carry
// inline syntax (`code`, **emphasis**, [links](…)). Render it to HTML rather
// than showing the source. Raw HTML in the source drops, since `toHast` only
// keeps it when told to; a bare URL stays text once its link is flattened.
function unlinked(nodes: readonly PhrasingContent[]): PhrasingContent[] {
  return nodes.flatMap((node): PhrasingContent[] => {
    if (node.type === "link") return unlinked(node.children);
    if ("children" in node) {
      return [{ ...node, children: unlinked(node.children) } as PhrasingContent];
    }
    return [node];
  });
}

/**
 * Render a one-line card summary's inline markdown to HTML, flattening links to
 * their text. The blurb sits inside the card's own `<a>`, and a nested anchor is
 * invalid HTML — so `[Defold](https://defold.com)` becomes plain `Defold` while
 * `code` and emphasis still render.
 */
export function renderCardSummary(summary: string): string {
  const [first] = parseMarkdownFragment(summary);
  if (first?.type !== "paragraph") return "";
  const paragraph = toHast({ type: "paragraph", children: unlinked(first.children) });
  return "children" in paragraph ? toHtml(paragraph.children).trim() : "";
}
