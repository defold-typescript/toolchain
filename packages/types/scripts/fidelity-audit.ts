import { resolve } from "node:path";
import * as ts from "typescript";
import { type ApiFunction, parseDefoldApiDoc } from "../src/api-doc";
import { DEFOLD_TYPE_MAP } from "../src/core-types";
import {
  ARBITRARY_TABLE_SLOT_KEYS,
  ARBITRARY_TABLE_SLOTS,
  applyFieldTypeOverrides,
  applyNestedFieldCurations,
  buildTableDocResolver,
  HANDLE_METHOD_LOCAL,
  HOMOGENEOUS_ARRAY_SLOTS,
  isDocOptional,
  isRecordsCollectionSlot,
  isSlotLevelList,
  isVarargParameter,
  MAPPING_TABLE_SLOTS,
  type NestedMapping,
  OVERLOAD_COVERED_SKIPS,
  parseTableFields,
  recoverCallbackSignature,
  TABLE_SLOT_CURATIONS,
  type TableSlotCuration,
  TS_IDENTIFIER,
  trailingOptionalCutoff,
} from "../src/emit-dts";
import { parseMessagesDoc } from "../src/emit-messages";
import { EXTENSION_GOLDEN_MANIFEST } from "./extension-goldens";
import {
  collectConstantFqns,
  generateModuleDeclaration,
  loadSrcAugmentations,
  MESSAGES_MANIFEST,
  MODULE_MANIFEST,
  type ModuleManifestEntry,
} from "./regen";

// The fidelity audit runs over the promoted default surface (the `default: true`
// target, `MODULE_MANIFEST`) so the 1.13-only modules (b2d.*, compute, material)
// and the 1.13 model additions are audited too — auditing the older 1.12.4 target
// left them unseen, which is how the promoted surface shipped opaque `Record`
// fallbacks while the gate read `recordTables: 0`. The extension goldens ride
// along because `resolve` applies the same curations to them.
export const FIDELITY_BASELINE_MANIFEST: readonly ModuleManifestEntry[] = [
  ...MODULE_MANIFEST,
  ...EXTENSION_GOLDEN_MANIFEST,
];

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

// Colon `<receiver>:<method>` FUNCTION elements are emitted as method-bearing
// interfaces (see emit-dts collectHandleMethodGroups). Before that recovery they
// emitted nothing yet were never counted as a droppedMembers loss — a blind spot
// that let `socket` read `droppedMembers: 0` over an incomplete surface. Count
// them honestly: with emission on, only a malformed colon name (non-identifier
// segment) is still a loss; with emission off, every colon method is dropped.
export function countDroppedHandleMethods(doc: unknown, namespace: string, emit = true): number {
  const prefix = `${namespace}.`;
  let dropped = 0;
  for (const element of elementsOf(doc)) {
    if (element.type !== "FUNCTION" || typeof element.name !== "string") continue;
    const local = element.name.startsWith(prefix)
      ? element.name.slice(prefix.length)
      : element.name;
    if (!local.includes(":")) continue;
    if (!emit || !HANDLE_METHOD_LOCAL.test(local)) dropped += 1;
  }
  return dropped;
}

