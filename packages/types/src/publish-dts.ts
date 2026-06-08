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

export function wrapAsAmbientGlobal(opts: WrapOptions): string {
  const used = collectEngineTypes(opts.emitted);
  const importLine =
    used.length === 0 ? "" : `import type { ${used.join(", ")} } from "${opts.importsFrom}";\n\n`;
  const inner = opts.emitted.replace(/(^|\n)declare\s+namespace\s+/, "$1namespace ").trimEnd();
  const indented = inner
    .split("\n")
    .map((l) => (l.length === 0 ? l : `  ${l}`))
    .join("\n");
  return `/** @noSelfInFile */\n${importLine}declare global {\n${indented}\n}\n\nexport {};\n`;
}

function collectEngineTypes(emitted: string): EngineType[] {
  return ENGINE_TYPES.filter((t) => new RegExp(`\\b${t}\\b`).test(emitted));
}
