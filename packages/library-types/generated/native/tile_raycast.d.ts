/** @noSelfInFile */
declare global {
  /**
   * Ray casts through a tile map with the DDA algorithm, for line of sight,
   * bullet paths and similar checks in tile-based games. Tile coordinates and
   * array indices are 1-based.
   *
   * @see {@link https://github.com/selimanac/defold-tile-raycast|Github Source}
   */
  namespace tile_raycast {
    /** The ray hit the left side of the tile. */
    const LEFT: number;
    /** The ray hit the right side of the tile. */
    const RIGHT: number;
    /** The ray hit the top side of the tile. */
    const TOP: number;
    /** The ray hit the bottom side of the tile. */
    const BOTTOM: number;

    /**
     * Sets up the tile map to cast rays through, replacing any previous one.
     *
     * @param tile_width - Width of a single tile.
     * @param tile_height - Height of a single tile.
     * @param tilemap_width - Number of tiles horizontally in the tile map.
     * @param tilemap_height - Number of tiles vertically in the tile map.
     * @param tiles - One-dimensional table of tile IDs, row by row.
     * @param target_tiles - IDs of the tiles a ray stops at, such as walls.
     */
    function setup(
      tile_width: number,
      tile_height: number,
      tilemap_width: number,
      tilemap_height: number,
      tiles: number[],
      target_tiles: number[],
    ): void;

    /**
     * Casts a ray through the tile map and reports the first target tile it
     * hits. A miss returns `false` alone, so check `hit` before reading the
     * other values. Before `setup`, it logs an error and returns nothing.
     *
     * @param from_x - X coordinate of the ray start.
     * @param from_y - Y coordinate of the ray start.
     * @param to_x - X coordinate of the ray end.
     * @param to_y - Y coordinate of the ray end.
     * @returns `hit`, then on a hit: `tile_x`, `tile_y`, `array_id` (index in the
     * tile table), `tile_id`, `intersection_x`, `intersection_y` and `side`
     * (`LEFT`, `RIGHT`, `TOP` or `BOTTOM`).
     */
    function cast(
      from_x: number,
      from_y: number,
      to_x: number,
      to_y: number,
    ): LuaMultiReturn<[false] | [true, number, number, number, number, number, number, number]>;

    /**
     * Returns the tile ID at a tile coordinate. The extension registers its
     * reader under this name and its writer as {@link tile_raycast.get_at}, the
     * reverse of what its documentation describes.
     *
     * @param tile_x - Tile X coordinate.
     * @param tile_y - Tile Y coordinate.
     * @returns The tile ID at that coordinate.
     */
    function set_at(tile_x: number, tile_y: number): number;

    /**
     * Sets the tile ID at a tile coordinate. The extension registers its
     * writer under this name and its reader as {@link tile_raycast.set_at}, the
     * reverse of what its documentation describes.
     *
     * @param tile_x - Tile X coordinate.
     * @param tile_y - Tile Y coordinate.
     * @param tile_id - Tile ID to set.
     */
    function get_at(tile_x: number, tile_y: number, tile_id: number): void;

    /** Clears all tile and tile map data. */
    function reset(): void;
  }
}

export {};