// Upstream ships `examples`, `description` and `brief` as syntax-highlighted HTML
// — every token in its own span, quotes as entities — so a call site is invisible
// to any parser until the markup is gone. `&amp;` decodes last so an escaped
// entity stays literal.
function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// The arguments of the call whose `(` ends just before `start`, split on
// top-level commas only: a comma inside a nested call, table, index or string
// literal belongs to that argument. Null when the text ends before the call does.
function splitArguments(text: string, start: number): string[] | null {
  const args: string[] = [];
  let current = "";
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (quote !== null) {
      current += ch;
      if (ch === "\\") {
        current += text[i + 1] ?? "";
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "(" || ch === "{" || ch === "[") {
      depth += 1;
    } else if (ch === ")" || ch === "}" || ch === "]") {
      if (depth === 0) {
        if (ch !== ")") return null;
        const last = current.trim();
        if (last !== "" || args.length > 0) args.push(last);
        return args;
      }
      depth -= 1;
    } else if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  return null;
}

// A call inside a Lua comment is not a call site, and prose there carries commas
// that would otherwise read as argument separators — `--> vmath.matrix4(1, 0, …)`
// showing printed output is the sharpest case. Quote-aware so a `--` inside a
// string literal stays put. Newlines survive, so line structure is unchanged.
function stripLuaComments(text: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (quote !== null) {
      out += ch;
      if (ch === "\\") {
        out += text[i + 1] ?? "";
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "-" && text[i + 1] === "-") {
      if (text.startsWith("--[[", i)) {
        const end = text.indexOf("]]", i + 4);
        i = end === -1 ? text.length : end + 1;
        continue;
      }
      const newline = text.indexOf("\n", i);
      if (newline === -1) break;
      i = newline - 1;
      continue;
    }
    out += ch;
  }
  return out;
}

// Inline `<code>` in example prose names a function rather than calling it
// (`<code>gui.set_texture()</code> is sufficient`). A highlighted block's `<code>`
// always wraps token spans, so only the prose kind is bare text.
const INLINE_CODE = /<code>[^<]*<\/code>/g;

const exampleCallCache = new WeakMap<ApiFunction, readonly (readonly string[])[]>();

// Every `<fqn>(…)` call in the function's upstream examples, as argument lists.
function exampleCalls(fn: ApiFunction): readonly (readonly string[])[] {
  const cached = exampleCallCache.get(fn);
  if (cached !== undefined) return cached;
  const text = stripLuaComments(plainText((fn.examples ?? "").replace(INLINE_CODE, "")));
  const escaped = fn.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const calls: string[][] = [];
  for (const match of text.matchAll(new RegExp(`(?<![\\w.:])${escaped}\\s*\\(`, "g"))) {
    const args = splitArguments(text, match.index + match[0].length);
    if (args !== null) calls.push(args);
  }
  exampleCallCache.set(fn, calls);
  return calls;
}

// The argument counts one declaration accepts, with the emitter's own
// trailing-optional cutoff as the floor. A vararg slot emits as a rest
// parameter, which accepts nothing at all, so it bounds the minimum as well as
// unbounding the maximum — `trailingOptionalCutoff` only sees doc-optionality
// and cannot lower it.
export function declaredArity(fn: ApiFunction): ArityRange {
  const params = fn.parameters;
  const firstVararg = params.findIndex(isVarargParameter);
  const unbounded = firstVararg !== -1;
  return {
    min: Math.min(trailingOptionalCutoff(params, fn.name), unbounded ? firstVararg : params.length),
    max: unbounded ? Number.POSITIVE_INFINITY : params.length,
  };
}

// Whether a call passing `count` arguments fits this declaration's arity.
function acceptsArgumentCount(fn: ApiFunction, count: number): boolean {
  const { min, max } = declaredArity(fn);
  return count >= min && count <= max;
}

// The ref-doc documents an overload as a separate element sharing the name, and
// an element's examples often call a sibling (`vmath.vector3(2.0)` beside the
// `x, y, z` form). A call another same-named declaration accepts is that
// declaration's call, not an omission from this one.
function ownExampleCalls(
  fn: ApiFunction,
  overloads: readonly ApiFunction[],
): readonly (readonly string[])[] {
  return exampleCalls(fn).filter(
    (args) => !overloads.some((other) => other !== fn && acceptsArgumentCount(other, args.length)),
  );
}

// A table parameter's `<dl>`/`<ul>` describes its fields, so an optional field
// there says nothing about whether the argument itself may be omitted.
const FIELD_LIST = /<(dl|ul|ol|table)\b[\s\S]*?<\/\1>/g;
const OPENS_OPTIONAL = /^\s*optional\b/i;
const OMISSION_PHRASE = /\bdefaults? to\b|\b(?:if|when|can be|may be) omitted\b/i;

type OptionalityAxis = (
  fn: ApiFunction,
  index: number,
  overloads: readonly ApiFunction[],
) => boolean;

// The three ways a ref-doc evidences that a parameter may be omitted, each read
// from one function element and its same-named overloads. `is_optional` is not
// among them: a slot upstream marks optional is already emitted omissible, so
// only the unmarked ones can be lost.
export const OPTIONALITY_EVIDENCE: Readonly<
  Record<"prose" | "exampleArity" | "exampleNil", OptionalityAxis>
> = {
  // The parameter's own prose opens with "optional", or names a default or an
  // omission outside any field list.
  prose: (fn, index) => {
    const doc = fn.parameters[index]?.doc ?? "";
    return (
      OPENS_OPTIONAL.test(plainText(doc)) ||
      OMISSION_PHRASE.test(plainText(doc.replace(FIELD_LIST, " ")))
    );
  },
  // An upstream example stops before this parameter. A trailing `...` forwards
  // an unknown number of values, so it proves nothing about arity.
  exampleArity: (fn, index, overloads) =>
    ownExampleCalls(fn, overloads).some((args) => args.length <= index && args.at(-1) !== "..."),
  // An upstream example passes a bare `nil` in this position.
  exampleNil: (fn, index, overloads) =>
    ownExampleCalls(fn, overloads).some((args) => args[index] === "nil"),
};

// Slots the evidence flags that are genuinely required, keyed like
// `OPTIONAL_SLOT_CORRECTIONS`. Each value is the recorded reason, so an
// exemption is a decision someone can re-check rather than a silent skip.
export const OPTIONALITY_EVIDENCE_EXEMPTIONS: ReadonlyMap<string, string> = new Map([]);

export interface EvidencedSlot {
  readonly key: string;
  readonly emittedRequired: boolean;
}

// Every `<element>:param:<slot>` the ref-doc evidences as omissible, and whether
// the emitted surface still requires it. A slot is emitted omissible when any
// same-named declaration makes that position omissible under `isDocOptional`,
// the emitter's own predicate, corrections included. Skipped functions are
// hand-authored, so their slots are not the generator's to lose.
export function evidencedOptionalSlots(
  entry: Pick<ModuleManifestEntry, "doc" | "skipFunctions">,
): EvidencedSlot[] {
  const skipFunctions = new Set(entry.skipFunctions ?? []);
  const functions = parseDefoldApiDoc(entry.doc).functions;
  const overloadsByName = overloadIndex(functions);
  const emittedRequired = new Map<string, boolean>();
  for (const fn of functions) {
    if (skipFunctions.has(stripNamespace(fn.name))) continue;
    const overloads = overloadsByName.get(fn.name) ?? [fn];
    fn.parameters.forEach((param, index) => {
      if (isVarargParameter(param)) return;
      if (!Object.values(OPTIONALITY_EVIDENCE).some((axis) => axis(fn, index, overloads))) return;
      const omissible = overloads.some((other) => {
        const slot = other.parameters[index];
        return slot?.name === param.name && isDocOptional(slot, other.name);
      });
      const key = tableSlotKey(fn.name, "param", param.name);
      emittedRequired.set(key, (emittedRequired.get(key) ?? false) || !omissible);
    });
  }
  return [...emittedRequired].map(([key, required]) => ({ key, emittedRequired: required }));
}

// The evidenced slots the emitted declaration still requires, before exemptions.
export function unmarkedOptionalSlots(
  entry: Pick<ModuleManifestEntry, "doc" | "skipFunctions">,
): string[] {
  return evidencedOptionalSlots(entry)
    .filter((slot) => slot.emittedRequired)
    .map((slot) => slot.key);
}

// `min` is the fewest arguments a call may pass, `max` the most;
// `Number.POSITIVE_INFINITY` for a declaration that takes a rest parameter.
export interface ArityRange {
  readonly min: number;
  readonly max: number;
}

function signatureArity(params: readonly ts.ParameterDeclaration[]): ArityRange {
  const fixed = params.filter((param) => param.dotDotDotToken === undefined);
  return {
    min: fixed.filter(
      (param) => param.questionToken === undefined && param.initializer === undefined,
    ).length,
    max: fixed.length === params.length ? params.length : Number.POSITIVE_INFINITY,
  };
}

function collectAuthoredArities(
  container: ts.SourceFile | ts.ModuleBlock,
  prefix: string,
  out: Map<string, ArityRange[]>,
): void {
  for (const statement of container.statements) {
    if (
      ts.isModuleDeclaration(statement) &&
      statement.body !== undefined &&
      ts.isModuleBlock(statement.body)
    ) {
      // `declare global` is an augmentation wrapper, not a namespace segment.
      const name = statement.name.text;
      const next = name === "global" ? prefix : prefix === "" ? name : `${prefix}.${name}`;
      collectAuthoredArities(statement.body, next, out);
    } else if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      const fqn = prefix === "" ? statement.name.text : `${prefix}.${statement.name.text}`;
      out.set(fqn, [...(out.get(fqn) ?? []), signatureArity(statement.parameters)]);
    }
  }
}

