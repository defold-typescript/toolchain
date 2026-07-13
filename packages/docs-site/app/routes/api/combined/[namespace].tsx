import { ssgParams } from "hono/ssg";
import { createRoute } from "honox/factory";
import { combinedParams } from "../../../lib/api-content";
import { redirectHtml } from "../../../lib/api-redirect";
import { withBase } from "../../../lib/base";

// `/api/combined/<namespace>` is now a permanent compatibility redirect to the
// canonical `/api/<namespace>`: Combined owns the unprefixed surface, so a
// previously-published Combined link stays valid via a noindex meta-refresh stub
// (emitted through `c.html` to bypass the indexable renderer chrome). `ssgParams`
// still enumerates every union namespace so each old route materializes its stub.
export default createRoute(
  ssgParams(() => combinedParams()),
  (c) => {
    const namespace = c.req.param("namespace");
    if (!namespace) return c.notFound();
    const base = withBase("/").replace(/\/$/, "");
    return c.html(redirectHtml(`/api/combined/${namespace}`, `/api/${namespace}`, base));
  },
);
