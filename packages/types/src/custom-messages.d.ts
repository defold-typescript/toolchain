/** @noSelfInFile */

declare global {
  /**
   * A project's own message ids, mapped to the payload each carries. Empty as
   * shipped and extended by declaration merging in your own code:
   *
   * ```ts
   * declare global {
   *   interface CustomMessages {
   *     spawn_wave: { count: number; boss?: boolean };
   *   }
   * }
   * ```
   *
   * Once declared, an id is checked on `msg.post` and narrowed by `isMessage`
   * and `onMessage` exactly like a built-in one. Augment this interface rather
   * than `BuiltinMessages`, which is regenerated from the Defold reference docs
   * and reserved for the ids the engine itself defines.
   */
  interface CustomMessages {}

  /** Every message id with a declared payload: the engine's, plus your own. */
  type MessageId = BuiltinMessageId | keyof CustomMessages;

  // A built-in id is tested first, so a `CustomMessages` key shadowing one is
  // inert rather than silently re-typing an engine message. Resolving to the
  // intersection instead would yield an unsatisfiable payload and point the
  // diagnostic at the call site rather than the declaration.
  /**
   * The payload declared for a message id: its `BuiltinMessages` entry, else
   * its `CustomMessages` entry, else the open record an undeclared id keeps.
   * An id declared in both resolves to the built-in payload.
   */
  type MessagePayload<K> = K extends BuiltinMessageId
    ? BuiltinMessages[K]
    : K extends keyof CustomMessages
      ? CustomMessages[K]
      : Record<string | number, unknown>;
}

export {};
