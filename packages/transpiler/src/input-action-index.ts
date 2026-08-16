import { parseSceneTextFormat, SceneTextFormatError } from "./scene-text-format";

// The action names the project's `.input_binding` files declare — the whole
// universe an `on_input` handler can compare against, since an action no binding
// produces never fires. A project-wide union, deliberately: which binding is
// live is a `game.project` `[input] game_binding` setting, and a suggestion
// claims nothing about what is absent.
//
// Every top-level sub-message contributes, not a list of the trigger kinds
// Defold ships today: `key_trigger`, `mouse_trigger`, `gamepad_trigger` and
// `text_trigger` all carry the same `action` field, and a kind added upstream
// would otherwise drop out of the universe silently. The `input` half names an
// engine constant rather than anything the project declares, so it is never
// offered.
//
// A document that will not parse is skipped and its siblings still contribute —
// the same honest-hole convention `buildGuiNodeIndex` uses, with no `unresolved`
// channel because nothing here reports.
export function buildInputActionIndex(documents: ReadonlyMap<string, string>): ReadonlySet<string> {
  const actions = new Set<string>();

  for (const text of documents.values()) {
    let document: ReturnType<typeof parseSceneTextFormat>;
    try {
      document = parseSceneTextFormat(text);
    } catch (error) {
      if (!(error instanceof SceneTextFormatError)) throw error;
      continue;
    }

    for (const triggers of document.messages.values()) {
      for (const trigger of triggers) {
        for (const action of trigger.fields.get("action") ?? []) {
          if (action !== "") actions.add(action);
        }
      }
    }
  }

  return actions;
}
