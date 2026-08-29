import { DEFOLD_TYPE_MAP } from "./core-types";

export interface MessageField {
  name: string;
  types: string[];
  optional: boolean;
  doc: string;
}

export interface MessageEntry {
  name: string;
  origin: string;
  description: string;
  payload: MessageField[];
  deprecatedSince?: string;
}

export interface MessageCatalog {
  entries: MessageEntry[];
}

export interface MessageDeprecation {
  origin: string;
  name: string;
  deprecatedSince: string;
}

// Messages sit outside the typed identity surface (no MESSAGE kind in
// ApiSymbolIdentity / the availability matrix), and the per-version message
// fixtures are incomplete, so message deprecations cannot be derived like member
// deprecations. This is the smallest curated overlay: only evidence-backed
// entries, matched by the stable (origin, name) identity, failing closed.
export const MESSAGE_DEPRECATIONS: readonly MessageDeprecation[] = [
  { origin: "camera", name: "acquire_camera_focus", deprecatedSince: "1.13.0" },
  { origin: "camera", name: "release_camera_focus", deprecatedSince: "1.13.0" },
];

// Stamp deprecatedSince onto the catalog entries the overlay names, keyed by
// exact (origin, name). The identity index nests name under origin so origin and
// name never share a delimiter — no separator byte can forge or collide two
// distinct identities. A duplicate catalog identity, a duplicate overlay
// identity, or an overlay entry that matches no catalog message each throws
// rather than silently overwriting or no-op'ing, so an ambiguous surface or a
// stale curation cannot pass unnoticed.
export function applyMessageDeprecations(
  catalog: MessageCatalog,
  overlay: readonly MessageDeprecation[] = MESSAGE_DEPRECATIONS,
): MessageCatalog {
  const entries = catalog.entries.map((entry) => ({ ...entry }));
  const byIdentity = new Map<string, Map<string, MessageEntry>>();
  for (const entry of entries) {
    let byName = byIdentity.get(entry.origin);
    if (!byName) {
      byName = new Map<string, MessageEntry>();
      byIdentity.set(entry.origin, byName);
    }
    if (byName.has(entry.name)) {
      throw new Error(
        `applyMessageDeprecations: duplicate catalog message identity (origin=${entry.origin}, name=${entry.name})`,
      );
    }
    byName.set(entry.name, entry);
  }
  const seenOverlay = new Map<string, Set<string>>();
  for (const dep of overlay) {
    let names = seenOverlay.get(dep.origin);
    if (!names) {
      names = new Set<string>();
      seenOverlay.set(dep.origin, names);
    }
    if (names.has(dep.name)) {
      throw new Error(
        `applyMessageDeprecations: duplicate overlay message identity (origin=${dep.origin}, name=${dep.name})`,
      );
    }
    names.add(dep.name);
    const entry = byIdentity.get(dep.origin)?.get(dep.name);
    if (!entry) {
      throw new Error(
        `applyMessageDeprecations: no catalog message matches (origin=${dep.origin}, name=${dep.name})`,
      );
    }
    entry.deprecatedSince = dep.deprecatedSince;
  }
  return { entries };
}

const TS_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const ENGINE_TYPES = [
  "Hash",
  "Matrix4",
  "Quaternion",
  "Url",
  "Vector",
  "Vector3",
  "Vector4",
] as const;

export function parseMessagesDoc(raw: unknown): MessageCatalog {
  if (!isRecord(raw)) {
    throw new Error(`parseMessagesDoc: expected object, got ${describeKind(raw)}`);
  }
  const rawMessages = raw.messages;
  if (!Array.isArray(rawMessages)) {
    throw new Error(`parseMessagesDoc: missing or invalid "messages" array`);
  }
  const entries: MessageEntry[] = [];
  for (const item of rawMessages) {
    if (!isRecord(item)) continue;
    const name = stringOr(item.name, "");
    if (name === "") continue;
    entries.push({
      name,
      origin: stringOr(item.origin, ""),
      description: stringOr(item.description, ""),
      payload: parsePayload(item.payload),
    });
  }
  return { entries };
}

function parsePayload(raw: unknown): MessageField[] {
  if (!Array.isArray(raw)) return [];
  const fields: MessageField[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const name = stringOr(item.name, "");
    if (name === "") continue;
    const typesRaw = item.types;
    const types = Array.isArray(typesRaw)
      ? typesRaw.filter((t): t is string => typeof t === "string")
      : [];
    fields.push({
      name,
      types,
      optional: item.optional === true,
      doc: stringOr(item.doc, ""),
    });
  }
  return fields;
}

export interface EmitBuiltinMessagesOptions {
  // Where the brand types are reached from. Defaults to the committed
  // `generated/` emit's sibling-relative path; a materialized surface has no
  // `src/` above it and supplies its own surface-root specifier.
  readonly importsFrom?: string;
}

export function emitBuiltinMessages(
  catalog: MessageCatalog,
  opts: EmitBuiltinMessagesOptions = {},
): string {
  const entries = [...catalog.entries].sort((a, b) => a.name.localeCompare(b.name));
  const body = entries.map(emitEntry).join("\n");
  const inner = [
    "declare global {",
    "  interface BuiltinMessages {",
    body,
    "  }",
    "  type BuiltinMessageId = keyof BuiltinMessages;",
    "}",
    "",
    "export {};",
    "",
  ].join("\n");
  const used = collectEngineTypes(inner);
  const importsFrom = opts.importsFrom ?? "../src/core-types";
  const importLine =
    used.length === 0 ? "" : `import type { ${used.join(", ")} } from "${importsFrom}";\n\n`;
  return `${importLine}${inner}`;
}

function emitEntry(entry: MessageEntry): string {
  const key = TS_IDENTIFIER.test(entry.name) ? entry.name : JSON.stringify(entry.name);
  const prefix = entry.deprecatedSince
    ? `    /** @deprecated since ${entry.deprecatedSince} */\n`
    : "";
  if (entry.payload.length === 0) {
    return `${prefix}    ${key}: Record<string, never>;`;
  }
  const fields = entry.payload.map(emitField).join("; ");
  return `${prefix}    ${key}: { ${fields} };`;
}

function emitField(field: MessageField): string {
  const name = TS_IDENTIFIER.test(field.name) ? field.name : JSON.stringify(field.name);
  const optional = field.optional ? "?" : "";
  const ts = field.types.length === 0 ? "unknown" : unionFromTokens(field.types);
  return `${name}${optional}: ${ts}`;
}

function unionFromTokens(tokens: readonly string[]): string {
  const seen = new Set<string>();
  const mapped: string[] = [];
  for (const token of tokens) {
    const ts = mapToken(token);
    if (seen.has(ts)) continue;
    seen.add(ts);
    mapped.push(ts);
  }
  return mapped.join(" | ");
}

function mapToken(token: string): string {
  if (Object.hasOwn(DEFOLD_TYPE_MAP, token)) {
    const mapped = DEFOLD_TYPE_MAP[token];
    if (typeof mapped === "string") return mapped;
  }
  return token;
}

function collectEngineTypes(emitted: string): string[] {
  return ENGINE_TYPES.filter((t) => new RegExp(`\\b${t}\\b`).test(emitted));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function describeKind(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
