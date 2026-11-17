import { withBase } from "@defold-typescript/docs-render/base";
import { renderCanonicalApiPage } from "@defold-typescript/docs-render/toolchain-page";
import { apiVersions } from "@defold-typescript/docs-render/toolchain-surface";
import { Card, Cards } from "fumadocs-ui/components/card";
import { DocsBody, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import type { PageProps } from "waku/router";
import { unstable_notFound } from "waku/router/server";
import { isKnownVersionId } from "../../../app/lib/api-badges";
import { canonicalNamespaces, TYPES_DIR, versionIndexPages } from "../../../app/lib/api-content";
import { COMBINED_ROUTE_SEGMENT, combinedRedirect } from "../../../app/lib/api-redirect";
import { HtmlPage } from "../../components/html-page";
import { SITE_NAME } from "../../lib/site";

// `/api/<param>` serves three page kinds, as one route because they share the
// segment: the old Combined index (now a redirect to `/api`), a version's index,
// and a canonical namespace page.
export default async function ApiParamRoute({ namespace: param }: PageProps<"/api/[namespace]">) {
  if (param === COMBINED_ROUTE_SEGMENT) {
    const to = withBase(combinedRedirect().to);
    return (
      <>
        <meta httpEquiv="refresh" content={`0; url=${to}`} />
        <link rel="canonical" href={to} />
        <p>
          Moved to <a href={to}>{to}</a>.
        </p>
      </>
    );
  }

  if (isKnownVersionId(param, apiVersions(TYPES_DIR))) {
    const title = `API reference (${param})`;
    return (
      <DocsPage>
        <title>{`${title} | ${SITE_NAME}`}</title>
        <DocsTitle>{title}</DocsTitle>
        <DocsBody>
          <Cards>
            {versionIndexPages(param).map((page) => (
              <Card
                key={page.namespace}
                title={page.namespace}
                description={page.brief}
                href={page.route}
              />
            ))}
          </Cards>
        </DocsBody>
      </DocsPage>
    );
  }

  const html = await renderCanonicalApiPage(param, TYPES_DIR);
  if (html === undefined) unstable_notFound();
  return <HtmlPage title={`${param} API`} html={html} />;
}

export async function getConfig() {
  return {
    render: "static",
    staticPaths: [
      ...canonicalNamespaces(),
      ...apiVersions(TYPES_DIR).map((version) => version.id),
      COMBINED_ROUTE_SEGMENT,
    ],
  } as const;
}
