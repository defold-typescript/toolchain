import { toJsx } from "fumadocs-core/utils/hast-to-jsx";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { Root } from "hast";
import type { ReactNode } from "react";

/** A page body from `processDocsMarkdown`, rendered with Fumadocs' content components. */
export function MarkdownBody({ hast }: { hast: Root }): ReactNode {
  return toJsx(hast, { components: defaultMdxComponents });
}
