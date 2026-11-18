import { transformerMetaHighlight } from "@shikijs/transformers";
import {
  rehypeCode,
  rehypeCodeDefaultOptions,
  remarkGfm,
  remarkHeading,
  remarkStructure,
  remarkStructureDefaultOptions,
  type StructuredData,
} from "fumadocs-core/mdx-plugins";
import type { TOCItemType } from "fumadocs-core/toc";
import type { Root } from "hast";
import type { Nodes as MdastNodes, Root as MdastRoot } from "mdast";
import rehypeRaw from "rehype-raw";
import { remark } from "remark";
import remarkRehype from "remark-rehype";
import { VFile } from "vfile";
import {
  rehypeGuideComponents,
  remarkCodeMeta,
  remarkCodeTabs,
  remarkGuideAlerts,
  remarkGuideImages,
  remarkGuideMore,
  remarkPlatformBadges,
  remarkSymbolCodeLinks,
  remarkTableBalance,
} from "./guide-plugins";
import { ALERT_TYPES } from "./guide-syntax";
import type { SearchRecord } from "./search-route";

/** A Markdown page run through the docs pipeline, ready to render and to index. */
export interface DocsMarkdown {
  hast: Root;
  toc: TOCItemType[];
  structuredData: StructuredData;
}

/** How `processDocsMarkdown` resolves a page's links, figures and code spans. */
export interface DocsMarkdownOptions {
  /** The route a relative `.md` link's slug sits under. */
  routePrefix: string;
  /** The SVG markup an `![caption](….svg#inline)` figure inlines, by its `src`. */
  readInlineSvg?: ((src: string) => string | undefined) | undefined;
  /** Symbol key -> root-absolute `/api` route an inline code span naming it links to. */
  symbolCodeLinks?: ReadonlyMap<string, string> | undefined;
}

// A relative `.md` link (`./other.md#anchor`) names a sibling page, which the
// site serves at `<routePrefix>/<name>`, and `README.md` names the site root.
// The route stays root-absolute without the deploy base: the link component that
// renders it adds the base itself.
function guideHref(url: string, routePrefix: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("/") || url.startsWith("#")) return url;
  const hash = url.indexOf("#");
  const path = hash === -1 ? url : url.slice(0, hash);
  if (!path.endsWith(".md")) return url;
  const name = path.replace(/.*\//, "").replace(/\.md$/, "");
  return `${name === "README" ? "/" : `${routePrefix}/${name}`}${hash === -1 ? "" : url.slice(hash)}`;
}

function remarkGuideLinks(routePrefix: string) {
  const walk = (node: MdastNodes): void => {
    if (node.type === "link" || node.type === "definition") {
      node.url = guideHref(node.url, routePrefix);
    }
    if ("children" in node) for (const child of node.children) walk(child);
  };
  return (tree: MdastRoot): void => walk(tree);
}

const STRUCTURE_TYPES = remarkStructureDefaultOptions.types.filter((type) => type !== "blockquote");

/**
 * Markdown to hast, with the page's table of contents and its structured search
 * data. Heading ids are the ones github.com gives the same `.md`, so a link
 * written against the file on GitHub lands on the same heading here.
 *
 * The guide syntax plugins run after `remarkHeading` and `remarkStructure`, so
 * the toc and the search data read the authored text: `remarkStructure` slices
 * the source rather than reading the tree, so no plugin order would keep a
 * marker out of the search data. A blockquote is not collected whole, so the
 * search data takes its paragraphs and tables but never its fences' code and
 * info strings. Raw HTML in the page is parsed into elements.
 */
export async function processDocsMarkdown(
  markdown: string,
  opts: DocsMarkdownOptions,
): Promise<DocsMarkdown> {
  const processor = remark()
    .use(remarkGfm)
    .use(remarkGuideLinks, opts.routePrefix)
    .use(remarkHeading, { customId: false })
    .use(remarkStructure, { types: STRUCTURE_TYPES })
    .use(remarkGuideAlerts)
    .use(remarkGuideMore)
    .use(remarkCodeTabs)
    .use(remarkCodeMeta)
    .use(remarkGuideImages, { readInlineSvg: opts.readInlineSvg })
    .use(remarkPlatformBadges)
    .use(remarkSymbolCodeLinks, opts.symbolCodeLinks)
    .use(remarkTableBalance)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeCode, {
      themes: { light: "github-light", dark: "github-dark" },
      transformers: [...(rehypeCodeDefaultOptions.transformers ?? []), transformerMetaHighlight()],
    })
    .use(rehypeGuideComponents);
  const file = new VFile(markdown);
  const hast = (await processor.run(processor.parse(file), file)) as Root;
  return {
    hast,
    toc: file.data.toc ?? [],
    structuredData: file.data.structuredData ?? { headings: [], contents: [] },
  };
}

/** The page outline: the page title is the page's own heading, so it stays out. */
export function pageToc(toc: TOCItemType[]): TOCItemType[] {
  return toc.filter((item) => item.depth >= 2 && item.depth <= 4);
}

// A blockquote's alert or disclosure marker, once its `>` is gone.
const BLOCK_MARKER = new RegExp(`^\\[!(?:${[...ALERT_TYPES, "more"].join("|")})\\][ \\t]*`, "gim");

// A code span, which keeps its text, or a raw HTML tag or comment, which renders
// no text of its own.
const CODE_SPAN_OR_HTML =
  /(`+)[\s\S]*?(?<!`)\1(?!`)|<!--[\s\S]*?-->|<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>/g;

// Structured data is Markdown with its links and images already reduced to their
// text. The inline marks left in it would show in a hit's passage, so they go;
// an underscore inside a word stays, keeping `snake_case` names searchable.
// `remarkStructure` slices the authored source, so raw HTML (an `<a id>` anchor)
// arrives as its tags and goes too.
function plainText(markdown: string): string {
  return markdown
    .replace(CODE_SPAN_OR_HTML, (match) => (match.startsWith("`") ? match : " "))
    .replace(/`+/g, "")
    .replace(/[*~]+/g, "")
    .replace(/(?<![A-Za-z0-9])_+|_+(?![A-Za-z0-9])/g, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(BLOCK_MARKER, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A page record holding the text before the first section, titled by the page's
 * `h1`, then one record per section at `<route>#<heading id>`, so a hit opens the
 * section holding its words.
 */
export function docsSearchRecords(route: string, page: DocsMarkdown): SearchRecord[] {
  const titleId = page.toc.find((item) => item.depth === 1)?.url.slice(1);
  const { headings, contents } = page.structuredData;
  const textUnder = (ids: (string | undefined)[]): string =>
    contents
      .filter((entry) => ids.includes(entry.heading))
      .map((entry) => plainText(entry.content))
      .filter((text) => text !== "")
      .join(" ");
  const titleHeading = headings.find((heading) => heading.id === titleId);
  return [
    {
      route,
      title: titleHeading ? plainText(titleHeading.content) : route.replace(/.*\//, ""),
      text: textUnder([undefined, titleId]),
    },
    ...headings
      .filter((heading) => heading.id !== titleId)
      .map((heading) => ({
        route: `${route}#${heading.id}`,
        title: plainText(heading.content),
        text: textUnder([heading.id]),
      })),
  ];
}
