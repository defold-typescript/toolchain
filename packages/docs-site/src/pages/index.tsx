import { unstable_notFound } from "waku/router/server";
import { renderGuide } from "../../app/lib/content";
import { HtmlPage } from "../components/html-page";
import { indexPage } from "../lib/site";

export default async function IndexRoute() {
  const page = indexPage();
  if (!page) unstable_notFound();
  return <HtmlPage title="Overview" html={await renderGuide(page)} />;
}

export async function getConfig() {
  return { render: "static" } as const;
}
