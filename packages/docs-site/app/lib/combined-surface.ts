import {
  type ApiAvailability,
  type ApiFunction,
  type ApiModule,
  type ApiSymbolIdentity,
  type ApiVariable,
  type AvailabilityLabel,
  availabilityLabel,
  normalizedFunctionSignature,
  type SignatureStore,
  type SlotTypes,
  signatureTransitionNames,
  symbolIdentityKey,
  symbolNameKey,
  type TranslationStore,
} from "@defold-typescript/types";
import {
  type ApiPage,
  type AvailabilityLookup,
  type CategoryWindow,
  functionBadgeCategory,
} from "./api-surface";
import type { BadgeCountTable } from "./api-surface-pref";
import type { VersionWindow } from "./version-window";

type ApiConstant = ApiModule["constants"][number];
type ApiProperty = ApiModule["properties"][number];
type ApiTypedef = ApiModule["typedefs"][number];
type ApiEnum = NonNullable<ApiModule["enums"]>[number];
type ApiStruct = NonNullable<ApiModule["structs"]>[number];

/**
 * The authoritative signatures artifact (`packages/types/api-signatures.json`):
 * bare-semver version -> {@link symbolIdentityKey} -> the TypeScript declaration
 * text for that symbol in that version. The Combined model reads a symbol's
 * signature from here rather than re-rendering it from ref-doc tokens, so the
 * projection cannot drift from the shipped `generated/*.d.ts`.
 */
export interface SignaturesArtifact {
  readonly versions: Record<string, Record<string, string>>;
  /**
   * The parallel per-slot map on the same axis and keys: each documented
   * parameter and return slot's rendered type, keyed
   * `param|return:<position>:<raw ref-doc name>`. A symbol absent here documents
   * no slot, or is an authored fold whose declaration the emitter did not
   * produce; either way the render layer falls back to its token-derived type.
   */
  readonly slotTypes?: Record<string, Record<string, SlotTypes>>;
}

export type { SlotTypes };

/** One tracked version's engine surface, addressed by bare semver (`1.13.0`). */
export interface CombinedVersionSurface {
  readonly version: string;
  readonly modules: readonly ApiModule[];
}

export interface BuildCombinedSurfaceInput {
  readonly surfaces: readonly CombinedVersionSurface[];
  readonly signatures: SignaturesArtifact;
  /**
   * The merged `signatures/*.json` authored override store. Combined carries it
   * so the canonical `/api/<ns>` page renders every hand-authored overload arm,
   * exactly as the version-independent pages already do; the artifact above still
   * supplies the single primary row per identity.
   */
  readonly signatureStore?: SignatureStore;
  /**
   * The merged `examples/translations.json` store. Combined carries it so the
   * canonical `/api/<ns>` page renders the authored TypeScript wherever a stored
   * hash resolves against the blob it is about to render; the accumulator takes
   * one concrete version's `examples` blob verbatim, so the hash it is keyed by
   * is that version's, and a blob resolving to no stored hash keeps its Lua
   * fallback.
   */
  readonly translationStore?: TranslationStore;
  /**
   * The committed `api-availability.json` lookup, consulted only for curated
   * facts (deprecation, replacement, Box2D backend) that the ref-doc snapshots
   * do not carry. Presence/`availableIn` is always recomputed from `surfaces`,
   * so a newly tracked version flows through without touching this overlay.
   */
  readonly overlay?: AvailabilityLookup;
}

/**
 * One arm of an authored overload fold, or one line of a generated declaration
 * several ref-doc elements share: its text, the versions whose
 * `api-signatures.json` value declares that line, and the label of that span. An
 * arm is dated by those values alone, never by a ref-doc identity: authored arms
 * replace every identity of the FQN, and a shared identity can reach versions
 * whose declaration held other lines, so an identity's span says nothing about
 * any one arm.
 */
export interface AuthoredArm {
  readonly signature: string;
  readonly availableIn: readonly string[];
  readonly label: AvailabilityLabel;
}

/**
 * A single union symbol on the Combined surface: its node-free identity, the
 * authoritative signature for its newest version present, the recomputed
 * `availableIn` span and friendly label, whether it is one arm of a signature
 * transition, and any curated lifecycle facts. This is the domain row the
 * website render and (later) the search/LLM serialization both consume.
 */
export interface CombinedEntry {
  readonly identity: ApiSymbolIdentity;
  readonly authoritativeSignature: string;
  /**
   * Set only on a `FUNCTION` whose authoritative signature is an authored fold:
   * every arm any version folds for the FQN, the newest fold's in its order and
   * then any arm only an older fold carries. A windowed surface keeps only the
   * arms a version in its window folds, each with its absolute `availableIn`.
   */
  readonly authoredArms?: readonly AuthoredArm[];
  /**
   * Set only on a `FUNCTION` whose identity several ref-doc elements share in the
   * version its signature resolved from (the Box2D backend forms of a
   * `b2d.world` query): those elements in fixture order, the order the joined
   * declaration lists their arms in.
   */
  readonly armElements?: readonly ApiFunction[];
  /**
   * Set alongside {@link armElements}: one arm per line of
   * {@link authoritativeSignature}, in its order, each dated by the versions
   * whose value for this identity declares that exact line.
   */
  readonly elementArms?: readonly AuthoredArm[];
  /**
   * The slot types emitted alongside {@link authoritativeSignature}, resolved
   * from the same version it was. Absent when the artifact records none.
   */
  readonly slotTypes?: SlotTypes;
  readonly availableIn: readonly string[];
  readonly label: AvailabilityLabel;
  readonly transition: boolean;
  readonly deprecatedSince?: string;
  readonly replacement?: ApiSymbolIdentity;
  readonly box2d?: NonNullable<ApiAvailability["box2d"]>;
}

