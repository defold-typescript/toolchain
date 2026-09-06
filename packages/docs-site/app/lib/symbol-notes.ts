// Authored notes attached to one API symbol, rendered directly under its
// heading and above the upstream prose. The ref-doc description and example
// belong to Defold and are vendored byte-for-byte, so a fact that only this
// toolchain knows — a call TypeScript projects differently, or one the
// toolchain deprecates in favor of its own form — has nowhere else to live.
// Keyed by fully-qualified symbol name so every page that renders the symbol
// carries the note — the canonical `/api/<ns>` union page and each
// version-pinned page alike. (`llms-full.txt` lists API signatures without
// prose, so it carries no notes; the guide section a note links is in there.)
//
// Keep a note short and actionable, and link the guide page that carries the
// full explanation rather than restating it here.
export const SYMBOL_NOTES: Readonly<Record<string, string>> = {
  "go.property": [
    "> [!WARNING]",
    "> **In the `defold-typescript` toolchain, don't call `go.property` yourself.**",
    "> Declare the property in the `properties` field of `defineScript` instead —",
    "> that is the only form that types the property onto `self`, and the",
    "> transpiler emits the chunk-scope `go.property(...)` registration Defold",
    "> needs. A direct call still registers the property at runtime, but it never",
    "> reaches `self`'s type, so reading `self.<name>` in a hook is a compile",
    "> error. The build reports it as a warning and names the file.",
    ">",
    "> ```ts",
    "> export default defineScript({",
    ">   properties: { health: 100 }, // self.health: number",
    "> });",
    "> ```",
    ">",
    "> Anything below written as a direct call is Defold's own Lua documentation.",
    "> [Script properties on `self`](/script-lifecycle#script-properties-on-self)",
    "> carries the TypeScript form and what a direct call costs you.",
  ].join("\n"),
};

// The note for a symbol, or `undefined` when none is authored. A page renders a
// note once per symbol name: an FQN with several overload rows would otherwise
// repeat it down the whole section.
export function symbolNote(name: string): string | undefined {
  // `hasOwn` rather than a bare index: symbol names arrive from the surface, and
  // one colliding with an inherited `Object.prototype` key would otherwise
  // return a function where a note belongs.
  return Object.hasOwn(SYMBOL_NOTES, name) ? SYMBOL_NOTES[name] : undefined;
}
