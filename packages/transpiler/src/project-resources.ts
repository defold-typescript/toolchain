// The Defold editor and bob read neither `.gitignore` nor `.vscode`; they scan
// the whole project tree for resources. `.defignore` (one root-relative path per
// line) is how a project tells them to skip a folder. These three carry files
// the editor would otherwise misread as project resources: `node_modules`
// dependency trees, the resolver-generated `.defold-types` LuaLS surface, and
// `.vscode` config plus the multi-MB debug engine binary. `src/` is never
// listed — its emitted `.ts.script`/`.gui_script`/`.lua` components are exactly
// what Defold must load. Committed config (not in `GITIGNORE_LINES`, like
// `.vscode`).
export const SCAFFOLDED_DEFIGNORE_LINES = ["/node_modules", "/.defold-types", "/.vscode"];

// Whether a project-relative display path lies under one of the lines `init`
// scaffolds. Root-anchored, because a `.defignore` line is a root-relative
// path: `assets/node_modules/tiles.atlas` is a resource Defold loads.
export function isDefignoredPath(displayPath: string): boolean {
  const rooted = `/${displayPath.replace(/^\/+/, "")}`;
  return SCAFFOLDED_DEFIGNORE_LINES.some(
    (line) => rooted === line || rooted.startsWith(`${line}/`),
  );
}