/**
 * One namespace projected across every tracked version: the deterministically
 * ordered union `module` (signature transitions rendered adjacent, oldest arm
 * first), the synthetic availability lookup that feeds the existing badge
 * renderer (a symbol present in every version and carrying no curated fact holds
 * no record, hence no badge), and the per-symbol `entries`.
 */
export interface CombinedNamespace {
  readonly namespace: string;
  readonly module: ApiModule;
  readonly availability: AvailabilityLookup;
  readonly entries: readonly CombinedEntry[];
  /** The authored override store this namespace's page renders its arms from. */
  readonly signatureStore?: SignatureStore;
  /** The authored example store this namespace's page resolves its bodies from. */
  readonly translationStore?: TranslationStore;
}

export interface CombinedSurface {
  readonly versions: readonly string[];
  readonly namespaces: readonly CombinedNamespace[];
  /** The merged authored override store every namespace above carries. */
  readonly signatureStore?: SignatureStore;
  /** The merged authored example store every namespace above carries. */
  readonly translationStore?: TranslationStore;
  /**
   * Set only on a {@link windowCombinedSurface} result: the `[from, to]` bounds
   * the membership was narrowed to. `versions` stays the full tracked axis
   * either way, so every label a consumer renders remains absolute.
   */
  readonly window?: VersionWindow;
}

/**
 * Project one Combined namespace as an `ApiPage` for the shared render / index /
 * search machinery: an `engine` page routed at the canonical `/api/<namespace>`,
 * carrying the union `module` and the synthetic availability lookup. Combined is
 * the canonical unprefixed surface, so the projection owns the canonical route at
 * its source — no consumer re-maps it afterward. Combined carries both authored
 * stores: the example translation store, so a blob whose stored hash resolves
 * renders its authored TypeScript and one that resolves to nothing renders its
 * Lua fallback, and the signature override store, so every hand-authored overload
 * arm renders as its own row. Pure
 * — the node-free counterpart the canonical `/api` routes, the search index, and
 * the symbol index all reuse so none re-walks the raw per-version surfaces.
 */
export function combinedNamespaceToApiPage(ns: CombinedNamespace): ApiPage {
  return {
    namespace: ns.namespace,
    route: `/api/${ns.namespace}`,
    brief: ns.module.brief,
    module: ns.module,
    translations: ns.translationStore ?? {},
    signatures: ns.signatureStore ?? {},
    category: "engine",
    availability: ns.availability,
    authoritativeSignatures: combinedAuthoritativeSignatures(ns),
    authoritativeSlotTypes: combinedAuthoritativeSlotTypes(ns),
    authoritativeArms: combinedAuthoritativeArms(ns),
    authoritativeArmElements: combinedAuthoritativeArmElements(ns),
    authoredArmSpans: combinedAuthoredArmSpans(ns),
    authoritativeArmSpans: combinedAuthoritativeArmSpans(ns),
  };
}

/**
 * Each element arm's span, keyed by exact identity and then by the arm's inner
 * render form, which is the text the page renders for that row.
 */
export function combinedAuthoritativeArmSpans(
  ns: CombinedNamespace,
): ReadonlyMap<string, ReadonlyMap<string, readonly string[]>> {
  const map = new Map<string, ReadonlyMap<string, readonly string[]>>();
  for (const entry of ns.entries) {
    if (entry.elementArms === undefined) continue;
    map.set(
      symbolIdentityKey(entry.identity),
      new Map(
        entry.elementArms.map((arm) => [
          innerFunctionArm(entry.identity, arm.signature),
          arm.availableIn,
        ]),
      ),
    );
  }
  return map;
}

/**
 * Each authored arm's span, keyed by FQN and then by the arm's text, which is
 * the text the page renders for that store row.
 */
export function combinedAuthoredArmSpans(
  ns: CombinedNamespace,
): ReadonlyMap<string, ReadonlyMap<string, readonly string[]>> {
  const map = new Map<string, ReadonlyMap<string, readonly string[]>>();
  for (const entry of ns.entries) {
    if (entry.authoredArms === undefined || map.has(entry.identity.name)) continue;
    map.set(
      entry.identity.name,
      new Map(entry.authoredArms.map((arm) => [arm.signature, arm.availableIn])),
    );
  }
  return map;
}

// Validates that a keyword/`;`-stripped member declaration is a well-formed
// `<binding>: T` before its type portion is spliced after the public identity
// name. The binding token itself is discarded (it may be an emitter-safe alias
// such as `_null`); only the type after the first `:` is kept.
const memberInnerFormShape = /^[A-Za-z_$][\w$]*\s*:/;

