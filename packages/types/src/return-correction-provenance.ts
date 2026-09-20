// Provenance helpers for the two return-side correction tables. Both read the
// vendored ref-doc as text rather than through `parseDefoldApiDoc`, because the
// evidence a return-side correction rests on lives in the slot's HTML prose and
// the parser discards it.

import type { ReturnFieldOptionalityCorrection, ReturnTypeCorrection } from "./emit-dts";
import type { ProvenanceSurface } from "./optional-correction-provenance";

const NAMED_ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function decodeEntities(text: string): string {
  let out = text;
  for (const [entity, char] of Object.entries(NAMED_ENTITIES)) {
    out = out.split(entity).join(char);
  }
  out = out.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  // `&amp;` last so an already-decoded `&` is never re-interpreted.
  return out.split("&amp;").join("&");
}

/**
 * Decode a ref-doc prose fragment to the plain text a correction's `evidence`
 * string is matched against.
 *
 * Unlike `htmlToDocText`, a `<span class="icon-X">` marker survives as `[X]`.
 * Upstream states some field-presence gates only through that marker —
 * `user_agent` carries `icon-html5` and no availability sentence at all — so
 * stripping it would leave those corrections pinned to prose that says nothing
 * about presence, and an upstream fix removing the gate would not red them.
 */
