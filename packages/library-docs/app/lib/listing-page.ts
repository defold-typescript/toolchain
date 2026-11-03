import { dependencyStep, releaseEraSuffix } from "@defold-typescript/docs-render/api-page-render";
import { escapeUpstreamText } from "@defold-typescript/docs-render/upstream-text";
import type { LibraryListing } from "./nav";
import { LIBRARY_API_KIND_SENTENCE } from "./no-typed-api-icon";

// A 40-hex commit pin reads as its short sha; a tag or release pin reads verbatim.
function pinLabel(ref: string): string {
  return /^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 7) : ref;
}

// An untyped library's `/libraries/<owner>/<repo>` page body in the typed library
// page's order: the authored lead, the api-kind sentence, the linked GitHub pin
// with the setup steps nested under it, then the optional `Engine APIs` section.
// Only a `standard` adoption opens the steps with the shared dependency step; a
// `fork` listing's authored steps already start from the fork, and an
// `unavailable` one has nothing to install, so theirs number from 1. An Asset
// Portal listing closes the bullets with a link to its portal entry.
export function listingPageMarkdown(listing: LibraryListing): string {
  const repo = `${listing.owner}/${listing.repo}`;
  const standard = listing.adoption === "standard";
  const firstNumber = standard ? 2 : 1;
  const lines = [
    escapeUpstreamText(listing.ships),
    "",
    LIBRARY_API_KIND_SENTENCE[listing.api],
    "",
    `- GitHub: [${repo}](${listing.url}) — pinned to [\`${pinLabel(listing.ref)}\`](${listing.url}/tree/${listing.ref})${releaseEraSuffix(listing.releaseEra)}`,
    ...(standard ? [dependencyStep(listing.url, listing.pinKind, listing.ref)] : []),
    ...listing.steps.map((step, index) => `  ${index + firstNumber}. ${escapeUpstreamText(step)}`),
    ...(listing.portal ? [`- Asset Portal: [${listing.repo}](${listing.portal.url})`] : []),
  ];
  if (listing.engineApis) {
    lines.push("", "## Engine APIs", "", escapeUpstreamText(listing.engineApis));
  }
  return lines.join("\n");
}
