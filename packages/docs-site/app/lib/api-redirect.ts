// honox SSG runs on a static host with no server-side 30x, so a superseded route
// cannot answer with a real redirect. The smallest static-host-safe substitute is
// a materialized stub per old route: an immediate `<meta http-equiv="refresh">`,
// a `<link rel="canonical">` pointing at the new route, a `noindex` robots tag so
// the stub never competes in search, a visible `<a>` fallback for no-JS clients,
// and a `location.replace` for JS clients (no history entry, so Back skips it).
//
// `base` is the deploy prefix ("" at a domain root, "/toolchain" on a project
// site); it is prepended to the target so the redirect stays within the mount.
// Pure and dependency-free so a route handler can emit it via `c.html(...)`,
// bypassing the shared renderer whose chrome would make the stub indexable.
export interface CombinedRedirect {
  /** The old `/api/combined…` route that materializes the stub. */
  from: string;
  /** The canonical `/api…` route it redirects to. */
  to: string;
}

// The single source of truth for where every `/api/combined*` compatibility route
// points: the Combined index maps to canonical `/api`, and each
// `/api/combined/<namespace>` maps to the unprefixed canonical `/api/<namespace>`.
// Both the `/api/combined` and `/api/combined/<namespace>` route handlers consume
// this, so a miswired target is a one-place fix (and the migration test pins it).
export function combinedRedirect(namespace?: string): CombinedRedirect {
  return namespace
    ? { from: `/api/combined/${namespace}`, to: `/api/${namespace}` }
    : { from: "/api/combined", to: "/api" };
}

export function redirectHtml(fromPath: string, toPath: string, base = ""): string {
  const to = `${base}${toPath}`;
  const attr = to.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const script = JSON.stringify(to);
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="UTF-8">',
    `<meta http-equiv="refresh" content="0; url=${attr}">`,
    `<link rel="canonical" href="${attr}">`,
    '<meta name="robots" content="noindex">',
    `<title>Redirecting to ${attr}</title>`,
    `<!-- ${fromPath} moved permanently to ${to} -->`,
    `<script>location.replace(${script})</script>`,
    "</head>",
    `<body>This page has moved to <a href="${attr}">${attr}</a>.</body>`,
    "</html>",
  ].join("");
}