/**
 * Reduce an authoritative declaration from `api-signatures.json` to the inner
 * form the `/api` render layer emits, dispatching on the symbol's kind:
 *
 * - `FUNCTION` (`function get_constants(…): …;`) drops `function `/`;` and
 *   splices the namespace-qualified `identity.name` before the first `(`, or
 *   before the type-parameter list ahead of it, so both arms of a signature
 *   transition re-qualify to their own overload.
 * - `CONSTANT`/`VARIABLE` (`const NAME: T;`, `const _mangled: T;`) and
 *   `PROPERTY` (`name: T;`) drop an optional binding keyword and `;`, then
 *   splice the namespace-qualified public `identity.name` before the type
 *   portion, so an emitter-safe binding alias (`_null`, `_delete`) never leaks.
 * - `TYPEDEF` (`type Name = T;`) drops the trailing `;`; an interface
 *   (`interface Name { … }`) passes through trimmed. The inner form is the
 *   definition the page's type row renders.
 *
 * Returns `""` when the declaration does not match its kind's expected shape, so
 * an unrenderable entry falls the render layer back to the token-derived form.
 */
function innerRenderSignature(identity: ApiSymbolIdentity, declaration: string): string {
  const decl = declaration.trim();
  switch (identity.kind) {
    case "FUNCTION": {
      // An authored multi-arm entry is folded into the artifact already in
      // namespace-qualified inner form, one arm per line. Its first line is arm
      // 0 — the same primary row `apiModuleSymbols` computes from the store — so
      // returning it keeps the map one-signature-per-identity while the render
      // layer sources arms 1..n from the store itself.
      if (!decl.startsWith("function ")) {
        return isAuthoredFold(identity.name, decl) ? (decl.split("\n")[0]?.trim() ?? "") : "";
      }
      // A generated multi-arm declaration carries one arm per line; the map
      // keeps arm 0, and `combinedAuthoritativeArms` carries the rest.
      return innerFunctionArm(identity, decl.split("\n")[0] ?? "");
    }
    case "CONSTANT":
    case "VARIABLE":
    case "PROPERTY": {
      const body = decl.replace(/^(?:const|let|var)\s+/, "").replace(/;\s*$/, "");
      if (!memberInnerFormShape.test(body)) return "";
      return `${identity.name}: ${body.slice(body.indexOf(":") + 1).trim()}`;
    }
    case "TYPEDEF": {
      if (decl.startsWith("interface ")) return decl;
      if (!decl.startsWith("type ")) return "";
      return decl.replace(/;\s*$/, "");
    }
    default:
      return "";
  }
}

/**
 * Whether a function's declaration is an authored fold: the store's arms are
 * folded in namespace-qualified inner form, so the first line opens with the
 * FQN. A generated declaration opens with `function `, and a generated method
 * (`close(): void;` for `client:close`) with its bare name.
 */
function isAuthoredFold(name: string, declaration: string): boolean {
  const first = declaration.trim().split("\n")[0]?.trim() ?? "";
  const after = first.slice(name.length);
  return first.startsWith(name) && (after.startsWith("(") || after.startsWith("<"));
}

function innerFunctionArm(identity: ApiSymbolIdentity, arm: string): string {
  const body = arm
    .trim()
    .replace(/^function /, "")
    .replace(/;\s*$/, "");
  const paren = body.indexOf("(");
  if (paren === -1) return "";
  // A type-parameter list is part of the form (`cast_ray<Backend extends "v3">`).
  const generic = body.indexOf("<");
  return `${identity.name}${body.slice(generic !== -1 && generic < paren ? generic : paren)}`;
}

/**
 * The inner render forms of arms 1..n of every generated `function `
 * declaration that declares more than one arm, keyed by the same exact identity
 * as {@link combinedAuthoritativeSignatures} (which carries arm 0). An authored
 * fold is excluded: its arms 1..n already render from the signature store.
 */
export function combinedAuthoritativeArms(
  ns: CombinedNamespace,
): ReadonlyMap<string, readonly string[]> {
  const map = new Map<string, readonly string[]>();
  for (const entry of ns.entries) {
    if (entry.identity.kind !== "FUNCTION") continue;
    const decl = entry.authoritativeSignature.trim();
    if (!decl.startsWith("function ")) continue;
    const arms = decl
      .split("\n")
      .slice(1)
      .map((arm) => innerFunctionArm(entry.identity, arm))
      .filter((arm) => arm !== "");
    if (arms.length > 0) map.set(symbolIdentityKey(entry.identity), arms);
  }
  return map;
}

/**
 * The ref-doc element each arm of a joined declaration was emitted from, arm 0
 * first, keyed by the same exact identity as {@link combinedAuthoritativeArms}.
 * Present only where the declaration lists one arm per element, so a row never
 * takes the prose of an element that emitted a different arm.
 */
export function combinedAuthoritativeArmElements(
  ns: CombinedNamespace,
): ReadonlyMap<string, readonly ApiFunction[]> {
  const map = new Map<string, readonly ApiFunction[]>();
  for (const entry of ns.entries) {
    if (entry.armElements === undefined) continue;
    const arms = entry.authoritativeSignature.split("\n").filter((arm) => arm.trim() !== "");
    if (arms.length === entry.armElements.length) {
      map.set(symbolIdentityKey(entry.identity), entry.armElements);
    }
  }
  return map;
}

