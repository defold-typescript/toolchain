/** @jsxImportSource hono/jsx */
// Root `bun test` transpiles this file via the cwd (root) tsconfig, which
// intentionally carries no JSX config so non-docs workspaces are not coupled to
// hono/jsx; this pragma pins the JSX dialect for this file.
import { ssgParams } from "hono/ssg";
import { createRoute } from "honox/factory";
import { ApiIndex, LibraryPath } from "../../components/api-index";
import { withGlobalTypes } from "../../components/api-index-sections";
import {
  apiNamespaceOwner,
  apiPagesForVersion,
  apiVersions,
  canonicalApiPages,
  canonicalNamespaces,
  combinedSurface,
  defaultGlobalTypePages,
  libraryDirs,
  libraryOwners,
} from "../../lib/api-content";
import {
  apiLinkify,
  apiPageMarkdown,
  apiReplacementResolver,
  apiSignatureSymbolLinks,
  isKnownVersionId,
  namespaceCountBadges,
} from "../../lib/api-page-render";
import { combinedRedirect, redirectHtml } from "../../lib/api-redirect";
import { withBase } from "../../lib/base";
import { namespaceBadgeCounts } from "../../lib/combined-surface";
import { pageHeadings } from "../../lib/headings";
import { AUTHORED_LIBRARY_HINT, authoredLibraryPin, renderMarkdown } from "../../lib/markdown";
import { COMBINED_VERSION_ID } from "../../lib/version-switch";

// The library page heading: the styled `creator/dir/namespace` path, plus the
// map-pin marker for a LuaLS-authored library (`authoredHere`). Exported so the
// pin wiring is unit-testable without the route's cwd-relative surface loaders.
export function LibraryHeading({
  creator,
  dir,
  namespace,
  authoredHere,
}: {
  creator: string;
  dir: string;
  namespace: string;
  authoredHere: boolean;
}) {
  return (
    <h1>
      <LibraryPath creator={creator} dir={dir} namespace={namespace} />
      {authoredHere ? (
        <span dangerouslySetInnerHTML={{ __html: authoredLibraryPin(AUTHORED_LIBRARY_HINT) }} />
      ) : null}
    </h1>
  );
}

// honox flat routing collapses `api/[version]/index.tsx` to `/api/:version`,
// which collides with this `/api/:namespace` route (the shallower one wins). So
// three page kinds are folded into one `/api/:param` route: the `combined` compat
// redirect, a known-version exact index (default included), and — otherwise — a
// canonical namespace page (a Combined engine page, or a version-independent one).
// The 3-segment `/api/:version/:namespace` route lives in its own file.
export default createRoute(
  ssgParams(() => [
    ...canonicalNamespaces().map((namespace) => ({ namespace })),
    ...apiVersions().map((v) => ({ namespace: v.id })),
    // honox collapses `api/combined/index.tsx` to `/api/combined`, which the
    // shallower `/api/:namespace` route shadows — so the Combined redirect param
    // is folded in here alongside the per-version index params.
    { namespace: COMBINED_VERSION_ID },
  ]),
  async (c) => {
    const param = c.req.param("namespace");
    if (!param) return c.notFound();
    const base = withBase("/").replace(/\/$/, "");

    // The old Combined index is now a permanent compat redirect to canonical /api.
    if (param === COMBINED_VERSION_ID) {
      const { from, to } = combinedRedirect();
      return c.html(redirectHtml(from, to, base));
    }

    // A known version id (the default included now that it owns an explicit
    // `/api/<default>` family) renders that version's exact-version index; its
    // version-independent entries link back to their canonical routes.
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

    // Otherwise a canonical namespace: dispatch on its owning surface. An unknown
    // namespace 404s.
    const owner = apiNamespaceOwner(param);
    if (!owner) return c.notFound();

    const pages = canonicalApiPages();
    const page = pages.find((entry) => entry.namespace === param);
    if (!page) return c.notFound();

    // The linkify + replacement registry span the whole canonical surface, so a
    // prose mention or a deprecation replacement resolves to its canonical route.
    const linkify = apiLinkify(pages);
    const resolveReplacement = apiReplacementResolver(pages);
    // Deep-link `Opaque` brand tokens in rendered signatures to this surface's
    // `/api/Opaque` Reference page.
    const signatureSymbolLinks = apiSignatureSymbolLinks(pages);

    // Library pages render their heading as the styled `creator/dir/namespace`
    // path (matching the /libraries index), so the markdown body omits its H1.
    if (page.category === "library") {
      const dir = libraryDirs().get(page.namespace) ?? page.namespace;
      const creator = libraryOwners().get(dir) ?? dir;
      const body = await renderMarkdown(
        apiPageMarkdown(page, linkify, { omitHeading: true, resolveReplacement }),
        { highlightSignatureHeadings: true, signatureSymbolLinks },
      );
      return c.render(
        <article class="prose">
          <LibraryHeading
            creator={creator}
            dir={dir}
            namespace={page.namespace}
            authoredHere={page.libraryMeta?.authoredHere ?? false}
          />
          <div dangerouslySetInnerHTML={{ __html: body }} />
        </article>,
        { title: `${page.module.namespace} API`, headings: pageHeadings(body) },
      );
    }

    // A Combined engine namespace renders with the availability markers and the
    // namespace-title count pills; a version-independent namespace (global type,
    // Lua stdlib) renders plainly.
    const combinedMarkers = owner === "combined-engine";
    const model = combinedMarkers
      ? combinedSurface().namespaces.find((n) => n.namespace === param)
      : undefined;
    const titleBadges = model ? namespaceCountBadges(namespaceBadgeCounts(model)) : "";

    const html = await renderMarkdown(
      apiPageMarkdown(page, linkify, { resolveReplacement, titleBadges, combinedMarkers }),
      { highlightSignatureHeadings: true, signatureSymbolLinks },
    );
    return c.render(<article class="prose" dangerouslySetInnerHTML={{ __html: html }} />, {
      title: `${page.module.namespace} API`,
      headings: pageHeadings(html),
    });
  },
);
