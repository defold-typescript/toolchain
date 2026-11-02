import type { NavCategory } from "./nav";

export interface PagerLink {
  route: string;
  label: string;
  labelHtml: string;
  topicId: string;
  topicLabel: string;
  crossesTopic: boolean;
}

export interface Pager {
  prev?: PagerLink;
  next?: PagerLink;
}

type FlatEntry = Omit<PagerLink, "crossesTopic">;

function flatten(nav: NavCategory[]): FlatEntry[] {
  const entries: FlatEntry[] = [];
  for (const category of nav) {
    const tag = (route: string, label: string, labelHtml: string) => {
      entries.push({
        route,
        label,
        labelHtml,
        topicId: category.id,
        topicLabel: category.label,
      });
    };
    const visit = (link: NavCategory["links"][number]) => {
      if (link.route) tag(link.route, link.label, link.labelHtml);
      for (const child of link.children ?? []) visit(child);
    };
    if (category.route) tag(category.route, category.label, category.label);
    for (const link of category.links) visit(link);
  }
  return entries;
}

function neighbor(current: FlatEntry, entry: FlatEntry | undefined): PagerLink | undefined {
  if (!entry) return undefined;
  return { ...entry, crossesTopic: entry.topicId !== current.topicId };
}

export function buildPager(nav: NavCategory[], route: string): Pager {
  const entries = flatten(nav);
  const index = entries.findIndex((entry) => entry.route === route);
  const current = index === -1 ? undefined : entries[index];
  if (!current) return {};
  const prev = neighbor(current, entries[index - 1]);
  const next = neighbor(current, entries[index + 1]);
  const pager: Pager = {};
  if (prev) pager.prev = prev;
  if (next) pager.next = next;
  return pager;
}
