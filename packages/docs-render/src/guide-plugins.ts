import type { CalloutType } from "fumadocs-ui/components/callout";
import type {
  Element,
  ElementContent,
  Nodes as HastNodes,
  Root as HastRoot,
  Properties,
} from "hast";
import type {
  Blockquote,
  Code,
  Html,
  Nodes,
  Paragraph,
  Parent,
  PhrasingContent,
  Root,
  RootContent,
  Text,
} from "mdast";
import {
  ALERT_LABELS,
  ALERT_MARKER,
  ALERT_TYPES,
  type AlertType,
  codeTitleFromInfo,
  fenceLanguage,
  fenceVariant,
  imageParamsFromSrc,
  MORE_DEFAULT_SUMMARY,
  MORE_MARKER,
  platformBadge,
  SHORT_COLUMN_CHARS,
} from "./guide-syntax";
import { imageMaxWidthStyle } from "./image-style";
import { PLATFORM_MARKER } from "./platform-icons";
import { SvgFigure } from "./ui";

declare module "mdast" {
  /** A fence and the variant fence after it, rendered as one tab group. */
  interface CodeTabs extends Parent {
    type: "codeTabs";
    children: Code[];
  }
  interface RootContentMap {
    codeTabs: CodeTabs;
  }
  interface BlockContentMap {
    codeTabs: CodeTabs;
  }
}

function eachNode(node: Nodes, visit: (node: Nodes) => void): void {
  visit(node);
  if ("children" in node) for (const child of node.children) eachNode(child, visit);
}

function setHProperties(node: Nodes, properties: Properties): void {
  node.data = { ...node.data, hProperties: { ...node.data?.hProperties, ...properties } };
}

// The text a blockquote opens with, where an alert or disclosure marker sits.
function leadText(quote: Blockquote): { paragraph: Paragraph; text: Text } | undefined {
  const paragraph = quote.children[0];
  const text = paragraph?.type === "paragraph" ? paragraph.children[0] : undefined;
  return paragraph?.type === "paragraph" && text?.type === "text" ? { paragraph, text } : undefined;
}

/**
 * A `> [!NOTE]`-style blockquote becomes a `div[data-callout]` holding its body
 * without the marker; `rehypeGuideComponents` turns it into a `Callout`. Text on
 * the marker's line stays as the body's first line.
 */
export function remarkGuideAlerts() {
  return (tree: Root): void =>
    eachNode(tree, (node) => {
      if (node.type !== "blockquote") return;
      const lead = leadText(node);
      const kind = lead && ALERT_MARKER.exec(lead.text.value)?.[1]?.toLowerCase();
      if (!lead || !kind) return;
      lead.text.value = lead.text.value.replace(/^\[!\w+\]\s*/, "");
      if (lead.text.value === "") {
        const { children } = lead.paragraph;
        children.shift();
        if (children[0]?.type === "break") children.shift();
        if (children.length === 0) node.children.shift();
      }
      node.data = {
        ...node.data,
        hName: "div",
        hProperties: { ...node.data?.hProperties, dataCallout: kind },
      };
    });
}

// The phrasing content up to the first line break, and the content after it.
function splitFirstLine(children: PhrasingContent[]): [PhrasingContent[], PhrasingContent[]] {
  for (const [index, child] of children.entries()) {
    if (child.type === "break") return [children.slice(0, index), children.slice(index + 1)];
    if (child.type !== "text") continue;
    const end = child.value.indexOf("\n");
    if (end === -1) continue;
    const before = child.value.slice(0, end);
    const after = child.value.slice(end + 1);
    return [
      [...children.slice(0, index), ...(before ? [{ type: "text", value: before } as const] : [])],
      [...(after ? [{ type: "text", value: after } as const] : []), ...children.slice(index + 1)],
    ];
  }
  return [children, []];
}

/**
 * A `> [!MORE]` blockquote becomes a `details.more` disclosure. The rest of the
 * marker's line, inline marks kept, is its `summary`, or `More` when the marker
 * stands alone; the lines after it are the revealed body.
 */
export function remarkGuideMore() {
  return (tree: Root): void =>
    eachNode(tree, (node) => {
      if (node.type !== "blockquote") return;
      const lead = leadText(node);
      if (!lead || !MORE_MARKER.test(lead.text.value)) return;
      lead.text.value = lead.text.value.replace(/^\[!more\][ \t]*/i, "");
      const [line, rest] = splitFirstLine(lead.paragraph.children);
      const titled = line.some((child) => child.type !== "text" || child.value.trim() !== "");
      const summary: Paragraph = {
        type: "paragraph",
        data: { hName: "summary" },
        children: titled ? line : [{ type: "text", value: MORE_DEFAULT_SUMMARY }],
      };
      lead.paragraph.children = rest;
      node.children.splice(0, rest.length > 0 ? 0 : 1, summary);
      node.data = {
        ...node.data,
        hName: "details",
        hProperties: { ...node.data?.hProperties, className: ["more"] },
      };
    });
}

const fenceInfo = (code: Code): string => [code.lang, code.meta].filter(Boolean).join(" ");

