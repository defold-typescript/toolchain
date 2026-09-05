// A project's own message ids, declared the way `guide/messages.md` documents
// them: a standalone `.d.ts` the program includes, made a module by the
// trailing `export {};`. The proof file beside this one consumes the catalog
// through the shipped declarations, so the documented placement is what is
// under test — not a `declare global` block sharing a source file with its
// consumer.
//
// This augmentation is program-wide, which is why it lives in its own tsc
// program: `test-d/custom-messages.ts` proves the unaugmented behaviour and
// could not if this interface were merged into that program.
declare global {
  interface CustomMessages {
    spawn_wave: { count: number; boss?: boolean };
    // Shadows a built-in id on purpose — the built-in payload must win.
    set_parent: { mine: string };
    // A numeric key the lowering could never emit: `handlerName` accepts only
    // an identifier or a string literal, so this must not reach `MessageId`.
    42: { count: number };
    // Quoted, so it is a string key like any other and stays fully usable.
    "7": { tick: number };
  }
}

export {};
