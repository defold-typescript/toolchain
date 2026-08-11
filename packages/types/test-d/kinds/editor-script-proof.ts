export {};

const _s: string = editor.get("/main/game.script", "path") as string;
editor.transact([editor.tx.set("/main/game.script", "text", "x")]);
void _s;

// @ts-expect-error go.* is absent on the editor-script surface
go.get_position();
// @ts-expect-error vmath.* is absent on the editor-script surface
vmath.vector3(1, 2, 3);
// @ts-expect-error msg.* is absent on the editor-script surface
msg.post("#", "hello");
// @ts-expect-error editor.ui.* is out of scope for this slice
editor.ui.label({ text: "x" });
