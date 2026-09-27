import { type ApiFunction, type ApiParameter, parseDefoldApiDoc } from "../src/api-doc";
import {
  ONE_BASED_PHRASE,
  splitSlotFields,
  ZERO_BASED_PHRASE,
} from "../src/index-slot-classifications";
import { loadApiTargets } from "./regen";

export type IndexSlotEvidence = "name" | "prose-1-based" | "prose-0-based" | "prose-index";

export interface IndexSlotHit {
  readonly key: string;
  readonly evidence: IndexSlotEvidence;
}

const INDEX_NAME = /(^|_)index$|^idx$/i;
const INDEX_WORD = /\bindex\b/i;
const CODE_SPAN = /`([^`]*)`/g;

// Their types come from `lua-types` and keep Lua's own 1-based semantics.
const LUA_STDLIB_NAMESPACES: ReadonlySet<string> = new Set(
  loadApiTargets().flatMap((target) => (target.luaStdlib ?? []).map((lib) => lib.namespace)),
);

function evidenceFor(name: string, prose: string): IndexSlotEvidence | undefined {
  if (ONE_BASED_PHRASE.test(prose)) return "prose-1-based";
  if (ZERO_BASED_PHRASE.test(prose)) return "prose-0-based";
  if (INDEX_NAME.test(name)) return "name";
  if (INDEX_WORD.test(prose.replace(CODE_SPAN, ""))) return "prose-index";
  return undefined;
}

function scanSlot(key: string, slot: ApiParameter, hits: IndexSlotHit[]): void {
  const { prose, fields } = splitSlotFields(slot.doc);
  const own = evidenceFor(slot.name, prose);
  if (own !== undefined) hits.push({ key, evidence: own });
  const seen = new Set<string>();
  for (const field of fields) {
    if (seen.has(field.name)) continue;
    seen.add(field.name);
    const evidence = evidenceFor(field.name, field.prose);
    if (evidence !== undefined) hits.push({ key: `${key}:${field.name}`, evidence });
  }
  for (const field of slot.fields ?? []) {
    if (seen.has(field.name)) continue;
    seen.add(field.name);
    scanSlot(`${key}:${field.name}`, field, hits);
  }
  // A key named only in the slot's prose (`table with ... and \`group_index\``).
  if (slot.types.includes("table")) {
    for (const match of prose.matchAll(CODE_SPAN)) {
      const name = match[1] ?? "";
      if (seen.has(name) || !INDEX_NAME.test(name) || !/^[A-Za-z_]\w*$/.test(name)) continue;
      seen.add(name);
      hits.push({ key: `${key}:${name}`, evidence: "name" });
    }
  }
}

function scanFunction(fn: ApiFunction, hits: IndexSlotHit[]): void {
  for (const slot of fn.parameters) scanSlot(`${fn.name}:param:${slot.name}`, slot, hits);
  for (const slot of fn.returnValues) scanSlot(`${fn.name}:return:${slot.name}`, slot, hits);
}

export function scanIndexSlots(doc: unknown, namespace: string): IndexSlotHit[] {
  if (LUA_STDLIB_NAMESPACES.has(namespace)) return [];
  const module = parseDefoldApiDoc(doc);
  const hits: IndexSlotHit[] = [];
  for (const fn of module.functions) scanFunction(fn, hits);
  for (const typedef of module.typedefs) {
    for (const fn of typedef.functions ?? []) scanFunction(fn, hits);
  }
  const unique = new Map<string, IndexSlotHit>();
  for (const hit of hits) if (!unique.has(hit.key)) unique.set(hit.key, hit);
  return [...unique.values()];
}
