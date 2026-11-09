/** @noSelfInFile **/

/**
 * Wraps several game objects at once. `new` takes urls, or names paired with urls, and
 * returns a table holding one `wrap.go` wrapper per url or name.
 * @see {@link https://github.com/baochungit/defold-wrap|Github Source}
 * @noResolution
 */
declare module 'wrap.go_list' {
  import type { Go } from 'wrap.go';

  /** One wrapped game object per url or name `new` was given. */
  export type GoList<K extends string> = { readonly [P in K]: Go };

  /**
   * Wraps the game object at each url, keyed by the url.
   * @param data The game object urls.
   */
  function new_<const K extends string>(data: readonly K[]): GoList<K>;
  /**
   * Wraps each game object, keyed by its name. A Lua table mixing urls and named entries
   * has no TypeScript literal, so name every entry, a url under its own string.
   * @param data Each name, paired with a game object url.
   */
  function new_<K extends string>(data: Record<K, SceneGameObjectAddress | Hash | Url>): GoList<K>;
  export { new_ as new };
}