// A skipped function has no generated declaration at all, so its arity exists
// only as text in the hand-authored augmentations. Parsed once per process:
// every manifest entry asks the same small set of files.
let authoredAritiesCache: Map<string, ArityRange[]> | null = null;

function authoredArities(): Map<string, ArityRange[]> {
  if (authoredAritiesCache !== null) return authoredAritiesCache;
  const out = new Map<string, ArityRange[]>();
  for (const { path, contents } of loadSrcAugmentations()) {
    collectAuthoredArities(
      ts.createSourceFile(path, contents, ts.ScriptTarget.Latest, true),
      "",
      out,
    );
  }
  authoredAritiesCache = out;
  return out;
}

// Every argument count the shipped surface accepts, keyed by FQN. This is a
// per-call question, unlike OPTIONALITY_EVIDENCE.exampleArity's per-slot one: an
// argument shifted into another slot keeps the slot count and still fails to
// compile, which is why omissibility alone could not see it.
export function declaredArities(
  entry: Pick<ModuleManifestEntry, "doc" | "namespace" | "skipFunctions">,
): Map<string, ArityRange[]> {
  const rules = entry.skipFunctions ?? [];
  const exact = new Set(rules.filter((rule) => !rule.endsWith(".")));
  const segments = rules.filter((rule) => rule.endsWith("."));
  const prefix = `${entry.namespace}.`;
  const authored = authoredArities();
  const result = new Map<string, ArityRange[]>();
  for (const fn of parseDefoldApiDoc(entry.doc).functions) {
    const local = fn.name.startsWith(prefix) ? fn.name.slice(prefix.length) : fn.name;
    if (exact.has(local) || segments.some((segment) => local.startsWith(segment))) {
      // Every ref-doc element sharing the name resolves to the same authored
      // signature set, so record it once rather than per element.
      result.set(fn.name, authored.get(fn.name) ?? []);
      continue;
    }
    result.set(fn.name, [...(result.get(fn.name) ?? []), declaredArity(fn)]);
  }
  return result;
}

