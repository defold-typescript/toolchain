// A symbol mention is "self-referring" when it names the very symbol whose
// description it sits in — e.g. `math.random` mentioned inside `math.random`'s
// own body. Its reference popup would point the reader back to the definition
// they are already reading, so the island suppresses the popup and gently
// underlines the mention instead. The owner comes from the section's
// `### signature` heading; both sides normalize to a call-free key (the
// registry is keyed call-free and signatures carry an argument list) before
// comparison.

export function normalizeSymbolKey(text: string): string {
  return text.replace(/\(.*$/s, "").trim();
}

export function isSelfReference(mentionText: string, ownerSignature: string): boolean {
  const owner = normalizeSymbolKey(ownerSignature);
  if (owner === "") return false;
  return normalizeSymbolKey(mentionText) === owner;
}
