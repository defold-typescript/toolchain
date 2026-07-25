const ENGINE_TYPES = [
  "Hash",
  "Matrix4",
  "Opaque",
  "Quaternion",
  "Url",
  "Vector",
  "Vector3",
  "Vector4",
] as const;
type EngineType = (typeof ENGINE_TYPES)[number];

export interface WrapOptions {
  namespace: string;
  emitted: string;
  importsFrom: string;
}

export interface ModuleWrapOptions extends WrapOptions {
  moduleId: string;
}

// The engine-type import line plus the emitted body with its leading
// `declare namespace` rewritten to `topKeyword` and every line indented two
// spaces — the shared shape both the ambient-global and importable-module wraps
// place inside their envelope.
function prepareWrapBody(
  emitted: string,
  importsFrom: string,
  topKeyword: string,
): { importLine: string; indented: string } {
  const used = collectEngineTypes(emitted);
  const importLine =
    used.length === 0 ? "" : `import type { ${used.join(", ")} } from "${importsFrom}";\n\n`;
  const inner = emitted.replace(/(^|\n)declare\s+namespace\s+/, `$1${topKeyword} `).trimEnd();
  const indented = inner
    .split("\n")
    .map((l) => (l.length === 0 ? l : `  ${l}`))
    .join("\n");
  return { importLine, indented };
}

export function wrapAsAmbientGlobal(opts: WrapOptions): string {
  const { importLine, indented } = prepareWrapBody(opts.emitted, opts.importsFrom, "namespace");
  return `/** @noSelfInFile */\n${importLine}declare global {\n${indented}\n}\n\nexport {};\n`;
}

export function wrapAsModule(opts: ModuleWrapOptions): string {
  const { importLine, indented } = prepareWrapBody(
    opts.emitted,
    opts.importsFrom,
    "export namespace",
  );
  return `/** @noSelfInFile */\n/** @noResolution */\n${importLine}declare module '${opts.moduleId}' {\n${indented}\n}\n`;
}

function collectEngineTypes(emitted: string): EngineType[] {
  return ENGINE_TYPES.filter((t) => new RegExp(`\\b${t}\\b`).test(emitted));
}
