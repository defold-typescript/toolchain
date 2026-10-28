/** @noSelfInFile **/

/**
 * Builds a world map as a graph of nodes and routes that can change at any time, draws
 * it for debugging, and moves game objects along it with a built-in pathfinder. Add
 * nodes with `map_add_node` and join them with `map_add_route`, start each game object
 * with `move_initialize`, then call `move_player` from its `update` and apply the
 * position and rotation it returns.
 * @see {@link https://github.com/dev-masih/defgraph|Github Source}
 * @noResolution
 */
declare module 'defgraph.defgraph' {
  /**
   * How `move_initialize` takes a game object through more than one destination.
   * `ONETIME` visits them in order and stops at the last, `SHUFFLE` visits them in
   * random order without stopping, and `CYCLE` visits them in order and starts over
   * after the last. With one destination they all behave the same.
   */
  export const ROUTETYPE: {
    ONETIME: Hash;
    SHUFFLE: Hash;
    CYCLE: Hash;
  };

  /**
   * The movement data `move_initialize` and `move_player` return. The table also holds
   * the path and the settings `move_player` works from, so a game only keeps it and
   * passes it back to `move_player` and `debug_draw_player_move`.
   */
  export interface MoveData {
    /** The destination node ids, the same list `move_initialize` was given. */
    readonly destination_list: number[];
    /**
     * The 1-based index of the current destination in `destination_list`.
     * **⚠️ 1-based; passed to `defgraph` unchanged.**
     */
    readonly destination_index: number;
    /** The `ROUTETYPE` the game object moves by. */
    readonly route_type: Hash;
    /**
     * The 1-based index of the next point on the path, or `0` while the game object
     * stands still because the map has no route or `destination_list` is empty.
     * **⚠️ 1-based; passed to `defgraph` unchanged.**
     */
    readonly path_index: number;
  }

  /** What one `move_player` call computed for the game object. */
  export interface MoveResult {
    /** The game object's next position. */
    position: Vector3;
    /**
     * The game object's next rotation around z, relative to the `initial_face_vector`
     * passed to `move_initialize`. `undefined` when `move_initialize` was given none.
     */
    rotation: Quaternion | undefined;
    /**
     * Whether the game object is at its destination. With more than one destination it
     * reads `true` on reaching each one, then `false` again while `destination_id` moves
     * on to the next.
     */
    is_reached: boolean;
    /** The node id of the current destination. */
    destination_id: number;
  }

  /**
   * Sets the module's path and movement settings, which every `move_initialize` call
   * falls back to for a setting it is not given. A `nil` keeps a setting's current
   * value, and each starts at the default stated on it.
   * @param settings_gameobject_threshold The distance within which a game object counts
   * as on a route or at a point. Use a larger value for faster game objects; the
   * smallest useful value is `1`. Defaults to `1`.
   * @param settings_path_curve_tightness How tight a turn on the path is; the smallest
   * useful value is `2`. Defaults to `4`.
   * @param settings_path_curve_roundness How round a turn on the path is. `0` gives no
   * curves and ignores the tightness and the corner distance, and a higher value costs
   * more processing, most of all while nodes move. Defaults to `3`.
   * @param settings_path_curve_max_distance_from_corner The farthest from its corner a
   * turn may start. Defaults to `10`.
   * @param settings_allow_enter_on_route Whether a game object may enter the map partway
   * along a route, rather than only at a node. Defaults to `true`.
   */
  export function map_set_properties(
    settings_gameobject_threshold?: number,
    settings_path_curve_tightness?: number,
    settings_path_curve_roundness?: number,
    settings_path_curve_max_distance_from_corner?: number,
    settings_allow_enter_on_route?: boolean,
  ): void;

  /**
   * Adds a node at a position and returns its id. The position's `z` is ignored. A node
   * with no route takes no part in routing, so remove one that is no longer used.
   * @param position The node's position.
   */
  export function map_add_node(position: Vector3): number;

  /**
   * Moves an existing node, and the routes attached to it with it. An unknown id fails
   * an assert.
   * @param node_id The node's id.
   * @param position The node's new position.
   */
  export function map_update_node_position(node_id: number, position: Vector3): void;

  /**
   * Removes a node and every route attached to it. An unknown id fails an assert.
   * @param node_id The node's id.
   */
  export function map_remove_node(node_id: number): void;

  /**
   * Adds a route between two nodes, both ways unless `is_one_way` is `true`. A route
   * from a node to itself is ignored, and an unknown id fails an assert. A one-way route
   * is a little cheaper to path through when the other way is never needed.
   * @param source_id The node the route starts at.
   * @param destination_id The node the route ends at.
   * @param is_one_way Whether the route runs from `source_id` to `destination_id` only.
   * Defaults to `false`.
   */
  export function map_add_route(
    source_id: number,
    destination_id: number,
    is_one_way?: boolean,
  ): void;

