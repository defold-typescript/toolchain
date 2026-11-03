// Reads which change scopes a ci.yml job runs for, from its `if:` condition.

const SCOPE_TERM = /^contains\(needs\.scope\.outputs\.scopes, '([a-z-]+)'\)$/;
const EXPRESSION = /^\$\{\{\s*([\s\S]*?)\s*\}\}$/;

// The scope names a job's `if:` admits. Only an OR of `contains` over the scope
// job's output is modelled; any other condition throws rather than guess.
export function admittedScopes(condition: string): string[] {
  const body = condition.trim().replace(EXPRESSION, "$1");
  return body.split("||").map((term) => {
    const scope = term.trim().match(SCOPE_TERM)?.[1];
    if (scope === undefined) throw new Error(`ci.yml job condition is not modelled: ${condition}`);
    return scope;
  });
}

// Whether a job admitting `admitted` runs when the scope job outputs `scopes`.
// GitHub's `contains` on a string is a case-insensitive substring test.
export function runsFor(admitted: readonly string[], scopes: string): boolean {
  const haystack = scopes.toLowerCase();
  return admitted.some((scope) => haystack.includes(scope.toLowerCase()));
}
