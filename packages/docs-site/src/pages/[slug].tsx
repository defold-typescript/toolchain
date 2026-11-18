import type { PageProps } from "waku/router";
import { unstable_notFound } from "waku/router/server";
import { guidePages, renderGuide } from "../../app/lib/content";
import { MarkdownPage } from "../components/markdown-page";
import { guidePage, guideTitle } from "../lib/site";

export default async function GuideRoute({ slug }: PageProps<"/[slug]">) {
  const page = guidePage(slug);
  if (!page) unstable_notFound();
  return <MarkdownPage title={guideTitle(page)} page={await renderGuide(page)} />;
}

export async function getConfig() {
  return {
    render: "static",
    staticPaths: guidePages()
      .filter((page) => !page.isIndex)
      .map((page) => page.slug),
  } as const;
}
