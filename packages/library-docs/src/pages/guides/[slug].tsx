import type { PageProps } from "waku/router";
import { unstable_notFound } from "waku/router/server";
import { libraryStaticPaths, renderLibraryGuideHtml } from "../../../app/lib/library-routes";
import { HtmlPage } from "../../components/html-page";

export default async function GuideRoute({ slug }: PageProps<"/guides/[slug]">) {
  const page = await renderLibraryGuideHtml(slug);
  if (!page) unstable_notFound();
  return <HtmlPage title={page.title} html={page.html} />;
}

export async function getConfig() {
  return { render: "static", staticPaths: libraryStaticPaths().guides } as const;
}
