/**
 * `/** *\/` blocks holding an odd number of fence markers, keyed by the line the
 * block opens on. An open fence swallows the rest of the block — including the
 * `@example` appended after it — in every editor hover that renders the doc.
 */
export function unbalancedFenceBlocks(content: string): { line: number; markers: number }[] {
  const offending: { line: number; markers: number }[] = [];
  const lines = content.split("\n");
  let start = -1;
  let markers = 0;
  lines.forEach((raw, index) => {
    const trimmed = raw.trimStart();
    if (start < 0) {
      if (!trimmed.startsWith("/**")) return;
      start = index + 1;
      markers = 0;
      if (raw.includes("*/")) start = -1;
      return;
    }
    if (trimmed.replace(/^\*+\s?/, "").startsWith("```")) markers += 1;
    if (raw.includes("*/")) {
      if (markers % 2 === 1) offending.push({ line: start, markers });
      start = -1;
    }
  });
  return offending;
}

export function offGridLines(content: string): { line: number; text: string }[] {
  const offending: { line: number; text: string }[] = [];
  const lines = content.split("\n");
  let inBlock = false;
  lines.forEach((raw, index) => {
    const trimmed = raw.trimStart();
    if (!inBlock) {
      if (trimmed.startsWith("/**")) {
        inBlock = !raw.includes("*/");
      }
      return;
    }
    if (trimmed.startsWith("*")) {
      if (raw.includes("*/")) inBlock = false;
      return;
    }
    offending.push({ line: index + 1, text: raw });
    if (raw.includes("*/")) inBlock = false;
  });
  return offending;
}
