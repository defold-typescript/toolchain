import { defineEditorScript } from "@defold-typescript/types/editor-script";

export default defineEditorScript({
  get_commands: () => [{ label: "Say Hi", locations: ["Edit"], run: () => print("hi") }],
});

const _s: string = editor.get("/main/game.script", "path") as string;
editor.transact([editor.tx.set("/main/game.script", "text", "x")]);
void _s;

// The call shapes the reference documents, verbatim from the upstream examples.
editor.bob({ archive: true, platform: editor.platform }, "distclean", "resolve", "build", "bundle");
const _captured: undefined | string = editor.execute("git", "log", "--oneline", {
  reload_resources: false,
  out: "capture",
});
void _captured;
editor.execute("git", "log");
editor.transact([editor.tx.add("/main/game.collection", "children", {})]);

// @ts-expect-error go.* is absent on the editor-script surface
go.get_position();
// @ts-expect-error vmath.* is absent on the editor-script surface
vmath.vector3(1, 2, 3);
// @ts-expect-error msg.* is absent on the editor-script surface
msg.post("#", "hello");
// @ts-expect-error editor.ui.* is out of scope for this slice
editor.ui.label({ text: "x" });
