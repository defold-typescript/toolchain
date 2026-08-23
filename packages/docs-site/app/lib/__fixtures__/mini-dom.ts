// A tiny HTML-to-element-tree parser standing in for the *browser*, so the
// serialized client helpers can be exercised against the real renderer's output
// instead of hand-written markup. It models no production behavior — production
// runs against the actual DOM — and implements only the surface those helpers
// read: attributes, class names, inline display, element parents/siblings, and a
// descendant selector engine covering `tag`, `.class`, `[attr]`, `[attr=value]`
// and `[attr*=value]`.

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "path",
  "source",
  "track",
  "wbr",
]);

interface CompoundSelector {
  tag?: string;
  classes: string[];
  attrs: { name: string; value?: string; contains?: boolean }[];
}

const ATTR_RE = /\[([\w-]+)(?:(\*?=)"?([^\]"]*)"?)?\]/g;
const CLASS_RE = /\.([\w-]+)/g;

function parseCompound(part: string): CompoundSelector {
  const attrs: CompoundSelector["attrs"] = [];
  for (const match of part.matchAll(ATTR_RE)) {
    attrs.push({
      name: match[1] as string,
      ...(match[2] ? { value: match[3] ?? "", contains: match[2] === "*=" } : {}),
    });
  }
  const stripped = part.replace(ATTR_RE, "");
  const classes = [...stripped.matchAll(CLASS_RE)].map((m) => m[1] as string);
  const tag = stripped.replace(CLASS_RE, "").trim().toLowerCase();
  return { ...(tag ? { tag } : {}), classes, attrs };
}

export class MiniElement {
  readonly tagName: string;
  readonly attrs: Record<string, string>;
  readonly children: MiniElement[] = [];
  parentElement: MiniElement | null = null;
  readonly style: { display: string } = { display: "" };
  text = "";

  constructor(tagName: string, attrs: Record<string, string> = {}) {
    this.tagName = tagName.toUpperCase();
    this.attrs = attrs;
  }

  get className(): string {
    return this.attrs.class ?? "";
  }

  get nextElementSibling(): MiniElement | null {
    const siblings = this.parentElement?.children;
    if (!siblings) return null;
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }

  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.text = value;
    this.children.length = 0;
  }

  getAttribute(name: string): string | null {
    return name in this.attrs ? (this.attrs[name] as string) : null;
  }

  descendants(): MiniElement[] {
    const out: MiniElement[] = [];
    for (const child of this.children) {
      out.push(child, ...child.descendants());
    }
    return out;
  }

  private matchesCompound(compound: CompoundSelector): boolean {
    if (compound.tag && this.tagName !== compound.tag.toUpperCase()) return false;
    for (const cls of compound.classes) {
      if (!this.className.split(/\s+/).includes(cls)) return false;
    }
    for (const attr of compound.attrs) {
      const actual = this.getAttribute(attr.name);
      if (actual === null) return false;
      if (attr.value === undefined) continue;
      if (attr.contains ? !actual.includes(attr.value) : actual !== attr.value) return false;
    }
    return true;
  }

  matches(selector: string): boolean {
    const parts = selector.trim().split(/\s+(?![^[]*\])/);
    const own = parts[parts.length - 1];
    if (!own || !this.matchesCompound(parseCompound(own))) return false;
    let ancestor = this.parentElement;
    for (let i = parts.length - 2; i >= 0; i -= 1) {
      const compound = parseCompound(parts[i] as string);
      while (ancestor && !ancestor.matchesCompound(compound)) ancestor = ancestor.parentElement;
      if (!ancestor) return false;
      ancestor = ancestor.parentElement;
    }
    return true;
  }

  querySelectorAll(selector: string): MiniElement[] {
    return this.descendants().filter((el) => el.matches(selector));
  }

  querySelector(selector: string): MiniElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

const TOKEN_RE =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!\w[^>]*>|<\/?([\w:-]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR_PAIR_RE = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of raw.matchAll(ATTR_PAIR_RE)) {
    out[match[1] as string] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return out;
}

/**
 * Parse an HTML fragment into a detached root element whose children are the
 * fragment's top-level elements. Unbalanced or stray closing tags are tolerated
 * the way a browser tolerates them: a close with no matching open is ignored.
 */
export function parseHtml(html: string): MiniElement {
  const root = new MiniElement("root");
  const stack: MiniElement[] = [root];
  let cursor = 0;
  for (const match of html.matchAll(TOKEN_RE)) {
    const tag = match[1];
    const index = match.index ?? 0;
    const top = stack[stack.length - 1] as MiniElement;
    if (index > cursor) top.text += html.slice(cursor, index);
    cursor = index + match[0].length;
    // Comments, CDATA and doctypes carry no element and no text.
    if (!tag) continue;
    if (match[0].charAt(1) === "/") {
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if ((stack[i] as MiniElement).tagName === tag.toUpperCase()) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const element = new MiniElement(tag, parseAttrs(match[2] ?? ""));
    element.parentElement = top;
    top.children.push(element);
    if (!VOID_TAGS.has(tag.toLowerCase()) && !(match[2] ?? "").trimEnd().endsWith("/")) {
      stack.push(element);
    }
  }
  const last = stack[stack.length - 1] as MiniElement;
  if (cursor < html.length) last.text += html.slice(cursor);
  return root;
}
