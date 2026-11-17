const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Text or an attribute value made safe to place in HTML, quotes included. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

/** ` name="value"` for each attribute with a value, in order, every value escaped. */
export function htmlAttributes(attributes: Record<string, string | undefined>): string {
  let out = "";
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined) out += ` ${name}="${escapeHtml(value)}"`;
  }
  return out;
}
