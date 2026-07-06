import { htmlToDocText } from "@defold-typescript/types";
import type { ApiPage } from "../lib/api-surface";
import { withBase } from "../lib/base";
import {
  apiPageCardDescription,
  groupApiIndexPages,
  groupLibraryIndexPages,
} from "./api-index-sections";

// One category's card grid. Factored so the three sections share identical
// markup; an empty category is rendered by the caller as nothing at all (a
// sparse non-default version shows only the sections it actually has).
function CardGrid({ pages }: { pages: ApiPage[] }) {
  return (
    <ul class="not-prose mt-4 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
      {pages.map((page) => {
        const description = apiPageCardDescription(page);
        return (
          <li>
            <a
              href={withBase(page.route)}
              class="block rounded-lg border border-border bg-surface px-4 py-3 transition hover:border-border-strong hover:bg-surface-2"
            >
              <span class="font-mono text-[13px] font-semibold text-accent">
                {page.displayName ?? page.namespace}
              </span>
              {description ? (
                <span class="mt-1 block text-sm text-text-muted">{htmlToDocText(description)}</span>
              ) : null}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

// The category-grouped API index body, shared by the default `/api` route and
// the per-version `/api/<version>` index. Libraries are intentionally excluded
// here because they have their own top-level `/libraries` index; with `version`
// set the intro names the version and only the non-empty categories render (a
// non-default surface carries engine pages only — the shared core-types stay
// default-only).
export function ApiIndex({ pages, version }: { pages: ApiPage[]; version?: string }) {
  const {
    engine: enginePages,
    globalType: globalTypePages,
    luaStdlib: luaStdlibPages,
  } = groupApiIndexPages(pages);
  const apiPageCount = enginePages.length + globalTypePages.length + luaStdlibPages.length;
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
        <span class="mt-1 block text-sm text-text-faint">
          {apiPageCount} namespace{apiPageCount === 1 ? "" : "s"} documented.
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

export function LibraryIndex({
  pages,
  moduleDir,
}: {
  pages: ApiPage[];
  moduleDir: Map<string, string>;
}) {
  const groups = groupLibraryIndexPages(pages, moduleDir);
  const libraryPageCount = groups.reduce((sum, group) => sum + group.pages.length, 0);
  return (
    <article class="prose">
      <h1>Libraries</h1>
      <p>
        Available vendored third-party library API blocks.{" "}
        <span class="mt-1 block text-sm text-text-faint">
          {libraryPageCount} namespace{libraryPageCount === 1 ? "" : "s"} documented.
        </span>
      </p>
      {groups.map((group) => (
        <section>
          <h2>{group.label}</h2>
          <CardGrid pages={group.pages} />
        </section>
      ))}
    </article>
  );
}
