/** @noSelfInFile */
declare global {
  /**
   * Editor scripting documentation
   */
  namespace tilemap.tiles {
    /**
     * Remove all tiles
     *
     * @param tiles - unbounded 2d grid of tiles
     * @returns unbounded 2d grid of tiles
     */
    export function clear(tiles: editor.tiles): editor.tiles;
    /**
     * Get full information from a tile at a particular coordinate
     *
     * @param tiles - unbounded 2d grid of tiles
     * @param x - x coordinate of a tile
     * @param y - y coordinate of a tile
     * @returns full tile information, or nil if no tile is set at the coordinate. **⚠️ `index` is 1-based; passed to Defold unchanged.**
     */
    export function get_info(tiles: editor.tiles, x: number, y: number): tilemap.tiles.get_info.result | undefined;
    /**
     * Get a tile index at a particular coordinate
     *
     * @param tiles - unbounded 2d grid of tiles
     * @param x - x coordinate of a tile
     * @param y - y coordinate of a tile
     * @returns 1-indexed tile index of a tilemap's tilesource. **⚠️ 1-based; passed to Defold unchanged.**
     */
    export function get_tile(tiles: editor.tiles, x: number, y: number): number;
    /**
     * Create an iterator over all tiles in a tiles data structure
     * When iterating using for loop, each iteration returns x, y and tile index of a tile in a tile map
     *
     * @param tiles - unbounded 2d grid of tiles
     * @returns iterator
     * @example
     * ```lua
     * Iterate over all tiles in a tile map:
     * local layers = editor.get("/level.tilemap", "layers")
     * for i = 1, #layers do
     *   local tiles = editor.get(layers[i], "tiles")
     *   for x, y, i in tilemap.tiles.iterator(tiles) do
     *     print(x, y, i)
     *   end
     * end
     * ```
     */
    export function iterator(tiles: editor.tiles): (...args: unknown[]) => unknown;
    /**
     * Create a new unbounded 2d grid data structure for storing tilemap layer tiles
     *
     * @returns unbounded 2d grid of tiles
     */
    function _new(): editor.tiles;
    /**
     * Remove a tile at a particular coordinate
     *
     * @param tiles - unbounded 2d grid of tiles
     * @param x - x coordinate of a tile
     * @param y - y coordinate of a tile
     * @returns unbounded 2d grid of tiles
     */
    export function remove(tiles: editor.tiles, x: number, y: number): editor.tiles;
    /**
     * Set a tile at a particular coordinate
     *
     * @param tiles - unbounded 2d grid of tiles
     * @param x - x coordinate of a tile
     * @param y - y coordinate of a tile
     * @param tile_or_info - Either 1-indexed tile index of a tilemap's tilesource or full tile information. **⚠️ 1-based; passed to Defold unchanged.** **⚠️ `index` is 1-based; passed to Defold unchanged.**
     * @returns unbounded 2d grid of tiles
     */
    export function set(tiles: editor.tiles, x: number, y: number, tile_or_info: number | tilemap.tiles.set.info): editor.tiles;
    export { _new as new };
    export namespace get_info {
      /**
       * Full tile information returned by tilemap.tiles.get_info
       */
      interface result {
        /**
         * 1-indexed tile index of a tilemap's tilesource
         */
        index: number;
        /**
         * horizontal flip
         */
        h_flip: boolean;
        /**
         * vertical flip
         */
        v_flip: boolean;
        /**
         * whether the tile is rotated 90 degrees clockwise
         */
        rotate_90: boolean;
      }
    }
    export namespace set {
      /**
       * Tile information accepted by tilemap.tiles.set
       */
      interface info {
        /**
         * 1-indexed tile index of a tilemap's tilesource
         */
        index: number;
        /**
         * horizontal flip
         */
        h_flip?: boolean;
        /**
         * vertical flip
         */
        v_flip?: boolean;
        /**
         * whether the tile is rotated 90 degrees clockwise
         */
        rotate_90?: boolean;
      }
    }
  }
}

export {};
