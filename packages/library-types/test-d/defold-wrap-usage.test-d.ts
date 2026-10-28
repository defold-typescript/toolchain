/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as wrap_go from "wrap.go";
import * as wrap_go_list from "wrap.go_list";
import * as gui_applet from "wrap.gui_applet";
import * as gui_object from "wrap.gui_object";
import * as gui_scene from "wrap.gui_scene";
import * as wrap_node from "wrap.node";
import * as wrap_node_list from "wrap.node_list";
import * as wrap from "wrap.wrap";

// Compile-only proof for the defold-wrap forks, written as upstream's README wraps and
// chains nodes and game objects, and as its example builds scenes and objects. No
// assertions execute; tsc --noEmit under tsconfig.dts-check.json is the gate.

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

// A hex color takes six or eight digits in either case, or a string checked at run time.
node.set_color("#FFFF0080");
node.set_color("#A0b1C2");
node.set_color(vmath.vector3(1, 1, 0));

declare const checked: wrap_node.HexColor;
node.set_color(checked);

// @ts-expect-error a hex pair is two hex digits
node.set_color("#red");

// @ts-expect-error a hex color has digits
node.set_color("#");

// @ts-expect-error a hex color has six or eight digits
node.set_color("#fff");

// @ts-expect-error a hex color has six or eight digits
node.set_color("#ffff00f");

// @ts-expect-error a hex color has six or eight digits
node.set_color("#ffff00ff00");

// @ts-expect-error a hex digit is 0-9 or a-f
node.set_color("#gg0000");

declare const any_string: string;
declare const hash_string: `#${string}`;

// @ts-expect-error an unchecked string may not be a hex color
node.set_color(any_string);

// @ts-expect-error an unchecked string may not be a hex color
node.set_color(hash_string);

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

const record_tree = wrap_node_list.new({ tree: "box" }).tree;
const _record_tree: Equal<typeof record_tree, wrap_node.Node> = true;
void _record_tree;

// Names that are not literals may include `tree`, so it is either a node or the tree.
declare const names: readonly string[];
const open_tree = wrap_node_list.new(names).tree;
const _open_tree: Equal<typeof open_tree, wrap_node.Node | wrap_node.NodeTree | undefined> = true;
void _open_tree;

const open_title = wrap_node_list.new(names).title;
const _open_title: Equal<typeof open_title, wrap_node.Node | undefined> = true;
void _open_title;

declare const named: Record<string, string | Opaque<"node">>;
const named_open_tree = wrap_node_list.new(named).tree;
const _named_open_tree: Equal<
  typeof named_open_tree,
  wrap_node.Node | wrap_node.NodeTree | undefined
> = true;
void _named_open_tree;

// @ts-expect-error a list has only the names it was given
wrap_node_list.new(["title"]).other;

// @ts-expect-error a record names a node id or a node
wrap_node_list.new({ title: 1 });

// A wrapped game object forwards each method to the `go.*` function of the same name,
// with its url last where the engine takes it last, and its setters chain.
const hero = wrap_go.new("/hero").set_position_x(1).add_position_y(2);
const _hero: Equal<typeof hero, wrap_go.Go> = true;
void _hero;

const world_position = hero.get_world_position();
const _world_position: Equal<typeof world_position, Vector3> = true;
void _world_position;

type GoChainableName = Extract<
  keyof wrap_go.Go,
  `set${string}` | `add_${string}` | "animate" | "cancel_animations" | "delete" | "post"
>;
type GoUnchained = {
  [K in GoChainableName]: wrap_go.Go[K] extends (...args: never[]) => wrap_go.Go ? never : K;
}[GoChainableName];
const _go_unchained: Equal<GoUnchained, never> = true;
void _go_unchained;

hero.post("jump");
hero.post("jump", { height: 2 });
hero.set("position.x", 5).set(hash("speed"), 2);
hero.animate("position.x", go.PLAYBACK_ONCE_FORWARD, 10, go.EASING_LINEAR, 1);
hero.animate(
  ["position.x", "position.y"],
  go.PLAYBACK_ONCE_FORWARD,
  [10, 20],
  go.EASING_LINEAR,
  1,
  0.5,
  (_self, url, property) => {
    void url;
    void property;
  },
);
hero.cancel_animations(["position.x", "position.y"]).cancel_animations();
hero.set_parent(msg.url("/world"), true).set_parent();

