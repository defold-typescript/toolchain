export interface Frontmatter {
  data: Record<string, unknown>;
  body: string;
}

function parseBlock(inner: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const line of inner.split("\n")) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const [, rawKey = "", rawValue = ""] = match;
    const key = rawKey.trim();
    let value = rawValue.trim();
    const quote = value[0];
    if (value.length >= 2 && (quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return data;
}

export function parseFrontmatter(raw: string): Frontmatter {
  if (!raw.startsWith("---\n")) return { data: {}, body: raw };

  const closing = raw.indexOf("\n---", 3);
  if (closing === -1) return { data: {}, body: raw };

  const inner = raw.slice(4, closing);
  const afterDelimiter = raw.indexOf("\n", closing + 1);
  const body = afterDelimiter === -1 ? "" : raw.slice(afterDelimiter + 1);

  return { data: parseBlock(inner), body };
}
