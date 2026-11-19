import type { BadgeCountTable } from "@defold-typescript/docs-render/combined-surface";
import { stripPlatformMarkers } from "@defold-typescript/docs-render/platform-icons";
import { htmlToDocText } from "@defold-typescript/types";
import { Card, Cards } from "fumadocs-ui/components/card";
import { DocsBody, DocsPage } from "fumadocs-ui/layouts/docs/page";
import { Fragment, type ReactNode } from "react";
import { renderCardSummary } from "../../app/lib/card-summary";
import { guidePages } from "../../app/lib/content";
import type { NavLink } from "../../app/lib/nav";
import {
  apiPages,
  apiSurfaceConfig,
  landingFooterItems,
  navCategories,
  SITE_NAME,
} from "../lib/site";
import { CardPills } from "./nav-pills";

// Inline markdown from the repo's own guide sources, rendered with links
// flattened so it can sit inside a card's own link.
function InlineMarkdown({ source }: { source: string }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: rendered from the repo's own guide markdown
  return <span dangerouslySetInnerHTML={{ __html: renderCardSummary(source) }} />;
}

// Each card's one-line summary by route: a guide page's lead paragraph, or an
// API namespace's brief as plain text.
function cardSummaries(): Map<string, ReactNode> {
  const summaries = new Map<string, ReactNode>();
  for (const page of guidePages()) {
    if (page.summary) summaries.set(page.route, <InlineMarkdown source={page.summary} />);
  }
  for (const page of apiPages()) {
    const brief = stripPlatformMarkers(htmlToDocText(page.brief)).trim();
    if (brief) summaries.set(page.route, brief);
  }
  return summaries;
}

// An engine namespace card's title carries its count pills after the name.
function cardTitle(link: NavLink, badgeCounts: BadgeCountTable): ReactNode {
  const row = badgeCounts[link.label];
  if (!row) return link.label;
  return (
    <>
      {link.label}
      <CardPills namespace={link.label} row={row} />
    </>
  );
}

function LinkCards({
  links,
  summaries,
  mono,
  badgeCounts,
}: {
  links: NavLink[];
  summaries: Map<string, ReactNode>;
  mono: boolean;
  badgeCounts: BadgeCountTable;
}) {
  return (
    <Cards>
      {links.flatMap((link) =>
        link.route
          ? [
              <Card
                key={link.route}
                title={cardTitle(link, badgeCounts)}
                description={summaries.get(link.route)}
                href={link.route}
                data-mono={mono ? "" : undefined}
              />,
            ]
          : [],
      )}
    </Cards>
  );
}

/**
 * The landing page of one top-level nav category: its intro, then its pages as
 * cards carrying each page's one-line summary, with each nested group under its
 * own heading and subtitle.
 */
export function CategoryLanding({ id, lead }: { id: string; lead: ReactNode }) {
  const nav = navCategories();
  const category = nav.find((c) => c.id === id);
  if (!category) return null;
  const summaries = cardSummaries();
  // API cards name namespaces, so they read in the code face, and an engine
  // namespace's card shows its count pills as its sidebar entry does.
  const mono = id === "api";
  const badgeCounts = mono ? apiSurfaceConfig().badgeCounts : {};
  const flat = category.links.filter((link) => !link.children);
  const groups = category.links.filter((link) => link.children);
  return (
    <DocsPage
      toc={groups.map((group) => ({
        title: group.label,
        url: `#${slug(group.label)}`,
        depth: 2,
      }))}
      footer={{ items: landingFooterItems(id, nav) }}
    >
      <title>{`${category.label} | ${SITE_NAME}`}</title>
      {/* The title and intro sit in the prose body, as a guide page's own do, so
          they take the same heading and body faces. */}
      <DocsBody>
        <h1>{category.label}</h1>
        <p>{lead}</p>
        {flat.length > 0 && (
          <LinkCards links={flat} summaries={summaries} mono={mono} badgeCounts={badgeCounts} />
        )}
        {/* Each group's blocks sit directly in the prose body, not in a wrapper,
            so the body's spacing between blocks reaches them. */}
        {groups.map((group) => (
          <Fragment key={group.label}>
            <h2 id={slug(group.label)}>{group.label}</h2>
            {group.subtitle ? (
              <p>
                <InlineMarkdown source={group.subtitle} />
              </p>
            ) : null}
            <LinkCards
              links={group.children ?? []}
              summaries={summaries}
              mono={mono}
              badgeCounts={badgeCounts}
            />
          </Fragment>
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
