--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.tilemap
---Functions and messages used to manipulate tile map components.
---flip tile horizontally
---
---[Open in Browser](https://defold.com/ref/tilemap-lua#tilemap.TRANSFORM)
---@field H_FLIP tilemap.TRANSFORM
---rotate tile 180 degrees clockwise
---
---[Open in Browser](https://defold.com/ref/tilemap-lua#tilemap.TRANSFORM)
---@field ROTATE_180 tilemap.TRANSFORM
---rotate tile 270 degrees clockwise
---
---[Open in Browser](https://defold.com/ref/tilemap-lua#tilemap.TRANSFORM)
---@field ROTATE_270 tilemap.TRANSFORM
---rotate tile 90 degrees clockwise
---
---[Open in Browser](https://defold.com/ref/tilemap-lua#tilemap.TRANSFORM)
---@field ROTATE_90 tilemap.TRANSFORM
---flip tile vertically
---
---[Open in Browser](https://defold.com/ref/tilemap-lua#tilemap.TRANSFORM)
---@field V_FLIP tilemap.TRANSFORM
tilemap = {}

---@enum defold_enum.tilemap.TRANSFORM: integer
local __defold_enum_tilemap_TRANSFORM = {
    H_FLIP = nil,
    ROTATE_180 = nil,
    ROTATE_270 = nil,
    ROTATE_90 = nil,
    V_FLIP = nil,
}

---A transform is the arithmetic sum of one or both flip members and/or one
---rotation member. Flipping is applied before clockwise rotation.
---
---[Open in Browser](https://defold.com/ref/tilemap-lua#tilemap.TRANSFORM)
---@alias tilemap.TRANSFORM defold_enum.tilemap.TRANSFORM
---| `tilemap.H_FLIP`
---| `tilemap.ROTATE_180`
---| `tilemap.ROTATE_270`
---| `tilemap.ROTATE_90`
---| `tilemap.V_FLIP`

---Get the bounds for a tile map. This function returns multiple values:
---The lower left corner index x and y coordinates (1-indexed),
---the tile map width and the tile map height.
---
---The resulting values take all tile map layers into account, meaning that
---the bounds are calculated as if all layers were collapsed into one.
---
---**Examples:**
---
---```lua
----- get the level bounds.
---local x, y, w, h = tilemap.get_bounds("/level#tilemap")
---```
---@param url string|hash|url the tile map
---@return integer x x coordinate of the bottom left corner
---@return integer y y coordinate of the bottom left corner
---@return integer w number of columns (width) in the tile map
---@return integer h number of rows (height) in the tile map
---
---[Open in Browser](https://defold.com/ref/tilemap-lua#tilemap.get_bounds:url)
function tilemap.get_bounds(url) end

---Get the tile set at the specified position in the tilemap.
---The position is identified by the tile index starting at origin
---with index 1, 1. (see `tilemap.set_tile()`)
---Which tile map and layer to query is identified by the URL and the
---layer name parameters.
---
---**Examples:**
---
---```lua
----- get the tile under the player.
---local tileno = tilemap.get_tile("/level#tilemap", "foreground", self.player_x, self.player_y)
---```
---@param url string|hash|url the tile map
---@param layer string|hash name of the layer for the tile
---@param x integer x-coordinate of the tile
---@param y integer y-coordinate of the tile
---@return integer tile index of the tile
---
---[Open in Browser](https://defold.com/ref/tilemap-lua#tilemap.get_tile:url-layer-x-y)
function tilemap.get_tile(url, layer, x, y) end

---Get the tile information at the specified position in the tilemap.
---The position is identified by the tile index starting at origin
---with index 1, 1. (see `tilemap.set_tile()`)
---Which tile map and layer to query is identified by the URL and the
---layer name parameters.
---
---**Examples:**
---
---```lua
----- get the tile under the player.
---local tile_info = tilemap.get_tile_info("/level#tilemap", "foreground", self.player_x, self.player_y)
---pprint(tile_info)
----- {
-----    index = 0,
-----    h_flip = false,
-----    v_flip = true,
-----    rotate_90 = false
----- }
---```
---@param url string|hash|url the tile map
---@param layer string|hash name of the layer for the tile
---@param x integer x-coordinate of the tile
---@param y integer y-coordinate of the tile
---@return { index:integer, h_flip:boolean, v_flip:boolean, rotate_90:boolean } tile_info full tile information
---
---[Open in Browser](https://defold.com/ref/tilemap-lua#tilemap.get_tile_info:url-layer-x-y)
function tilemap.get_tile_info(url, layer, x, y) end

---Retrieves all the tiles for the specified layer in the tilemap.
---It returns a table of rows where the keys are the
---tile positions (see `tilemap.get_bounds()`).
---You can iterate it using `tiles[row_index][column_index]`.
---
---**Examples:**
---
---```lua
---local left, bottom, columns_count, rows_count = tilemap.get_bounds("#tilemap")
---local tiles = tilemap.get_tiles("#tilemap", "layer")
---local tile, count = 0, 0
---for row_index = bottom, bottom + rows_count - 1 do
---    for column_index = left, left + columns_count - 1 do
---        tile = tiles[row_index][column_index]
---        count = count + 1
---    end
---end
---```
---@param url string|hash|url the tilemap
---@param layer string|hash the name of the layer for the tiles
---@return table<integer, table<integer, integer>> tiles a table of rows representing the layer
---
---[Open in Browser](https://defold.com/ref/tilemap-lua#tilemap.get_tiles:url-layer)
function tilemap.get_tiles(url, layer) end

---Resets a shader constant for a tile map component.
---The constant must be defined in the material assigned to the tile map.
---Resetting a constant through this function implies that the value defined in the material will be used.
---Which tile map to reset a constant for is identified by the URL.
---
---**Examples:**
---
---The following examples assumes that the tile map has id "tilemap" and that the default-material in builtins is used, which defines the constant "tint".
---If you assign a custom material to the tile map, you can reset the constants defined there in the same manner.
---
---How to reset the tinting of a tile map:
---
---```lua
---function init(self)
---    tilemap.reset_constant("#tilemap", "tint")
---end
---```
---@param url string|hash|url the tile map that should have a constant reset
---@param constant string|hash name of the constant
---
---[Open in Browser](https://defold.com/ref/tilemap-lua#tilemap.reset_constant:url-constant)
function tilemap.reset_constant(url, constant) end

---Replace a tile in a tile map with a new tile.
---The coordinates of the tiles are indexed so that the "first" tile just
---above and to the right of origin has coordinates 1,1.
---Tiles to the left of and below origin are indexed 0, -1, -2 and so forth.
---
---+-------+-------+------+------+
---|  0,3  |  1,3  | 2,3  | 3,3  |
---+-------+-------+------+------+
---|  0,2  |  1,2  | 2,2  | 3,2  |
---+-------+-------+------+------+
---|  0,1  |  1,1  | 2,1  | 3,1  |
---+-------O-------+------+------+
---|  0,0  |  1,0  | 2,0  | 3,0  |
---+-------+-------+------+------+
---
---The coordinates must be within the bounds of the tile map as it were created.
---That is, it is not possible to extend the size of a tile map by setting tiles outside the edges.
---To clear a tile, set the tile to number 0. Which tile map and layer to manipulate is identified by the URL and the layer name parameters.
---
---**Examples:**
---
---```lua
----- Clear the tile under the player.
---tilemap.set_tile("/level#tilemap", "foreground", self.player_x, self.player_y, 0)
---
----- Set tile with different combination of flip and rotation
---tilemap.set_tile("#tilemap", "layer1", x, y, 0, tilemap.H_FLIP + tilemap.V_FLIP + tilemap.ROTATE_90)
---tilemap.set_tile("#tilemap", "layer1", x, y, 0, tilemap.H_FLIP + tilemap.ROTATE_270)
---tilemap.set_tile("#tilemap", "layer1", x, y, 0, tilemap.V_FLIP + tilemap.H_FLIP)
---tilemap.set_tile("#tilemap", "layer1", x, y, 0, tilemap.ROTATE_180)
---```
---@param url string|hash|url the tile map
---@param layer string|hash name of the layer for the tile
---@param x integer x-coordinate of the tile
---@param y integer y-coordinate of the tile
---@param tile integer index of new tile to set. 0 resets the cell
---@param transform_bitmask? tilemap.TRANSFORM optional flip and/or rotation should be applied to the tile
---
---[Open in Browser](https://defold.com/ref/tilemap-lua#tilemap.set_tile:url-layer-x-y-tile-transform_bitmask)
function tilemap.set_tile(url, layer, x, y, tile, transform_bitmask) end

---Sets the visibility of the tilemap layer
---
---**Examples:**
---
---```lua
----- Disable rendering of the layer
---tilemap.set_visible("/level#tilemap", "foreground", false)
---```
---@param url string|hash|url the tile map
---@param layer string|hash name of the layer for the tile
---@param visible boolean should the layer be visible
---
---[Open in Browser](https://defold.com/ref/tilemap-lua#tilemap.set_visible:url-layer-visible)
function tilemap.set_visible(url, layer, visible) end