const position_x = hero.get("position.x");
const _position_x: Equal<typeof position_x, number> = true;
void _position_x;

const go_parent = hero.get_parent();
const _go_parent: Equal<typeof go_parent, ReturnType<typeof go.get_parent>> = true;
void _go_parent;

// @ts-expect-error a position is a vector
hero.set_position("x");

// @ts-expect-error an array of properties takes an array of targets
hero.animate(["position.x"], go.PLAYBACK_ONCE_FORWARD, 1, go.EASING_LINEAR, 1);

// @ts-expect-error a parent is a url, not a wrapper
hero.set_parent(hero);

// A game object list's keys are the urls it is given, or the names they are paired with.
const listed_hero = wrap_go_list.new(["/hero", "/enemy"])["/hero"];
const _listed_hero: Equal<typeof listed_hero, wrap_go.Go> = true;
void _listed_hero;

const camera = wrap_go_list.new({ hero: "/hero", camera: msg.url("/camera") }).camera;
const _camera: Equal<typeof camera, wrap_go.Go> = true;
void _camera;

// @ts-expect-error a list has only the names it was given
wrap_go_list.new({ hero: "/hero" }).enemy;

// @ts-expect-error a record names a url
wrap_go_list.new({ hero: 1 });

// @ts-expect-error unlike a node list, a game object list takes no tree
wrap_go_list.new(["/hero"], undefined);

// The forks' helper aliases stay private: `export { new_ as new }` turns off the
// implicit export of every other module member.
// @ts-expect-error a helper alias is not exported
export type _HexDigit = wrap_node.HexDigit;

// @ts-expect-error a helper alias is not exported
export type _HexDigitCount = wrap_node.HexDigitCount<"ff">;

// @ts-expect-error a helper alias is not exported
export type _OpenKey = wrap_node_list.OpenKey<string>;

// A GUI object subclass types its props, its settings and the fields a game adds, and a
// hook assigned to it sees the instance as `this`, as upstream's `function Object:init()`.
const Button = gui_object.extend<
  { text: string },
  { on_click?: () => void },
  { hover?: boolean }
>();
Button.init = function () {
  this.new_text(undefined, this.props.text).set_font("default");
  this.hover = false;
  const _props: Equal<typeof this.props, { text: string }> = true;
  void _props;
  const _settings: Equal<typeof this.settings, { on_click?: () => void }> = true;
  void _settings;
  const _scene: Equal<typeof this.scene, gui_scene.GuiScene> = true;
  void _scene;
};

// @ts-expect-error a hook takes the parameters of the lifecycle function it mirrors
Button.init = function (_text: string) {
  this.hover = true;
};

const Lobby = gui_scene.extend<{ label?: gui_object.GuiObject }>();
Lobby.init = function () {
  this.set_transitions({
    transition_in: this.slide_in_left(),
    transition_out: this.slide_out_right(),
  });
  this.register_modal("modal", Button, { text: "I'm a modal" });
  this.label = this.new_object(Button, { text: "Hi" });

  const button = this.new_object(Button, { text: "Hi" }, { on_click: () => undefined });
  const _button_text: Equal<typeof button.props.text, string> = true;
  void _button_text;
  const _button_hover: Equal<typeof button.hover, boolean | undefined> = true;
  void _button_hover;

  const modal = this.open_modal("modal");
  const _modal: Equal<typeof modal, gui_object.GuiObject | undefined> = true;
  void _modal;

  // A modal may also be a plain table of hooks and fields, which sees the object, with the
  // table's own fields, as `this`.
  this.register_modal("note", {
    label: "note",
    init() {
      this.new_text(undefined, this.label);
      const _note_label: Equal<typeof this.label, string> = true;
      void _note_label;
      const _note_scene: Equal<typeof this.scene, gui_scene.GuiScene> = true;
      void _note_scene;
    },
  });

  // @ts-expect-error a `__name` passes the table off as a class, whose missing `new` is called
  this.register_modal("fake", { __name: "GuiObject" });

  // @ts-expect-error a copied `new` replaces the constructor of the modal's class
  this.register_modal("ctor", { new: () => Button.new() });

  // @ts-expect-error a copied `__index` replaces method lookup for every modal instance
  this.register_modal("lookup", { __index: Button });

  // @ts-expect-error props are checked against the class
  this.new_object(Button, { text: 1 });

  // @ts-expect-error `setup` defaults omitted props to `{}`, which lacks `text`
  this.new_object(Button);

  // @ts-expect-error `new_object` calls `new` on what it is given, so it takes only a class
  this.new_object({ init() {} });

  // @ts-expect-error a transition is a function taking `on_done`
  this.set_transitions({ transition_in: 1 });
};

