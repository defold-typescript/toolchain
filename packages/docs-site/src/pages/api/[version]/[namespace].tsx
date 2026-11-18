import type { PageProps } from "waku/router";
import { unstable_notFound } from "waku/router/server";
import { apiStaticPaths, renderVersionedApiPage } from "../../../../app/lib/api-routes";
import { ApiMarkdownPage } from "../../../components/api-markdown-page";
import { apiCanonicalHref } from "../../../lib/site";

// One namespace as it stands at an exact engine version: the window from the
// oldest tracked version up to `version`.
export default async function VersionedApiRoute({
  version,
  namespace,
}: PageProps<"/api/[version]/[namespace]">) {
  const page = await renderVersionedApiPage(version, namespace);
  if (page === undefined) unstable_notFound();
  const canonical = apiCanonicalHref(`/api/${version}/${namespace}`);
  return (
    <>
      {canonical && <link rel="canonical" href={canonical} />}
      <ApiMarkdownPage title={`${namespace} API (${version})`} page={page} />
    </>
  );
}

export async function getConfig() {
  return { render: "static", staticPaths: apiStaticPaths().versioned } as const;
}
