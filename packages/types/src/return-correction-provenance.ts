// Provenance helpers for the two return-side correction tables. Both read the
// vendored ref-doc as text rather than through `parseDefoldApiDoc`, because the
// evidence a return-side correction rests on lives in the slot's HTML prose and
// the parser discards it.

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
