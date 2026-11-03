/** @jsxImportSource hono/jsx */
// Pins the JSX dialect for root `bun test`, which reads no JSX config from the root tsconfig.
import { isExternalUrl, withBase } from "@defold-typescript/docs-render/base";
import { EXTERNAL_LINK_ICON } from "@defold-typescript/docs-render/phosphor";
import type { NavCategory, NavLink } from "../lib/nav";

function firstRoute(links: NavLink[]): string | undefined {
  for (const link of links) {
    if (link.route) return link.route;
    const childRoute = link.children ? firstRoute(link.children) : undefined;
    if (childRoute) return childRoute;
  }
  return undefined;
}

export function CategoryLink({ category, active }: { category: NavCategory; active: boolean }) {
  const href = category.route ?? firstRoute(category.links) ?? "/";
  const external = isExternalUrl(href);
  return (
    <a
      href={withBase(href)}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      aria-current={active ? "page" : undefined}
      class={
        "-mb-px inline-flex h-14 shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-text-muted transition hover:text-text " +
        (active ? "border-accent text-text" : "border-transparent")
      }
    >
      {category.label}
      {external ? <span dangerouslySetInnerHTML={{ __html: EXTERNAL_LINK_ICON }} /> : null}
    </a>
  );
}
