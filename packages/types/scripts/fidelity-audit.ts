import { resolve } from "node:path";
import { DEFOLD_TYPE_MAP } from "../src/core-types";
import {
  ARBITRARY_TABLE_SLOTS,
  applyNestedFieldCurations,
  buildTableDocResolver,
  HOMOGENEOUS_ARRAY_SLOTS,
  MAPPING_TABLE_SLOTS,
  type NestedMapping,
  parseTableFields,
  recoverCallbackSignature,
  TABLE_SLOT_CURATIONS,
  type TableSlotCuration,
  TS_IDENTIFIER,
} from "../src/emit-dts";
import { parseMessagesDoc } from "../src/emit-messages";
import {
  collectConstantFqns,
  generateModuleDeclaration,
  MESSAGES_MANIFEST,
  MODULE_MANIFEST,
  type ModuleManifestEntry,
} from "./regen";

const NO_KNOWN_CONSTANTS: ReadonlySet<string> = new Set();

// These message names are typed by builtin-messages-typing's separate surface
// (BuiltinMessages), so a fixture `MESSAGE` element of the same name is not a
// namespace-API loss — it is reclassified out of droppedElements below.
const BUILTIN_MESSAGE_NAMES: ReadonlySet<string> = new Set(
  parseMessagesDoc(MESSAGES_MANIFEST.doc).entries.map((e) => e.name),
);

export interface FidelityEntry {
  droppedElements: number;
  unknownTokens: string[];
  recordTables: number;
  multiReturn: number;
  droppedMembers: number;
  optionalAsRequired: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function elementsOf(doc: unknown): Record<string, unknown>[] {
  if (!isRecord(doc) || !Array.isArray(doc.elements)) return [];
  return doc.elements.filter(isRecord);
}

function stringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
}

function paramList(raw: unknown): Record<string, unknown>[] {
  return Array.isArray(raw) ? raw.filter(isRecord) : [];
}

function docString(raw: unknown): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

function isDocOptional(param: Record<string, unknown>): boolean {
  return param.is_optional === "True" || stringArray(param.types).includes("nil");
}

function trailingOptionalCutoff(params: readonly Record<string, unknown>[]): number {
  let cutoff = params.length;
  for (let i = params.length - 1; i >= 0; i -= 1) {
    const p = params[i];
    if (p && isDocOptional(p)) cutoff = i;
    else break;
  }
  return cutoff;
}

