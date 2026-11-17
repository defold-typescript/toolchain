import type { PageProps } from "waku/router";
import { unstable_notFound } from "waku/router/server";
import { libraryStaticPaths, renderLibraryApiHtml } from "../../../../../../app/lib/library-routes";
import { HtmlPage } from "../../../../../components/html-page";

export default async function LibraryApiRoute(
  params: PageProps<"/api/[host]/[owner]/[repo]/[namespace]">,
) {
  const page = await renderLibraryApiHtml(params);
  if (!page) unstable_notFound();
  return <HtmlPage title={page.title} html={page.html} />;
}

export async function getConfig() {
  return { render: "static", staticPaths: libraryStaticPaths().api } as const;
}
