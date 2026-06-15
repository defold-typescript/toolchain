import { type ApiModule, htmlToDocText } from "@defold-typescript/types";
import { ssgParams } from "hono/ssg";
import { createRoute } from "honox/factory";
import { apiPages } from "../../lib/api-content";
import { apiModuleMarkdown } from "../../lib/api-surface";
import { pageHeadings } from "../../lib/headings";
import { renderMarkdown } from "../../lib/markdown";

function isEmptyModule(m: ApiModule): boolean {
  return (
    m.functions.length === 0 &&
    m.variables.length === 0 &&
    m.constants.length === 0 &&
    m.properties.length === 0
  );
}

export default createRoute(
  ssgParams(() => apiPages().map((page) => ({ namespace: page.namespace }))),
  async (c) => {
    const namespace = c.req.param("namespace");
    const page = apiPages().find((entry) => entry.namespace === namespace);
    if (!page) return c.notFound();

    const body = apiModuleMarkdown(page);
    if (isEmptyModule(page.module)) {
      // Honest empty state: the namespace exists, the fixture for it just
      // hasn't been populated with elements yet. Don't pretend there's
      // content — show the brief and a quiet "not yet documented" card.
      return c.render(
        <article class="prose">
          <h1>{page.module.namespace}</h1>
          {page.module.brief ? <p>{htmlToDocText(page.module.brief)}</p> : null}
          <div class="not-prose mt-6 rounded-lg border border-dashed border-border bg-surface px-5 py-6 text-sm text-text-muted">
            <p class="font-medium text-text">No symbols documented yet</p>
            <p class="mt-1">
              The Defold reference fixture for this namespace ships with no elements, so the
              reference surface for it is empty. Once a populated fixture lands, the page picks up
              functions, variables, constants, and properties automatically.
            </p>
          </div>
        </article>,
        { title: `${page.module.namespace} API` },
      );
    }

    const html = await renderMarkdown(body);
    return c.render(<article class="prose" dangerouslySetInnerHTML={{ __html: html }} />, {
      title: `${page.module.namespace} API`,
      headings: pageHeadings(html),
    });
  },
);