// The two tab labels when `second` is the variant of `first`. Only badged,
// untitled fences pair, so every tab has a label and no filename caption is
// dropped; a variant that names a language pairs only when both fences carry
// it, so a `builder` fence pairs only with TypeScript on both sides.
function codeTabLabels(first: Code, second: Code): readonly [string, string] | undefined {
  const firstInfo = fenceInfo(first);
  const secondInfo = fenceInfo(second);
  const variant = fenceVariant(secondInfo);
  if (!variant || fenceVariant(firstInfo)) return undefined;
  if (codeTitleFromInfo(firstInfo) !== undefined || codeTitleFromInfo(secondInfo) !== undefined) {
    return undefined;
  }
  const firstLanguage = fenceLanguage(firstInfo)?.label;
  const secondLanguage = fenceLanguage(secondInfo)?.label;
  if (firstLanguage === undefined || secondLanguage === undefined) return undefined;
  if (
    variant.language !== undefined &&
    (firstLanguage !== variant.language || secondLanguage !== variant.language)
  ) {
    return undefined;
  }
  return variant.labels ?? [firstLanguage, secondLanguage];
}

/**
 * A fence directly followed by its variant fence (`<lang> original`,
 * `<lang> builder`) becomes one `div[data-code-tabs]` holding both, its value
 * the two tab labels; `rehypeGuideComponents` turns it into `CodeBlockTabs`.
 */
export function remarkCodeTabs() {
  return (tree: Root): void =>
    eachNode(tree, (node) => {
      if (!("children" in node) || node.type === "codeTabs") return;
      const children: RootContent[] = node.children;
      for (let i = 1; i < children.length; i++) {
        const first = children[i - 1];
        const second = children[i];
        if (first?.type !== "code" || second?.type !== "code") continue;
        const labels = codeTabLabels(first, second);
        if (!labels) continue;
        children.splice(i - 1, 2, {
          type: "codeTabs",
          data: { hName: "div", hProperties: { dataCodeTabs: JSON.stringify(labels) } },
          children: [first, second],
        });
      }
    });
}

/**
 * remark-rehype keeps a fence's meta string (`title="a.ts" {2}`) in the `code`
 * element's node data, which rehype-raw does not carry over; as the `metastring`
 * property it survives, and rehypeCode reads it there.
 */
export function remarkCodeMeta() {
  return (tree: Root): void =>
    eachNode(tree, (node) => {
      if (node.type === "code" && node.meta) setHProperties(node, { metastring: node.meta });
    });
}

/**
 * An image's `#max-width=…` hint becomes its style and leaves its `src`. With
 * `readInlineSvg`, a paragraph holding only an `![caption](….svg#inline)` image
 * becomes the `SvgFigure` carrying that file's markup, captioned by the alt
 * text; a file the resolver has no markup for is an error. Without a resolver
 * the image stays an `img`.
 */
export function remarkGuideImages(
  options: { readInlineSvg?: ((src: string) => string | undefined) | undefined } = {},
) {
  const { readInlineSvg } = options;
  return (tree: Root): void =>
    eachNode(tree, (node) => {
      if (node.type === "image") {
        const params = imageParamsFromSrc(node.url);
        node.url = params.src;
        if (params.maxWidth) setHProperties(node, { style: imageMaxWidthStyle(params.maxWidth) });
        return;
      }
      if (!readInlineSvg || !("children" in node)) return;
      const children: RootContent[] = node.children;
      for (const [index, child] of children.entries()) {
        const image = child.type === "paragraph" ? child.children : undefined;
        if (image?.length !== 1 || image[0]?.type !== "image") continue;
        const params = imageParamsFromSrc(image[0].url);
        if (!params.inline) continue;
        const svg = readInlineSvg(params.src);
        if (svg === undefined) {
          throw new Error(`inline SVG figure has no SVG markup to inline: ${params.src}`);
        }
        const figure = SvgFigure({
          svg,
          caption: image[0].alt ?? "",
          src: params.src,
          ...(params.maxWidth ? { maxWidth: params.maxWidth } : {}),
        });
        children[index] = { type: "html", value: figure };
      }
    });
}

function splitPlatformMarkers(text: Text): (Text | Html)[] {
  const out: (Text | Html)[] = [];
  let cursor = 0;
  for (const match of text.value.matchAll(PLATFORM_MARKER)) {
    const badge = platformBadge(match[1] ?? "");
    if (!badge) continue;
    if (match.index > cursor)
      out.push({ type: "text", value: text.value.slice(cursor, match.index) });
    out.push({ type: "html", value: badge });
    cursor = match.index + match[0].length;
  }
  if (cursor === 0) return [text];
  if (cursor < text.value.length) out.push({ type: "text", value: text.value.slice(cursor) });
  return out;
}

/**
 * A known `[icon:X]` marker in prose becomes the platform badge; unknown names,
 * and markers in code, stay literal text.
 */