// Call shape (`<fqn>:<argumentCount>`) to the recorded reason an upstream
// example calls an argument count no declaration accepts, mirroring
// OPTIONALITY_EVIDENCE_EXEMPTIONS. The key is the shape rather than the name
// because each reason explains one argument count: a second unsupported arity
// on the same function is new evidence, not something an existing entry covers.
// Empty is the goal state, not a gap: the gate below asserts both directions.
export const INEXPRESSIBLE_EXAMPLE_RESIDUALS: ReadonlyMap<string, string> = new Map([
  [
    "b2d.shape.set_shape:4",
    "upstream documents an alternative call form inside one slot — the `shape_id` " +
      'parameter reads "shape handle from a shape info table, or pass body, shape_index" ' +
      "— so the four-argument example has one more argument than any parameter list " +
      "upstream declares. Expressing it needs a hand-authored b2d.shape overload pair, " +
      "which changes the shipped surface and is its own piece of work.",
  ],
]);

export interface InexpressibleCall {
  readonly fqn: string;
  readonly argumentCount: number;
}

// One function owns the key format so the producer and the consumer below
// cannot drift apart.
export function residualKey(call: InexpressibleCall): string {
  return `${call.fqn}:${call.argumentCount}`;
}

// The flagged calls no residual explains. A residual covers exactly the one
// call shape its reason describes.
export function unexplainedInexpressibleCalls(
  calls: readonly InexpressibleCall[],
  residuals: ReadonlyMap<string, string> = INEXPRESSIBLE_EXAMPLE_RESIDUALS,
): InexpressibleCall[] {
  return calls.filter((call) => !residuals.has(residualKey(call)));
}

// The residuals no flagged call produces any more, so the recorded reason is
// excusing something the evidence no longer shows.
export function deadResiduals(
  calls: readonly InexpressibleCall[],
  residuals: ReadonlyMap<string, string> = INEXPRESSIBLE_EXAMPLE_RESIDUALS,
): string[] {
  const flagged = new Set(calls.map(residualKey));
  return [...residuals.keys()].filter((key) => !flagged.has(key));
}

