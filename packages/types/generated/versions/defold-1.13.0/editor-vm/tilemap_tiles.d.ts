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
    export function clear(tiles: unknown): unknown;
    /**
     * Get full information from a tile at a particular coordinate
     *
     * @param tiles - unbounded 2d grid of tiles
     * @param x - x coordinate of a tile
     * @param y - y coordinate of a tile
     * @returns full tile information table with the following keys:`index integer`1-indexed tile index of a tilemap's tilesource`h_flip boolean`horizontal flip`v_flip boolean`vertical flip`rotate_90 boolean`whether the tile is rotated 90 degrees clockwise
     */
    export function get_info(tiles: unknown, x: number, y: number): Record<string | number, unknown>;
    /**
     * Get a tile index at a particular coordinate
     *
     * @param tiles - unbounded 2d grid of tiles
     * @param x - x coordinate of a tile
     * @param y - y coordinate of a tile
     * @returns 1-indexed tile index of a tilemap's tilesource
     */
    export function get_tile(tiles: unknown, x: number, y: number): number;
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
    export function iterator(tiles: unknown): (...args: unknown[]) => unknown;
    /**
     * Create a new unbounded 2d grid data structure for storing tilemap layer tiles
     *
     * @returns unbounded 2d grid of tiles
     */
    function _new(): unknown;
    /**
     * Remove a tile at a particular coordinate
     *
     * @param tiles - unbounded 2d grid of tiles
     * @param x - x coordinate of a tile
     * @param y - y coordinate of a tile
     * @returns unbounded 2d grid of tiles
     */
    export function remove(tiles: unknown, x: number, y: number): unknown;
    /**
     * Set a tile at a particular coordinate
     *
     * @param tiles - unbounded 2d grid of tiles
     * @param x - x coordinate of a tile
     * @param y - y coordinate of a tile
     * @param tile_or_info - Either 1-indexed tile index of a tilemap's tilesource or full tile information table with the following keys:`index integer`1-indexed tile index of a tilemap's tilesource`h_flip boolean`horizontal flip`v_flip boolean`vertical flip`rotate_90 boolean`whether the tile is rotated 90 degrees clockwise
     * @returns unbounded 2d grid of tiles
     */
    export function set(tiles: unknown, x: number, y: number, tile_or_info: number | Record<string | number, unknown>): unknown;
    export { _new as new };
  }
}

export {};
