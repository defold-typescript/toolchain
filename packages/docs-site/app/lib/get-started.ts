import type { GuidePage } from "./guide";

// Single source of truth for the Get started folder's pages, in reading order:
// the Overview (index, "") first, then the onboarding pages a newcomer works
// through. Drives both the nav category membership (`buildNav`) and the
// `/get-started` landing cards, so the sidebar and the landing cannot drift.
export const GET_STARTED_SLUGS = [
  "", // Overview — the index page
  "getting-started",
  "add-typescript",
  "editor-setup",
  "defold-editor",
] as const;

/** Resolve the folder's slugs to pages in order, dropping any slug with no page. */
export function getStartedPages(pages: GuidePage[]): GuidePage[] {
  const bySlug = new Map(pages.map((page) => [page.slug, page]));
  return GET_STARTED_SLUGS.map((slug) => bySlug.get(slug)).filter(
    (page): page is GuidePage => page !== undefined,
  );
}