export function decodeSlotProse(html: string): string {
  const withIcons = html.replace(
    /<span class="icon-([a-z0-9-]+)"><\/span>/gi,
    (_, platform: string) => `[${platform}]`,
  );
  return decodeEntities(withIcons.replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

/**
 * The decoded prose of one `<dd>` in a slot doc's `<dl>`, keyed by the `<dt>`
 * field name. Returns `undefined` when the slot doc has no entry for the field,
 * which is the signal that upstream renamed or dropped it.
 */
export function fieldProse(slotDoc: string, field: string): string | undefined {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`<dt><code>${escaped}</code></dt>\\s*<dd>([\\s\\S]*?)</dd>`, "i").exec(
    slotDoc,
  );
  return match?.[1] === undefined ? undefined : decodeSlotProse(match[1]);
}

/**
 * The `<span class="type">` tokens upstream declares for one `<dd>`, split the
 * way the table-field parser splits them. An absent field yields `undefined`;
 * a field with no type span yields an empty array.
 */
export function fieldTypeTokens(slotDoc: string, field: string): readonly string[] | undefined {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`<dt><code>${escaped}</code></dt>\\s*<dd>([\\s\\S]*?)</dd>`, "i").exec(
    slotDoc,
  );
  if (match?.[1] === undefined) return undefined;
  const span = /<span class="type">([^<]*)<\/span>/.exec(match[1]);
  if (span?.[1] === undefined) return [];
  return span[1]
    .split("|")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

interface RawSlot {
  readonly name?: string;
  readonly doc?: string;
  readonly types?: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Every `returnvalues` entry of every FUNCTION in the surface named `element`,
// unfiltered by slot: one target can declare the element more than once.
function returnSlots(doc: unknown, element: string): RawSlot[] {
  if (!isRecord(doc) || !Array.isArray(doc.elements)) return [];
  return doc.elements.flatMap((candidate) =>
    isRecord(candidate) &&
    candidate.type === "FUNCTION" &&
    candidate.name === element &&
    Array.isArray(candidate.returnvalues)
      ? candidate.returnvalues.filter(isRecord)
      : [],
  );
}

// The first `returnvalues` entry of each declaration of `element`, one per
// declaration so a target that declares the element twice is folded, not sliced.
function firstReturnSlots(doc: unknown, element: string): RawSlot[] {
  if (!isRecord(doc) || !Array.isArray(doc.elements)) return [];
  return doc.elements.flatMap((candidate) => {
    if (
      !isRecord(candidate) ||
      candidate.type !== "FUNCTION" ||
      candidate.name !== element ||
      !Array.isArray(candidate.returnvalues)
    ) {
      return [];
    }
    const first = candidate.returnvalues[0];
    return isRecord(first) ? [first] : [];
  });
}

function namespaceOf(element: string): string {
  return element.slice(0, element.lastIndexOf("."));
}

// A sighted target lands in exactly one bucket, strongest signal first. A
// dropped field outranks a needed one because `applyFieldOptionalityCorrections`
// throws for that target, so regen fails there whatever the other declarations
// say; a needed one outranks a resolved one so an overload that still shows the
// defect keeps the correction alive, matching `correctionProvenance`.
type FieldVerdict = "missing" | "needed" | "resolved";

const FIELD_VERDICT_RANK: Record<FieldVerdict, number> = {
  missing: 2,
  needed: 1,
  resolved: 0,
};

export interface ReturnFieldProvenance {
  readonly key: string;
  readonly sightedIn: readonly string[];
  readonly neededBy: readonly string[];
  readonly resolvedIn: readonly string[];
  readonly missingFieldIn: readonly string[];
  readonly typeDrift: readonly string[];
}

// Upstream sets no structural optionality flag on a return *field* — the parser
// never populates `TableField.optional`, only the curation and correction passes
// do — so there is no `isMarkedOptional` analogue to read here. "Resolved" is
// therefore prose- and token-shaped: the evidence sentence is gone from the
// field's `<dd>`, or its type span now declares `nil` itself.
//
// `missingFieldIn` is deliberately not a resolution. A field upstream dropped
// from a slot the target still declares makes the correction stale, and
// `applyFieldOptionalityCorrections` throws rather than no-op for it, so that
// target needs a human decision instead of a silent deletion.
export function fieldCorrectionProvenance(
  entries: readonly [string, ReturnFieldOptionalityCorrection][],
  surfaces: readonly ProvenanceSurface[],
): ReturnFieldProvenance[] {
  return entries.map(([key, correction]) => {
    const parts = key.split(":");
    if (parts.length !== 4) {
      throw new Error(`fieldCorrectionProvenance: malformed key ${key}`);
    }
    const [element, , slotName, field] = parts as [string, string, string, string];
    const namespace = namespaceOf(element);

    const verdicts = new Map<string, FieldVerdict>();
    const drift = new Map<string, Set<string>>();
    for (const surface of surfaces) {
      if (surface.namespace !== namespace) continue;
      for (const slot of returnSlots(surface.doc, element)) {
        if (slot.name !== slotName) continue;
        const slotDoc = slot.doc ?? "";
        const prose = fieldProse(slotDoc, field);
        const tokens = fieldTypeTokens(slotDoc, field);

        let verdict: FieldVerdict;
        if (prose === undefined) {
          verdict = "missing";
        } else if (!prose.includes(correction.evidence) || (tokens ?? []).includes("nil")) {
          verdict = "resolved";
        } else {
          verdict = "needed";
          if ((tokens ?? []).join("|") !== correction.upstream.join("|")) {
            const messages = drift.get(surface.target) ?? new Set<string>();
            drift.set(surface.target, messages);
            messages.add(
              `${surface.target}: pinned ${correction.upstream.join("|")}, found ${tokens?.join("|") ?? "no field"}`,
            );
          }
        }

        const seen = verdicts.get(surface.target);
        if (seen === undefined || FIELD_VERDICT_RANK[verdict] > FIELD_VERDICT_RANK[seen]) {
          verdicts.set(surface.target, verdict);
        }
      }
    }

    const sightedIn = [...verdicts.keys()].sort();
    const inBucket = (verdict: FieldVerdict) =>
      sightedIn.filter((target) => verdicts.get(target) === verdict);
    const neededBy = inBucket("needed");
    return {
      key,
      sightedIn,
      neededBy,
      resolvedIn: inBucket("resolved"),
      missingFieldIn: inBucket("missing"),
      typeDrift: neededBy.flatMap((target) => [...(drift.get(target) ?? [])]).sort(),
    };
  });
}

export interface ReturnTypeProvenance {
  readonly key: string;
  readonly sightedIn: readonly string[];
  readonly neededBy: readonly string[];
  readonly resolvedIn: readonly string[];
  readonly driftedIn: readonly string[];
  readonly typeDrift: readonly string[];
}

// Same ranking argument as `FIELD_VERDICT_RANK`: `emitReturn` applies the
// correction to every declaration of the FQN in a target, so one drifted
// declaration makes that target's emit wrong whatever its siblings say.
type ReturnVerdict = "drift" | "needed" | "resolved";

const RETURN_VERDICT_RANK: Record<ReturnVerdict, number> = {
  drift: 2,
  needed: 1,
  resolved: 0,
};

function baseTokens(tokens: readonly string[]): string {
  return tokens.filter((token) => token !== "nil").join("|");
}

// The return-type class has the same two-sided evidence: the declared tokens
// still say what the correction contradicts, and the slot prose still states the
// contradiction. A target that fixes either half no longer needs the entry.
//
// Unlike the field lane, a changed base type is drift here rather than a
// resolution. A field correction only flips `optional` and leaves the type
// parser-authoritative, so a retyped field still emits what upstream declares; a
// return correction replaces the whole emitted type, so a base upstream no longer
// declares means the correction now overwrites a type nobody verified — a
// decision for a human, not a deletion and not a silent bank.
export function returnCorrectionProvenance(
  entries: readonly [string, ReturnTypeCorrection][],
  surfaces: readonly ProvenanceSurface[],
): ReturnTypeProvenance[] {
  return entries.map(([key, correction]) => {
    const namespace = namespaceOf(key);
    const pinned = baseTokens(correction.upstream);

    const verdicts = new Map<string, ReturnVerdict>();
    const drift = new Map<string, Set<string>>();
    for (const surface of surfaces) {
      if (surface.namespace !== namespace) continue;
      // The correction rewrites the first return only, so only that slot is
      // evidence; a declaration with no returns at all sights nothing.
      for (const slot of firstReturnSlots(surface.doc, key)) {
        const tokens = slot.types ?? [];

        let verdict: ReturnVerdict;
        if (baseTokens(tokens) !== pinned) {
          verdict = "drift";
          const messages = drift.get(surface.target) ?? new Set<string>();
          drift.set(surface.target, messages);
          messages.add(
            `${surface.target}: pinned ${correction.upstream.join("|")}, found ${tokens.join("|")}`,
          );
        } else if (
          tokens.includes("nil") ||
          !decodeSlotProse(slot.doc ?? "").includes(correction.reason)
        ) {
          verdict = "resolved";
        } else {
          verdict = "needed";
        }

        const seen = verdicts.get(surface.target);
        if (seen === undefined || RETURN_VERDICT_RANK[verdict] > RETURN_VERDICT_RANK[seen]) {
          verdicts.set(surface.target, verdict);
        }
      }
    }

    const sightedIn = [...verdicts.keys()].sort();
    const inBucket = (verdict: ReturnVerdict) =>
      sightedIn.filter((target) => verdicts.get(target) === verdict);
    const driftedIn = inBucket("drift");
    return {
      key,
      sightedIn,
      neededBy: inBucket("needed"),
      resolvedIn: inBucket("resolved"),
      driftedIn,
      typeDrift: driftedIn.flatMap((target) => [...(drift.get(target) ?? [])]).sort(),
    };
  });
}
