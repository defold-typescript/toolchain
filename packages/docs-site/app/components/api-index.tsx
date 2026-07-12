import { htmlToDocText } from "@defold-typescript/types";
import type { ApiPage } from "../lib/api-surface";
import { renderCardSummary } from "../lib/card-summary";
import { getStartedPages } from "../lib/get-started";
import type { GuidePage } from "../lib/guide";
import { groupGuidePages } from "../lib/guide-groups";
import { humanize } from "../lib/nav";
import {
  apiPageCardDescription,
  groupApiIndexPages,
  groupLibraryIndexByCreator,
} from "./api-index-sections";
import { LandingCard, LandingCardGrid, LandingPage, LandingSection } from "./landing";

// A card grid of API namespaces. Namespace labels render mono; the card summary
// is the same doc-derived blurb used across the API surface. An empty category
// is rendered by the caller as nothing at all.
function ApiCards({
  pages,
  label = (page) => page.displayName ?? page.namespace,
}: {
  pages: ApiPage[];
  label?: (page: ApiPage) => string;
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
            description={description ? htmlToDocText(description) : null}
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
// the per-version `/api/<version>` index. Libraries are intentionally excluded
// here because they have their own top-level `/libraries` index; with `version`
// set the intro names the version and only the non-empty categories render. A
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
            ? `Generated from the Defold ${version} reference documentation.`
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

// The `/api/combined` landing: every engine namespace across the tracked Defold
// versions in one surface. Documentation-only — the same card grid as the
// per-version index, but the lead names the versions the union spans and the
// availability convention (a symbol present in every version carries no badge).
export function CombinedIndex({
  pages,
  versions,
}: {
  pages: ApiPage[];
  versions: readonly string[];
}) {
  return (
    <LandingPage
      title="Combined API reference"
      lead={
        <p>
          Every engine namespace across the tracked Defold versions ({versions.join(", ")}), unified
          into one surface. Each symbol is annotated with the versions it is available in; a symbol
          present in every version carries no badge.
          <span class="mt-1 block text-sm text-text-faint">
            {pages.length} namespace{pages.length === 1 ? "" : "s"} documented.
          </span>
        </p>
      }
    >
      {pages.length > 0 ? (
        <LandingSection
          heading="Defold engine"
          subtitle={
            <>
              Namespaces emitted by <code>@defold-typescript/types</code>, merged across every
              tracked reference-documentation version.
            </>
          }
        >
          <ApiCards pages={pages} />
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

// A library namespace's full lineage as one line: dimmed `creator/dir/` path
// with the namespace itself emphasised (mono, accent), so a card or page header
// carries the whole tree the sidebar shows without a separate level per line.
// The `creator` segment is dropped when it equals the dir (a dir with no owner).
export function LibraryPath({
  creator,
  dir,
  namespace,
}: {
  creator: string;
  dir: string;
  namespace: string;
}) {
  return (
    <>
      {creator && creator !== dir ? (
        <>
          <span class="font-normal text-text-muted">{creator}</span>
          <span class="font-normal text-text-faint/25">/</span>
        </>
      ) : null}
      <span class="font-normal text-text-muted">{dir}</span>
      <span class="font-normal text-text-faint/25">/</span>
      <span class="font-mono font-semibold text-accent">{namespace}</span>
    </>
  );
}

export function LibraryIndex({
  pages,
  moduleDir,
  owners,
}: {
  pages: ApiPage[];
  moduleDir: Map<string, string>;
  owners: Map<string, string>;
}) {
  const groups = groupLibraryIndexByCreator(pages, moduleDir, owners);
  const total = groups.reduce(
    (sum, group) => sum + group.libraries.reduce((acc, lib) => acc + lib.pages.length, 0),
    0,
  );
  return (
    <LandingPage
      title="Libraries"
      lead={
        <p>
          Third-party library API blocks.
          <br />
          They are built on the TypeScript definitions maintained by the{" "}
          <a href="https://github.com/ts-defold/library">ts-defold/library</a> project.
          <br />
          <span class="mt-1 block text-sm text-text-faint">
            {total} namespace{total === 1 ? "" : "s"} documented.
          </span>
        </p>
      }
    >
      {groups.map((group) => (
        // One section per creator (like the API index's topic sections); the
        // creator heads the block, so each card shows only `dir/namespace`.
        <LandingSection heading={group.label}>
          <LandingCardGrid>
            {group.libraries.flatMap((lib) =>
              lib.pages.map((page) => (
                <LandingCard
                  mono
                  href={page.route}
                  title={<LibraryPath creator="" dir={lib.label} namespace={page.namespace} />}
                  description={apiPageCardDescription(page) || null}
                />
              )),
            )}
          </LandingCardGrid>
        </LandingSection>
      ))}
    </LandingPage>
  );
}