function auditEntry(
  entry: ModuleManifestEntry,
  knownConstantFqns: ReadonlySet<string>,
): FidelityEntry {
  const skipFunctions = new Set(entry.skipFunctions ?? []);
  const elements = elementsOf(entry.doc);

  let droppedElements = 0;
  let recordTables = 0;
  // multiReturn is fully recovered: emitReturn emits LuaMultiReturn<[...]> for
  // every >1-return function, so no documented multi-return is a loss anymore.
  const multiReturn = 0;
  let optionalAsRequired = 0;
  const unknown = new Set<string>();

  const constantFqns = new Set<string>();
  for (const element of elements) {
    if (element.type === "CONSTANT" && typeof element.name === "string") {
      constantFqns.add(element.name);
    }
  }

  // Same module-scoped resolver the emitter builds, so a cross-reference table
  // slot is recovered (not counted under recordTables) in lockstep with the
  // emitted surface.
  const resolver = buildTableDocResolver(
    elements
      .filter((element) => element.type === "FUNCTION" && typeof element.name === "string")
      .map((element) => ({
        name: element.name as string,
        slots: [...paramList(element.parameters), ...paramList(element.returnvalues)].map(
          (slot) => ({ types: stringArray(slot.types), doc: docString(slot.doc) ?? "" }),
        ),
      })),
  );

  const considerTypes = (
    types: readonly string[],
    doc?: string,
    arbitraryTable = false,
    mappingSlot?: { key: string; value: string },
    homogeneousElement?: string | readonly string[],
    tableSlotCuration?: TableSlotCuration,
    slot?: { element: string; kind: "param" | "return"; name: string },
  ) => {
    for (const token of types) {
      // A `table` slot whose doc carries a parseable `<dl>` field list is
      // recovered by emit-dts into an inline object type, so it no longer
      // collapses to `Record`: don't count it under recordTables. Instead feed
      // each recovered field's types back through considerTypes so an unmapped
      // field token still surfaces under unknownTokens and a nested `table`
      // field (no doc → not recovered) still counts under recordTables. This
      // keeps the invariant that every loss in the emitted surface is measured.
      if (token === "table") {
        // A mapping-table slot is recovered by emit-dts into `LuaMap<K, V>` from
        // the curated key/value tokens — not a `Record`, so don't count it.
        // Feed the curated tokens back through considerTypes so an unmapped one
        // still surfaces under unknownTokens (none today: hash/node/vector3 map).
        if (tableSlotCuration?.kind === "mapping") {
          // A single-token value feeds straight back; an object-valued mapping
          // (`LuaMap<K, { … }>`) feeds the key plus each curated field type, the
          // same way the object branch does; a nested-mapping value
          // (`LuaMap<K, LuaMap<K, V>>`) feeds the outer key plus the inner
          // key/value tokens — so an unmapped token in any arm still surfaces.
          if (typeof tableSlotCuration.value === "string") {
            // The value may be a `T | U` union token (render.clear's
            // `number | vector4`); split on `|` exactly as the emit branch does
            // so each token is checked against DEFOLD_TYPE_MAP individually and a
            // single-token value is unaffected.
            considerTypes([
              tableSlotCuration.key,
              ...tableSlotCuration.value.split("|").map((token) => token.trim()),
            ]);
          } else if (Array.isArray(tableSlotCuration.value)) {
            considerTypes([tableSlotCuration.key]);
            for (const field of tableSlotCuration.value) {
              if (field.fields !== undefined) {
                for (const nested of field.fields) {
                  if (nested.numberList === true) continue;
                  considerTypes(nested.types);
                }
              } else if (field.numberList !== true) {
                considerTypes(field.types);
              }
            }
          } else {
            const nested = tableSlotCuration.value as NestedMapping;
            considerTypes([tableSlotCuration.key, nested.key, nested.value]);
          }
          continue;
        }
        if (mappingSlot !== undefined) {
          considerTypes([mappingSlot.key, mappingSlot.value]);
          continue;
        }
        // A homogeneous-array slot is recovered by emit-dts into `T[]` (or a
        // `(A | B)[]` union element) from the curated element token(s) — not a
        // `Record`, so don't count it. Feed the curated token(s) back through
        // considerTypes so an unmapped one still surfaces under unknownTokens
        // (none today: number/hash/string/url map).
        if (tableSlotCuration?.kind === "array") {
          considerTypes(
            typeof tableSlotCuration.element === "string"
              ? [tableSlotCuration.element]
              : tableSlotCuration.element,
          );
          continue;
        }
        if (tableSlotCuration?.kind === "object" || tableSlotCuration?.kind === "array-object") {
          for (const field of tableSlotCuration.fields) {
            if (field.fields !== undefined) {
              for (const nested of field.fields) {
                if (nested.numberList === true) continue;
                considerTypes(nested.types);
              }
            } else if (field.numberList !== true) {
              considerTypes(field.types);
            }
          }
          continue;
        }
        if (homogeneousElement !== undefined) {
          considerTypes(
            typeof homogeneousElement === "string" ? [homogeneousElement] : homogeneousElement,
          );
          continue;
        }
        const parsed = doc !== undefined ? parseTableFields(doc, resolver) : null;
        const fields =
          parsed !== null && slot !== undefined
            ? applyNestedFieldCurations(slot.element, slot.kind, slot.name, parsed)
            : parsed;
        if (fields !== null) {
          // A recovered field carrying nested fields (the mixed `<dl>`+`<ul>`
          // shape, or an injected nested-field curation) emits a nested object,
          // not a `Record` — recurse into the nested field types instead of
          // counting the nested `table`. A nested number-list member is recovered
          // as `number[]`, so skip it the same way the top-level branch does.
          // The function-level arbitraryTable / mappingSlot / homogeneousElement
          // flags propagate to the recursion so a slot on an ARBITRARY_TABLE_SLOTS
          // element (or any other function-level reclassification) does not
          // re-count its parsed sub-tables. The parser-recovered field has no
          // tableSlotCuration, so the per-slot curation lookup is irrelevant
          // here.
          for (const field of fields) {
            if (field.fields !== undefined) {
              for (const nested of field.fields) {
                if (nested.numberList === true) continue;
                considerTypes(nested.types, undefined, arbitraryTable);
              }
            } else if (field.numberList === true) {
              // Recovered as `number[]` by inlineTableType — no longer a
              // `Record`, so skip it. Re-counting its `table` token here would
              // double-count a slot the emitted surface no longer loses.
            } else {
              considerTypes(field.types, undefined, arbitraryTable);
            }
          }
          continue;
        }
        // A slot on a serialization/JSON passthrough function is a genuinely
        // arbitrary lua table — its emitted `Record<string | number, unknown>`
        // is faithful, not a loss — so it is not counted under recordTables.
        if (arbitraryTable) continue;
        recordTables += 1;
        continue;
      }
      // `nil` is the optional-parameter sentinel (emitParameter strips it), not a
      // real Defold type the mapper fails to resolve — the optionalAsRequired
      // category covers that loss instead. Constant FQNs defined in this module
      // (constantFqns) or in any other manifest module (knownConstantFqns) now
      // resolve to their brand type, and `function(...)` callback signatures
      // recover to typed functions, so none is an unknown token.
      if (
        token !== "nil" &&
        !Object.hasOwn(DEFOLD_TYPE_MAP, token) &&
        !constantFqns.has(token) &&
        !knownConstantFqns.has(token) &&
        recoverCallbackSignature(token) === null
      ) {
        unknown.add(token);
      }
    }
  };

  for (const element of elements) {
    const type = element.type;
    // An identifier-named TYPEDEF is recovered into a per-namespace
    // `type <name> = Opaque<"<name>">` alias, under the same TS_IDENTIFIER guard
    // the emitter uses, so the gate and the emitted surface agree. A
    // non-identifier TYPEDEF cannot become an alias and stays dropped.
    if (
      type === "TYPEDEF" &&
      typeof element.name === "string" &&
      TS_IDENTIFIER.test(element.name)
    ) {
      continue;
    }
    // A MESSAGE element whose name is in the builtin-messages catalog is a
    // built-in message owned by builtin-messages-typing, not a namespace-API
    // member — counting it here double-counts a surface that is fully typed
    // elsewhere. A MESSAGE name absent from the catalog falls through to the
    // catch-all and still counts, so the gate stays honest.
    if (
      type === "MESSAGE" &&
      typeof element.name === "string" &&
      BUILTIN_MESSAGE_NAMES.has(element.name)
    ) {
      continue;
    }
    if (type !== "FUNCTION" && type !== "VARIABLE" && type !== "CONSTANT" && type !== "PROPERTY") {
      droppedElements += 1;
      continue;
    }
    // PROPERTY is recovered into the per-namespace `interface properties` block;
    // its name+type survive, so it is no longer a dropped element.
    if (type === "CONSTANT" || type === "PROPERTY") continue;
    if (type === "VARIABLE") {
      considerTypes(stringArray(element.types));
      continue;
    }
    // Skipped functions are measured as droppedMembers only; counting their
    // params/returns here would double-count losses covered by hand-written d.ts.
    if (typeof element.name === "string" && skipFunctions.has(stripNamespace(element.name))) {
      continue;
    }
    const params = paramList(element.parameters);
    const returns = paramList(element.returnvalues);
    const cutoff = trailingOptionalCutoff(params);
    const arbitraryTable =
      typeof element.name === "string" && ARBITRARY_TABLE_SLOTS.has(element.name);
    const mappingSlot =
      typeof element.name === "string" ? MAPPING_TABLE_SLOTS.get(element.name) : undefined;
    const homogeneousElement =
      typeof element.name === "string" ? HOMOGENEOUS_ARRAY_SLOTS.get(element.name) : undefined;
    params.forEach((param, index) => {
      const tableSlotCuration =
        typeof element.name === "string" && typeof param.name === "string"
          ? TABLE_SLOT_CURATIONS.get(tableSlotKey(element.name, "param", param.name))
          : undefined;
      considerTypes(
        stringArray(param.types),
        docString(param.doc),
        arbitraryTable,
        mappingSlot,
        homogeneousElement,
        tableSlotCuration,
        typeof element.name === "string" && typeof param.name === "string"
          ? { element: element.name, kind: "param", name: param.name }
          : undefined,
      );
      // Residual: a doc-optional param the emitter cannot mark `?` because a
      // required param follows it. The trailing-run cutoff must match
      // emit-dts so the gate and the emitted surface agree.
      if (isDocOptional(param) && index < cutoff) optionalAsRequired += 1;
    });
    for (const ret of returns) {
      const tableSlotCuration =
        typeof element.name === "string" && typeof ret.name === "string"
          ? TABLE_SLOT_CURATIONS.get(tableSlotKey(element.name, "return", ret.name))
          : undefined;
      considerTypes(
        stringArray(ret.types),
        docString(ret.doc),
        arbitraryTable,
        mappingSlot,
        homogeneousElement,
        tableSlotCuration,
        typeof element.name === "string" && typeof ret.name === "string"
          ? { element: element.name, kind: "return", name: ret.name }
          : undefined,
      );
    }
  }

  return {
    droppedElements,
    unknownTokens: [...unknown].sort(),
    recordTables,
    multiReturn,
    droppedMembers: generateModuleDeclaration(entry, { knownConstantFqns: NO_KNOWN_CONSTANTS })
      .dropped.length,
    optionalAsRequired,
  };
}

