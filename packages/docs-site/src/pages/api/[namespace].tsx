import { withBase } from "@defold-typescript/docs-render/base";
import { renderCanonicalApiPage } from "@defold-typescript/docs-render/toolchain-page";
import { Card, Cards } from "fumadocs-ui/components/card";
import { DocsBody, DocsPage } from "fumadocs-ui/layouts/docs/page";
import type { PageProps } from "waku/router";
import { unstable_notFound } from "waku/router/server";
import { TYPES_DIR } from "../../../app/lib/api-content";
import { apiParamKind, apiStaticPaths, versionIndexEntries } from "../../../app/lib/api-routes";
import { HtmlPage } from "../../components/html-page";
import { apiCanonicalHref, SITE_NAME } from "../../lib/site";

// `/api/<param>` serves three page kinds, as one route because they share the
// segment: the old Combined index (now a redirect to `/api`), a version's index,
// and a canonical namespace page.
export default async function ApiParamRoute({ namespace: param }: PageProps<"/api/[namespace]">) {
  const page = apiParamKind(param);

  if (page.kind === "combined-redirect") {
    const to = withBase(page.to);
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

  if (page.kind === "version-index") {
    const title = `API reference (${page.version})`;
    const canonical = apiCanonicalHref(`/api/${page.version}`);
    return (
      <DocsPage>
        <title>{`${title} | ${SITE_NAME}`}</title>
        {canonical && <link rel="canonical" href={canonical} />}
        <DocsBody>
          <h1>{title}</h1>
          <Cards>
            {versionIndexEntries(page.version).map((entry) => (
              <Card
                key={entry.namespace}
                title={entry.namespace}
                description={entry.brief}
                href={entry.href}
                data-mono=""
              />
            ))}
          </Cards>
        </DocsBody>
      </DocsPage>
    );
  }

  const html = await renderCanonicalApiPage(page.namespace, TYPES_DIR);
  if (html === undefined) unstable_notFound();
  return <HtmlPage title={`${page.namespace} API`} html={html} />;
}

export async function getConfig() {
  return { render: "static", staticPaths: apiStaticPaths().single } as const;
}
