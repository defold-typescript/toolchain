export {};

// A target whose engine has the nil branch of `gui_script.cpp:LuaSet` accepts
// the texture removal form and keeps every other `gui.get`, `gui.set` and
// `gui.animate` form. `test/versions.test.ts` picks this proof or its absent
// twin from each target's vendored engine source.

const node = gui.get_node("box");
const _w: number = gui.get(node, "position").w;
gui.get(node, hash("tint"), { index: 2 });
gui.set(node, "rotation", vmath.quat());
gui.set(msg.url(), "textures", hash("atlas"), { key: "k" });
gui.animate(node, "position.x", 1, gui.EASING_LINEAR, 1);
// @ts-expect-error only `textures` accepts nil
gui.set(msg.url(), "fonts", undefined, { key: "k" });
void _w;

gui.set(msg.url(), "textures", undefined, { key: "k" });
