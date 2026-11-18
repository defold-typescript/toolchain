import { unstable_notFound } from "waku/router/server";
import { renderGuide } from "../../app/lib/content";
import { MarkdownPage } from "../components/markdown-page";
import { indexPage } from "../lib/site";

export default async function IndexRoute() {
  const page = indexPage();
  if (!page) unstable_notFound();
  return <MarkdownPage title="Overview" page={await renderGuide(page)} />;
}

export async function getConfig() {
  return { render: "static" } as const;
}
