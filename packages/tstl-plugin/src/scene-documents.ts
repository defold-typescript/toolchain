import { isDefignoredPath } from "@defold-typescript/transpiler";

// The narrow slice of `ts.server.ServerHost` this needs: the real host
// satisfies it structurally, and a test fake is two methods rather than a whole
// server. `readDirectory` is optional because a host may not provide it, and a
// plugin that throws takes the editor's completions down with it.
export interface SceneReadHost {
  readDirectory?(path: string, extensions?: readonly string[]): string[];
  readFile(path: string): string | undefined;
}

export const SCENE_EXTENSIONS = [".go", ".collection"];

// The extension sets more than one reader asks the host for. They live here
// rather than beside either caller because the index cache serves exactly the
// sets it is handed: a second definition that drifted would walk — and watch —
// a universe the other reader never invalidates.
export const GUI_EXTENSIONS = [".gui"];
export const INPUT_BINDING_EXTENSIONS = [".input_binding"];

// The walk returns every `.project` the project holds, so the lookup is by
// display path — a vendored `*.project` declares keys this project's readers
// cannot resolve.
export const PROJECT_EXTENSIONS = [".project"];
export const GAME_PROJECT_DOCUMENT = "game.project";

// The project-relative name a file is keyed by — the same name the editor
// reports for a program file, so a scene's claim on a script can be looked up
// against the file being edited.
export function displayPathOf(projectRoot: string, filePath: string): string {
  const path = filePath.replace(/\\/g, "/");
  const root = projectRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}

// What both walks exclude is what Defold does not load as a project resource:
// `build/` output, plus the directories the scaffolded `.defignore` names
// (`isDefignoredPath`, root-anchored because a `.defignore` line is a
// root-relative path).
//
// Bob writes `_generated_*.go` copies of the project's scenes under `build/`;
// reading them would report every id twice, against files no author edits. The
// segment test runs on the project-relative path, so a project that itself
// lives under a directory named `build` is not excluded wholesale — a different
// rule from `.defignore`'s, because bob writes those copies below whatever
// depth it is pointed at.
function isBuildOutput(displayPath: string): boolean {
  return displayPath.split("/").includes("build");
}

// The single rule, exported because the index cache filters watch events with
// it: a copy in the watcher could drift from what the walks exclude, and an
// event the walk would have ignored is exactly the event that must not throw the
// cache away — bob writes `_generated_*.go` throughout a build.
export function isExcludedProjectPath(displayPath: string): boolean {
  return isBuildOutput(displayPath) || isDefignoredPath(displayPath);
}

// Read the project's own scene sources through the editor host — by default the
// `.go`/`.collection` set the component-id universe is built from, or whatever
// `extensions` names instead. The two universes stay disjoint: a `.gui` declares
// node ids, not component ids, so folding it into the default would feed gui
// text to `buildSceneComponentIndex`. Keys are project-relative display paths,
// matching what `buildSceneComponentIndex` reports in `incomplete`, and every
// file that could not be read is named in `unreadable` — a universe with a
// silent hole cannot be reasoned about. `paths` names the host paths actually
// read — what a watcher must be registered on, which cannot be reconstructed
// from a display path for a file outside the project root.
export function readSceneDocuments(
  host: SceneReadHost,
  projectRoot: string,
  extensions: readonly string[] = SCENE_EXTENSIONS,
): { documents: Map<string, string>; unreadable: string[]; paths: string[] } {
  const documents = new Map<string, string>();
  const unreadable: string[] = [];
  const paths: string[] = [];

  if (!host.readDirectory) {
    unreadable.push("the editor host cannot enumerate project files, so no scene source was read");
    return { documents, unreadable, paths };
  }

  for (const filePath of host.readDirectory(projectRoot, extensions)) {
    const displayPath = displayPathOf(projectRoot, filePath);
    if (isExcludedProjectPath(displayPath)) continue;
    const text = host.readFile(filePath);
    if (text === undefined) {
      unreadable.push(`${displayPath}: could not be read`);
      continue;
    }
    documents.set(displayPath, text);
    paths.push(filePath);
  }

  return { documents, unreadable, paths };
}

// The project's own files of the given kinds, as the `/`-prefixed
// project-relative paths a Defold resource property names. Nothing is read: a
// resource path is the whole suggestion, so the walk is the entire universe.
//
// The extension filter is re-applied rather than trusted. `readSceneDocuments`
// can take the host at its word because a wrong document merely contributes no
// ids, but here a wrong file *is* the suggestion — a host that ignored its
// `extensions` argument would turn a `.font` slot into a project-wide file dump.
export function listProjectResourcePaths(
  host: SceneReadHost,
  projectRoot: string,
  extensions: readonly string[],
): Set<string> {
  if (!host.readDirectory) return new Set();

  const paths: string[] = [];
  for (const filePath of host.readDirectory(projectRoot, extensions)) {
    const displayPath = displayPathOf(projectRoot, filePath);
    if (isExcludedProjectPath(displayPath)) continue;
    if (!extensions.some((extension) => displayPath.endsWith(extension))) continue;
    paths.push(`/${displayPath}`);
  }

  return new Set(paths.sort());
}
