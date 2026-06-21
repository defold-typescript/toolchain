import { htmlToDocText } from "@defold-typescript/types";
import type { ApiPage } from "../lib/api-surface";
import { withBase } from "../lib/base";

// One category's card grid. Factored so the three sections share identical
// markup; an empty category is rendered by the caller as nothing at all (a
// sparse non-default version shows only the sections it actually has).
function CardGrid({ pages }: { pages: ApiPage[] }) {
  return (
    <ul class="not-prose mt-4 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
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
  );
}

// The category-grouped API index body, shared by the default `/api` route and
// the per-version `/api/<version>` index. With `version` omitted the output is
// byte-identical to the legacy default index; with `version` set the intro names
// the version and only the non-empty categories render (a non-default surface
// carries engine pages only — the shared core-types stay default-only).
export function ApiIndex({ pages, version }: { pages: ApiPage[]; version?: string }) {
  const enginePages = pages.filter((p) => p.category === "engine");
  const globalTypePages = pages.filter((p) => p.category === "global-type");
  const luaStdlibPages = pages.filter((p) => p.category === "lua-stdlib");
  // The engine pages are the Defold reference surface (generated from ref-doc.zip);
  // the Lua standard library pages are pure-Lua / LuaJIT surfaces whose types are
  // owned by `lua-types` and are surfaced as their own labelled section so the
  // provenance split stays obvious to a reader landing on the index.
  return (
    <article class="prose">
      <h1>{version ? `API reference (${version})` : "API reference"}</h1>
      <p>
        {version
          ? `Generated from the Defold ${version} reference documentation.`
          : "Generated from the default Defold version's reference documentation."}{" "}
        <span class="text-text-muted">
          {pages.length} namespace{pages.length === 1 ? "" : "s"} documented.
        </span>
      </p>
      {enginePages.length > 0 ? (
        <>
          <h2>Defold engine</h2>
          <p>
            Namespaces emitted by <code>@defold-typescript/types</code> from the pinned Defold
            reference documentation.
          </p>
          <CardGrid pages={enginePages} />
        </>
      ) : null}
      {globalTypePages.length > 0 ? (
        <>
          <h2>Global types</h2>
          <p>
            Core value types (<code>Vector3</code>, <code>Quaternion</code>, <code>Hash</code>, …)
            that Defold exposes as ambient globals. Hand-curated from{" "}
            <code>@defold-typescript/types</code> rather than generated from the Defold reference
            documentation.
          </p>
          <CardGrid pages={globalTypePages} />
        </>
      ) : null}
      {luaStdlibPages.length > 0 ? (
        <>
          <h2>Lua standard library</h2>
          <p>
            Pure-Lua and LuaJIT surfaces (<code>base</code>, <code>bit</code>, …). Types are
            provided by the <code>lua-types</code> dependency and are not re-emitted by{" "}
            <code>@defold-typescript/types</code>.
          </p>
          <CardGrid pages={luaStdlibPages} />
        </>
      ) : null}
    </article>
  );
}
