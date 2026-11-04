// The title `library-upstream-check.ts` gives a pin's "moved to" issue. It sits in
// a module that imports nothing, so `library-update-prs.ts`, which runs without an
// install, can recognize those issues by the same format that prints them.

const MOVED_TO = " moved to ";
const REFRESH = " — refresh the pinned library types";
const INTERNAL = " (internal)";

// Keyed on the repo slug, the upstream version and the internal flag so a rerun
// before the bump lands finds the issue it opened last time; folding the pinned
// version in would mint a second issue the moment anything else rotated the pin.
// A go/no-go decision flip does mint a new issue, because the work it asks for
// differs.
export function issueTitleFor(slug: string, upstream: string, internal: boolean): string {
  return `${slug}${MOVED_TO}${upstream}${REFRESH}${internal ? INTERNAL : ""}`;
}

export function isIssueTitle(title: string): boolean {
  const rest = title.endsWith(INTERNAL) ? title.slice(0, -INTERNAL.length) : title;
  if (!rest.endsWith(REFRESH)) return false;
  const head = rest.slice(0, -REFRESH.length);
  const at = head.indexOf(MOVED_TO);
  return at > 0 && at + MOVED_TO.length < head.length;
}
