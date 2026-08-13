// The narrow slice of `ts.server.ServerHost` this needs: the real host
// satisfies it structurally, and a test fake is two methods rather than a whole
// server. `readDirectory` is optional because a host may not provide it, and a
// plugin that throws takes the editor's completions down with it.
export interface SceneReadHost {
  readDirectory?(path: string, extensions?: readonly string[]): string[];
  readFile(path: string): string | undefined;
}

const SCENE_EXTENSIONS = [".go", ".collection"];

// The project-relative name a file is keyed by — the same name the editor
// reports for a program file, so a scene's claim on a script can be looked up
// against the file being edited.
export function displayPathOf(projectRoot: string, filePath: string): string {
  const path = filePath.replace(/\\/g, "/");
  const root = projectRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}

// Bob writes `_generated_*.go` copies of the project's scenes under `build/`;
// reading them would report every id twice, against files no author edits. The
// segment test runs on the project-relative path, so a project that itself
// lives under a directory named `build` is not excluded wholesale.
function isBuildOutput(displayPath: string): boolean {
  return displayPath.split("/").includes("build");
}

// Read the project's own scene sources through the editor host — by default the
// `.go`/`.collection` set the component-id universe is built from, or whatever
// `extensions` names instead. The two universes stay disjoint: a `.gui` declares
// node ids, not component ids, so folding it into the default would feed gui
// text to `buildSceneComponentIndex`. Keys are project-relative display paths,
// matching what `buildSceneComponentIndex` reports in `incomplete`, and every
// file that could not be read is named in `unreadable` — a universe with a
// silent hole cannot be reasoned about.
export function readSceneDocuments(
  host: SceneReadHost,
  projectRoot: string,
  extensions: readonly string[] = SCENE_EXTENSIONS,
): { documents: Map<string, string>; unreadable: string[] } {
  const documents = new Map<string, string>();
  const unreadable: string[] = [];

  if (!host.readDirectory) {
    unreadable.push("the editor host cannot enumerate project files, so no scene source was read");
    return { documents, unreadable };
  }

  for (const filePath of host.readDirectory(projectRoot, extensions)) {
    const displayPath = displayPathOf(projectRoot, filePath);
    if (isBuildOutput(displayPath)) continue;
    const text = host.readFile(filePath);
    if (text === undefined) {
      unreadable.push(`${displayPath}: could not be read`);
      continue;
    }
    documents.set(displayPath, text);
  }

  return { documents, unreadable };
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
    if (isBuildOutput(displayPath)) continue;
    if (!extensions.some((extension) => displayPath.endsWith(extension))) continue;
    paths.push(`/${displayPath}`);
  }

  return new Set(paths.sort());
}
