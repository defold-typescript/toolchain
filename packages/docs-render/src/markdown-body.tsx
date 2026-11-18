import type { Components } from "fumadocs-core/utils/hast-to-jsx";
import { toJsx } from "fumadocs-core/utils/hast-to-jsx";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { Root } from "hast";
import {
  type AnchorHTMLAttributes,
  type ComponentType,
  createElement,
  type ReactNode,
} from "react";

const FumadocsLink = defaultMdxComponents.a;

// Fumadocs' link gives every anchor an `href`, which would turn an `<a id>`
// written as a link target into a link to the current page.
function Anchor(props: AnchorHTMLAttributes<HTMLAnchorElement>): ReactNode {
  return props.href === undefined ? <a {...props} /> : <FumadocsLink {...props} />;
}

const components = { ...defaultMdxComponents, a: Anchor };

/** Element renderers laid over the defaults `MarkdownBody` renders a page with. */
export type BodyComponents = Partial<Components>;

/**
 * A page body from the docs pipeline, rendered with Fumadocs' content
 * components and any `components` laid over them.
 */
export function MarkdownBody({
  hast,
  components: overrides,
}: {
  hast: Root;
  components?: BodyComponents | undefined;
}): ReactNode {
  return toJsx(hast, { components: overrides ? { ...components, ...overrides } : components });
}

type ElementProps = Record<string, unknown> & { id?: unknown; className?: unknown };

// The `?since=` pre-paint script writes `style.display` on the elements it can
// reach, all of which carry an `id` or an `api-*` class, before React hydrates.
const reachable = (props: ElementProps): boolean =>
  typeof props.id === "string" ||
  (typeof props.className === "string" && /(?:^|\s)api-/.test(props.className));

const tolerant = (props: ElementProps): ElementProps =>
  reachable(props) ? { ...props, suppressHydrationWarning: true } : props;

type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

// A signature heading carries its own permalink (`data-anchored`), so it renders
// as the plain element; Fumadocs' heading would wrap that link in a second one.
function apiHeading(tag: HeadingTag, props: ElementProps): ReactNode {
  if (props["data-anchored"] !== undefined) return createElement(tag, tolerant(props));
  const Base = defaultMdxComponents[tag] as ComponentType<ElementProps>;
  return <Base {...tolerant(props)} />;
}

const ApiH1 = (props: ElementProps): ReactNode => apiHeading("h1", props);
const ApiH2 = (props: ElementProps): ReactNode => apiHeading("h2", props);
const ApiH3 = (props: ElementProps): ReactNode => apiHeading("h3", props);
const ApiH4 = (props: ElementProps): ReactNode => apiHeading("h4", props);
const ApiH5 = (props: ElementProps): ReactNode => apiHeading("h5", props);
const ApiH6 = (props: ElementProps): ReactNode => apiHeading("h6", props);
const ApiCode = (props: ElementProps): ReactNode => createElement("code", tolerant(props));
const ApiDiv = (props: ElementProps): ReactNode => createElement("div", tolerant(props));
const ApiLi = (props: ElementProps): ReactNode => createElement("li", tolerant(props));
const ApiOl = (props: ElementProps): ReactNode => createElement("ol", tolerant(props));
const ApiP = (props: ElementProps): ReactNode => createElement("p", tolerant(props));
const ApiSpan = (props: ElementProps): ReactNode => createElement("span", tolerant(props));
const ApiStrong = (props: ElementProps): ReactNode => createElement("strong", tolerant(props));
const ApiUl = (props: ElementProps): ReactNode => createElement("ul", tolerant(props));

/**
 * The renderers of an API page body. A pre-paint script hides symbols and chips
 * the stored `?since=` window excludes before React hydrates, so every element
 * it can reach renders with `suppressHydrationWarning`. Registering `span` also
 * makes the renderer build each span as an element, where a chip can carry it.
 */
export const apiBodyComponents = {
  code: ApiCode,
  div: ApiDiv,
  li: ApiLi,
  ol: ApiOl,
  p: ApiP,
  span: ApiSpan,
  strong: ApiStrong,
  ul: ApiUl,
  h1: ApiH1,
  h2: ApiH2,
  h3: ApiH3,
  h4: ApiH4,
  h5: ApiH5,
  h6: ApiH6,
} as BodyComponents;
