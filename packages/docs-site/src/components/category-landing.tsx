import { Card, Cards } from "fumadocs-ui/components/card";
import { DocsBody, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import type { NavLink } from "../../app/lib/nav";
import { navCategories, SITE_NAME } from "../lib/site";

function LinkCards({ links }: { links: NavLink[] }) {
  return (
    <Cards>
      {links.flatMap((link) =>
        link.route ? [<Card key={link.route} title={link.label} href={link.route} />] : [],
      )}
    </Cards>
  );
}

/**
 * The landing page of one top-level nav category: its pages as cards, with each
 * nested group under its own heading.
 */
export function CategoryLanding({ id }: { id: string }) {
  const category = navCategories().find((c) => c.id === id);
  if (!category) return null;
  const flat = category.links.filter((link) => !link.children);
  const groups = category.links.filter((link) => link.children);
  return (
    <DocsPage
      toc={groups.map((group) => ({
        title: group.label,
        url: `#${slug(group.label)}`,
        depth: 2,
      }))}
    >
      <title>{`${category.label} | ${SITE_NAME}`}</title>
      <DocsTitle>{category.label}</DocsTitle>
      <DocsBody>
        {flat.length > 0 && <LinkCards links={flat} />}
        {groups.map((group) => (
          <section key={group.label}>
            <h2 id={slug(group.label)}>{group.label}</h2>
            <LinkCards links={group.children ?? []} />
          </section>
        ))}
      </DocsBody>
    </DocsPage>
  );
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
