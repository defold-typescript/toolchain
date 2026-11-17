import { withBase } from "@defold-typescript/docs-render/base";
import type { PageProps } from "waku/router";
import { combinedRedirect } from "../../../../app/lib/api-redirect";
import { apiStaticPaths } from "../../../../app/lib/api-routes";

// The old Combined namespace pages are permanent redirects to the canonical ones.
// A static host has no server-side 30x, so the page redirects itself.
export default function CombinedRedirectRoute({
  namespace,
}: PageProps<"/api/combined/[namespace]">) {
  const to = withBase(combinedRedirect(namespace).to);
  return (
    <>
      <meta httpEquiv="refresh" content={`0; url=${to}`} />
      <link rel="canonical" href={to} />
      <p>
        Moved to <a href={to}>{to}</a>.
      </p>
    </>
  );
}

export async function getConfig() {
  return { render: "static", staticPaths: apiStaticPaths().combined } as const;
}