/**
 * The exact-identity ({@link symbolIdentityKey}) to inner-render-form signature
 * map a Combined `ApiPage` carries. Keyed by the entry's identity so two arms of
 * a signature transition resolve to their own distinct authoritative signature.
 * Every kind is emitted with its namespace-qualified public identity name
 * (functions and members alike); an entry whose declaration does not match its
 * kind's expected shape is skipped, so a lookup miss falls the render layer back
 * to the token-derived signature.
 */
/**
 * The per-slot companion to {@link combinedAuthoritativeSignatures}, keyed by the
 * **same exact identity** so a row can only take slot types from the declaration
 * it is actually rendering. Keying by name alone would attach the emitter's slots
 * to a row whose signature lookup missed and fell back to the token render — the
 * socket handle methods, whose page signature is ref-doc prose — reintroducing the
 * contradiction from the other side.
 */
export function combinedAuthoritativeSlotTypes(
  ns: CombinedNamespace,
): ReadonlyMap<string, SlotTypes> {
  const map = new Map<string, SlotTypes>();
  for (const entry of ns.entries) {
    if (entry.slotTypes === undefined) continue;
    // A declaration the render layer cannot reduce to its inner form is dropped
    // from the signature map, so its slots must drop with it.
    if (!innerRenderSignature(entry.identity, entry.authoritativeSignature)) continue;
    map.set(symbolIdentityKey(entry.identity), entry.slotTypes);
  }
  return map;
}

export function combinedAuthoritativeSignatures(
  ns: CombinedNamespace,
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const entry of ns.entries) {
    const inner = innerRenderSignature(entry.identity, entry.authoritativeSignature);
    if (inner) map.set(symbolIdentityKey(entry.identity), inner);
  }
  return map;
}

/**
 * The llms-full line body for a Combined entry, kind-aware so the agent contract
 * never carries an emitter-safe binding alias. A `FUNCTION` keeps its full
 * authoritative declaration (`function …;`) verbatim; a member (constant,
 * variable, property) emits the shared public inner form (`json.null: unknown`,
 * not `const _null`). Falls back to the raw declaration only for a member whose
 * declaration does not match its expected shape.
 */
export function llmsSignatureForEntry(entry: CombinedEntry): string {
  return llmsSignaturesForEntry(entry)[0] ?? "";
}

/**
 * Every symbol form a Combined entry contributes to the agent corpus, one per
 * list item. A `FUNCTION` whose authoritative declaration is an authored
 * multi-arm fold yields one form per arm; every other entry yields exactly one,
 * so the caller emits a uniform list either way.
 */
export function llmsSignaturesForEntry(entry: CombinedEntry): string[] {
  if (entry.identity.kind === "FUNCTION") {
    return entry.authoritativeSignature.split("\n").filter((arm) => arm.trim() !== "");
  }
  return [
    innerRenderSignature(entry.identity, entry.authoritativeSignature) ||
      entry.authoritativeSignature,
  ];
}

/** Every Combined namespace projected as an `ApiPage`, in projection order. */
export function combinedApiPages(combined: CombinedSurface): ApiPage[] {
  return combined.namespaces.map(combinedNamespaceToApiPage);
}

/**
 * The availability span tag alone — `[since X]`, `[through X]`, `[versions: …]`,
 * or the closed-range `[X–Y]`; `""` for an all-versions span. The lifecycle
 * tail ({@link compactAvailability}) builds on this.
 */
function spanTag(label: AvailabilityLabel): string {
  switch (label.kind) {
    case "since":
      return `[since ${label.from}]`;
    case "through":
      return `[through ${label.to}]`;
    case "range":
      return `[${label.from}–${label.to}]`;
    case "discrete":
      return `[versions: ${(label.versions ?? []).join(", ")}]`;
    default:
      return "";
  }
}

/**
 * The compact, machine-readable availability tail an agent-facing artifact
 * appends to a Combined entry's authoritative signature: the span tag, then any
 * curated lifecycle facts — `[signature transition]` (one arm of a same-name
 * overload change), `[deprecated since X]`, `[replaced by namespace.symbol]`,
 * `[Box2D: …]` — in that deterministic order, space-joined and text-only. An
 * entry present in every tracked version and carrying no curated fact yields the
 * empty string, so the absence of a tag reads as "available in every tracked
 * version, no lifecycle caveat".
 */
export function compactAvailability(entry: CombinedEntry): string {
  return availabilityTail(entry.label, entry.transition, entry);
}

/**
 * The same tail for one authored or element arm of `entry`: the arm's own span,
 * then the entry's curated facts. Never `[signature transition]`, which
 * describes a declaration changing shape rather than one of its arms.
 */
export function compactArmAvailability(entry: CombinedEntry, arm: AuthoredArm): string {
  return availabilityTail(arm.label, false, entry);
}

function availabilityTail(
  label: AvailabilityLabel,
  transition: boolean,
  facts: Pick<CombinedEntry, "deprecatedSince" | "replacement" | "box2d">,
): string {
  const tags: string[] = [];
  const span = spanTag(label);
  if (span) tags.push(span);
  if (transition) tags.push("[signature transition]");
  if (facts.deprecatedSince) tags.push(`[deprecated since ${facts.deprecatedSince}]`);
  if (facts.replacement) tags.push(`[replaced by ${facts.replacement.name}]`);
  if (facts.box2d && facts.box2d.length > 0) tags.push(`[Box2D: ${facts.box2d.join(", ")}]`);
  return tags.join(" ");
}

