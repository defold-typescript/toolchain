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

export interface AmbientWrapOptions extends WrapOptions {
  // Tags the namespace `@deprecated` with this text.
  deprecated?: string;
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

export function wrapAsAmbientGlobal(opts: AmbientWrapOptions): string {
  const emitted =
    opts.deprecated === undefined ? opts.emitted : withDeprecation(opts.emitted, opts.deprecated);
  const { importLine, indented } = prepareWrapBody(emitted, opts.importsFrom, "namespace");
  return `/** @noSelfInFile */\n${importLine}declare global {\n${indented}\n}\n\nexport {};\n`;
}

// TypeScript reads tags from the last JSDoc only, so the tag joins the
// namespace's own doc block rather than following it in a second one.
function withDeprecation(emitted: string, deprecated: string): string {
  const tag = ` * @deprecated ${deprecated}`;
  let documented = false;
  const out = emitted.replace(/(^|\n) \*\/\n(declare\s+namespace\s)/, (_match, lead, keyword) => {
    documented = true;
    return `${lead} *\n${tag}\n */\n${keyword}`;
  });
  return documented ? out : `/**\n${tag}\n */\n${emitted}`;
}

// The emitted namespace as an ambient `declare module "<namespace>"` tagged
// `@globalTable`, so an import lowers to a local alias of the global the
// extension registers. The description stays a separate JSDoc above the tag,
// since TypeScript reads tags from the last one. The body keeps the namespace's
// indentation, and engine handles resolve as ambient globals, as in
// `wrapAsModule`.
export function wrapAsGlobalTableModule(opts: WrapOptions): string {
  const body = opts.emitted
    .replace(
      /(^|\n)declare\s+namespace\s+[\w$.]+\s*\{/,
      (_match, lead) => `${lead}/** @globalTable */\ndeclare module "${opts.namespace}" {`,
    )
    .trimEnd();
  return `/** @noSelfInFile */\n${body}\n`;
}

// The `@deprecated` text pointing a global's reader at the import. A dotted
// module's local is named after its segments past the first, as the docs site
// names a library import.
export function globalTableImportHint(namespace: string): string {
  const [first, ...rest] = namespace.split(".");
  const local = rest.length === 0 ? first : rest.join("_");
  return `Import it: import * as ${local} from "${namespace}"`;
}

export function wrapAsModule(opts: ModuleWrapOptions): string {
  // ambient-globals-only: the module form references engine handles (`Hash`,
  // `Vector3`, ...) as ambient globals and emits no top-level import. A top-level
  // `import type` would make the `.d.ts` a module, demoting `declare module
  // '<id>'` to an augmentation of an unresolvable specifier that a consumer
  // `import` cannot resolve (`TS2307`). `importsFrom` stays in the signature for
  // caller symmetry but is unused here; `wrapAsAmbientGlobal` still imports it.
  const { indented } = prepareWrapBody(opts.emitted, opts.importsFrom, "export namespace");
  return `/** @noSelfInFile */\n/** @noResolution */\ndeclare module '${opts.moduleId}' {\n${indented}\n}\n`;
}

function collectEngineTypes(emitted: string): EngineType[] {
  return ENGINE_TYPES.filter((t) => new RegExp(`\\b${t}\\b`).test(emitted));
}
