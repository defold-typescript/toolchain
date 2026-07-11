/**
 * Theirs-only symbol allowlist for the `presence parity` gate in
 * `api-doc-parity.test.ts`. A "theirs-only" symbol exists in the pinned
 * ts-defold-types fixture but not in our emitted surface. Each must either be
 * present in our surface or matched by exactly one of these patterns, otherwise
 * the gate fails. Every entry must also still match at least one current
 * theirs-only symbol (hygiene assertion forces stale entries to be pruned).
 *
 * Seed after the 1.13.0 promotion:
 *   delegated   — bit.*
 *   tracked-gap — the flattened b2d.body_is_fixed_rotation alias
 *   intentional — modeling/casing/reserved-word differences
 */

export type ParityCategory = "delegated" | "intentional" | "tracked-gap";

export interface ParityAllowEntry {
  /** Exact dotted key, or a `<namespace>.*` prefix glob. */
  pattern: string;
  category: ParityCategory;
  reason: string;
}

export const PARITY_ALLOWLIST: ParityAllowEntry[] = [
  {
    pattern: "bit.*",
    category: "delegated",
    reason: "lua-types owns the entire bit namespace; we deliberately never declare it.",
  },
  {
    pattern: "b2d.body_is_fixed_rotation",
    category: "tracked-gap",
    reason: "same b2d.body ref-doc variant, flattened-name form.",
  },
  {
    pattern: "buffer",
    category: "intentional",
    reason:
      'modeled as the buffer namespace + Opaque<"buffer"> handle, not a top-level type alias.',
  },
  {
    pattern: "bufferstream",
    category: "intentional",
    reason: 'modeled as Opaque<"bufferstream"> via DEFOLD_TYPE_MAP, not a top-level type alias.',
  },
  {
    pattern: "node",
    category: "intentional",
    reason:
      "gui node handles are modeled as branded types within the gui surface, not a top-level node alias.",
  },
  {
    pattern: "url",
    category: "intentional",
    reason: "modeled as the Url interface in core-types, not a lowercase top-level alias.",
  },
  {
    pattern: "vmath.quaternion",
    category: "intentional",
    reason: "modeled as the Quaternion type in core-types, not a lowercase vmath.quaternion alias.",
  },
  {
    pattern: "go.delete_",
    category: "intentional",
    reason:
      "reserved-word internal alias differs (delete_ vs our _delete); both re-export the public go.delete.",
  },
  {
    pattern: "json.null_",
    category: "intentional",
    reason:
      "reserved-word internal alias differs (null_ vs our _null); both re-export the public json.null.",
  },
  {
    pattern: "go.input_message",
    category: "intentional",
    reason:
      "input message payloads are modeled via lifecycle InputAction typing, not a go.input_message alias.",
  },
  {
    pattern: "go.touch_input",
    category: "intentional",
    reason:
      "touch input payloads are modeled via lifecycle InputTouch typing, not a go.touch_input alias.",
  },
  {
    pattern: "msg.generic_message",
    category: "intentional",
    reason:
      "generic message payloads are modeled via the typed message-dispatch surface, not a msg.generic_message alias.",
  },
];

/** A `<ns>.*` pattern matches the namespace itself and any dotted descendant; any other pattern is an exact key. */
export function parityPatternMatches(pattern: string, key: string): boolean {
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -2);
    return key === prefix || key.startsWith(`${prefix}.`);
  }
  return key === pattern;
}