/** Per-category badge tallies for a Combined namespace title. */
export interface NamespaceBadgeCounts {
  readonly new: number;
  readonly changed: number;
  readonly deprecated: number;
}

/**
 * Tally the color-badge categories over a Combined namespace's entries: each
 * function or member adds to every category it carries (a changed-and-deprecated
 * symbol bumps both). The entries sharing a kind and name are one symbol whatever
 * their overload signatures, scored once through the shared
 * {@link functionBadgeCategory}, so a signature transition counts as one Changed
 * rather than one New plus one Changed, and the title pills, the sidebar pills
 * and the heading dots can never disagree.
 *
 * `window` scopes the categories to a selected range; omitting it measures the
 * full tracked axis, which is what the entry's precomputed absolute `label`
 * describes. The entry's `label` is deliberately not consulted: it is the
 * absolute prose the pages still render, and it cannot answer for a narrower
 * range. Counting an **unwindowed** namespace at a window equals counting the
 * windowed projection at the same window, because an entry the window excludes
 * carries no category either way — which is what lets the renderer tally every
 * range off one surface.
 */
export function namespaceBadgeCounts(
  ns: CombinedNamespace,
  window?: CategoryWindow,
): NamespaceBadgeCounts {
  const versions = ns.availability.versions;
  const scope = window ?? {
    from: versions[versions.length - 1] ?? "",
    to: versions[0] ?? "",
  };
  const functions = new Map<string, CombinedEntry[]>();
  for (const entry of ns.entries) {
    // A type renders as a section with no marker dot, so the tally counts only
    // the members a page marks.
    if (entry.identity.kind === "TYPEDEF") continue;
    const key = `${entry.identity.kind}\u0000${entry.identity.name}`;
    const group = functions.get(key);
    if (group) group.push(entry);
    else functions.set(key, [entry]);
  }
  let isNew = 0;
  let changed = 0;
  let deprecated = 0;
  for (const members of functions.values()) {
    const category = functionBadgeCategory(members, versions, scope);
    if (category.isNew) isNew += 1;
    if (category.isChanged) changed += 1;
    if (category.isDeprecated) deprecated += 1;
  }
  return { new: isNew, changed, deprecated };
}

/**
 * Every namespace's badge tallies at every window a reader can select, in the
 * order {@link BadgeCountTable} documents. `versionIds` is the tracked axis
 * newest-first in whichever vocabulary the caller uses; the keys come back in
 * that same vocabulary, so the pre-paint script can index it with the range it
 * already holds.
 *
 * The tally is taken over the *unwindowed* namespaces: an entry the window
 * excludes carries no category, so counting the full surface at a window equals
 * counting that window's projection, and no second surface is projected here.
 */
export function buildBadgeCountTable(
  namespaces: readonly CombinedNamespace[],
  versionIds: readonly string[],
): BadgeCountTable {
  const table: Record<string, Record<string, readonly [number, number, number]>> = {};
  for (const ns of namespaces) {
    const windows: Record<string, readonly [number, number, number]> = {};
    for (let to = 0; to < versionIds.length; to += 1) {
      for (let from = to; from < versionIds.length; from += 1) {
        const counts = namespaceBadgeCounts(ns, {
          from: versionIds[from] as string,
          to: versionIds[to] as string,
        });
        if (counts.new === 0 && counts.changed === 0 && counts.deprecated === 0) continue;
        windows[`${versionIds[from]}|${versionIds[to]}`] = [
          counts.new,
          counts.changed,
          counts.deprecated,
        ];
      }
    }
    if (Object.keys(windows).length > 0) table[ns.namespace] = windows;
  }
  return table;
}

/**
 * The categories a namespace's sidebar leaf can reach from *any* window in its
 * {@link BadgeCountTable} row, as the largest tally each one attains there.
 *
 * The pre-paint script only toggles `style.display`, so a category the reader
 * can narrow into has to be in the markup before they narrow — a gapped span
 * reads Changed at the full range and New one step in, and the browser is not
 * allowed to derive that. The server therefore emits the union and hides what
 * the active window scores zero.
 *
 * A magnitude rather than a 0/1 flag: callers only test `> 0`, and a flag
 * wearing a count's type invites a caller to render it. An absent or empty row
 * reaches nothing, which is the same "no pills" the table's omission rules mean.
 */
export function reachableBadgeCounts(
  row: Record<string, readonly [number, number, number]> | undefined,
): NamespaceBadgeCounts {
  let isNew = 0;
  let changed = 0;
  let deprecated = 0;
  for (const triple of Object.values(row ?? {})) {
    if (triple[0] > isNew) isNew = triple[0];
    if (triple[1] > changed) changed = triple[1];
    if (triple[2] > deprecated) deprecated = triple[2];
  }
  return { new: isNew, changed, deprecated };
}

/**
 * Descending-semver comparator over the bare version strings the projection is
 * keyed by, so the axis reads newest-first. Exported as the single ordering the
 * window projection reuses — a second comparator would be free to disagree.
 */
