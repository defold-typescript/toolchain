/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as wrap_node from "wrap.node";
import * as wrap_node_list from "wrap.node_list";

// Compile-only proof for the defold-wrap forks, written as upstream's README wraps and
// chains nodes. No assertions execute; tsc --noEmit under tsconfig.dts-check.json is the
// gate.

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// Every setter returns the node it was called on, so calls chain.
const chained = wrap_node.new("box").set_alpha(0.5).set_enabled(true);
const _chained: Equal<typeof chained, wrap_node.Node> = true;
void _chained;

const node = wrap_node.new(gui.get_node("box"));
const raw: Opaque<"node"> = node.node;
void raw;

const x = node.get_position_x();
const _x: Equal<typeof x, number> = true;
void _x;

// Each method upstream ends with `return self` is chainable, not only the two above.
type ChainableName = Extract<
  keyof wrap_node.Node,
  | `set_${string}`
  | `add_${string}`
  | `cancel_${string}`
  | `play_${string}`
  | `move_${string}`
  | "animate"
  | "delete"
  | "reset_material"
  | "stop_particlefx"
>;
type Unchained = {
  [K in ChainableName]: wrap_node.Node[K] extends (...args: never[]) => wrap_node.Node ? never : K;
}[ChainableName];
const _unchained: Equal<Unchained, never> = true;
void _unchained;

// The setters widen what the engine takes where their bodies do.
node.set_color("#ffff00");
node.set_color("#ffff0080");
node.set_color(vmath.vector4(1, 1, 0, 1));
node.set_scale(1);
node.set_scale(vmath.vector3(2, 2, 1));
node.add_position(vmath.vector3(1, 0, 0));
node.add_position(5);
node.add_size(10).add_euler(vmath.vector3(0, 0, 45));

// One property and one target, or an array of each paired by index.
node.animate("position.x", 10, gui.EASING_LINEAR, 1);
node.animate(gui.PROP_COLOR, vmath.vector4(1, 1, 1, 0), gui.EASING_OUTQUAD, 0.5, 0.2);
node.animate(["position.x", "color.w"], [10, 0], gui.EASING_LINEAR, 1);
node.cancel_animations(["position.x", "color.w"]).cancel_animation("scale");
node.cancel_animations();

// A parent or child is a wrapped node or a raw one.
node.add_child(wrap_node.new("child")).set_parent(gui.get_node("root"), true);
node.move_above(undefined);

// `new_<kind>_node` returns the raw node, `new_<kind>` wraps it.
const text_node = node.new_text_node(undefined, "x");
const _text_node: Equal<typeof text_node, Opaque<"node">> = true;
void _text_node;

const text = node.new_text(undefined, "x");
const _text: Equal<typeof text, wrap_node.Node> = true;
void _text;

const width = node.get_text_metrics().width;
const _width: Equal<typeof width, number> = true;
void _width;

const parent = node.get_parent();
const _parent: Equal<typeof parent, Opaque<"node"> | undefined> = true;
void _parent;

// @ts-expect-error an alpha is a number
node.set_alpha("x");

// @ts-expect-error a color string is `#rrggbb` or `#rrggbbaa`
node.set_color("red");

// @ts-expect-error an array of properties takes an array of targets
node.animate(["position.x"], 1, gui.EASING_LINEAR, 1);

// @ts-expect-error a component setter needs its value
node.set_position_x();

// A node list's keys are the names it is given, by array or by record.
const title = wrap_node_list.new(["title", "button"]).title;
const _title: Equal<typeof title, wrap_node.Node> = true;
void _title;

const box = wrap_node_list.new({ title: "text_title", box: gui.get_node("box") }).box;
const _box: Equal<typeof box, wrap_node.Node> = true;
void _box;

wrap_node_list.new(["title"]).title.set_text("Admin").set_color("#ffffff");

// The tree a list is built from is kept on it, and its ids are looked up in it first.
const cloned = wrap_node_list.new(["button"], gui.clone_tree(gui.get_node("button")));
const tree = cloned.tree;
const _tree: Equal<typeof tree, ReturnType<typeof gui.clone_tree> | undefined> = true;
void _tree;

// A node named `tree` replaces the tree, as upstream assigns it after.
const named_tree = wrap_node_list.new(["tree"]).tree;
const _named_tree: Equal<typeof named_tree, wrap_node.Node> = true;
void _named_tree;

// @ts-expect-error a list has only the names it was given
wrap_node_list.new(["title"]).other;

// @ts-expect-error a record names a node id or a node
wrap_node_list.new({ title: 1 });
