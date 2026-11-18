import type { PageProps } from "waku/router";
import { unstable_notFound } from "waku/router/server";
import {
  libraryStaticPaths,
  renderLibraryListingPage,
} from "../../../../../app/lib/library-routes";
import { ApiMarkdownPage } from "../../../../components/api-markdown-page";

// The page for a library that ships no `.script_api`: what it ships and how a
// project uses it, in place of an API reference.
export default async function LibraryListingRoute(
  params: PageProps<"/libraries/[host]/[owner]/[repo]">,
) {
  const page = await renderLibraryListingPage(params);
  if (!page) unstable_notFound();
  return <ApiMarkdownPage {...page} />;
}

export async function getConfig() {
  return { render: "static", staticPaths: libraryStaticPaths().listings } as const;
}
