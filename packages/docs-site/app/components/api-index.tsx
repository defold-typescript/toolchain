/** @jsxImportSource hono/jsx */
// Pins the JSX dialect for root `bun test`, which reads no JSX config from the root tsconfig.

import { stripPlatformMarkers } from "@defold-typescript/docs-render/platform-icons";
import { htmlToDocText } from "@defold-typescript/types";
import type { ApiPage } from "../lib/api-surface";
import { renderCardSummary } from "../lib/card-summary";
import type { NamespaceBadgeCounts } from "../lib/combined-surface";
import { getStartedPages } from "../lib/get-started";
import type { GuidePage } from "../lib/guide";
import { groupGuidePages } from "../lib/guide-groups";
import { humanize } from "../lib/nav";
import { apiCardBadgeHtml, apiPageCardDescription, groupApiIndexPages } from "./api-index-sections";
import { LandingCard, LandingCardGrid, LandingPage, LandingSection } from "./landing";

// A card grid of API namespaces. Namespace labels render mono; the card summary
// is the same doc-derived blurb used across the API surface. An empty category
// is rendered by the caller as nothing at all. `badgeHtml` (Combined index only)
// yields per-card availability pills; it defaults to none, so the version index
// stays badge-less.
function ApiCards({
  pages,
  label = (page) => page.namespace,
  badgeHtml,
}: {
  pages: ApiPage[];
  label?: (page: ApiPage) => string;
  badgeHtml?: (page: ApiPage) => string;
}) {
  return (
    <LandingCardGrid>
      {pages.map((page) => {
        const description = apiPageCardDescription(page);
        return (
          <LandingCard
            mono
            href={page.route}
            title={label(page)}
            description={description ? stripPlatformMarkers(htmlToDocText(description)) : null}
            badgeHtml={badgeHtml?.(page) || null}
          />
        );
      })}
    </LandingCardGrid>
  );
}

// Landing-card title precedence mirrors the sidebar: the toc-title override,
// then the body H1, then a humanized slug for a page that carries neither.
function guideCardTitle(page: GuidePage): string {
  return page.tocTitle ?? page.title ?? humanize(page.slug);
}

/** A card of guide/get-started pages: title over the page's lead-paragraph summary. */
function GuideCards({ pages }: { pages: GuidePage[] }) {
  return (
    <LandingCardGrid>
      {pages.map((page) => (
        <LandingCard
          href={page.route}
          title={guideCardTitle(page)}
          descriptionHtml={page.summary ? renderCardSummary(page.summary) : null}
        />
      ))}
    </LandingCardGrid>
  );
}

// The `/get-started` landing. Renders the onboarding pages as cards, sourced
// from the same GET_STARTED_SLUGS that seed the nav category, so the folder's
// root node and its content cannot drift.
export function GetStartedIndex({ pages }: { pages: GuidePage[] }) {
  return (
    <LandingPage
      title="Get started"
      lead={<p>Install the toolchain, scaffold a project, and wire it into the Defold editor.</p>}
    >
      <GuideCards pages={getStartedPages(pages)} />
    </LandingPage>
  );
}

// The category-grouped API index body, shared by the default `/api` route and
// the per-version `/api/<version>` index. With `version` set the intro names the version and only the non-empty categories render. A
// non-default surface carries engine pages plus the version-independent Global
// types, which the route re-adds for display (they keep their default routes and
// stay out of per-version routing/search).
export function ApiIndex({ pages, version }: { pages: ApiPage[]; version?: string }) {
  const {
    globals: globalsPages,
    globalType: globalTypePages,
    luaStdlib: luaStdlibPages,
    engine: enginePages,
  } = groupApiIndexPages(pages);
  const apiPageCount =
    globalsPages.length + globalTypePages.length + luaStdlibPages.length + enginePages.length;
  // The API index mirrors the left-side API tree order: Globals, Global types,
  // Lua Standard, then Defold engine namespaces.
  return (
    <LandingPage
      title={version ? `API reference (${version})` : "API reference"}
      lead={
        <p>
          {version
            ? `Generated from the tracked Defold releases up to ${version}.`
            : "Generated from the default Defold version's reference documentation."}{" "}
          <span class="mt-1 block text-sm text-text-faint">
            {apiPageCount} namespace{apiPageCount === 1 ? "" : "s"} documented.
          </span>
        </p>
      }
    >
      {globalsPages.length > 0 ? (
        <LandingSection
          heading="Globals"
          subtitle="Prefixless globals that Defold exposes to every script."
        >
          <ApiCards pages={globalsPages} />
        </LandingSection>
      ) : null}
      {globalTypePages.length > 0 ? (
        <LandingSection
          heading="Global types"
          subtitle={
            <>
              Core value types (<code>Vector3</code>, <code>Quaternion</code>, <code>Hash</code>, …)
              that Defold exposes as ambient globals. Hand-curated from{" "}
              <code>@defold-typescript/types</code> rather than generated from the Defold reference
              documentation.
            </>
          }
        >
          <ApiCards pages={globalTypePages} />
        </LandingSection>
      ) : null}
      {luaStdlibPages.length > 0 ? (
        <LandingSection
          heading="Lua standard library"
          subtitle={
            <>
              Pure-Lua and LuaJIT surfaces (<code>base</code>, <code>bit</code>, …). Types are
              provided by the <code>lua-types</code> dependency and are not re-emitted by{" "}
              <code>@defold-typescript/types</code>.
            </>
          }
        >
          <ApiCards pages={luaStdlibPages} />
        </LandingSection>
      ) : null}
      {enginePages.length > 0 ? (
        <LandingSection
          heading="Defold engine"
          subtitle={
            <>
              Namespaces emitted by <code>@defold-typescript/types</code> from the pinned Defold
              reference documentation.
            </>
          }
        >
          <ApiCards pages={enginePages} />
        </LandingSection>
      ) : null}
    </LandingPage>
  );
}

