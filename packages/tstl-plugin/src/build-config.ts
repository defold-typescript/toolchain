import {
  type BuildConfig,
  DEFAULT_INCLUDE,
  type GlobalShadowsMode,
  parseBuildConfig,
  readGlobalShadowsSetting,
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

// The project's `package.json` `"global-shadows"` setting, read through the
// editor host on every call so an edit applies without a server restart. A
// missing, unparsable or invalid file reads as `"warn"`: the build reports the
// bad value, and a throw here would take the editor's own diagnostics down.
export function readGlobalShadowsFromHost(
  host: SceneReadHost,
  projectRoot: string,
): GlobalShadowsMode {
  const root = projectRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  try {
    const text = host.readFile(`${root}/package.json`);
    return text === undefined ? "warn" : readGlobalShadowsSetting(JSON.parse(text));
  } catch {
    return "warn";
  }
}