// A curated mapping key or value may be a `T | U` union token that emit-dts
// splits per token; the audit has to split it the same way or it measures a
// token the emitted surface never produces.
function unionTokens(token: string): string[] {
  return token.split("|").map((part) => part.trim());
}

function overloadIndex(functions: readonly ApiFunction[]): Map<string, ApiFunction[]> {
  const byName = new Map<string, ApiFunction[]>();
  for (const fn of functions) {
    byName.set(fn.name, [...(byName.get(fn.name) ?? []), fn]);
  }
  return byName;
}

export function inexpressibleExampleCalls(
  entry: Pick<ModuleManifestEntry, "doc" | "namespace" | "skipFunctions">,
): InexpressibleCall[] {
  const arities = declaredArities(entry);
  const functions = parseDefoldApiDoc(entry.doc).functions;
  const byName = overloadIndex(functions);
  const seen = new Set<string>();
  const calls: InexpressibleCall[] = [];
  for (const fn of functions) {
    const ranges = arities.get(fn.name) ?? [];
    for (const args of ownExampleCalls(fn, byName.get(fn.name) ?? [fn])) {
      // A forwarded vararg stands for an unknown number of values, the same
      // reason exampleArity discounts it.
      if (args.at(-1) === "...") continue;
      const argumentCount = args.length;
      if (ranges.some((range) => argumentCount >= range.min && argumentCount <= range.max))
        continue;
      const key = `${fn.name}:${argumentCount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      calls.push({ fqn: fn.name, argumentCount });
    }
  }
  return calls;
}

// The scan can only speak for functions whose ref-doc carries a parseable
// example call. Reporting that split is what stops an empty residual from
// reading as stronger coverage than it is.
export function exampleScanReach(entry: Pick<ModuleManifestEntry, "doc">): {
  withCalls: number;
  withoutCalls: number;
} {
  const functions = parseDefoldApiDoc(entry.doc).functions;
  const byName = overloadIndex(functions);
  let withCalls = 0;
  let withoutCalls = 0;
  for (const fn of functions) {
    if (ownExampleCalls(fn, byName.get(fn.name) ?? [fn]).length > 0) withCalls += 1;
    else withoutCalls += 1;
  }
  return { withCalls, withoutCalls };
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
  // Every param upstream marks optional is recovered: emitParameter expresses an
  // interior one as `| undefined` and a trailing one as `?`. What stays lost is a
  // slot the ref-doc evidences as omissible without marking it, which neither an
  // OPTIONAL_SLOT_CORRECTIONS entry nor a stated exemption accounts for.
  const optionalAsRequired = unmarkedOptionalSlots(entry).filter(
    (key) => !OPTIONALITY_EVIDENCE_EXEMPTIONS.has(key),
  ).length;
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
          // The key and a string value may each be a `T | U` union token
          // (render.clear's three graphics.BUFFER_TYPE_* keys, its
          // `number | vector4` value); split on `|` exactly as the emit branch
          // does so each token is checked individually and a single token is
          // unaffected.
          const keyTokens = unionTokens(tableSlotCuration.key);
          if (typeof tableSlotCuration.value === "string") {
            considerTypes([...keyTokens, ...unionTokens(tableSlotCuration.value)]);
          } else if (Array.isArray(tableSlotCuration.value)) {
            considerTypes(keyTokens);
            for (const field of tableSlotCuration.value) {
              if (field.fields !== undefined) {
                for (const nested of field.fields) {
                  if (nested.numberList === true || nested.tsType !== undefined) continue;
                  considerTypes(nested.types);
                }
              } else if (field.numberList !== true && field.tsType === undefined) {
                considerTypes(field.types);
              }
            }
          } else {
            const nested = tableSlotCuration.value as NestedMapping;
            considerTypes([...keyTokens, nested.key, nested.value]);
          }
          continue;
        }
        if (mappingSlot !== undefined) {
          considerTypes([...unionTokens(mappingSlot.key), mappingSlot.value]);
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
                if (nested.numberList === true || nested.tsType !== undefined) continue;
                considerTypes(nested.types);
              }
            } else if (field.numberList !== true && field.tsType === undefined) {
              considerTypes(field.types);
            }
          }
          continue;
        }
        // A keyed-object slot is recovered by emit-dts into `Record<string, { … }>`
        // where the inner fields are parser-recovered — not a bare `Record`, so
        // don't count it. Feed the parsed inner field types back through
        // considerTypes so an unmapped inner token still surfaces under
        // unknownTokens (mirrors the parser-recovered branch below).
        if (tableSlotCuration?.kind === "keyed-object") {
          const rawParsed = doc !== undefined ? parseTableFields(doc, resolver) : null;
          if (rawParsed !== null && slot !== undefined) {
            const parsed = applyFieldTypeOverrides(slot.element, slot.kind, slot.name, rawParsed);
            for (const field of parsed) {
              if (field.fields !== undefined) {
                for (const nested of field.fields) {
                  if (nested.numberList === true || nested.tsType !== undefined) continue;
                  considerTypes(nested.types);
                }
              } else if (field.numberList !== true && field.tsType === undefined) {
                considerTypes(field.types);
              }
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
            ? applyFieldTypeOverrides(
                slot.element,
                slot.kind,
                slot.name,
                applyNestedFieldCurations(slot.element, slot.kind, slot.name, parsed),
              )
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
                if (nested.numberList === true || nested.tsType !== undefined) continue;
                considerTypes(nested.types, undefined, arbitraryTable);
              }
            } else if (field.numberList === true || field.tsType !== undefined) {
              // Recovered as `number[]` (numberList) or pinned via a field-type
              // override (tsType) by inlineTableType — no longer a `Record`, so
              // skip it. Re-counting its `table` token here would double-count a
              // slot the emitted surface no longer loses.
            } else {
              considerTypes(field.types, undefined, arbitraryTable);
            }
          }
          // A records-collection return slot ("… of tables" / "table of tables")
          // whose inner record the parser recovered but the emitter did not wrap
          // (isSlotLevelList false) still lost its outer array layer — the emitted
          // shape is a bare object. The oracle (isRecordsCollectionSlot) is
          // intentionally broader than the emitter's wrap trigger (isSlotLevelList):
          // a records-collection wording the trigger stops recognizing re-surfaces
          // here as a counted loss, keeping the gate coupled to the emitted surface.
          // array / array-object / mapping / homogeneous curations already
          // `continue`d above, so reaching here means none applied.
          if (
            slot?.kind === "return" &&
            doc !== undefined &&
            isRecordsCollectionSlot(doc) &&
            !isSlotLevelList(doc)
          ) {
            recordTables += 1;
          }
          continue;
        }
        // A slot on a serialization/JSON passthrough function is a genuinely
        // arbitrary lua table — its emitted `Record<string | number, unknown>`
        // is faithful, not a loss — so it is not counted under recordTables.
        if (arbitraryTable) continue;
        // A per-slot arbitrary allowlist entry (an undocumented table slot on an
        // otherwise-documented element) is faithful `Record` too — not a loss.
        if (
          slot !== undefined &&
          ARBITRARY_TABLE_SLOT_KEYS.has(`${slot.element}:${slot.kind}:${slot.name}`)
        ) {
          continue;
        }
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
    const arbitraryTable =
      typeof element.name === "string" && ARBITRARY_TABLE_SLOTS.has(element.name);
    const mappingSlot =
      typeof element.name === "string" ? MAPPING_TABLE_SLOTS.get(element.name) : undefined;
    const homogeneousElement =
      typeof element.name === "string" ? HOMOGENEOUS_ARRAY_SLOTS.get(element.name) : undefined;
    params.forEach((param) => {
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
      // Interior doc-optional params (a required param follows) are no longer a
      // loss: emitParameter expresses them as `| undefined`, mirroring the
      // emitted surface. optionalAsRequired counts the unmarked ones instead,
      // through unmarkedOptionalSlots above.
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
    droppedMembers:
      generateModuleDeclaration(entry, {
        knownConstantFqns: NO_KNOWN_CONSTANTS,
      }).dropped.filter((name) => !OVERLOAD_COVERED_SKIPS.has(name)).length +
      countDroppedHandleMethods(entry.doc, entry.namespace),
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
  manifest: readonly ModuleManifestEntry[] = FIDELITY_BASELINE_MANIFEST,
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
