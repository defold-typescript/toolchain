/** @noSelfInFile **/

/**
 * The module a project requires to use defold-wrap: `node` and `go` wrap one GUI node or
 * game object, or a list of them, so calls on them chain, and `gui_applet` creates an
 * applet that shows scenes.
 * @see {@link https://github.com/baochungit/defold-wrap|Github Source}
 * @noResolution
 */
declare module 'wrap.wrap' {
  import type { Go } from 'wrap.go';
  import type { GoList } from 'wrap.go_list';
  import type { GuiApplet } from 'wrap.gui_applet';
  import type { GuiSceneClass, GuiSceneHooks } from 'wrap.gui_scene';
  import type { Node, NodeTree } from 'wrap.node';
  import type { NodeList } from 'wrap.node_list';

  /**
   * Wraps a GUI node, from `wrap.node.new`.
   * @param node The node, or its id. An id is looked up in `tree` first, then with
   * `gui.get_node`.
   * @param tree A table from `gui.clone_tree` or `gui.get_tree` to look an id up in.
   */
  export function node(node: string | Opaque<'node'>, tree?: NodeTree): Node;
  /**
   * Wraps the node with each id, keyed by the id, from `wrap.node_list.new`.
   * @param node The node ids.
   * @param tree A table from `gui.clone_tree` or `gui.get_tree` to look each id up in
   * first. An id it lacks, or every id when it is omitted, is looked up with
   * `gui.get_node`.
   */
  export function node<const K extends string>(node: readonly K[], tree?: NodeTree): NodeList<K>;
  /**
   * Wraps each node, keyed by its name, from `wrap.node_list.new`.
   * @param node Each name, paired with a node id or a node.
   * @param tree A table from `gui.clone_tree` or `gui.get_tree` to look each id up in
   * first. An id it lacks, or every id when it is omitted, is looked up with
   * `gui.get_node`.
   */
  export function node<K extends string>(
    node: Record<K, string | Opaque<'node'>>,
    tree?: NodeTree,
  ): NodeList<K>;

  /**
   * Wraps a game object, from `wrap.go.new`.
   * @param go The game object's url.
   */
  export function go(go: SceneGameObjectAddress | Hash | Url): Go;
  /**
   * Wraps the game object at each url, keyed by the url, from `wrap.go_list.new`.
   * @param go The game object urls.
   */
  export function go<const K extends string>(go: readonly K[]): GoList<K>;
  /**
   * Wraps each game object, keyed by its name, from `wrap.go_list.new`.
   * @param go Each name, paired with a game object url.
   */
  export function go<K extends string>(
    go: Record<K, SceneGameObjectAddress | Hash | Url>,
  ): GoList<K>;

  /**
   * Creates an applet on a node, from `wrap.gui_applet.new`, and when given a scene class
   * shows a new scene of it.
   * @param root_node The node, or the id `gui.get_node` looks it up by.
   * @param scene A class `wrap.gui_scene.extend` returns.
   */
  export function gui_applet(
    root_node: string | Opaque<'node'>,
    scene?: GuiSceneClass<object>,
  ): GuiApplet;
  /**
   * Creates an applet on a node, from `wrap.gui_applet.new`, and shows a scene built from a
   * plain table of hooks and fields, copied onto a fresh `wrap.gui_scene.extend()`.
   * @param root_node The node, or the id `gui.get_node` looks it up by.
   * @param scene The hooks and fields, each hook seeing the scene as `this`.
   */
  export function gui_applet<F extends object = {}>(
    root_node: string | Opaque<'node'>,
    scene: GuiSceneHooks<F>,
  ): GuiApplet;
}