export function compareSemverDesc(a: string, b: string): number {
  const pa = a.split(".").map((part) => Number.parseInt(part, 10));
  const pb = b.split(".").map((part) => Number.parseInt(part, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return db - da;
  }
  if (a < b) return 1;
  if (a > b) return -1;
  return 0;
}

/**
 * Widen a presence-derived `availableIn` with the existence a curated
 * `deprecatedSince` proves: a symbol deprecated as of `D` existed in every
 * tracked version `<= D`, even those whose (incomplete) typings omit it. Unions
 * every such version into `availableIn` and returns the result in the canonical
 * newest-first axis order. With no `deprecatedSince` the presence set is returned
 * unchanged, so a genuinely-new symbol never over-widens.
 */
function availableWithDeprecation(
  availableIn: readonly string[],
  deprecatedSince: string | undefined,
  versions: readonly string[],
): string[] {
  if (deprecatedSince === undefined) return [...availableIn];
  const covered = new Set(availableIn);
  for (const version of versions) {
    if (compareSemverDesc(version, deprecatedSince) >= 0) covered.add(version);
  }
  return versions.filter((version) => covered.has(version));
}

/**
 * The canonical identity for a non-function module member. Exported alongside
 * {@link funcIdentity} so a downstream projection keys members by the exact
 * value {@link buildCombinedSurface} used, rather than re-deriving the encoding.
 */
export function memberIdentity(namespace: string, kind: string, name: string): ApiSymbolIdentity {
  return { namespace, kind, name, signature: "" };
}

/** The canonical identity for a function, overload signature included. */
export function funcIdentity(namespace: string, fn: ApiFunction): ApiSymbolIdentity {
  return { namespace, kind: "FUNCTION", name: fn.name, signature: normalizedFunctionSignature(fn) };
}

function curatedFacts(
  record: ApiAvailability | undefined,
): Pick<CombinedEntry, "deprecatedSince" | "replacement" | "box2d"> {
  if (!record) return {};
  return {
    ...(record.deprecatedSince !== undefined ? { deprecatedSince: record.deprecatedSince } : {}),
    ...(record.replacement !== undefined ? { replacement: record.replacement } : {}),
    ...(record.box2d !== undefined ? { box2d: record.box2d } : {}),
  };
}

interface PresenceRecord {
  identity: ApiSymbolIdentity;
  availableIn: string[];
}

interface NamespaceAccumulator {
  namespace: string;
  brief: string;
  description: string;
  functions: Map<string, ApiFunction>;
  variables: Map<string, ApiVariable>;
  constants: Map<string, ApiConstant>;
  properties: Map<string, ApiProperty>;
  typedefs: Map<string, ApiTypedef>;
  // The reference's own `ENUM` and `STRUCT` names, which a page shows beside the
  // types the declarations rename. Newest version first, by name.
  enums: Map<string, ApiEnum>;
  structs: Map<string, ApiStruct>;
}

/**
 * Build the reusable Combined projection domain model from an ordered set of
 * per-version engine surfaces. Presence (`availableIn`) is recomputed from the
 * surfaces themselves — the version axis is derived by descending semver so the
 * output is independent of input order and auto-expands when a version is added.
 * Signatures come from the authoritative artifact; curated lifecycle facts are
 * overlaid from `api-availability.json`. Pure data: no JSX, no I/O.
 */
export function buildCombinedSurface(input: BuildCombinedSurfaceInput): CombinedSurface {
  const surfaces = [...input.surfaces].sort((a, b) => compareSemverDesc(a.version, b.version));
  const versions = surfaces.map((surface) => surface.version);
  const overlayRecords = input.overlay?.records;

  // Per-identity presence (newest-first, mirroring the canonical version axis)
  // plus the newest concrete definition object seen for each identity.
  const presence = new Map<string, PresenceRecord>();
  // Every ref-doc element of each function identity, per version, in fixture order.
  const elements = new Map<string, Map<string, ApiFunction[]>>();
  const namespaces = new Map<string, NamespaceAccumulator>();
  const accumFor = (module: ApiModule): NamespaceAccumulator => {
    let accum = namespaces.get(module.namespace);
    if (!accum) {
      accum = {
        namespace: module.namespace,
        brief: module.brief,
        description: module.description,
        functions: new Map(),
        variables: new Map(),
        constants: new Map(),
        properties: new Map(),
        typedefs: new Map(),
        enums: new Map(),
        structs: new Map(),
      };
      namespaces.set(module.namespace, accum);
    }
    return accum;
  };
  const seePresence = (identity: ApiSymbolIdentity, version: string): string => {
    const key = symbolIdentityKey(identity);
    const record = presence.get(key) ?? { identity, availableIn: [] };
    if (!record.availableIn.includes(version)) {
      record.availableIn.push(version);
      record.availableIn.sort((a, b) => versions.indexOf(a) - versions.indexOf(b));
    }
    presence.set(key, record);
    return key;
  };

  for (const surface of surfaces) {
    for (const module of surface.modules) {
      const accum = accumFor(module);
      for (const fn of module.functions) {
        const key = seePresence(funcIdentity(module.namespace, fn), surface.version);
        if (!accum.functions.has(key)) accum.functions.set(key, fn);
        const perVersion = elements.get(key) ?? new Map<string, ApiFunction[]>();
        perVersion.set(surface.version, [...(perVersion.get(surface.version) ?? []), fn]);
        elements.set(key, perVersion);
      }
      for (const variable of module.variables) {
        const key = seePresence(
          memberIdentity(module.namespace, "VARIABLE", variable.name),
          surface.version,
        );
        if (!accum.variables.has(key)) accum.variables.set(key, variable);
      }
      for (const constant of module.constants) {
        const key = seePresence(
          memberIdentity(module.namespace, "CONSTANT", constant.name),
          surface.version,
        );
        if (!accum.constants.has(key)) accum.constants.set(key, constant);
      }
      for (const property of module.properties) {
        const key = seePresence(
          memberIdentity(module.namespace, "PROPERTY", property.name),
          surface.version,
        );
        if (!accum.properties.has(key)) accum.properties.set(key, property);
      }
      for (const typedef of module.typedefs) {
        const key = seePresence(
          memberIdentity(module.namespace, "TYPEDEF", typedef.name),
          surface.version,
        );
        if (!accum.typedefs.has(key)) accum.typedefs.set(key, typedef);
      }
      for (const enumeration of module.enums ?? []) {
        if (!accum.enums.has(enumeration.name)) accum.enums.set(enumeration.name, enumeration);
      }
      for (const struct of module.structs ?? []) {
        if (!accum.structs.has(struct.name)) accum.structs.set(struct.name, struct);
      }
    }
  }

  // A type is dated by the declarations that carry it, not by its reference: the
  // signature map holds a TYPEDEF in every version whose declarations declare it,
  // including a type the emitter mints and one an older reference leaves
  // undocumented.
  const ledgerTypedefs = new Map<string, Set<string>>();
  for (const version of versions) {
    for (const key of Object.keys(input.signatures.versions[version] ?? {})) {
      const [namespace = "", kind, name, signature] = key.split("\u0000");
      if (kind !== "TYPEDEF" || signature !== "" || name === undefined) continue;
      seePresence(memberIdentity(namespace, "TYPEDEF", name), version);
      const names = ledgerTypedefs.get(namespace) ?? new Set<string>();
      names.add(name);
      ledgerTypedefs.set(namespace, names);
    }
  }

  // Signature transitions: logical names whose disjoint non-universal overloads
  // cover a contiguous span (the name never disappears, only its signature).
  const nonUniversal: ApiAvailability[] = [];
  for (const record of presence.values()) {
    if (record.availableIn.length < versions.length) {
      nonUniversal.push({ identity: record.identity, availableIn: record.availableIn });
    }
  }
  const transitionNames = signatureTransitionNames(nonUniversal, versions);

  // Each authored fold's lines per version, keyed by namespace and FQN so every
  // identity of a function reads the same arm set.
  const authoredFolds = new Map<string, Map<string, Set<string>>>();
  for (const version of versions) {
    for (const [key, declaration] of Object.entries(input.signatures.versions[version] ?? {})) {
      const [namespace, kind, name = ""] = key.split("\u0000");
      if (kind !== "FUNCTION" || !isAuthoredFold(name, declaration)) continue;
      const fqnKey = `${namespace}\u0000${name}`;
      const perVersion = authoredFolds.get(fqnKey) ?? new Map<string, Set<string>>();
      const lines = perVersion.get(version) ?? new Set<string>();
      for (const line of declaration.split("\n")) if (line.trim() !== "") lines.add(line);
      perVersion.set(version, lines);
      authoredFolds.set(fqnKey, perVersion);
    }
  }
  const authoredArmsByFqn = new Map<string, readonly AuthoredArm[]>();
  const authoredArmsFor = (identity: ApiSymbolIdentity): readonly AuthoredArm[] | undefined => {
    const fqnKey = `${identity.namespace}\u0000${identity.name}`;
    const cached = authoredArmsByFqn.get(fqnKey);
    if (cached) return cached;
    const perVersion = authoredFolds.get(fqnKey);
    if (!perVersion) return undefined;
    const order = new Set(versions.flatMap((version) => [...(perVersion.get(version) ?? [])]));
    const arms = [...order].map((signature): AuthoredArm => {
      const availableIn = versions.filter((version) => perVersion.get(version)?.has(signature));
      return { signature, availableIn, label: availabilityLabel(availableIn, versions) };
    });
    authoredArmsByFqn.set(fqnKey, arms);
    return arms;
  };

  const oldestIndex = (key: string): number =>
    (presence.get(key)?.availableIn ?? []).reduce(
      (max, version) => Math.max(max, versions.indexOf(version)),
      -1,
    );
  const byName = <T extends { name: string }>(a: T, b: T): number => a.name.localeCompare(b.name);
  const fnSort =
    (namespace: string) =>
    (a: ApiFunction, b: ApiFunction): number => {
      if (a.name !== b.name) return a.name.localeCompare(b.name);
      const ka = symbolIdentityKey(funcIdentity(namespace, a));
      const kb = symbolIdentityKey(funcIdentity(namespace, b));
      // Oldest arm first: the overload reaching the oldest version (a higher index
      // on the newest-first axis) leads; the identity key is the stable tiebreak.
      const diff = oldestIndex(kb) - oldestIndex(ka);
      return diff !== 0 ? diff : ka.localeCompare(kb);
    };

  const entryFor = (identity: ApiSymbolIdentity): CombinedEntry => {
    const key = symbolIdentityKey(identity);
    const presenceIn = presence.get(key)?.availableIn ?? [];
    const facts = curatedFacts(overlayRecords?.get(key));
    const availableIn = availableWithDeprecation(presenceIn, facts.deprecatedSince, versions);
    // The signature comes from the newest version whose typings declare the symbol:
    // a version widened in by a deprecation has none unless its declarations
    // back-fill the symbol the reference omits.
    const newest =
      versions.find(
        (version) =>
          availableIn.includes(version) && input.signatures.versions[version]?.[key] !== undefined,
      ) ??
      versions.find((version) => presenceIn.includes(version)) ??
      versions[0] ??
      "";
    const transition = transitionNames.has(symbolNameKey(identity));
    const slotTypes = input.signatures.slotTypes?.[newest]?.[key];
    const authoritativeSignature = input.signatures.versions[newest]?.[key] ?? "";
    const authoredArms =
      identity.kind === "FUNCTION" && isAuthoredFold(identity.name, authoritativeSignature)
        ? authoredArmsFor(identity)
        : undefined;
    const armElements = identity.kind === "FUNCTION" ? elements.get(key)?.get(newest) : undefined;
    const elementArms =
      armElements && armElements.length > 1
        ? authoritativeSignature
            .split("\n")
            .filter((line) => line.trim() !== "")
            .map((signature): AuthoredArm => {
              const armIn = versions.filter((version) =>
                input.signatures.versions[version]?.[key]?.split("\n").includes(signature),
              );
              return { signature, availableIn: armIn, label: availabilityLabel(armIn, versions) };
            })
        : undefined;
    return {
      identity,
      authoritativeSignature,
      ...(authoredArms ? { authoredArms } : {}),
      ...(armElements && elementArms ? { armElements, elementArms } : {}),
      ...(slotTypes ? { slotTypes } : {}),
      availableIn,
      label: availabilityLabel(availableIn, versions, { transition }),
      transition,
      ...facts,
    };
  };

  const result: CombinedNamespace[] = [];
  for (const accum of namespaces.values()) {
    const ns = accum.namespace;
    const functions = [...accum.functions.values()].sort(fnSort(ns));
    const variables = [...accum.variables.values()].sort(byName);
    const constants = [...accum.constants.values()].sort(byName);
    const properties = [...accum.properties.values()].sort(byName);
    const typedefs = [...accum.typedefs.values()].sort(byName);

    const identities: ApiSymbolIdentity[] = [
      ...functions.map((fn) => funcIdentity(ns, fn)),
      ...variables.map((v) => memberIdentity(ns, "VARIABLE", v.name)),
      ...constants.map((c) => memberIdentity(ns, "CONSTANT", c.name)),
      ...properties.map((p) => memberIdentity(ns, "PROPERTY", p.name)),
      ...typedefs.map((t) => memberIdentity(ns, "TYPEDEF", t.name)),
    ];

    // A TYPEDEF no ref-doc accumulator holds — a constant-union alias, an
    // overload-slot alias, a socket handle interface, or a type only an older
    // version's map carries — joins `entries` from the signature map of every
    // version, which is what puts its definition in the page's authoritative map.
    // Its presence is the ledger presence recorded above, so its authoritative
    // signature resolves in every version it spans and its entry carries that
    // span. It holds no availability record: the walk below covers `identities`.
    const declared = new Set(identities.map(symbolIdentityKey));
    const aliasIdentities: ApiSymbolIdentity[] = [];
    for (const name of [...(ledgerTypedefs.get(ns) ?? [])].sort()) {
      const identity = memberIdentity(ns, "TYPEDEF", name);
      if (declared.has(symbolIdentityKey(identity))) continue;
      aliasIdentities.push(identity);
    }

    const records = new Map<string, ApiAvailability>();
    for (const identity of identities) {
      const key = symbolIdentityKey(identity);
      const presenceIn = presence.get(key)?.availableIn ?? [];
      const curated = overlayRecords?.get(key);
      // A symbol present in every version and carrying no curated fact needs no
      // badge, so it holds no record — the render layer then shows nothing. The
      // skip keys on real presence: a deprecated symbol always carries a curated
      // fact, so widening never sneaks it past this guard.
      if (presenceIn.length === versions.length && !curated) continue;
      const facts = curatedFacts(curated);
      const availableIn = availableWithDeprecation(presenceIn, facts.deprecatedSince, versions);
      records.set(key, { identity, availableIn, ...facts });
    }

    result.push({
      namespace: ns,
      module: {
        namespace: ns,
        brief: accum.brief,
        description: accum.description,
        functions,
        variables,
        constants,
        properties,
        typedefs,
        enums: [...accum.enums.values()].sort(byName),
        structs: [...accum.structs.values()].sort(byName),
      },
      availability: { versions, records, transitions: transitionNames },
      entries: [...identities, ...aliasIdentities].map(entryFor),
      ...(input.signatureStore ? { signatureStore: input.signatureStore } : {}),
      ...(input.translationStore ? { translationStore: input.translationStore } : {}),
    });
  }
  result.sort((a, b) => a.namespace.localeCompare(b.namespace));

  return {
    versions,
    namespaces: result,
    ...(input.signatureStore ? { signatureStore: input.signatureStore } : {}),
    ...(input.translationStore ? { translationStore: input.translationStore } : {}),
  };
}
