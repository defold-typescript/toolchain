import { toJsx } from "fumadocs-core/utils/hast-to-jsx";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { Root } from "hast";
import type { AnchorHTMLAttributes, ReactNode } from "react";

const FumadocsLink = defaultMdxComponents.a;

// Fumadocs' link gives every anchor an `href`, which would turn an `<a id>`
// written as a link target into a link to the current page.
function Anchor(props: AnchorHTMLAttributes<HTMLAnchorElement>): ReactNode {
  return props.href === undefined ? <a {...props} /> : <FumadocsLink {...props} />;
}

const components = { ...defaultMdxComponents, a: Anchor };

/** A page body from `processDocsMarkdown`, rendered with Fumadocs' content components. */
export function MarkdownBody({ hast }: { hast: Root }): ReactNode {
  return toJsx(hast, { components });
}
