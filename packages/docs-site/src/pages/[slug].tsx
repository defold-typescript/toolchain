import type { PageProps } from "waku/router";
import { unstable_notFound } from "waku/router/server";
import { guidePages, renderGuide } from "../../app/lib/content";
import { HtmlPage } from "../components/html-page";
import { guidePage, guideTitle } from "../lib/site";

export default async function GuideRoute({ slug }: PageProps<"/[slug]">) {
  const page = guidePage(slug);
  if (!page) unstable_notFound();
  return <HtmlPage title={guideTitle(page)} html={await renderGuide(page)} />;
}

export async function getConfig() {
  return {
    render: "static",
    staticPaths: guidePages()
      .filter((page) => !page.isIndex)
      .map((page) => page.slug),
  } as const;
}