const _lobby_label: Equal<(typeof Lobby)["label"], gui_object.GuiObject | undefined> = true;
void _lobby_label;

// An applet shows a registered scene by name, a scene class, or a plain table of hooks,
// whose fields the hooks see beside the scene's own.
declare const action: go.on_input.Action;
const app = gui_applet.new("root");
app.register_scene("lobby", Lobby);
app.show_scene("lobby");
app.show_scene(Lobby);
app.show_scene({
  init() {
    this.new_object(Button, { text: "x" });
  },
});
app.register_scene("bouncing", {
  direction: 1,
  update(dt: number) {
    this.direction = -this.direction * dt;
    const _direction: Equal<typeof this.direction, number> = true;
    void _direction;
    const _app: Equal<typeof this.app, gui_applet.GuiApplet> = true;
    void _app;
  },
});

// @ts-expect-error a `__name` passes the table off as a class, whose missing `new` is called
app.register_scene("fake", { __name: "GuiScene" });

// @ts-expect-error a copied `new` replaces the constructor of the scene's class
app.register_scene("ctor", { new: () => Lobby.new() });

// @ts-expect-error a copied `__index` replaces method lookup for every scene instance
app.register_scene("lookup", { __index: Lobby });

// @ts-expect-error a `__name` passes the table off as a class, whose missing `new` is called
app.show_scene({ __name: "GuiScene", init(): void {} });

// @ts-expect-error a `__name` passes the table off as a class, whose missing `new` is called
gui_applet.new("root", { __name: "GuiScene" });

app.update(1 / 60);

const consumed = app.on_input(hash("touch"), action);
const _consumed: Equal<typeof consumed, boolean> = true;
void _consumed;

const _app_root: Equal<typeof app.root, wrap_node.Node> = true;
void _app_root;

// @ts-expect-error a scene is a class or a table of hooks
app.register_scene("x", 5);

// The facade a project requires wraps one node or game object, or a list of them, as the
// README's first chain does, and creates an applet.
const facade_box = wrap.node("box").set_alpha(0.5).set_enabled(true);
const _facade_box: Equal<typeof facade_box, wrap_node.Node> = true;
void _facade_box;

const facade_title = wrap.node(["title"]).title;
const _facade_title: Equal<typeof facade_title, wrap_node.Node> = true;
void _facade_title;

const facade_button = wrap.node("button", gui.clone_tree(gui.get_node("button")));
const _facade_button: Equal<typeof facade_button, wrap_node.Node> = true;
void _facade_button;

const facade_named = wrap.node({ title: "text_title", button: gui.get_node("button") }).button;
const _facade_named: Equal<typeof facade_named, wrap_node.Node> = true;
void _facade_named;

const facade_hero = wrap.go("/hero");
const _facade_hero: Equal<typeof facade_hero, wrap_go.Go> = true;
void _facade_hero;

const facade_listed = wrap.go({ hero: "/hero" }).hero;
const _facade_listed: Equal<typeof facade_listed, wrap_go.Go> = true;
void _facade_listed;

const facade_applet = wrap.gui_applet("applet1", {
  init() {
    this.new_object(Button, { text: "x" });
  },
});
const _facade_applet: Equal<typeof facade_applet, gui_applet.GuiApplet> = true;
void _facade_applet;
wrap.gui_applet("applet2").register_scene("lobby", Lobby);

// @ts-expect-error a `__name` passes the table off as a class, whose missing `new` is called
wrap.gui_applet("applet3", { __name: "GuiScene" });

// @ts-expect-error a node is an id, a node, or a list of them
wrap.node(1);

// @ts-expect-error a list has only the urls it was given
wrap.go(["/hero"]).enemy;
