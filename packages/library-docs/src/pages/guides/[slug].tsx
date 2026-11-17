import type { PageProps } from "waku/router";
import { unstable_notFound } from "waku/router/server";
import { libraryStaticPaths, renderLibraryGuide } from "../../../app/lib/library-routes";
import { MarkdownPage } from "../../components/markdown-page";

export default async function GuideRoute({ slug }: PageProps<"/guides/[slug]">) {
  const guide = await renderLibraryGuide(slug);
  if (!guide) unstable_notFound();
  return <MarkdownPage title={guide.title} page={guide.page} />;
}

export async function getConfig() {
  return { render: "static", staticPaths: libraryStaticPaths().guides } as const;
}
