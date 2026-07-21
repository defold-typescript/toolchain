/** @jsxImportSource hono/jsx */
import { withBase } from "../lib/base";
import type { NavLink } from "../lib/nav";

export function SidebarItems({
  links,
  path,
  depth = 0,
  uppercaseGroupHeaders = true,
}: {
  links: NavLink[];
  path: string;
  depth?: number;
  uppercaseGroupHeaders?: boolean;
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
            <SidebarLink link={link} active={path === link.route} />
          ) : (
            <p
              class={
                "mt-3 mb-1 px-2 text-text-faint " +
                (uppercaseGroupHeaders
                  ? "text-[11px] font-semibold uppercase tracking-wider"
                  : "text-[13px] font-medium")
              }
              dangerouslySetInnerHTML={{ __html: link.labelHtml }}
            />
          )}
          {link.children && link.children.length > 0 ? (
            <SidebarItems
              links={link.children}
              path={path}
              depth={depth + 1}
              uppercaseGroupHeaders={uppercaseGroupHeaders}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function SidebarLink({ link, active }: { link: NavLink; active: boolean }) {
  if (!link.route) return null;
  const base =
    "rounded-md px-2 py-1.5 text-text-muted transition hover:bg-surface hover:text-text " +
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
