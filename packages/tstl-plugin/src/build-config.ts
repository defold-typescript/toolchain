import {
  type BuildConfig,
  DEFAULT_INCLUDE,
  parseBuildConfig,
  type SceneReadHost,
} from "@defold-typescript/transpiler";

// Alongside output is what the build itself does with no `outDir`, so it is also
// the honest answer when the config cannot be read: a wrong guess would offer
// completions for a resource no scene names, and a throw here would take the
// editor's own completions down with it.
const ALONGSIDE: BuildConfig = { outDir: undefined, include: DEFAULT_INCLUDE };

// The project's `tsconfig.json` as the build reads it, its `extends` bases
// included, fetched through the editor host rather than the filesystem so the
// plugin sees the same unsaved state the editor does.
export function readBuildConfigFromHost(host: SceneReadHost, projectRoot: string): BuildConfig {
  const root = projectRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  try {
    return parseBuildConfig(`${root}/tsconfig.json`, (filePath) => host.readFile(filePath));
  } catch {
    return ALONGSIDE;
  }
}
