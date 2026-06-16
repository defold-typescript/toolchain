import { htmlToDocText } from "@defold-typescript/types";
import { createRoute } from "honox/factory";
import { apiPages } from "../lib/api-content";
import { withBase } from "../lib/base";

export default createRoute((c) => {
  const pages = apiPages();
  const namespaces = pages.map((p) => p.namespace);
  // Group the index alphabetically and surface each namespace as a card.
  // Card layout matches the Claude docs' reference pages.
  return c.render(
    <article class="prose">
      <h1>API reference</h1>
      <p>
        Generated from the default Defold version's reference documentation.{" "}
        <span class="text-text-muted">
          {namespaces.length} namespace{namespaces.length === 1 ? "" : "s"} documented.
        </span>
      </p>
      <ul class="not-prose mt-8 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
        {pages.map((page) => (
          <li>
            <a
              href={withBase(page.route)}
              class="block rounded-lg border border-border bg-surface px-4 py-3 transition hover:border-border-strong hover:bg-surface-2"
            >
              <span class="font-mono text-[13px] font-semibold text-accent">{page.namespace}</span>
              {page.brief ? (
                <span class="mt-1 block text-sm text-text-muted">{htmlToDocText(page.brief)}</span>
              ) : null}
            </a>
          </li>
        ))}
      </ul>
    </article>,
    { title: "API reference" },
  );
});
