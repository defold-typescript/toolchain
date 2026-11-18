import type { PageProps } from "waku/router";
import { unstable_notFound } from "waku/router/server";
import { libraryStaticPaths, renderLibraryApiPage } from "../../../../../../app/lib/library-routes";
import { ApiMarkdownPage } from "../../../../../components/api-markdown-page";

export default async function LibraryApiRoute(
  params: PageProps<"/api/[host]/[owner]/[repo]/[namespace]">,
) {
  const page = await renderLibraryApiPage(params);
  if (!page) unstable_notFound();
  return <ApiMarkdownPage {...page} />;
}

export async function getConfig() {
  return { render: "static", staticPaths: libraryStaticPaths().api } as const;
}
