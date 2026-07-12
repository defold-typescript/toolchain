import { ssgParams } from "hono/ssg";
import { createRoute } from "honox/factory";
import { ApiIndex, LibraryPath } from "../../components/api-index";
import { withGlobalTypes } from "../../components/api-index-sections";
import {
  apiPages,
  apiPagesForVersion,
  apiVersions,
  defaultGlobalTypePages,
  libraryDirs,
  libraryOwners,
} from "../../lib/api-content";
import {
  apiLinkify,
  apiPageMarkdown,
  apiReplacementResolver,
  isKnownVersionId,
} from "../../lib/api-page-render";
import { pageHeadings } from "../../lib/headings";
import { renderMarkdown } from "../../lib/markdown";

// honox flat routing collapses `api/[version]/index.tsx` to `/api/:version`,
// which collides with this `/api/:namespace` route (the shallower one wins). So
// the per-version index is folded in here: one `/api/:param` route that renders
// the version index when the param is a known non-default version id, and the
// namespace page otherwise. The 3-segment `/api/:version/:namespace` route lives
// in its own file and does not collide.
export default createRoute(
  ssgParams(() => [
    ...apiPages().map((page) => ({ namespace: page.namespace })),
    ...apiVersions()
      .filter((v) => !v.isDefault)
      .map((v) => ({ namespace: v.id })),
  ]),
  async (c) => {
    const param = c.req.param("namespace");
    if (!param) return c.notFound();

    if (isKnownVersionId(param, apiVersions())) {
      return c.render(
        <ApiIndex
          pages={withGlobalTypes(apiPagesForVersion(param), defaultGlobalTypePages())}
          version={param}
        />,
        {
          title: `API reference (${param})`,
        },
      );
    }

    const pages = apiPages();
    const page = pages.find((entry) => entry.namespace === param);
    if (!page) return c.notFound();

    // Build the linkify registry from the full surface. `linkifySymbolMentions`
    // itself drops bare-namespace keys (no `.`) — pointing a prose mention at
    // `/api/camera` is too broad; only qualified member keys like
    // `camera.screen_to_world` (with the heading-slug anchor) are linked.
    const linkify = apiLinkify(pages);
    const resolveReplacement = apiReplacementResolver(pages);

    // Library pages render their heading as the styled `creator/dir/namespace`
    // path (matching the /libraries index), so the markdown body omits its H1.
    if (page.category === "library") {
      const dir = libraryDirs().get(page.namespace) ?? page.namespace;
      const creator = libraryOwners().get(dir) ?? dir;
      const body = await renderMarkdown(
        apiPageMarkdown(page, linkify, { omitHeading: true, resolveReplacement }),
        { highlightSignatureHeadings: true },
      );
      return c.render(
        <article class="prose">
          <h1>
            <LibraryPath creator={creator} dir={dir} namespace={page.namespace} />
          </h1>
          <div dangerouslySetInnerHTML={{ __html: body }} />
        </article>,
        { title: `${page.module.namespace} API`, headings: pageHeadings(body) },
      );
    }

    const html = await renderMarkdown(apiPageMarkdown(page, linkify, { resolveReplacement }), {
      highlightSignatureHeadings: true,
    });
    return c.render(<article class="prose" dangerouslySetInnerHTML={{ __html: html }} />, {
      title: `${page.module.namespace} API`,
      headings: pageHeadings(html),
    });
  },
);
