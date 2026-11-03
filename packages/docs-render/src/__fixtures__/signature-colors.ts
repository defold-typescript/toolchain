// The visible characters of a highlighted code span, each with the
// `--shiki-light` color it renders in. The overload count badge is left out:
// it is not signature text.
export function coloredChars(html: string): { text: string; colors: string[] } {
  const stack: (string | null)[] = [];
  let text = "";
  const colors: string[] = [];
  for (const match of html.matchAll(/<span([^>]*)>|<\/span>|<[^>]+>|([^<]+)/g)) {
    if (match[0] === "</span>") stack.pop();
    else if (match[1] !== undefined) {
      const inherited = stack[stack.length - 1] ?? "";
      if (match[1].includes("api-overload-count")) stack.push(null);
      else stack.push(match[1].match(/--shiki-light:([^;"]+)/)?.[1] ?? inherited);
    } else if (match[2] !== undefined && stack[stack.length - 1] !== null) {
      const decoded = match[2]
        .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&");
      for (const ch of decoded) {
        text += ch;
        colors.push(stack[stack.length - 1] ?? "");
      }
    }
  }
  return { text, colors };
}

export const SIGNATURE_CODE_RE = /<code class="api-signature shiki">([\s\S]*?)<\/code>/g;
