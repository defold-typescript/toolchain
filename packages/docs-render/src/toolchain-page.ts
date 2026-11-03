import {
  apiLinkify,
  apiPageMarkdown,
  apiReplacementResolver,
  apiSignatureSymbolLinks,
} from "./api-page-render";
import { type NamespaceBadgeCounts, namespaceBadgeCounts } from "./combined-surface";
import { renderMarkdown } from "./markdown";
import { apiNamespaceOwner, canonicalApiPages, combinedSurface } from "./toolchain-surface";

// The toolchain docs' canonical `/api/<ns>` page render, kept apart from the
// surface in `toolchain-surface.ts` so a reader of the surface alone (the release
// scripts) does not pull in the markdown renderer and its JSX components.

export const COUNT_KINDS: {
  readonly flag: keyof NamespaceBadgeCounts;
  readonly kind: string;
  readonly noun: string;
}[] = [
  { flag: "new", kind: "new", noun: "new" },
  { flag: "changed", kind: "changed", noun: "changed" },
  { flag: "deprecated", kind: "deprecated", noun: "deprecated" },
];

// The count pills for a Combined namespace: one pill per non-zero category
// showing its tally and category noun as visible text (`12 new`), the
// `aria-label` spelling it out for assistive tech so color stays additive rather
// than the sole signal. The wrapper is an inline `<span>` (not a block `<div>`)
// so the group rides the namespace-page H1 baseline and the `/api` index card
// title row instead of wrapping to its own line. Returns `""` when every count
// is zero (a fully stable namespace shows nothing).
export function namespaceCountBadges(counts: NamespaceBadgeCounts): string {
  const pills = COUNT_KINDS.filter((c) => counts[c.flag] > 0).map(
    (c) =>
      `<span class="api-badge-count api-badge-count--${c.kind}" aria-label="${counts[c.flag]} ${c.noun} symbols">${counts[c.flag]} ${c.noun}</span>`,
  );
  if (pills.length === 0) return "";
  return `<span class="api-badge-counts" aria-label="Availability summary">${pills.join("")}</span>`;
}

// The article HTML of one canonical `/api/<ns>` page, or `undefined` for a
// namespace the canonical surface does not hold. The toolchain route renders it,
// and the library site's link test reads the heading ids it mints.
export async function renderCanonicalApiPage(
  namespace: string,
  typesDir: string,
): Promise<string | undefined> {
  const owner = apiNamespaceOwner(namespace, typesDir);
  if (!owner) return undefined;
  const pages = canonicalApiPages(typesDir);
  const page = pages.find((entry) => entry.namespace === namespace);
  if (!page) return undefined;

  // The linkify + replacement registry span the whole canonical surface, so a
  // prose mention or a deprecation replacement resolves to its canonical route.
  const linkify = apiLinkify(pages);
  const resolveReplacement = apiReplacementResolver(pages);
  // Deep-link `Opaque` brand tokens in rendered signatures to this surface's
  // `/api/Opaque` Reference page, and this page's own typedef shapes to their
  // headings on it. Both render sites below render this same page.
  const signatureSymbolLinks = apiSignatureSymbolLinks(pages, page);

  // A Combined engine namespace renders with the availability markers and the
  // namespace-title count pills; a version-independent namespace (global type,
  // Lua stdlib) renders plainly.
  const combinedMarkers = owner === "combined-engine";
  const surface = combinedSurface(typesDir);
  const model = combinedMarkers
    ? surface.namespaces.find((n) => n.namespace === namespace)
    : undefined;
  // The canonical route is the full range by definition, so it states that
  // window explicitly rather than leaning on the option's default: the counts
  // and the dots then read from the same declared range.
  const axis = surface.versions;
  const window = { from: axis[axis.length - 1] ?? "", to: axis[0] ?? "" };
  const titleBadges = model ? namespaceCountBadges(namespaceBadgeCounts(model, window)) : "";

  return renderMarkdown(
    apiPageMarkdown(page, linkify, {
      resolveReplacement,
      titleBadges,
      combinedMarkers,
      window,
    }),
    { highlightSignatureHeadings: true, signatureSymbolLinks },
  );
}
