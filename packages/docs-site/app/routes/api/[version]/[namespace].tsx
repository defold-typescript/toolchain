import { ssgParams } from "hono/ssg";
import { createRoute } from "honox/factory";
import { apiPagesForVersion, canonicalApiPages, TYPES_DIR } from "../../../lib/api-content";
import {
  apiLinkify,
  apiPageMarkdown,
  apiReplacementResolver,
  apiSignatureSymbolLinks,
  versionedApiParams,
} from "../../../lib/api-page-render";
import { pageHeadings } from "../../../lib/headings";
import { renderMarkdown } from "../../../lib/markdown";

// The 3-segment `/api/:version/:namespace` route — one page per engine namespace
// of every tracked version, the current (default) version included, since each
// version now owns an explicit `/api/<id>/…` family. `versionedApiParams` is
// filtered to versions whose fixtures are on disk, so an unmaterialized ref-doc
// target contributes nothing and the build stays clean until its fixtures land.
export default createRoute(
  ssgParams(() => versionedApiParams(TYPES_DIR)),
  async (c) => {
    const version = c.req.param("version");
    const namespace = c.req.param("namespace");
    if (!version || !namespace) return c.notFound();
    const pages = apiPagesForVersion(version);
    const page = pages.find((entry) => entry.namespace === namespace);
    if (!page) return c.notFound();

    const linkify = apiLinkify(pages);
    const resolveReplacement = apiReplacementResolver(pages);
    // Global-type brands (`Opaque`) are version-independent — they live only on
    // the canonical `/api/Opaque` page, not per version — so resolve the
    // signature deep-links against the canonical surface, not this version's.
    const signatureSymbolLinks = apiSignatureSymbolLinks(canonicalApiPages());
    const html = await renderMarkdown(apiPageMarkdown(page, linkify, { resolveReplacement }), {
      highlightSignatureHeadings: true,
      signatureSymbolLinks,
    });
    return c.render(<article class="prose" dangerouslySetInnerHTML={{ __html: html }} />, {
      title: `${namespace} API (${version})`,
      headings: pageHeadings(html),
    });
  },
);
