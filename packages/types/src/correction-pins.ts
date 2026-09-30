// A slot-level type correction records the upstream spelling it contradicts
// (`upstream`) and any later spelling of the same defect a newer release
// declares (`retypedUpstream`). The emitter applies the correction only while
// the slot being emitted still declares one of them, and the provenance tests
// ask the same question of every retained target, so one table serves every
// release and neither side can drift from the other.
export interface PinnedCorrection {
  readonly upstream: readonly string[];
  readonly retypedUpstream?: readonly (readonly string[])[];
}

// `nil` is optionality, which `isDocOptional` owns (and, for a return, the
// return lane's own `nil` verdict); a correction rewrites only the concrete
// tokens, so only those are evidence.
export function baseTokens(tokens: readonly string[]): string {
  return tokens.filter((token) => token !== "nil").join("|");
}

export function correctionPins(correction: PinnedCorrection): readonly (readonly string[])[] {
  return [correction.upstream, ...(correction.retypedUpstream ?? [])];
}

export function pinMatches(
  declared: readonly string[],
  pins: readonly (readonly string[])[],
): boolean {
  const base = baseTokens(declared);
  return pins.some((pin) => baseTokens(pin) === base);
}

// A property pins the text of its `<span class="type">`, split the way
// `parseProperty` splits it.
export function spanTokens(span: string): string[] {
  return span
    .split("|")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

export interface PinnedPropertyCorrection {
  readonly upstream: string;
  readonly retypedUpstream?: readonly string[];
}

export function propertyCorrectionPins(
  correction: PinnedPropertyCorrection,
): readonly (readonly string[])[] {
  return [correction.upstream, ...(correction.retypedUpstream ?? [])].map(spanTokens);
}