  /**
   * Removes the route between two nodes, both ways unless `is_remove_one_way` is `true`.
   * An unknown id fails an assert.
   * @param source_id The node the route starts at.
   * @param destination_id The node the route ends at.
   * @param is_remove_one_way Whether to remove only the way from `source_id` to
   * `destination_id`. Defaults to `false`.
   */
  export function map_remove_route(
    source_id: number,
    destination_id: number,
    is_remove_one_way?: boolean,
  ): void;

  /**
   * Sets the colors and the scale the `debug_draw_*` functions draw with. A `nil` keeps
   * a value's current setting, and each starts at the default stated on it.
   * @param node_color The color of the nodes. Defaults to `vmath.vector4(1, 0, 1, 1)`.
   * @param two_way_route_color The color of two-way routes. Defaults to
   * `vmath.vector4(0, 1, 0, 1)`.
   * @param one_way_route_color The color of one-way routes. Defaults to
   * `vmath.vector4(0, 1, 1, 1)`.
   * @param draw_scale The size of the node marks. Defaults to `5`.
   */
  export function debug_set_properties(
    node_color?: Vector4,
    two_way_route_color?: Vector4,
    one_way_route_color?: Vector4,
    draw_scale?: number,
  ): void;

  /**
   * Draws every node for one frame, by posting `draw_line` and, for the ids,
   * `draw_text` to `@render:`. A node with no route is drawn as a triangle, a dead end
   * as a cross and an intersection as a square. Call it every frame to keep it shown.
   * @param is_show_ids Whether to draw each node's id beside it. Defaults to `false`.
   */
  export function debug_draw_map_nodes(is_show_ids?: boolean): void;

  /**
   * Draws every route for one frame, by posting `draw_line` to `@render:`: two-way
   * routes in one color, and one-way routes in another with a square near the end they
   * run to. Call it every frame to keep it shown.
   */
  export function debug_draw_map_routes(): void;

  /**
   * Draws the rest of a game object's path for one frame, by posting `draw_line` to
   * `@render:`. Nothing is drawn while the game object stands still for want of a
   * route. Call it every frame to keep it shown.
   * @param movement_data The movement data from `move_initialize` or `move_player`.
   * @param color The color of the path.
   * @param is_show_intersection Whether to mark each point on the path with a cross.
   * Defaults to `false`.
   */
  export function debug_draw_player_move(
    movement_data: MoveData,
    color: Vector4,
    is_show_intersection?: boolean,
  ): void;

  /**
   * Starts a game object moving from its position through a list of destination nodes,
   * and returns the movement data `move_player` takes. Each setting it is not given
   * falls back to the value `map_set_properties` set. To change the destinations, call
   * it again and replace the old movement data with the result.
   * @param source_position The game object's current position.
   * @param destination_list The destination node ids, in order. With an empty list the
   * game object stands still and `move_player` reports no `destination_id`.
   * @param route_type One of `ROUTETYPE`. Defaults to `ROUTETYPE.ONETIME`.
   * @param initial_face_vector The direction the game object faces at zero rotation.
   * Without it, `move_player` returns no rotation.
   * @param settings_gameobject_threshold The distance within which the game object counts
   * as on a route or at a point. Defaults to the `map_set_properties` value.
   * @param settings_path_curve_tightness How tight a turn on the path is. Defaults to the
   * `map_set_properties` value.
   * @param settings_path_curve_roundness How round a turn on the path is, `0` for no
   * curves. Defaults to the `map_set_properties` value.
   * @param settings_path_curve_max_distance_from_corner The farthest from its corner a
   * turn may start. Defaults to the `map_set_properties` value.
   * @param settings_allow_enter_on_route Whether the game object may enter the map partway
   * along a route. Defaults to the `map_set_properties` value.
   */
  export function move_initialize(
    source_position: Vector3,
    destination_list: number[],
    route_type?: Hash,
    initial_face_vector?: Vector3,
    settings_gameobject_threshold?: number,
    settings_path_curve_tightness?: number,
    settings_path_curve_roundness?: number,
    settings_path_curve_max_distance_from_corner?: number,
    settings_allow_enter_on_route?: boolean,
  ): MoveData;

  /**
   * Moves a game object one step along its path toward its current destination, and
   * returns the movement data and the result of the move:
   * `const [data, result] = defgraph.move_player(go.get_position(), speed * dt, move)`.
   * Keep the returned movement data in place of the one passed in. When the map has
   * changed since the last call, the path is found again first. `result.rotation` is
   * `undefined` unless `move_initialize` was given an `initial_face_vector`.
   * @param current_position The game object's current position.
   * @param speed How far the game object moves this call, its speed already multiplied
   * by `dt`.
   * @param move_data The movement data from `move_initialize` or the last `move_player`.
   */
  export function move_player(
    current_position: Vector3,
    speed: number,
    move_data: MoveData,
  ): LuaMultiReturn<[MoveData, MoveResult]>;
}
