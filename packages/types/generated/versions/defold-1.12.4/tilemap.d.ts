/** @noSelfInFile */
import type { Hash, Url } from "../../../src/core-types";

declare global {
  /**
   * Functions and messages used to manipulate tile map components.
   */
  namespace tilemap {
    /**
     * flip tile horizontally
     */
    const H_FLIP: number & { readonly __brand: "tilemap.H_FLIP" };
    /**
     * rotate tile 180 degrees clockwise
     */
    const ROTATE_180: number & { readonly __brand: "tilemap.ROTATE_180" };
    /**
     * rotate tile 270 degrees clockwise
     */
    const ROTATE_270: number & { readonly __brand: "tilemap.ROTATE_270" };
    /**
     * rotate tile 90 degrees clockwise
     */
    const ROTATE_90: number & { readonly __brand: "tilemap.ROTATE_90" };
    /**
     * flip tile vertically
     */
    const V_FLIP: number & { readonly __brand: "tilemap.V_FLIP" };
    /**
     * Get the bounds for a tile map. This function returns multiple values:
     * The lower left corner index x and y coordinates (1-indexed),
     * the tile map width and the tile map height.
     * The resulting values take all tile map layers into account, meaning that
     * the bounds are calculated as if all layers were collapsed into one.
     *
     * @param url - the tile map
     * @example
     * ```ts
     * // get the level bounds.
     * const [x, y, w, h] = tilemap.get_bounds("/level#tilemap");
     * ```
     */
    function get_bounds(url: string | Hash | Url): LuaMultiReturn<[number, number, number, number]>;
    /**
     * Get the tile set at the specified position in the tilemap.
     * The position is identified by the tile index starting at origin
     * with index 1, 1. (see tilemap.set_tile())
     * Which tile map and layer to query is identified by the URL and the
     * layer name parameters.
     *
     * @param url - the tile map
     * @param layer - name of the layer for the tile
     * @param x - x-coordinate of the tile
     * @param y - y-coordinate of the tile
     * @returns index of the tile
     * @example
     * ```ts
     * // get the tile under the player.
     * const tileno = tilemap.get_tile("/level#tilemap", "foreground", self.player_x, self.player_y);
     * ```
     */
    function get_tile(url: string | Hash | Url, layer: string | Hash, x: number, y: number): number;
    /**
     * Get the tile information at the specified position in the tilemap.
     * The position is identified by the tile index starting at origin
     * with index 1, 1. (see tilemap.set_tile())
     * Which tile map and layer to query is identified by the URL and the
     * layer name parameters.
     *
     * @param url - the tile map
     * @param layer - name of the layer for the tile
     * @param x - x-coordinate of the tile
     * @param y - y-coordinate of the tile
     * @returns index of the tile
     * @example
     * ```ts
     * // get the tile under the player.
     * const tile_info = tilemap.get_tile_info("/level#tilemap", "foreground", self.player_x, self.player_y);
     * pprint(tile_info);
     * // {
     * //    index = 0,
     * //    h_flip = false,
     * //    v_flip = true,
     * //    rotate_90 = false
     * // }
     * ```
     */
    function get_tile_info(url: string | Hash | Url, layer: string | Hash, x: number, y: number): { index: number; h_flip: boolean; v_flip: boolean; rotate_90: boolean };
    /**
     * Retrieves all the tiles for the specified layer in the tilemap.
     * It returns a table of rows where the keys are the
     * tile positions (see tilemap.get_bounds()).
     * You can iterate it using `tiles[row_index][column_index]`.
     *
     * @param url - the tilemap
     * @param layer - the name of the layer for the tiles
     * @returns a table of rows representing the layer
     * @example
     * ```ts
     * const [left, bottom, columns_count, rows_count] = tilemap.get_bounds("#tilemap");
     * const tiles = tilemap.get_tiles("#tilemap", "layer");
     * let tile = 0;
     * let count = 0;
     * for (let row_index = bottom; row_index <= bottom + rows_count - 1; row_index++) {
     *   for (let column_index = left; column_index <= left + columns_count - 1; column_index++) {
     *     tile = tiles[row_index][column_index];
     *     count = count + 1;
     *   }
     * }
     * ```
     */
    function get_tiles(url: string | Hash | Url, layer: string | Hash): LuaMap<number, LuaMap<number, number>>;
    /**
     * Replace a tile in a tile map with a new tile.
     * The coordinates of the tiles are indexed so that the "first" tile just
     * above and to the right of origin has coordinates 1,1.
     * Tiles to the left of and below origin are indexed 0, -1, -2 and so forth.
     *
     * +-------+-------+------+------+
     * | 0,3 | 1,3 | 2,3 | 3,3 |
     * +-------+-------+------+------+
     * | 0,2 | 1,2 | 2,2 | 3,2 |
     * +-------+-------+------+------+
     * | 0,1 | 1,1 | 2,1 | 3,1 |
     * +-------O-------+------+------+
     * | 0,0 | 1,0 | 2,0 | 3,0 |
     * +-------+-------+------+------+
     *
     * The coordinates must be within the bounds of the tile map as it were created.
     * That is, it is not possible to extend the size of a tile map by setting tiles outside the edges.
     * To clear a tile, set the tile to number 0. Which tile map and layer to manipulate is identified by the URL and the layer name parameters.
     * Transform bitmask is arithmetic sum of one or both FLIP constants (`tilemap.H_FLIP`, `tilemap.V_FLIP`) and/or one of ROTATION constants
     * (`tilemap.ROTATE_90`, `tilemap.ROTATE_180`, `tilemap.ROTATE_270`).
     * Flip always applies before rotation (clockwise).
     *
     * @param url - the tile map
     * @param layer - name of the layer for the tile
     * @param x - x-coordinate of the tile
     * @param y - y-coordinate of the tile
     * @param tile - index of new tile to set. 0 resets the cell
     * @param transform_bitmask - optional flip and/or rotation should be applied to the tile
     * @example
     * ```ts
     * // Clear the tile under the player.
     * tilemap.set_tile("/level#tilemap", "foreground", self.player_x, self.player_y, 0);
     *
     * // Set tile with different combination of flip and rotation
     * tilemap.set_tile("#tilemap", "layer1", x, y, 0, tilemap.H_FLIP + tilemap.V_FLIP + tilemap.ROTATE_90);
     * tilemap.set_tile("#tilemap", "layer1", x, y, 0, tilemap.H_FLIP + tilemap.ROTATE_270);
     * tilemap.set_tile("#tilemap", "layer1", x, y, 0, tilemap.V_FLIP + tilemap.H_FLIP);
     * tilemap.set_tile("#tilemap", "layer1", x, y, 0, tilemap.ROTATE_180);
     * ```
     */
    function set_tile(url: string | Hash | Url, layer: string | Hash, x: number, y: number, tile: number, transform_bitmask?: number): void;
    /**
     * Sets the visibility of the tilemap layer
     *
     * @param url - the tile map
     * @param layer - name of the layer for the tile
     * @param visible - should the layer be visible
     * @example
     * ```ts
     * // Disable rendering of the layer
     * tilemap.set_visible("/level#tilemap", "foreground", false);
     * ```
     */
    function set_visible(url: string | Hash | Url, layer: string | Hash, visible: boolean): void;
    interface properties {
      /**
       * The material used when rendering the tile map. The type of the property is hash.
       */
      material: Hash;
      /**
       * The tile source used when rendering the tile map. The type of the property is hash.
       */
      tile_source: Hash;
    }
  }
}

export {};