export function remarkPlatformBadges() {
  return (tree: Root): void =>
    eachNode(tree, (node) => {
      if (!("children" in node)) return;
      const parent: Parent = node;
      if (
        !parent.children.some((child) => child.type === "text" && child.value.includes("[icon:"))
      ) {
        return;
      }
      parent.children = parent.children.flatMap((child): RootContent[] =>
        child.type === "text" ? splitPlatformMarkers(child) : [child],
      );
    });
}

/**
 * An inline code span whose whole text is a documented symbol (`go.get`) links
 * to the route `symbolCodeLinks` maps it to. Spans inside a link stay as they
 * are (anchors cannot nest), and so do spans in headings, which the heading
 * permalink already wraps.
 */
export function remarkSymbolCodeLinks(symbolCodeLinks?: ReadonlyMap<string, string>) {
  const link = (parent: Parent, routes: ReadonlyMap<string, string>): void => {
    parent.children = parent.children.map((child): RootContent => {
      if (child.type === "inlineCode") {
        const url = routes.get(child.value);
        return url === undefined ? child : { type: "link", url, children: [child] };
      }
      if (child.type === "link" || child.type === "linkReference" || child.type === "heading") {
        return child;
      }
      if ("children" in child) link(child, routes);
      return child;
    });
  };
  return (tree: Root): void => {
    if (symbolCodeLinks && symbolCodeLinks.size > 0) link(tree, symbolCodeLinks);
  };
}

function visibleLength(node: Nodes): number {
  if (node.type === "text" || node.type === "inlineCode") return node.value.length;
  return "children" in node
    ? node.children.reduce((sum: number, child: Nodes) => sum + visibleLength(child), 0)
    : 0;
}

/**
 * Every cell of a column whose cells all fit `SHORT_COLUMN_CHARS` takes
 * `cell-nowrap`. The browser's auto table layout otherwise hands nearly all the
 * width to a column of long content and squeezes short columns down to their
 * narrowest break, splitting `1-based` at its hyphen and identifiers mid-word.
 */
export function remarkTableBalance() {
  return (tree: Root): void =>
    eachNode(tree, (node) => {
      if (node.type !== "table") return;
      const widths: number[] = [];
      for (const row of node.children) {
        row.children.forEach((cell, column) => {
          widths[column] = Math.max(widths[column] ?? 0, visibleLength(cell));
        });
      }
      for (const row of node.children) {
        row.children.forEach((cell, column) => {
          if ((widths[column] ?? 0) <= SHORT_COLUMN_CHARS) {
            setHProperties(cell, { className: ["cell-nowrap"] });
          }
        });
      }
    });
}

const CALLOUT_TYPES: Record<AlertType, CalloutType> = {
  note: "info",
  tip: "idea",
  important: "info",
  warning: "warning",
  caution: "error",
};

const isAlertType = (value: unknown): value is AlertType =>
  typeof value === "string" && (ALERT_TYPES as readonly string[]).includes(value);

function element(tagName: string, properties: Properties, children: ElementContent[]): Element {
  return { type: "element", tagName, properties, children };
}

function parseTabLabels(value: string): string[] {
  const labels: unknown = JSON.parse(value);
  if (!Array.isArray(labels) || !labels.every((label) => typeof label === "string")) {
    throw new Error(`code tabs carry no labels: ${value}`);
  }
  return labels;
}

/**
 * Turns the elements the guide remark plugins mark into the Fumadocs components
 * `MarkdownBody` renders: `div[data-callout]` into `Callout`, and
 * `div[data-code-tabs]` into `CodeBlockTabs` with one trigger per label and one
 * `CodeBlockTab` per code block. Every tab is mounted, the unselected one hidden,
 * so the page's HTML holds both variants. Runs after rehype-raw, whose HTML parser would
 * lowercase a component name, and after rehypeCode, so each tab holds its
 * highlighted block.
 */
export function rehypeGuideComponents() {
  const visit = (node: HastNodes): void => {
    if (node.type === "element" && node.tagName === "div") {
      const kind = node.properties.dataCallout;
      const tabs = node.properties.dataCodeTabs;
      if (isAlertType(kind)) {
        node.tagName = "Callout";
        node.properties = { type: CALLOUT_TYPES[kind], title: ALERT_LABELS[kind] };
      } else if (typeof tabs === "string") {
        const labels = parseTabLabels(tabs);
        const blocks = node.children.filter(
          (child) => child.type !== "text" || child.value.trim() !== "",
        );
        node.tagName = "CodeBlockTabs";
        node.properties = { defaultValue: "0" };
        node.children = [
          element(
            "CodeBlockTabsList",
            {},
            labels.map((label, index) =>
              element("CodeBlockTabsTrigger", { value: String(index) }, [
                { type: "text", value: label },
              ]),
            ),
          ),
          ...blocks.map((block, index) =>
            element(
              "CodeBlockTab",
              {
                value: String(index),
                forceMount: true,
                className: ["data-[state=inactive]:hidden"],
              },
              [block],
            ),
          ),
        ];
      }
    }
    if ("children" in node) for (const child of node.children) visit(child);
  };
  return (tree: HastRoot): void => visit(tree);
}
