import { htmlToDocText } from "@defold-typescript/types";
import { createRoute } from "honox/factory";
import { apiPages } from "../lib/api-content";
import { withBase } from "../lib/base";

export default createRoute((c) => {
  const pages = apiPages();
  const enginePages = pages.filter((p) => p.category === "engine");
  const luaStdlibPages = pages.filter((p) => p.category === "lua-stdlib");
  // The engine pages are the Defold reference surface (generated from ref-doc.zip);
  // the Lua standard library pages are pure-Lua / LuaJIT surfaces whose types are
  // owned by `lua-types` and are surfaced as their own labelled section so the
  // provenance split stays obvious to a reader landing on the index.
  return c.render(
    <article class="prose">
      <h1>API reference</h1>
      <p>
        Generated from the default Defold version's reference documentation.{" "}
        <span class="text-text-muted">
          {pages.length} namespace{pages.length === 1 ? "" : "s"} documented.
        </span>
      </p>
      <h2>Defold engine</h2>
      <p>
        Namespaces emitted by <code>@defold-typescript/types</code> from the pinned Defold reference
        documentation.
      </p>
      <ul class="not-prose mt-4 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
        {enginePages.map((page) => (
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
      <h2>Lua standard library</h2>
      <p>
        Pure-Lua and LuaJIT surfaces (<code>base</code>, <code>bit</code>, …). Types are provided by
        the <code>lua-types</code> dependency and are not re-emitted by{" "}
        <code>@defold-typescript/types</code>.
      </p>
      <ul class="not-prose mt-4 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
        {luaStdlibPages.map((page) => (
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
