import { ssgParams } from "hono/ssg";
import { createRoute } from "honox/factory";
import {
  apiPages,
  combinedApiPages,
  combinedParams,
  combinedSurface,
} from "../../../lib/api-content";
import {
  apiLinkify,
  apiPageMarkdown,
  apiReplacementResolver,
  namespaceCountBadges,
} from "../../../lib/api-page-render";
import { namespaceBadgeCounts } from "../../../lib/combined-surface";
import { pageHeadings } from "../../../lib/headings";
import { renderMarkdown } from "../../../lib/markdown";

// `/api/combined/<namespace>`: the union of that namespace's symbols across the
// tracked versions, each carrying its availability badge, signature transitions
// rendered adjacent. Reuses the existing API page renderer fed by the Combined
// domain model; the components stay presentational.
export default createRoute(
  ssgParams(() => combinedParams()),
  async (c) => {
    const namespace = c.req.param("namespace");
    if (!namespace) return c.notFound();

    const pages = combinedApiPages();
    const page = pages.find((entry) => entry.namespace === namespace);
    if (!page) return c.notFound();

    // Prose mentions link within the Combined surface; a removed symbol's
    // replacement resolves against the default (newest) surface, so the link
    // lands on a version where the replacement actually exists.
    const linkify = apiLinkify(pages);
    const resolveReplacement = apiReplacementResolver(apiPages());

    // Namespace-title count pills glance-summarize the per-symbol dots; the model
    // comes from the same cached Combined surface the pages are projected from.
    const model = combinedSurface().namespaces.find((n) => n.namespace === namespace);
    const titleBadges = model ? namespaceCountBadges(namespaceBadgeCounts(model)) : "";

    const html = await renderMarkdown(
      apiPageMarkdown(page, linkify, { resolveReplacement, titleBadges, combinedMarkers: true }),
      { highlightSignatureHeadings: true },
    );
    return c.render(<article class="prose" dangerouslySetInnerHTML={{ __html: html }} />, {
      title: `${namespace} API (combined)`,
      headings: pageHeadings(html),
    });
  },
);
