import { defineGuiScript } from "@defold-typescript/types";

// `set_hud` is a project-defined message, not a Defold builtin, so the
// `isMessage` guard (which only accepts builtin ids) does not apply here: match
// the id directly and read the payload `board.ts` posts. `message` arrives as
// `Record<string | number, unknown>`, so the score/level are stringified for
// display rather than typed through a builtin payload.
export default defineGuiScript({
  on_message(_self, message_id, message) {
    if (message_id === hash("set_hud")) {
      gui.set_text(gui.get_node("score"), `SCORE  ${String(message.score)}`);
      gui.set_text(gui.get_node("level"), `LEVEL  ${String(message.level)}`);
    } else if (message_id === hash("game_over")) {
      gui.set_enabled(gui.get_node("gameover"), true);
    }
  },
});