// The canonical `/api` landing: every namespace across the tracked
// Defold versions in one surface. Mirrors `ApiIndex`'s four grouped sections
// (Globals, Global types, Lua standard, Defold engine) so the index matches the
// sidebar, but the lead names the versions the union spans and engine cards carry
// per-namespace change badges from `badgeCounts` (Combined-only, so a symbol
// present in every version carries no badge).
export function CombinedIndex({
  pages,
  versions,
  badgeCounts = new Map(),
}: {
  pages: ApiPage[];
  versions: readonly string[];
  badgeCounts?: Map<string, NamespaceBadgeCounts>;
}) {
  const {
    globals: globalsPages,
    globalType: globalTypePages,
    luaStdlib: luaStdlibPages,
    engine: enginePages,
  } = groupApiIndexPages(pages);
  const apiPageCount =
    globalsPages.length + globalTypePages.length + luaStdlibPages.length + enginePages.length;
  const engineBadge = (page: ApiPage) => apiCardBadgeHtml(page, badgeCounts);
  // Newest first, so the axis ends on the last entry. Absence carries meaning
  // here — a symbol present in every tracked version renders no badge — and that
  // is only readable once the page says which versions are tracked and how far
  // back the record goes, so the legend is derived from the same list rather
  // than restated as prose that rots at the next adoption.
  const oldest = versions[versions.length - 1];
  const unmarkedRule = oldest
    ? `A symbol carrying no availability note exists in all of them, and may be older still — Defold ${oldest} is the oldest release this reference covers.`
    : "No release is tracked yet.";
  return (
    <LandingPage
      title="Combined API reference"
      lead={
        <p>
          Every namespace across the tracked Defold versions, unified into one surface. Each symbol
          is annotated with the versions it is available in.
          <span
            class="mt-1 block text-sm text-text-faint"
            data-tracked-versions={versions.join(", ")}
          >
            Tracked releases: {versions.join(", ")}. {unmarkedRule}
          </span>
          <span class="mt-1 block text-sm text-text-faint">
            {apiPageCount} namespace{apiPageCount === 1 ? "" : "s"} documented.
          </span>
        </p>
      }
    >
      {globalsPages.length > 0 ? (
        <LandingSection
          heading="Globals"
          subtitle="Prefixless globals that Defold exposes to every script."
        >
          <ApiCards pages={globalsPages} />
        </LandingSection>
      ) : null}
      {globalTypePages.length > 0 ? (
        <LandingSection
          heading="Global types"
          subtitle={
            <>
              Core value types (<code>Vector3</code>, <code>Quaternion</code>, <code>Hash</code>, …)
              that Defold exposes as ambient globals. Hand-curated from{" "}
              <code>@defold-typescript/types</code> rather than generated from the Defold reference
              documentation.
            </>
          }
        >
          <ApiCards pages={globalTypePages} />
        </LandingSection>
      ) : null}
      {luaStdlibPages.length > 0 ? (
        <LandingSection
          heading="Lua standard library"
          subtitle={
            <>
              Pure-Lua and LuaJIT surfaces (<code>base</code>, <code>bit</code>, …). Types are
              provided by the <code>lua-types</code> dependency and are not re-emitted by{" "}
              <code>@defold-typescript/types</code>.
            </>
          }
        >
          <ApiCards pages={luaStdlibPages} />
        </LandingSection>
      ) : null}
      {enginePages.length > 0 ? (
        <LandingSection
          heading="Defold engine"
          subtitle={
            <>
              Namespaces emitted by <code>@defold-typescript/types</code>, merged across every
              tracked reference-documentation version.
            </>
          }
        >
          <ApiCards pages={enginePages} badgeHtml={engineBadge} />
        </LandingSection>
      ) : null}
    </LandingPage>
  );
}

// The `/guides` landing. Renders the GUIDE_GROUPS as sections — the same shared
// definition that drives the sidebar subgroups, so the two cannot drift.
export function GuidesIndex({ pages }: { pages: GuidePage[] }) {
  const groups = groupGuidePages(pages);
  return (
    <LandingPage
      title="Guides"
      lead={<p>Learn defold-typescript in order — core concepts first, sharp edges last.</p>}
    >
      {groups.map((group) => (
        <LandingSection heading={group.label} subtitle={group.subtitle}>
          <GuideCards pages={group.pages} />
        </LandingSection>
      ))}
    </LandingPage>
  );
}