function stripNamespace(name: string): string {
  const index = name.lastIndexOf(".");
  return index === -1 ? name : name.slice(index + 1);
}

function tableSlotKey(elementName: string, slotKind: "param" | "return", slotName: string): string {
  return `${elementName}:${slotKind}:${slotName}`;
}

export function buildFidelityReport(
  manifest: readonly ModuleManifestEntry[] = MODULE_MANIFEST,
): Record<string, FidelityEntry> {
  const report: Record<string, FidelityEntry> = {};
  const knownConstantFqns = collectConstantFqns(manifest);
  for (const namespace of [...manifest.map((e) => e.namespace)].sort()) {
    const entry = manifest.find((e) => e.namespace === namespace);
    if (entry) report[namespace] = auditEntry(entry, knownConstantFqns);
  }
  return report;
}

function biomeFormatJson(raw: string): string {
  const out = Bun.spawnSync(
    ["bunx", "biome", "format", "--stdin-file-path=fidelity-baseline.json"],
    {
      stdin: Buffer.from(raw),
    },
  );
  if (out.exitCode !== 0) {
    throw new Error(`biome format failed: ${out.stderr.toString()}`);
  }
  return out.stdout.toString();
}

if (import.meta.main) {
  const report = buildFidelityReport();
  if (process.argv.includes("--write")) {
    const path = resolve(import.meta.dir, "fidelity-baseline.json");
    Bun.write(path, biomeFormatJson(JSON.stringify(report)));
    console.log(`wrote ${path}`);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}
