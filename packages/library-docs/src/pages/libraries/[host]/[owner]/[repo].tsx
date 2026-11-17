import type { PageProps } from "waku/router";
import { unstable_notFound } from "waku/router/server";
import {
  libraryStaticPaths,
  renderLibraryListingHtml,
} from "../../../../../app/lib/library-routes";
import { HtmlPage } from "../../../../components/html-page";

// The page for a library that ships no `.script_api`: what it ships and how a
// project uses it, in place of an API reference.
export default async function LibraryListingRoute(
  params: PageProps<"/libraries/[host]/[owner]/[repo]">,
) {
  const page = await renderLibraryListingHtml(params);
  if (!page) unstable_notFound();
  return <HtmlPage title={page.title} html={page.html} />;
}

export async function getConfig() {
  return { render: "static", staticPaths: libraryStaticPaths().listings } as const;
}
