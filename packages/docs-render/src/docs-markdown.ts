import {
  rehypeCode,
  remarkGfm,
  remarkHeading,
  remarkStructure,
  type StructuredData,
} from "fumadocs-core/mdx-plugins";
import type { TOCItemType } from "fumadocs-core/toc";
import type { Root } from "hast";
import type { Nodes as MdastNodes, Root as MdastRoot } from "mdast";
import { remark } from "remark";
import remarkRehype from "remark-rehype";
import { VFile } from "vfile";
import type { SearchRecord } from "./search-route";

/** A Markdown page run through the docs pipeline, ready to render and to index. */
export interface DocsMarkdown {
  hast: Root;
  toc: TOCItemType[];
  structuredData: StructuredData;
}

// A relative `.md` link (`./other.md#anchor`) names a sibling page, which the
// site serves at `<routePrefix>/<name>`. The route stays root-absolute without
// the deploy base: the link component that renders it adds the base itself.
function guideHref(url: string, routePrefix: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("/") || url.startsWith("#")) return url;
  const hash = url.indexOf("#");
  const path = hash === -1 ? url : url.slice(0, hash);
  if (!path.endsWith(".md")) return url;
  const name = path.replace(/.*\//, "").replace(/\.md$/, "");
  return `${routePrefix}/${name}${hash === -1 ? "" : url.slice(hash)}`;
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

/**
 * Markdown to hast, with the page's table of contents and its structured search
 * data. Heading ids are the ones github.com gives the same `.md`, so a link
 * written against the file on GitHub lands on the same heading here.
 */
export async function processDocsMarkdown(
  markdown: string,
  opts: { routePrefix: string },
): Promise<DocsMarkdown> {
  const processor = remark()
    .use(remarkGfm)
    .use(remarkGuideLinks, opts.routePrefix)
    .use(remarkHeading, { customId: false })
    .use(remarkStructure)
    .use(remarkRehype)
    .use(rehypeCode, { themes: { light: "github-light", dark: "github-dark" } });
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

// Structured data is Markdown with its links and images already reduced to their
// text. The inline marks left in it would show in a hit's passage, so they go;
// an underscore inside a word stays, keeping `snake_case` names searchable.
function plainText(markdown: string): string {
  return markdown
    .replace(/`+/g, "")
    .replace(/[*~]+/g, "")
    .replace(/(?<![A-Za-z0-9])_+|_+(?![A-Za-z0-9])/g, "")
    .replace(/^\s{0,3}>\s?/gm, "")
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
    plainText(
      contents
        .filter((entry) => ids.includes(entry.heading))
        .map((entry) => entry.content)
        .join(" "),
    );
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
