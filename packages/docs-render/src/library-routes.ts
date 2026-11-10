// The library docs site addresses each page by where its library lives, never by
// an internal page key: an API page at `/api/<host>/<owner>/<repo>/<namespace>`
// and an untyped listing at `/libraries/<host>/<owner>/<repo>`, every segment
// lowercased. The host is the forge's (`github.com`, `codeberg.org`), so one
// owner and repo on two forges are two libraries with two addresses. A default
// port drops out of the host; any other port is refused, since its `:` is no
// file-name character and library data refuses one too.

const WINDOWS_DEVICE_STEM = /^(?:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)/i;

// One route segment that is also one portable file name, the rule
// `isSafePageKey` (`packages/cli/src/library/sync-defold-extensions.ts`) applies
// to page keys.
function isSafeRouteSegment(segment: string): boolean {
  return (
    /^[A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_])?$/.test(segment) &&
    !WINDOWS_DEVICE_STEM.test(segment)
  );
}

function routeSegment(segment: string, repoUrl: string): string {
  if (!isSafeRouteSegment(segment)) {
    throw new Error(
      `library route for ${repoUrl}: ${JSON.stringify(segment)} is not one safe route and file-name segment`,
    );
  }
  return segment.toLowerCase();
}

function originSegments(repoUrl: string): string[] {
  const path = /^https?:\/\/[^/]+\/(.*)$/.exec(repoUrl)?.[1] ?? "";
  const [owner = "", repo = ""] = path.split("/");
  if (owner === "" || repo === "") {
    throw new Error(`library route: ${JSON.stringify(repoUrl)} names no owner and repo`);
  }
  const host = new URL(repoUrl).host;
  return [routeSegment(host, repoUrl), routeSegment(owner, repoUrl), routeSegment(repo, repoUrl)];
}

export function libraryApiRoute(repoUrl: string, namespace: string): string {
  return `/api/${[...originSegments(repoUrl), routeSegment(namespace, repoUrl)].join("/")}`;
}

export function libraryListingRoute(repoUrl: string): string {
  return `/libraries/${originSegments(repoUrl).join("/")}`;
}
