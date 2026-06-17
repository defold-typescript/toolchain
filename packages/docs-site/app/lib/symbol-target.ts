// A symbol reference shows the hover popup only when it points the reader
// *elsewhere* — to a page other than the one being read. This pure predicate
// compares a symbol's reference page against the current path so the island can
// suppress the card on a symbol documented right here (its own `### signature`
// heading and same-page sibling mentions) while keeping it on cross-references
// to other `/api/<namespace>` pages. The caller owns base normalization and
// passes the already-`withBase` route and `location.pathname`.
function stripPage(path: string): string {
  const noAnchor = path.replace(/#.*$/s, "");
  const noTrailingSlash = noAnchor.replace(/\/$/, "");
  return noTrailingSlash === "" ? "/" : noTrailingSlash;
}

export function isSymbolOnCurrentPage(symbolRoute: string, currentPath: string): boolean {
  return stripPage(symbolRoute) === stripPage(currentPath);
}
