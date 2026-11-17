import type { PageProps } from "waku/router";
import { unstable_notFound } from "waku/router/server";
import { apiStaticPaths, renderVersionedApiHtml } from "../../../../app/lib/api-routes";
import { HtmlPage } from "../../../components/html-page";

// One namespace as it stands at an exact engine version: the window from the
// oldest tracked version up to `version`.
export default async function VersionedApiRoute({
  version,
  namespace,
}: PageProps<"/api/[version]/[namespace]">) {
  const html = await renderVersionedApiHtml(version, namespace);
  if (html === undefined) unstable_notFound();
  return <HtmlPage title={`${namespace} API (${version})`} html={html} />;
}

export async function getConfig() {
  return { render: "static", staticPaths: apiStaticPaths().versioned } as const;
}
