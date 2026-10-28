/** @noSelfInFile **/

/**
 * Wraps several GUI nodes at once. `new` takes node ids, or names paired with ids or
 * nodes, and returns a table holding one `wrap.node` wrapper per name, optionally looking
 * each id up in a cloned tree first.
 * @see {@link https://github.com/baochungit/defold-wrap|Github Source}
 * @noResolution
 */
declare module 'wrap.node_list' {
  import type { Node, NodeTree } from 'wrap.node';

  /**
   * The members of `K` that are not literals, such as `string`, which any name fits.
   * @internal
   */
  type OpenKey<K extends string> = K extends unknown
    ? {} extends Record<K, 1>
      ? K
      : never
    : never;

  /**
   * One wrapped node per name `new` was given, and the `tree` it was given. A node named
   * `tree` replaces the tree, as `new` stores the tree first. When the names are not
   * literals, `tree` may be either.
   */
  export type NodeList<K extends string> = [OpenKey<K>] extends [never]
    ? {
        readonly [P in K | 'tree']: P extends 'tree'
          ? 'tree' extends K
            ? Node
            : NodeTree | undefined
          : Node;
      }
    : { readonly [P in K]: Node } & { readonly tree: Node | NodeTree | undefined };

  /**
   * Wraps the node with each id, keyed by the id.
   * @param data The node ids.
   * @param tree A table from `gui.clone_tree` or `gui.get_tree` to look each id up in
   * first. An id it lacks, or every id when it is omitted, is looked up with
   * `gui.get_node`.
   */
  function new_<const K extends string>(data: readonly K[], tree?: NodeTree): NodeList<K>;
  /**
   * Wraps each node, keyed by its name. A Lua table mixing ids and named entries has no
   * TypeScript literal, so name every entry, an id under its own name.
   * @param data Each name, paired with a node id or a node.
   * @param tree A table from `gui.clone_tree` or `gui.get_tree` to look each id up in
   * first. An id it lacks, or every id when it is omitted, is looked up with
   * `gui.get_node`.
   */
  function new_<K extends string>(
    data: Record<K, string | Opaque<'node'>>,
    tree?: NodeTree,
  ): NodeList<K>;
  export { new_ as new };
}
