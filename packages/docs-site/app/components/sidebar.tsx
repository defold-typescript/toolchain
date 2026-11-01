/** @jsxImportSource hono/jsx */
import { withBase } from "../lib/base";
import type { NavLink } from "../lib/nav";

const routePath = (route: string): string => route.split("?")[0] as string;

export function SidebarItems({
  links,
  path,
  depth = 0,
}: {
  links: NavLink[];
  path: string;
  depth?: number;
}) {
  return (
    <ul
      class={
        depth === 0
          ? "space-y-0.5 text-[length:var(--nav-side-size)] leading-5"
          : "mt-0.5 ml-3 space-y-0.5 border-l border-border pl-2"
      }
    >
      {links.map((link) => (
        <li key={link.route ?? link.label}>
          {link.route ? (
            // A nav route carries the active window's `?since=` while `path` is
            // the bare pathname, so the query is dropped before comparing —
            // otherwise narrowing the range unmarks every leaf in the tree.
            <SidebarLink link={link} active={path === routePath(link.route)} />
          ) : (
            <p
              class={
                "mt-3 mb-1 px-2 text-text-faint text-[11px] font-semibold uppercase tracking-wider"
              }
              dangerouslySetInnerHTML={{ __html: link.labelHtml }}
            />
          )}
          {link.children && link.children.length > 0 ? (
            <SidebarItems links={link.children} path={path} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function SidebarLink({ link, active }: { link: NavLink; active: boolean }) {
  if (!link.route) return null;
  const base =
    "rounded-md px-2 py-1.5 transition hover:bg-surface text-text-muted hover:text-text " +
    (active ? "bg-accent-soft text-accent" : "");
  // A namespace leaf with Combined count pills becomes a flex row so the label
  // truncates while the badges stay visible; a plain leaf keeps the single-node
  // truncating anchor unchanged.
  if (link.badgeHtml) {
    return (
      <a
        href={withBase(link.route)}
        aria-current={active ? "page" : undefined}
        class={`flex items-center gap-1 ${base}`}
      >
        <span class="truncate min-w-0" dangerouslySetInnerHTML={{ __html: link.labelHtml }} />
        <span class="shrink-0" dangerouslySetInnerHTML={{ __html: link.badgeHtml }} />
      </a>
    );
  }
  return (
    <a
      href={withBase(link.route)}
      aria-current={active ? "page" : undefined}
      class={`block truncate ${base}`}
      dangerouslySetInnerHTML={{ __html: link.labelHtml }}
    />
  );
}
