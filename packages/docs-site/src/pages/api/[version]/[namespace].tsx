import {
  apiLinkify,
  apiPageMarkdown,
  apiReplacementResolver,
  apiSignatureSymbolLinks,
} from "@defold-typescript/docs-render/api-page-render";
import { renderMarkdown } from "@defold-typescript/docs-render/markdown";
import {
  apiVersionAxis,
  canonicalApiPages,
  windowedApiPages,
} from "@defold-typescript/docs-render/toolchain-surface";
import { resolveVersionWindow } from "@defold-typescript/docs-render/version-window";
import type { PageProps } from "waku/router";
import { unstable_notFound } from "waku/router/server";
import { versionedApiParams } from "../../../../app/lib/api-badges";
import { TYPES_DIR } from "../../../../app/lib/api-content";
import { HtmlPage } from "../../../components/html-page";

// One namespace as it stands at an exact engine version: the window from the
// oldest tracked version up to `version`.
export default async function VersionedApiRoute({
  version,
  namespace,
}: PageProps<"/api/[version]/[namespace]">) {
  const window = resolveVersionWindow(apiVersionAxis(TYPES_DIR), version, null);
  if (!window) unstable_notFound();
  const pages = windowedApiPages(window, TYPES_DIR);
  const page = pages.find((entry) => entry.namespace === namespace);
  if (!page) unstable_notFound();
  const html = await renderMarkdown(
    apiPageMarkdown(page, apiLinkify(pages), {
      resolveReplacement: apiReplacementResolver(pages),
      combinedMarkers: true,
      window,
    }),
    {
      highlightSignatureHeadings: true,
      signatureSymbolLinks: apiSignatureSymbolLinks(canonicalApiPages(TYPES_DIR), page, pages),
    },
  );
  return <HtmlPage title={`${namespace} API (${version})`} html={html} />;
}

export async function getConfig() {
  return {
    render: "static",
    staticPaths: versionedApiParams(TYPES_DIR).map(({ version, namespace }) => [
      version,
      namespace,
    ]),
  } as const;
}
